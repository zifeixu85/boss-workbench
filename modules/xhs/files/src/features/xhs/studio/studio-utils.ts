// 创作页的纯函数：宽度、账号、版本和文字导出。
import type { Draft } from '../types'

export const CHAT_KEY = 'workbench.xhs.chat-width'
export function chatBounds(total: number) {
  const available = Math.max(0, Number.isFinite(total) ? total - 24 : 0)
  const min = Math.min(280, available * .42)
  return { min, max: Math.max(min, Math.min(available * .6, available - 360)) }
}
export function chatWidth(value: number | null, total: number) {
  const { min, max } = chatBounds(total)
  return Math.round(Math.min(max, Math.max(min, value != null && Number.isFinite(value) ? value : total * .4)))
}
export function accountState(names: string[], current?: string | null) {
  return { mode: names.length === 0 ? 'empty' : names.length === 1 ? 'single' : 'select', label: names.length ? current || (names.length === 1 ? names[0] : '选择账号') : '还没登记账号' }
}
export function versionRows<T extends { version: number; author: string | null; origin: string }>(versions: readonly T[]) {
  return [...versions].sort((a, b) => b.version - a.version).map(v => ({ ...v, author: v.author || '未记录', origin: v.origin || '未记录' }))
}
export function draftText(d: Draft, markdown = true) {
  return [
    `${markdown ? '# ' : ''}${d.title}`, '',
    d.titles.filter(t => t !== d.title).length ? `备选标题：${d.titles.filter(t => t !== d.title).join(' / ')}\n` : '',
    `封面大字：${d.cover_text}`, '',
    ...d.pages.map((p, i) => `第 ${i + 1} 张图（${p.role}）：\n${p.text}\n`),
    d.body, '', d.tags.map(t => `#${t}`).join(' '),
  ].join('\n')
}
export function exportFilename(title: string, ext: 'md' | 'txt') {
  return `${title.replace(/[\\/:*?"<>|\r\n]/g, ' ').trim().slice(0, 80) || '小红书稿件'}.${ext}`
}
