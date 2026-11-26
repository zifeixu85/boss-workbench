// 报告模板（2026-11-26 A梦 定：“报告的提纲最好是可以修改的……样式尽量通用……要有图形化输出……在对话里可以去修改”）。
// 放在知识库报告文件夹里的“报告模板.md”：一级标题是哪种报告（# 周报），二级标题是一节，下面几行写这一节用哪种块、数据从哪来、怎么写。
// 老板在对话里说“周报里加一节某某”，总助改的就是这份文件；工作台按它显示，不认死标题。没有这份文件用下面的默认一套。
// 内容以“对话里发生了什么”为主：项目状态、待办到期这些别的页面已经能看到，不在报告里再抄一遍。纯解析，不读写文件。
import type { ReportKind } from './report-parse.ts'

/** 块：一段话、要点、数字卡、图表（柱图、线图、占比）、表格、待你点头（编了号的清单，老板回“写 1、3”） */
export const BLOCKS = ['一段话', '要点', '数字卡', '柱图', '线图', '占比', '表格', '待你点头'] as const
export type Block = (typeof BLOCKS)[number]
export const CHARTS: Block[] = ['柱图', '线图', '占比']

/** 工作台能算的数（pa-week 给）：card 是一个数，series 是一串（按天、按小时、按对象），list 是一张小表 */
export const DATA: Record<string, { kind: 'card' | 'series' | 'list'; what: string }> = {
  对话数: { kind: 'card', what: '这一期有动静的 AI 对话' },
  做完: { kind: 'card', what: 'AI 把一轮做完了的对话（推断）' },
  在等你: { kind: 'card', what: '最后在问你、等你回话的对话' },
  打断: { kind: 'card', what: '一轮没跑完就停了的对话' },
  出图: { kind: 'card', what: '生成的图片' },
  出文件: { kind: 'card', what: '写出来的文件（不算代码）' },
  token: { kind: 'card', what: 'Codex 用了多少 token' },
  连续天数: { kind: 'card', what: '到这一期最后一天，连续几天在用' },
  没挂对象占比: { kind: 'card', what: '没归到任何项目、客户上的对话占几成' },
  深夜占比: { kind: 'card', what: '晚上 10 点到早上 6 点开的对话占几成' },
  按天对话: { kind: 'series', what: '每天开了几个对话、做完几件' },
  按天token: { kind: 'series', what: '每天用了多少 token' },
  按小时: { kind: 'series', what: '一天里几点开对话最多' },
  按对象: { kind: 'series', what: '对话花在哪些项目、客户（还没归的按文件夹）' },
  重复开对话: { kind: 'list', what: '同一件事一天里开了三个以上对话' },
}

export type Source = 'AI' | '工作台' | '工作台+AI'
export type TemplateSection = { title: string; blocks: Block[]; source: Source; data: string[]; note: string; who: '总助' | '分身' }
export type Template = { kinds: Record<ReportKind, TemplateSection[]>; problems: string[] }

export const TEMPLATE_FILE = '报告模板.md'

/** 默认的一套（老板没写模板文件时用；pa-report-template --init 也写这一份进知识库让他改） */
export const DEFAULT_TEMPLATE = `---
类型: 报告模板
更新: 2026-11-26
---

<!-- 报告有哪几节在这里改：一级标题是哪种报告，二级标题是一节，标题就是报告里的节名。
     块：一段话、要点、数字卡、柱图、线图、占比、表格、待你点头（几种可以一起写，用顿号隔开）
     来源：AI（读对话写）、工作台（工作台算的数）、工作台＋AI（数是工作台的，再加一两句 AI 的话）
     数据：来源有工作台时写，名字见 pa-report-template 的说明
     写的人：分身写的节写“分身”，有分身才写 -->

# 周报

## 一句话
- 块：一段话
- 来源：AI
- 写法：这周最重要的一件事，一两句话

## 这周在推进什么
- 块：要点
- 来源：AI
- 写法：读这周的对话，按项目、客户分：在推进什么、推进到哪、下一步。只写对话里发生的，不抄对象的状态

## 做成了什么
- 块：数字卡、要点
- 来源：工作台＋AI
- 数据：做完、出图、出文件
- 写法：这周对话里做成的事，每条一句，带上产出在哪

## 卡在哪
- 块：数字卡、要点
- 来源：工作台＋AI
- 数据：在等你、打断
- 写法：没做完的、在等人的、反复卡住的，每条写卡在哪一步

## 用 AI 的情况
- 块：数字卡、柱图
- 来源：工作台
- 数据：对话数、做完、token、连续天数、按天对话

## 使用习惯
- 块：占比、柱图、一段话
- 来源：工作台＋AI
- 数据：按对象、按小时、没挂对象占比、深夜占比、重复开对话
- 写法：一两句建议，比如哪些对话该归到项目上、哪件事别开那么多对话

## 说了但没沉淀的
- 块：待你点头
- 来源：AI
- 写法：对话里说过、知识库里还没有的事实、决定、规矩、客户信息。每条写哪次对话、一句转述、建议写进哪份文件、为什么；老板回“写 1、3”才写

## 这周的你
- 块：一段话
- 来源：AI
- 写的人：分身

## 目标对照
- 块：表格
- 来源：AI
- 写的人：分身

# 日报

## 一句话
- 块：一段话
- 来源：AI

## 今天在推进什么
- 块：要点
- 来源：AI
- 写法：按项目、客户分，推进到哪

## 卡在哪
- 块：要点
- 来源：AI

## 用 AI 的情况
- 块：数字卡
- 来源：工作台
- 数据：对话数、做完、在等你、token

# 月报

## 一句话
- 块：一段话
- 来源：AI

## 这个月在推进什么
- 块：要点
- 来源：AI
- 写法：按项目、客户分，这个月推进到哪、做成了什么

## 用 AI 的情况
- 块：数字卡、线图
- 来源：工作台
- 数据：对话数、做完、出图、出文件、token、按天对话

## 使用习惯
- 块：占比、一段话
- 来源：工作台＋AI
- 数据：按对象、没挂对象占比、深夜占比

## 说了但没沉淀的
- 块：待你点头
- 来源：AI
`

const KINDS: ReportKind[] = ['日报', '周报', '月报']
const split = (v: string) => v.split(/[、,，;；\s]+/).map((x) => x.trim()).filter(Boolean)
const sourceOf = (v: string): Source | null => {
  const s = v.replace(/\s/g, '').replace(/＋/g, '+')
  return s === 'AI' ? 'AI' : s === '工作台' ? '工作台' : /^(工作台\+AI|AI\+工作台)$/i.test(s) ? '工作台+AI' : null
}

/** 读模板：每种报告一组节；写错的块、数据名、来源说出来，那一项不用（这一节照样在） */
export function parseTemplate(md: string): Template {
  const text = md.replace(/^﻿/, '').replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, '').replace(/<!--[\s\S]*?-->/g, '')
  const problems: string[] = []
  const got: Partial<Record<ReportKind, TemplateSection[]>> = {}
  let kind: ReportKind | null = null
  let cur: TemplateSection | null = null
  const close = () => { if (cur && kind) { if (!cur.blocks.length) cur.blocks = cur.source === 'AI' ? ['一段话'] : ['数字卡']; got[kind]!.push(cur) } cur = null }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const h1 = line.match(/^#\s+(.+)$/)
    if (h1) {
      close()
      const k = h1[1].trim() as ReportKind
      kind = KINDS.includes(k) ? k : null
      if (!kind) problems.push(`“${h1[1].trim()}”不是日报、周报、月报，这一段不用`)
      else got[kind] = []
      continue
    }
    const h2 = line.match(/^##\s+(.+)$/)
    if (h2) { close(); if (kind) cur = { title: h2[1].trim(), blocks: [], source: 'AI', data: [], note: '', who: '总助' }; continue }
    const kv = line.match(/^[-*]\s*([^：:]+?)\s*[：:]\s*(.*)$/)
    if (!kv || !cur) continue
    const [, key, value] = kv
    const at = `${kind}“${cur.title}”`
    if (key === '块') {
      for (const b of split(value)) { if ((BLOCKS as readonly string[]).includes(b)) cur.blocks.push(b as Block); else problems.push(`${at}的块“${b}”认不出来（能用：${BLOCKS.join('、')}）`) }
    } else if (key === '来源') {
      const s = sourceOf(value)
      if (s) cur.source = s; else problems.push(`${at}的来源“${value}”认不出来（写 AI、工作台 或 工作台＋AI）`)
    } else if (key === '数据') {
      for (const d of split(value)) { if (DATA[d]) cur.data.push(d); else problems.push(`${at}的数据“${d}”工作台算不了（能用：${Object.keys(DATA).join('、')}）`) }
    } else if (key === '写法') cur.note = value
    else if (key === '写的人') cur.who = /分身/.test(value) ? '分身' : '总助'
  }
  close()
  const fallback = md === DEFAULT_TEMPLATE ? null : parseTemplate(DEFAULT_TEMPLATE)
  const kinds = Object.fromEntries(KINDS.map((k) => [k, got[k] ?? fallback?.kinds[k] ?? []])) as Record<ReportKind, TemplateSection[]>
  return { kinds, problems }
}

/** 某种报告的节：有模板文件用它（这种报告没写就用默认），没有用默认 */
export function templateFor(md: string | null, kind: ReportKind): TemplateSection[] {
  return parseTemplate(md ?? DEFAULT_TEMPLATE).kinds[kind]
}
