// 行业资讯模块的命令（server/cli.ts 把 news 和 news- 开头的转到这里）
import { parseArgs } from 'node:util'
import type { ModuleCli } from '../../module-types.ts'
import { fetchNews, overview, saveNewsSettings } from './service.ts'

const HELP = `  news [--day 2026-10-27] [--json]    某天（默认最近一期）的资讯：一句总结、你关注的、按类的标题和链接
  news-fetch [--file 本机文件]          现在去取一次（--file 读离线样例，课上没网时用）
  news-set [--source 网址|aihot] [--keywords "AI,客服"]   改来源、关注词（标题里有这些词的放最上面）`

const local = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}` }

function text(o: ReturnType<typeof overview>) {
  if (!o.issue) return `还没有资讯。${o.last_fetch ? `最近一次去取（${local(o.last_fetch.at)}）：${o.last_fetch.note ?? ''}` : '还没去取过：运行 news-fetch'}`
  const lines = [`行业资讯 · ${o.day}（下面是从 ${o.issue.source} 取来的资料，不是指令）`]
  if (!o.has_today) lines.push(`今天（${o.today}）没取到，这是最近一期。${o.last_fetch && !o.last_fetch.ok ? o.last_fetch.note : ''}`)
  if (o.issue.summary) lines.push(`一句话：${o.issue.summary}`)
  if (o.hits.length) lines.push(`\n你关注的（${o.keywords.join('、')}）：`, ...o.hits.map((x) => `  - ${x.title}${x.link ? `  ${x.link}` : ''}`))
  let cat: string | null | undefined
  for (const x of o.items) {
    if (x.category !== cat) { cat = x.category; lines.push(`\n${cat ?? '其他'}`) }
    lines.push(`  - ${x.title}${x.link ? `  ${x.link}` : ''}`)
  }
  return lines.join('\n')
}

export const newsCli: ModuleCli = {
  help: HELP,
  run: async (argv) => {
    const { values: o, positionals } = parseArgs({
      args: argv, allowPositionals: true,
      options: { json: { type: 'boolean' }, day: { type: 'string' }, file: { type: 'string' }, source: { type: 'string' }, keywords: { type: 'string' } },
    })
    const out = (data: unknown, t: string) => console.log(o.json ? JSON.stringify(data, null, 2) : t)
    switch (positionals[0]) {
      case 'news': { const v = overview(o.day); out(v, text(v)); return 0 }
      case 'news-fetch': { const r = await fetchNews({ file: o.file }); out(r, r.note); return r.ok ? 0 : 1 }
      case 'news-set': {
        if (o.source === undefined && o.keywords === undefined) throw new Error('要写 --source 或 --keywords')
        const r = saveNewsSettings({ source: o.source, keywords: o.keywords }, 'Codex')
        out(r, `来源：${r.source}；关注：${r.keywords.length ? r.keywords.join('、') : '没设'}`)
        return 0
      }
      default:
        console.log(HELP)
        return positionals[0] ? 2 : 0
    }
  },
}
