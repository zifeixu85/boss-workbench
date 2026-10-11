// 详情抽屉和新建弹窗都由地址栏参数控制：可以分享链接、刷新不丢、后退能关闭。
//   ?client=c_qian    打开客户详情抽屉       ?event= ?todo= ?project=  同理
//   ?new=todo         打开新建待办弹窗        配合 &for=客户ID / 应收ID、&date=2026-10-08T15:00、&text=预填内容
import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export type DetailType = 'client' | 'event' | 'todo' | 'project'
export type NewKind = 'todo' | 'event' | 'client' | 'clientEdit' | 'log' | 'collect' | 'ledger' | 'deal' | 'project' | 'inbox'
const OVERLAY_KEYS = ['client', 'event', 'todo', 'project', 'new', 'for', 'date', 'text']

export function useOverlay() {
  const [sp, setSp] = useSearchParams()
  const update = useCallback((fn: (n: URLSearchParams) => void) => setSp((prev) => { const n = new URLSearchParams(prev); fn(n); return n }), [setSp])
  return {
    params: sp,
    openDetail: (type: DetailType, id: string) => update((n) => { ['client', 'event', 'todo', 'project'].forEach((k) => n.delete(k)); n.set(type, id) }),
    openNew: (kind: NewKind, extra: { for?: string; date?: string; text?: string } = {}) => update((n) => {
      n.set('new', kind)
      if (extra.for) n.set('for', extra.for); else n.delete('for')
      if (extra.date) n.set('date', extra.date); else n.delete('date')
      if (extra.text) n.set('text', extra.text); else n.delete('text')
    }),
    closeDetail: (type: DetailType) => update((n) => n.delete(type)),
    closeNew: () => update((n) => { n.delete('new'); n.delete('for'); n.delete('date'); n.delete('text') }),
    clearAll: () => update((n) => OVERLAY_KEYS.forEach((k) => n.delete(k))),
  }
}
