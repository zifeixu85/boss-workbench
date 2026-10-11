// 内容中心的小工具：状态顺序和颜色、单篇抽屉的地址栏参数、边改边查、时间和用时的写法。归属：小红书内容模块。
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { runChecks } from '@shared/xhs-check'
import { useApi } from '@/lib/api'
import { todayStr, NBSP } from '@/lib/format'
import type { Draft, PieceStatus, Rules } from './types'

export const BOARD: PieceStatus[] = ['灵感池', '已选', '写稿中', '待发布', '已发布']
type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'primary'
export const STATUS_TONE: Record<PieceStatus, Tone> = { 灵感池: 'neutral', 已选: 'neutral', 写稿中: 'info', 待发布: 'warn', 已发布: 'neutral', 已放弃: 'neutral' }
/** 颜色之外再分一层：已选是空心描边（决定了、还没动），已发布是浅灰底正文色（过去的事弱化），已放弃加删除线 */
export const STATUS_CLASS: Partial<Record<PieceStatus, string>> = {
  已选: 'bg-transparent text-foreground ring-1 ring-inset ring-border',
  已发布: 'bg-surface-2 text-foreground/75',
  已放弃: 'line-through',
}
export const STATUS_HINT: Record<PieceStatus, string> = {
  灵感池: 'AI 和团队攒下的想法', 已选: '决定要做，还没动笔', 写稿中: '在创作页和 AI 一起写', 待发布: '定稿了，等那天发', 已发布: '发出去了，跟数据', 已放弃: '不做了，留个记录',
}
export const SOURCE_SHORT: Record<string, string> = {
  评论区问题: '评论区', 热点和节气: '热点节气', 同行爆款: '同行爆款', 知识库客户常问: '客户常问', 自己想的: '自己想的', 复盘建议: '复盘建议', 旧笔记翻新: '旧笔记翻新', 从一款茶开始: '一款茶', 对标笔记: '对标笔记',
}

/** 单篇抽屉：?piece=<id>，今天、内容、数据、复盘四页都能开 */
export function usePieceParam() {
  const [sp, setSp] = useSearchParams()
  const open = useCallback((id: string) => setSp((p) => { const n = new URLSearchParams(p); n.set('piece', id); return n }), [setSp])
  const close = useCallback(() => setSp((p) => { const n = new URLSearchParams(p); n.delete('piece'); return n }), [setSp])
  return { id: sp.get('piece'), open, close }
}

/** 页面自己的筛选、视图写进地址栏 */
export function useParam<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const [sp, setSp] = useSearchParams()
  const v = (sp.get(key) as T) || fallback
  const set = useCallback((x: T) => setSp((p) => { const n = new URLSearchParams(p); if (x === fallback) n.delete(key); else n.set(key, x); return n }, { replace: true }), [setSp, key, fallback])
  return [v, set]
}

/** 边改边查：词表从服务端取一次（知识库和客户表现读），规则在 shared/xhs-check.ts，和服务端同一套 */
export function useChecks(draft: Draft | null | undefined, publishOn?: string | null) {
  const { data: rules } = useApi<Rules>('/content/check-rules')
  return useMemo(() => (draft && rules ? runChecks(draft, rules.rules, rules.sources, publishOn || rules.today || todayStr()) : null), [draft, rules, publishOn])
}

/** ISO 时间 → 本地“07:12” */
export const hm = (iso?: string | null) => (iso ? new Date(iso).toTimeString().slice(0, 5) : '—')
/** ISO 时间 → 本地日期 2026-10-27 */
export const localDay = (iso?: string | null) => {
  if (!iso) return null
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** 10/27 07:12 */
export const mdhm = (iso?: string | null) => {
  const d = localDay(iso)
  return d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}${NBSP}${hm(iso)}` : '—'
}
/** 用时：48 秒、3 分 21 秒 */
export function took(ms?: number | null) {
  if (ms == null) return ''
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}${NBSP}秒` : `${Math.floor(s / 60)}${NBSP}分${s % 60 ? ` ${s % 60}${NBSP}秒` : ''}`
}
export const pct = (a?: number | null, b?: number | null) => (a == null || !b ? null : Math.round((a / b) * 1000) / 10)
/** 知识库文件的短名：README 写成“所在文件夹 · 说明”；代表作卡去掉编号；给 AI 的写法说明叫“小红书写法” */
export const kbName = (p: string) => {
  if (p.startsWith('.agents/')) return '小红书写法'
  const parts = p.split('/')
  const f = parts.pop()!.replace(/\.md$/, '')
  if (f === 'README') return `${(parts.pop() ?? '知识库').replace(/^\d+-/, '')} · 说明`
  const card = f.match(/^XHS-\d{4}-\d+-(.+)$/)
  if (card) return `代表作 · ${card[1]}`
  if (parts.at(-1) === '规律') return `规律 · ${f}`
  return f
}
/** 依据里写的是知识库路径（06-项目/xx.md）就当文件链接 */
export const isKbPath = (s?: string | null) => !!s && /^\d{2}-[^\s]+\.md$/.test(s.trim())
