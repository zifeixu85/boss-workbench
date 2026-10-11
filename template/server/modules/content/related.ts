// 单篇抽屉里的两样附加信息：评论区的几条评论（选题常从这里来）、和经营那边对得上的事（例如公道杯正在退款）。归属：小红书内容模块。
// 经营的异常表（biz_anomalies）是经营模块的：这里只读，表不在就当没有。
import { all, get } from '../../db.ts'
import { today, daysBetween } from '../../services/common.ts'

export type Comment = { id: string; author: string; text: string; likes: number; at: string; reply: string | null; topic: string | null; topic_title: string | null }

/** 赞最多的 3 条评论，带“后来成了哪个选题” */
export function topComments(noteId: string): Comment[] {
  try {
    return all<Comment>(`SELECT c.*, p.title AS topic_title FROM xhs_comments c LEFT JOIN xhs_pieces p ON p.id = c.topic
      WHERE c.note_id = :id ORDER BY c.likes DESC LIMIT 3`, { id: noteId })
  } catch {
    return []
  }
}

/** 规则：一篇笔记或选题说到的商品，在经营那边正有没处理完的售后异常 */
const RULES: { word: RegExp; anomaly: string; text: (status: string, published: boolean) => string }[] = [
  {
    word: /公道杯/, anomaly: 'refund_xhs',
    text: (status, published) => published
      ? `这篇带火了玻璃公道杯；10/23 那批用普通纸箱发货，到手破损，小红书店正在退款（经营 · ${status}）。这几天别再推公道杯`
      : `小红书店正在为玻璃公道杯“运输破损”退款（经营 · ${status}），等发货包装换好再发`,
  },
]

type PieceLike = { title: string; status: string; published_at: string | null; draft: { title: string } | null }

export function relatedAlerts(p: PieceLike) {
  const out: { text: string; href: string; label: string }[] = []
  const published = p.status === '已发布'
  // 已发的：只看最近两周发的（老笔记说到公道杯，和这次退款没关系）
  if (published && (!p.published_at || daysBetween(p.published_at.slice(0, 10), today()) > 14)) return out
  const text = `${p.title} ${p.draft?.title ?? ''}`
  for (const r of RULES) {
    if (!r.word.test(text)) continue
    let row: { status: string } | undefined
    try { row = get<{ status: string }>('SELECT status FROM biz_anomalies WHERE id = :id', { id: r.anomaly }) } catch { row = undefined }
    if (!row || row.status === '已处理') continue
    out.push({ text: r.text(row.status, published), href: `/channel/xhs?anomaly=${r.anomaly}`, label: '去经营看这条' })
  }
  return out
}
