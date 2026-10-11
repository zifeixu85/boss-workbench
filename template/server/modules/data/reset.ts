// 彩排后复原：把“数据源与导入”演示要用的状态恢复成演示前的样子。只动本模块写过的东西，别的模块的数据不碰。
//   ① 现场导过的每一批（经营每天的数、小红书笔记数据）按“写之前的样子”撤销，新到旧依次来；
//   ② 清掉的预置示例数据放回去；③ 本模块 7 张表重灌示例（天猫没有新规则、笔记数据 4 列等你确认、导入记录回到 10/27 早上）；
//   ④ 工作台/导入规则/ 里数据库已经没有的规则文件删掉；⑤ 导入文件夹里彩排时放进去的文件只列出来，不删。
// 用法：node 工作台/程序/server/cli.ts import-reset --yes（网页不用重启，刷新一下就行）。归属：数据源与导入模块。
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { all, run, tx, ROOT } from '../../db.ts'
import { undoBatch, restoreSamples, sampleStatus } from './batches.ts'
import { removeOrphanRuleFiles } from './rules.ts'
import { data } from '../../seed/data.ts'

/** 种子自己放进导入文件夹的文件（复原后还在、不算彩排留下的） */
const SEEDED = new Set(['工作台/导入/小红书笔记/笔记数据_20261026.csv', '工作台/导入/小红书笔记/粉丝数据_20261026.csv'])

export function resetDemo() {
  const live = all<{ id: string; label: string }>("SELECT id, label FROM data_batches WHERE id NOT LIKE 'batch_sample_%' AND status = '有效' ORDER BY rowid DESC")
  for (const b of live) undoBatch(b.id, 'Codex')
  const restored = sampleStatus().rows_cleared > 0 ? restoreSamples('Codex').restored : 0
  tx(() => { for (const t of data.tables) run(`DELETE FROM ${t}`); data.seed() })
  const ruleFiles = removeOrphanRuleFiles()
  const extra: string[] = []
  const dir = join(ROOT, '工作台', '导入')
  if (existsSync(dir)) {
    for (const sub of readdirSync(dir)) {
      const p = join(dir, sub)
      if (!statSync(p).isDirectory()) continue
      for (const f of readdirSync(p)) {
        const rel = relative(ROOT, join(p, f))
        if (!f.startsWith('.') && !SEEDED.has(rel)) extra.push(rel)
      }
    }
  }
  return { undone: live.map((b) => b.label), restored, rule_files_removed: ruleFiles, extra_files: extra }
}
