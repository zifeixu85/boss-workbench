// 数据源与导入的命令行（给 Codex 用，和网页走同一套规则）。在知识库根目录运行：
//   node 工作台/程序/server/cli.ts import-<命令> [参数] [--json]（公共命令行把 import 开头的命令转到这里）
//   也可以直接 node 工作台/程序/server/modules/data/cli.ts <命令>
// 写入的命令都要先看过 check 的结果、老板说“确认”再加 --yes。归属：数据源与导入模块。
import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { readTable } from './csv.ts'
import { analyze } from './recognize.ts'
import { buildPreview } from './preview.ts'
import { commitTable, withSampleFlag } from './importer.ts'
import { undoBatch, listBatches, sampleStatus, clearSamples, restoreSamples, channelArg } from './batches.ts'
import { listRules } from './rules.ts'
import { sources, runs } from './service.ts'
import { syncSource, decodeFile } from './sync.ts'
import { reimportNotes } from './notes.ts'
import { resetDemo } from './reset.ts'
import { CHANNELS, FIELD, type FieldKey } from './fields.ts'
import { span } from './time.ts'

const HELP = `用法：node 工作台/程序/server/cli.ts import-<命令> [参数] [--json]

查看
  import-sources                      数据源：每个来源的状态、最近更新、数据截至
  import-runs [--source 数据源ID] [--limit 20]   导入记录
  import-rules                        导入规则
  import-batches                      每次导入写进去的那一批（能撤销的）
  import-check <文件.csv> [--channel tmall] [--map 列名=字段 ...] [--skip-missing 字段]
                                      认表 + 对字段 + 预览（只读，不写）。字段：${Object.keys(FIELD).join(' ')}
写入（先 import-check，给老板看过、他说“确认”再加 --yes）
  import <文件.csv> --yes [同 import-check 的参数] [--no-rule]   导入；默认把对照存成导入规则
  import-undo <批次ID> --yes          撤销一次导入
  import-sync <数据源ID> --yes         立即同步一个数据源（去它的导入文件夹找新文件）
  import-samples [clear|restore] [--channel tmall] [--yes]   看 / 清掉 / 恢复预置的示例数据（只动预置批次，你导的不动；--channel 只动一个渠道）
  import-notes --yes                  小红书笔记数据：对照确认完后，按新对照重新导入导入文件夹里那份笔记数据表
  import-reset --yes                  彩排后复原：撤销现场导过的每一批、放回示例数据、本模块的表重灌示例（演示的人用）
规则：拿不准的列不要替老板选；缺列不能当 0；对照和知识库《数据口径》对不上时，以知识库为准并告诉老板。`

const ARGV = process.argv.slice(2)
const { values: o, positionals } = parseArgs({
  args: ARGV, allowPositionals: true, strict: false,
  options: {
    json: { type: 'boolean' }, yes: { type: 'boolean' }, source: { type: 'string' }, limit: { type: 'string' }, channel: { type: 'string' },
    map: { type: 'string', multiple: true }, 'skip-missing': { type: 'string', multiple: true }, 'no-rule': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  },
})
const cmd = positionals[0] === 'import' ? 'import' : positionals[0]?.replace(/^import-/, '')
const a1 = positionals[1]
const out = (data: unknown, text: string) => console.log(o.json ? JSON.stringify(data, null, 2) : text)
const need = () => { if (!o.yes) throw new Error(cmd === 'reset' ? '复原会撤销现场导过的所有数据：确认要复原再加 --yes' : '这是写入命令：先给老板看 check 的结果，他说“确认”后再加 --yes') }

function loadFile(path: string) {
  const p = resolve(path)
  const { text } = decodeFile(readFileSync(p))
  const table = readTable(text)
  const columns: Record<string, { field: FieldKey | null; by: '你选的' }> = {}
  for (const m of (o.map as string[] | undefined) ?? []) {
    const [col, field] = m.split('=')
    const i = table.headers.findIndex((h) => h.trim() === col.trim())
    if (i < 0) throw new Error(`表里没有「${col}」这一列`)
    if (field && field !== 'null' && !(field in FIELD)) throw new Error(`字段「${field}」不认识，可选：${Object.keys(FIELD).join(' ')}`)
    columns[String(i)] = { field: field && field !== 'null' ? field as FieldKey : null, by: '你选的' }
  }
  const choices = { columns, channel_id: (o.channel as string | undefined) ?? undefined, ack_missing: ((o['skip-missing'] as string[] | undefined) ?? []) as FieldKey[] }
  return { table, analysis: withSampleFlag(analyze(table, choices), basename(p)), name: basename(p) }
}

function main() {
  switch (cmd) {
    case 'sources': {
      const xs = sources()
      return out(xs, xs.map((s) => `- [${s.id}] ${s.name}（${s.way}）：${s.display}，最近 ${s.last_run_at?.replace('T', ' ') ?? '—'}，数据截至 ${s.data_through ?? '—'}${s.reason ? `。${s.reason}` : ''}`).join('\n'))
    }
    case 'runs': {
      const xs = runs({ source: o.source as string | undefined, limit: o.limit as string | undefined })
      return out(xs, xs.map((r) => `- ${String(r.started_at).replace('T', ' ')} ${r.source_name} ${r.status}：${r.message ?? ''}${r.batch_status === '已撤销' ? '（已撤销）' : ''}`).join('\n'))
    }
    case 'rules': {
      const xs = listRules()
      return out(xs, xs.map((r) => `- [${r.id}] ${r.platform} · ${r.report}（${r.status}，${r.origin}）用过 ${r.use_count} 次，最近 ${r.last_used_at ?? '—'}；${r.mapping.filter((m) => m.field).map((m) => `${m.col}→${m.field}`).join('，')}`).join('\n'))
    }
    case 'batches': {
      const xs = listBatches()
      return out(xs, xs.map((b) => `- [${b.id}] ${b.label}（${b.origin}，${b.status}）${b.rows} 行${b.file_name ? `，文件 ${b.file_name}` : ''}`).join('\n'))
    }
    case 'check': case 'import': {
      if (!a1) throw new Error('要给一个 CSV 文件的路径')
      const { table, analysis: a, name } = loadFile(a1)
      const lines = [`# ${name}`, a.recognized ? `认出来：${a.recognized.platform} · ${a.recognized.report}（${a.recognized.reasons.join('；')}）` : '认不出是哪家平台的表',
        a.rule ? `对上规则：${a.rule.name}（表头 ${a.rule.matched}/${a.rule.total} 对得上）` : '没有现成的导入规则',
        `渠道：${a.channel_id ? CHANNELS[a.channel_id]?.name : a.channel_from ?? '没定'}｜日期格式：${a.date?.label ?? '没找到日期列'}｜金额单位：${a.amount_unit}`,
        '\n## 对照', ...a.columns.map((c) => `- ${c.state}｜${c.header} → ${c.field ? FIELD[c.field].label : '不导'}（${c.why}）`)]
      if (a.blocking.length) {
        lines.push('\n## 还不能导', ...a.blocking.map((b) => `- ${b}`))
        if (cmd === 'import') throw new Error(`还不能导：${a.blocking.join('；')}`)
        return out({ analysis: a }, lines.join('\n'))
      }
      const p = buildPreview(table, a)
      lines.push(`\n## 预览：能导 ${p.counts.ok} 行（新增 ${p.counts.new}、覆盖 ${p.counts.update}、一样 ${p.counts.same}），跳过 ${p.counts.skipped}，有问题 ${p.counts.bad}，${span(p.date_from, p.date_to)}`,
        ...p.problems.map((x) => `- 第 ${x.line} 行（${x.kind}）：${x.reason}`), ...p.rows.filter((r) => r.warnings.length).map((r) => `- 第 ${r.line} 行 ${r.date} 提醒：${r.warnings.join('；')}`))
      if (cmd === 'check') return out({ analysis: a, preview: p }, lines.join('\n'))
      need()
      const res = commitTable(table, a, { fileName: name, saveRule: !o['no-rule'], actor: 'Codex', by: 'Codex' })
      return out(res, `已导入 ${res.rows} 行：${res.batch.label}（批次 ${res.batch.id}，要撤销：undo ${res.batch.id} --yes）${res.rule ? `；规则「${res.rule.name}」${res.rule.action}` : ''}`)
    }
    case 'undo': {
      need()
      const r = undoBatch(a1, 'Codex')
      const empty = r.empty_channels.filter((c) => c.sample_rows > 0)
      return out(r, `已撤销「${r.batch.label}」：恢复 ${r.restored} 行，删掉 ${r.removed} 行${r.kept ? `，${r.kept} 行后来又被改过没动` : ''}${empty.length ? `。${empty.map((c) => c.name).join('、')}现在没有数了（示例数据之前清掉了），要放回：import-samples restore --channel ${empty[0].id} --yes` : ''}`)
    }
    case 'sync': { need(); const r = syncSource(a1); return out(r, `${r.kind}：${r.message}`) }
    case 'notes': { need(); const r = reimportNotes('Codex'); return out(r, r.message) }
    case 'reset': {
      need()
      const r = resetDemo()
      return out(r, [`复原好了：撤销了现场导的 ${r.undone.length} 批${r.undone.length ? `（${r.undone.join('、')}）` : ''}${r.restored ? `，放回示例数据 ${r.restored} 行` : ''}；数据源、导入记录、导入规则、字段对照回到 10/27 早上的样子。`,
        r.rule_files_removed.length ? `删掉了库里已经没有的规则文件：${r.rule_files_removed.join('、')}` : '',
        r.extra_files.length ? `导入文件夹里这些是彩排时放进去的，没删（不要的话手动删掉，不然“立即同步”会再导一次）：${r.extra_files.join('、')}` : '',
        '网页刷新一下就能看到；工作台不用重启。'].filter(Boolean).join('\n'))
    }
    case 'samples': {
      const ch = channelArg(o.channel)
      if (a1 === 'clear') { need(); const r = clearSamples('Codex', ch); return out(r, `清掉了${ch ? CHANNELS[ch].name + '的' : ''}预置示例数据 ${r.cleared} 行${r.kept ? `（${r.kept} 行后来导过，没动）` : ''}`) }
      if (a1 === 'restore') { need(); const r = restoreSamples('Codex', ch); return out(r, `恢复了${ch ? CHANNELS[ch].name + '的' : ''}预置示例数据 ${r.restored} 行`) }
      const s = sampleStatus()
      return out(s, `预置的示例数据：经营每天的数 ${s.rows_live} 行在用${s.rows_cleared ? `，${s.rows_cleared} 行清掉了（可恢复）` : ''}；你导的批次 ${s.my_batches} 个\n${s.batches.map((b) => `- ${b.label}（${b.status}${b.cleared_rows ? `，${b.cleared_rows} 行可放回` : ''}）`).join('\n')}`)
    }
    default: console.log(HELP)
  }
}

try {
  if (o.help) console.log(HELP)
  else main()
} catch (err) {
  console.error(`没办成：${(err as Error).message}`)
  process.exit(1)
}
