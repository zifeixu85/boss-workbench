// 行业资讯 · 设置页的几块：来源、想加新渠道（回 Codex 说一句）、关注词、让 Codex 每天去取、（老用户）自动运行记录。
// 加来源不在这里填表：回到 Codex 说一句，它用 news-source-add 接上、先取一次。这里只开关。
import { useState } from 'react'
import { Copy, Plus, X } from 'lucide-react'
import { api, useWrite } from '@/lib/api'
import { Panel } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { Say } from './Say'
import { SAY_ADD, copyText, when, type Run, type Schedule, type Source } from './types'

const TONES = ['bg-info-soft text-info', 'bg-warn-soft text-warn', 'bg-ok-soft text-ok', 'bg-accent text-accent-foreground']
/** 来源的小头像：英文取前两个字母，中文取前两个字 */
const initials = (name: string) => (/^[a-z]/i.test(name) ? name.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() : name.slice(0, 2))

function how(s: Source, at: string) {
  return s.kind === 'codex' ? 'Codex 去取' : `工作台每天 ${at} 自己取`
}

function status(s: Source): { text: string; bad: boolean } | null {
  if (!s.enabled) return null
  if (s.kind === 'codex') return { text: s.today ? `今天写进来 ${s.today} 条` : '今天还没取', bad: false }
  if (!s.last_fetch) return { text: '还没取过', bad: false }
  return { text: `${when(s.last_fetch.at)} ${s.last_fetch.note ?? ''}`, bad: !s.last_fetch.ok || s.last_fetch.stale }
}

export function SourceCards({ sources, at, fresh }: { sources: Source[]; at: string; fresh: string | null }) {
  const toggle = useWrite((s: Source) => api.patch<Source>(`/m/news/sources/${encodeURIComponent(s.id)}`, { enabled: !s.enabled }), (s) => `${s.name}：${s.enabled ? '打开了' : '关掉了'}`)
  const list = [...sources].sort((a, b) => Number(b.enabled) - Number(a.enabled))
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-paper" aria-label="来源">
      {list.map((s) => {
        const st = status(s)
        const tone = TONES[sources.indexOf(s) % TONES.length]
        return (
          <li key={s.id} className={cn('flex items-center gap-4 px-5 py-4', s.id === fresh && 'bg-warn-soft/40')}>
            <span className={cn('grid size-11 shrink-0 place-items-center rounded-lg text-[15px] font-semibold', s.enabled ? tone : 'bg-muted text-muted-foreground')} aria-hidden>{initials(s.name)}</span>
            <div className={cn('min-w-0 flex-1', !s.enabled && 'opacity-60')}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold break-words">{s.name}</span>
                {s.id === fresh && <span className="inline-flex h-5 items-center rounded-md bg-danger px-1.5 text-[11px] font-semibold text-background">刚加上</span>}
              </div>
              <p className="mt-0.5 text-sm leading-relaxed break-words text-muted-foreground">{how(s, at)}{s.note ? ` · ${s.note}` : ''}</p>
              {st && <p className={cn('mt-0.5 text-xs text-muted-foreground', st.bad && 'text-warn')}>{st.text}</p>}
            </div>
            <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
              <span className={s.enabled ? 'text-primary' : 'text-muted-foreground'}>{s.enabled ? '开着' : '关着'}</span>
              <Switch checked={s.enabled} disabled={toggle.isPending} onCheckedChange={() => toggle.mutate(s)} aria-label={`${s.enabled ? '关掉' : '打开'}${s.name}`} />
            </label>
          </li>
        )
      })}
    </ul>
  )
}

export function AddHint() {
  return (
    <section className="rounded-xl border border-primary/25 bg-accent/60 px-5 py-4" aria-labelledby="news-add-hint">
      <h2 id="news-add-hint" className="text-base font-semibold text-primary">想加一个新渠道？</h2>
      <p className="mt-1 text-sm leading-relaxed">不用在这里填表。回到 Codex，说一句就行，它会帮你接上、先取一次给你看：</p>
      <Say text={SAY_ADD} className="mt-3 max-w-2xl" />
    </section>
  )
}

/** 关注词：小标签，× 拿掉，“加一个”就地输入 */
export function KeywordChips({ value }: { value: string[] }) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const save = useWrite((keywords: string[]) => api.patch('/m/news/settings', { keywords }), '关注词存好了')
  const add = () => { const w = text.trim(); if (w) save.mutate([...value, w], { onSuccess: () => { setText(''); setAdding(false) } }); else setAdding(false) }
  return (
    <section className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-5 py-4 shadow-paper" aria-label="关注词">
      <h2 className="mr-1 text-base font-semibold">关注词</h2>
      {value.map((w) => (
        <span key={w} className="inline-flex h-8 items-center gap-1 rounded-full border bg-background pr-1 pl-3 text-sm">
          {w}
          <button type="button" className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`拿掉关注词 ${w}`} disabled={save.isPending}
            onClick={() => save.mutate(value.filter((x) => x !== w))}><X className="size-3.5" /></button>
        </span>
      ))}
      {adding ? (
        <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); add() }}>
          <label htmlFor="news-kw" className="sr-only">新的关注词</label>
          <Input id="news-kw" autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} placeholder="比如：礼盒" className="h-8 w-32" />
          <Button type="submit" size="sm" variant="outline" className="h-8" disabled={save.isPending}>加上</Button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed px-3 text-sm text-primary hover:bg-accent">
          <Plus className="size-3.5" aria-hidden />加一个
        </button>
      )}
      <p className="w-full text-xs text-muted-foreground">标题或摘要里有这些词的，在资讯页放最上面，带“命中”标签。</p>
    </section>
  )
}

/** 每天的口令：粘进 Codex 的定时任务。工作台自己不调 AI，取和写总结都是 Codex 做 */
export function PromptPanel({ daily, once }: { daily: string; once: string }) {
  return (
    <Panel title="让 Codex 每天去取" desc="在 Codex 里新建一个定时任务（比如每天 08:30），把这段粘进去：它到点去开着的来源取新内容、写进来，再写一份当天的总结。"
      action={<Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" onClick={() => copyText(daily, '每天的口令复制好了，粘进 Codex 的定时任务')}><Copy aria-hidden />复制</Button>}>
      <pre className="max-h-64 overflow-y-auto rounded-lg bg-muted px-3 py-2.5 font-sans text-xs leading-relaxed break-words whitespace-pre-wrap text-muted-foreground" tabIndex={0} aria-label="每天的口令">{daily}</pre>
      <p className="mt-2 text-xs text-muted-foreground">
        只想现在取一次（不写总结）：<button type="button" className="text-primary underline underline-offset-2" onClick={() => copyText(once)}>复制“现在取一次”的口令</button>
      </p>
    </Panel>
  )
}

/** 自动运行记录：只在有“工作台自己取”的来源时显示（0.2 的老用户） */
export function Runs({ runs, schedule }: { runs: Run[]; schedule: Schedule }) {
  const plan = schedule.off ? '自动取现在停着。' : `工作台每天 ${schedule.at} 自己取 RSS 来源${schedule.once?.pending ? `；今天 ${schedule.once.at} 再自动跑一次` : ''}。工作台开着才会跑，没赶上的下次打开补跑。`
  return (
    <Panel title="自动运行记录" desc={`${plan}定时 = 每天那一次，补跑 = 到点时没开、后来补上，单次 = 今天再自动跑的那一次，手动 = 用命令跑的。`}>
      {runs.length ? (
        <ul className="divide-y text-sm">
          {runs.map((r) => (
            <li key={r.started_at + r.trigger} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
              <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{when(r.started_at)}</span>
              <span className="w-10 shrink-0">{r.trigger}</span>
              <span className={cn('w-10 shrink-0 font-medium', r.status === '失败' && 'text-destructive')}>{r.status}</span>
              <span className="min-w-0 flex-1 break-words text-muted-foreground">{r.note ?? ''}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">还没有自动运行过。</p>}
    </Panel>
  )
}
