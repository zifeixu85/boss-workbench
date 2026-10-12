// 和本地服务通信。所有数据都走这里；文件或数据库变了，服务推送事件，页面自动重新取数。
import { QueryClient, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { NOTIFY_EVENT, notifyEnabled, showPopups, type PushedPopup } from './reminders'

export class ApiError extends Error {
  issues?: { path: string; message: string }[]
  constructor(message: string, issues?: { path: string; message: string }[]) {
    super(message)
    this.issues = issues
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({ ok: false, error: `本地服务没有响应（${res.status}）` }))
  if (!json.ok) throw new ApiError(json.error ?? '出错了', json.issues)
  return json.data as T
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown) => request<T>('POST', url, body),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: 1 } },
})

export function useApi<T>(url: string | null, key?: QueryKey) {
  return useQuery<T>({ queryKey: key ?? [url], queryFn: () => api.get<T>(url!), enabled: url !== null })
}

/** 写操作：成功后提示并刷新全部数据（数据量小，整体刷新最省心） */
export function useWrite<TInput, TOut = unknown>(fn: (input: TInput) => Promise<TOut>, success?: string | ((out: TOut) => string)) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (out) => {
      qc.invalidateQueries()
      if (success) toast.success(typeof success === 'function' ? success(out) : success)
    },
    onError: (err) => toast.error(err.message),
  })
}

export type LiveState = 'connecting' | 'live' | 'offline'

/** 订阅本地服务推送：Codex 改了数据库或知识库，页面几乎立刻更新。
 *  浏览器对同一网站最多同时开 6 个连接：标签页切到后台或进入前进/后退缓存时先断开推送，回来再连并补一次刷新，
 *  否则开多个标签页时请求会排队卡住。 */
export function useLiveRefresh() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const nav = useRef(navigate) // 放进 ref：换页时不用重连推送
  useEffect(() => { nav.current = navigate }, [navigate])
  const [state, setState] = useState<LiveState>('connecting')
  useEffect(() => {
    let es: EventSource | null = null
    let idle: ReturnType<typeof setTimeout> | null = null
    const connect = () => {
      if (es) return
      // 在这个浏览器点过“开启提醒”、也允许了通知：告诉服务端，到点的提醒推到这里用浏览器通知弹（server/index.ts）
      es = new EventSource(notifyEnabled() ? '/api/live?notify=on' : '/api/live')
      es.onopen = () => setState('live')
      es.onerror = () => {
        setState('offline')
        // 浏览器一般会自己重连；连接被关死了（服务重启时有的浏览器会这样）就过 5 秒自己重连
        if (es?.readyState === EventSource.CLOSED) { es = null; setTimeout(() => { if (!es && document.visibilityState === 'visible') connect() }, 5000) }
      }
      es.addEventListener('change', (e) => {
        const msg = JSON.parse((e as MessageEvent).data || '{}')
        if (msg.reason === 'hello') return
        qc.invalidateQueries()
        if (msg.reason === 'external') toast('Codex 刚更新了数据', { description: '页面已同步' })
        if (msg.reason === 'kb') toast('知识库文件有改动', { description: String(msg.file ?? '').split('/').pop() })
      })
      // 提醒：新记下的刷新“提醒”页和角标；要弹的用浏览器通知弹，点了打开对应页面、标已读
      es.addEventListener('reminder', (e) => {
        const msg = JSON.parse((e as MessageEvent).data || '{}') as { popups?: PushedPopup[] }
        qc.invalidateQueries()
        if (msg.popups?.length) showPopups(msg.popups, (link, ids) => {
          nav.current(link)
          request('POST', '/reminders/read', { ids }).then(() => qc.invalidateQueries()).catch(() => {})
        })
      })
    }
    const reconnect = () => { es?.close(); es = null; connect() }
    const disconnect = () => { es?.close(); es = null }
    const onVisible = () => {
      if (idle) { clearTimeout(idle); idle = null }
      if (document.visibilityState === 'visible') { if (!es) { connect(); qc.invalidateQueries() } }
      else idle = setTimeout(disconnect, 30_000) // 后台超过半分钟才断，来回切换不打扰
    }
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) { connect(); qc.invalidateQueries() } }
    connect()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pagehide', disconnect)
    window.addEventListener('pageshow', onShow)
    window.addEventListener(NOTIFY_EVENT, reconnect) // 刚开启 / 关掉提醒：重连，让服务端知道
    return () => {
      if (idle) clearTimeout(idle)
      disconnect()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pagehide', disconnect)
      window.removeEventListener('pageshow', onShow)
      window.removeEventListener(NOTIFY_EVENT, reconnect)
    }
  }, [qc])
  return state
}
