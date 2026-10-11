// “立即同步”：平台导出 → 去 工作台/导入/<平台>/ 找还没导过的 CSV，有规则就按规则导，表头对不上就停下来记一条失败；
// 知识库文件夹 → 现场数一遍；飞书、RSS、Codex 定时任务 → 这台电脑上没有接真的账号，如实说什么时候会更新、怎么手动做。
// 归属：数据源与导入模块。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { all, get, run, uid, ROOT, logChange } from '../../db.ts'
import { NotFound } from '../../services/common.ts'
import { readTable } from './csv.ts'
import { analyze } from './recognize.ts'
import { commitTable, type ImportResult } from './importer.ts'
import { kbNow } from './service.ts'
import { notesState, reimportNotes } from './notes.ts'
import { md, stamp, whenText } from './time.ts'

type Src = { id: string; name: string; kind: string; channel_id: string | null; inbox_dir: string | null; schedule: string; owner: string | null; status: string; next_run_at: string | null }
export type SyncResult = { kind: '导入了' | '没有新文件' | '失败' | '要手动' | '检查了'; message: string; imported?: ImportResult[]; next?: string }

/** 读文件：先按 UTF-8，读出乱码再按 GBK（国内平台导出的 CSV 常是 GBK） */
export function decodeFile(buf: Buffer): { text: string; encoding: string } {
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'UTF-8' } }
  catch { return { text: new TextDecoder('gbk').decode(buf), encoding: 'GBK' } }
}

function recordFail(src: Src, file: string, message: string, detail: unknown) {
  const at = stamp()
  run(`INSERT INTO import_runs (id, source_id, started_at, finished_at, status, file_name, rows_total, rows_ok, rows_failed, actor, message, detail, origin)
    VALUES (:id, :s, :at, :at, '失败', :f, 0, 0, 0, '网页', :m, :d, '自己的')`, { id: uid('run'), s: src.id, at, f: file, m: message, d: JSON.stringify(detail) })
  run("UPDATE data_sources SET status = '失败', last_run_at = :at, note = :m WHERE id = :s", { at, m: message, s: src.id })
  logChange('导入', 'data', src.id, '失败', `${src.name}：${message}`)
}

function syncFolder(src: Src): SyncResult {
  const rel = src.inbox_dir ?? ''
  const dir = join(ROOT, rel)
  if (!rel || !existsSync(dir)) return { kind: '没有新文件', message: `还没有 ${rel || '导入文件夹'} 这个文件夹。把平台导出的 CSV 放进去再点同步，或者直接拖到“导入”页` }
  const done = new Set(all<{ f: string }>('SELECT DISTINCT file_name AS f FROM import_runs WHERE source_id = :s AND file_name IS NOT NULL', { s: src.id }).map((r) => r.f))
  const files = readdirSync(dir).filter((f) => !f.startsWith('.') && statSync(join(dir, f)).isFile()).sort()
  const fresh = files.map((f) => ({ f, path: relative(ROOT, join(dir, f)) })).filter((x) => !done.has(x.path))
  if (!fresh.length) {
    // 只说文件夹里真有、没撤销的那份；预置的导入记录没有放原件，如实说
    const inFolder = new Set(files.map((f) => relative(ROOT, join(dir, f))))
    const last = all<{ file_name: string; started_at: string; b: string | null }>(`SELECT r.file_name, r.started_at, b.status AS b FROM import_runs r LEFT JOIN data_batches b ON b.id = r.batch_id
      WHERE r.source_id = :s AND r.file_name IS NOT NULL ORDER BY r.started_at DESC LIMIT 20`, { s: src.id }).find((r) => inFolder.has(r.file_name) && r.b !== '已撤销')
    return { kind: '没有新文件', message: `${rel}/ 里没有新文件。${last ? `最近一份 ${last.file_name.split('/').pop()} 已在 ${whenText(last.started_at)} 导过。` : '示例里预置的导入记录没有放原件，文件夹是空的。'}平台导出的 CSV 放进去再点，或者直接拖到“导入”页` }
  }
  const imported: ImportResult[] = []
  const fails: string[] = []
  for (const { f, path } of fresh) {
    if (!/\.(csv|txt|tsv)$/i.test(f)) {
      recordFail(src, path, `${f} 不是 CSV：工作台还读不了 Excel，在平台上导出成 CSV 再放进来`, { 文件: f }); fails.push(f); continue
    }
    const { text } = decodeFile(readFileSync(join(dir, f)))
    const table = readTable(text)
    const analysis = analyze(table, src.channel_id ? { channel_id: src.channel_id } : {})
    if (!analysis.rule) {
      recordFail(src, path, `${f} 没有对上任何导入规则：第一次导这种表，先拖到“导入”页对一次字段`, { 表头: table.headers }); fails.push(f); continue
    }
    if (analysis.blocking.length) {
      recordFail(src, path, `${f} 和规则「${analysis.rule.name}」对不上：${analysis.blocking.join('；')}`, {
        缺少的列: analysis.rule.missing_cols, 多出来的列: analysis.rule.extra_cols, 拿不准的列: analysis.columns.filter((c) => c.state === '拿不准').map((c) => c.header), 建议: '去“导入”页把这份文件拖进去，对一下字段',
      }); fails.push(f); continue
    }
    imported.push(commitTable(table, analysis, { fileName: path, saveRule: false, actor: '立即同步', by: '网页' }))
  }
  if (!imported.length) return { kind: '失败', message: `读到 ${fresh.length} 个新文件，都没导进去：${fails.join('、')}。原因在运行记录里` }
  return { kind: '导入了', message: `按规则导了 ${imported.length} 个文件、${imported.reduce((a, r) => a + r.rows, 0)} 行${fails.length ? `；${fails.length} 个没导进去，原因在运行记录里` : ''}`, imported }
}

/** 知识库文件夹：现场数一遍笔记文件（不算 README 这类说明，不进 工作台/ 和隐藏文件夹） */
function syncKb(src: Src): SyncResult {
  const k = kbNow()
  const n = k.notes
  const at = stamp()
  const msg = `读了一遍知识库：现在 ${n} 份笔记${k.latest ? `，最近改的是 ${k.latest.path.replace(/\.md$/, '')}（${whenText(k.latest.at)}）` : ''}`
  run(`INSERT INTO import_runs (id, source_id, started_at, finished_at, status, rows_total, rows_ok, rows_failed, actor, message, origin)
    VALUES (:id, :s, :at, :at, '成功', :n, :n, 0, '网页', :m, '自己的')`, { id: uid('run'), s: src.id, at, n, m: msg })
  run("UPDATE data_sources SET last_run_at = :at, last_ok_at = :at, status = '正常' WHERE id = :s", { at, s: src.id })
  return { kind: '检查了', message: msg }
}

export function syncSource(id: string): SyncResult {
  const src = get<Src>('SELECT * FROM data_sources WHERE id = :id', { id })
  if (!src) throw new NotFound('找不到这个数据源')
  if (src.status === '停用') return { kind: '要手动', message: '这个数据源停用了，先启用再同步' }
  if (src.id === 'src_xhs_notes') {
    const st = notesState()
    if (st.pending) return { kind: '要手动', message: `先确认 ${st.pending} 列对照（${st.pending_cols.join('、')}）：平台改了列名，不确认就同步，还是会因为对不上而失败。在这个数据源的“等你确认”里点一下就行` }
    if (!st.file) return { kind: '没有新文件', message: `${src.inbox_dir}/ 里没有笔记数据表：小艾从专业号后台导出“笔记数据”放进去再点` }
    if (st.file.imported_at) return { kind: '没有新文件', message: `${st.file.name} 已在 ${whenText(st.file.imported_at)} 按新对照导过，没有新文件` }
    const r = reimportNotes('网页')
    return { kind: '导入了', message: r.message }
  }
  switch (src.kind) {
    case '平台导出': return syncFolder(src)
    case '知识库文件夹': return syncKb(src)
    case '飞书多维表格': return { kind: '要手动', message: `门店日报在飞书多维表格里，要用飞书命令行工具读。这份示例没有连真的飞书表格，现在拉不了；${src.owner ?? '负责的人'}填完后，${src.schedule.replace('每天 ', '今晚 ')} 的定时任务会读。真用的时候装好飞书命令行工具、把表格链接写进数据源，就能“立即同步”` }
    case '飞书日历与妙记': {
      const cal = get<{ at: string }>(`SELECT COALESCE(finished_at, started_at) AS at FROM import_runs WHERE source_id = :s AND status = '成功' ORDER BY started_at DESC LIMIT 1`, { s: src.id })?.at
      return { kind: '要手动', message: `这份示例没有连真的飞书，现在拉不了；日历停在 ${cal ? whenText(cal) : '—'} 那次同步。${md('2026-10-26')} 周会的妙记飞书那边还没生成（可能没开录音转写），生成之前同步也拿不到，可以在飞书里打开那场会议看看` }
    }
    case 'RSS': return { kind: '要手动', message: '这份示例里的订阅地址是虚构的，现在拉不了；明早 06:30 的定时任务照常拉。真用的时候换成你自己的订阅地址' }
    case 'Codex 定时任务': return { kind: '要手动', message: 'Codex 定时任务在 Codex 里按点跑（07:00 出选题、07:10 起草关怀、07:55 等平台数据导完写经营早报、每周二 07:30 写周复盘），网页上不能替它跑。要现在出一份，在 Codex 里说“写一份今天的经营早报”' }
    default: return { kind: '要手动', message: '这种数据源不能在网页上同步' }
  }
}
