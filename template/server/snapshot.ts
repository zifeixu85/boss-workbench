// 只读快照：把数据库里的现状导出成 Markdown，放在 工作台/快照/。
// 用途：其他项目里的对话通过知识库 Skill 也能读到“客户现状、今天要做什么”，不用连数据库。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, localDate } from './db.ts'
import { now } from './clock.ts'
import { overview } from './services/today.ts'
import { listProjects } from './services/projects.ts'
import { clientList } from './modules/crm/service.ts'

const HEAD = (title: string) => `# ${title}\n\n> 由工作台自动生成，${localDate()} ${now().toTimeString().slice(0, 5)}。**不要在这里改**：改动请在工作台网页里做，或让 Codex 用工作台命令写入。\n\n`
const cell = (s: unknown) => String(s ?? '—').replace(/\|/g, '/').replace(/\n/g, ' ')
const yuan = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n).toLocaleString('zh-CN')} 元`)

export function writeSnapshots() {
  const dir = join(ROOT, '工作台', '快照')
  mkdirSync(dir, { recursive: true })
  const cs = clientList()
  const clientsMd = HEAD('客户现状') + '| 客户 | 联系人 | 阶段 | 上次联系 | 下次跟进 | 下一步 | 累计消费 | 最近一次沟通 |\n|---|---|---|---|---|---|---|---|\n'
    + cs.map((c) => `| ${cell(c.name)}${c.key_account ? '（大客户）' : ''} | ${cell(c.contact_name)} | ${cell(c.stage)} | ${cell(c.last_contact)} | ${cell(c.next_follow)} | ${cell(c.next_step)} | ${yuan(c.total_spent || null)} | ${cell(c.last_summary)} |`).join('\n') + '\n'
  const v = overview()
  const s = v.sales
  const todayMd = HEAD(`${v.date} 今日`) + `最该做的一件事：${v.headline?.title ?? '（无）'}\n\n`
    + (s ? `## 各平台昨天（${s.date}）\n\n合计 ${yuan(s.total.gmv)}，比前天 ${s.total.vs_prev ?? '—'}%\n\n` + s.channels.map((c) => `- ${c.name}：${yuan(c.gmv)}，退款率 ${c.refund_rate ?? '—'}%，ROI ${c.roi == null ? '—' : Number(c.roi).toFixed(1)}`).join('\n') + '\n\n' : '')
    + '## 数据异常\n\n' + (v.alerts.map((a) => `- ${a.title}：${a.detail}${a.cause ? `；${a.cause}` : ''}`).join('\n') || '- （无）') + '\n\n'
    + '## 今天该跟进的大客户\n\n' + (v.key_clients.map((c) => `- ${c.name}：${c.reasons.slice(0, 2).join('；')}`).join('\n') || '- （无）') + '\n\n'
    + '## 小红书今天发什么\n\n' + (v.xhs?.posts.map((p) => `- ${p.time ?? ''} ${p.title}（${p.status}）`).join('\n') || '- （无）') + '\n\n'
    + '## 今天要做\n\n' + ((v.todos.today as { title: string; status: string }[]).map((t) => `- ${t.title}（${t.status}）`).join('\n') || '- （无）')
    + '\n\n## 有风险的项目\n\n' + (listProjects().filter((p) => p.risks.length).map((p) => `- ${p.name}：${p.risks.map((r) => r.text).join('；')}`).join('\n') || '- （无）') + '\n'
  const files = [['客户现状.md', clientsMd], ['今日概况.md', todayMd]] as const
  for (const [name, body] of files) writeFileSync(join(dir, name), body, 'utf8')
  return files.map(([name]) => `工作台/快照/${name}`)
}
