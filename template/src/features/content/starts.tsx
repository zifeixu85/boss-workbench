// 开写的起点：一句话、今天的选题、旧笔记翻新、一款茶、对标笔记。今天页和创作开始页共用。归属：小红书内容模块。
// 一句话入口只是入口：建好一篇、把这句话作为第一条消息发给 Codex，然后进创作页（对话只在创作页）。
import { useCallback, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ArrowRight, BookMarked, CornerDownLeft, Leaf, Lightbulb, Loader2, Lock, NotebookPen, Search } from 'lucide-react'
import { api, useApi, useWrite } from '@/lib/api'
import { md, thousands } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/status'
import { CoverArt } from './phone/Cover'
import { SOURCE_SHORT } from './lib'
import type { Piece, Starts } from './types'

type StartKind = 'topic' | 'note' | 'tea' | 'bench'
export const START_ITEMS: { kind: StartKind; label: string; desc: string; icon: typeof Lightbulb }[] = [
  { kind: 'topic', label: '从今天的选题', desc: '早上 Codex 出的 10 个', icon: Lightbulb },
  { kind: 'note', label: '从我的旧笔记翻新', desc: '收藏高的再写一版', icon: NotebookPen },
  { kind: 'tea', label: '从一款茶开始', desc: '零售商品清单里的 12 款', icon: Leaf },
  { kind: 'bench', label: '从对标笔记开始', desc: '借结构，换成自己的茶', icon: BookMarked },
]

export function useStartParam() {
  const [sp, setSp] = useSearchParams()
  const open = useCallback((k: StartKind) => setSp((p) => { const n = new URLSearchParams(p); n.set('start', k); return n }), [setSp])
  const close = useCallback(() => setSp((p) => { const n = new URLSearchParams(p); n.delete('start'); return n }), [setSp])
  return { kind: sp.get('start') as StartKind | null, open, close }
}

/** 建一篇（或把选题推进到写稿中），可选地先发第一句话，然后进创作页 */
export function useBegin() {
  const nav = useNavigate()
  const go = useWrite(async (b: { piece?: Piece; create?: Record<string, unknown>; say?: string }) => {
    let id = b.piece?.id
    if (b.piece) await api.patch(`/content/pieces/${b.piece.id}`, { status: '写稿中', start: b.piece.start ?? { kind: '选题', ref: b.piece.id, label: `${md(b.piece.topic_date ?? '')} 早上的选题`, text: b.piece.reason ?? '' } })
    else id = (await api.post<Piece>('/content/pieces', { status: '写稿中', ...b.create })).id
    if (b.say) await api.post(`/content/pieces/${id}/messages`, { text: b.say })
    return id!
  })
  return { begin: (b: Parameters<typeof go.mutate>[0]) => go.mutate(b, { onSuccess: (id) => nav(`/content/studio/${id}`) }), pending: go.isPending }
}

/** 一句话开写 */
export function OneLine({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const [text, setText] = useState('')
  const { begin, pending } = useBegin()
  const st = useStartParam()
  const submit = () => {
    const t = text.trim()
    if (!t) { toast('先说一句想写什么'); return }
    begin({ create: { title: t.replace(/^(帮我)?写一篇/, '').slice(0, 30) || t.slice(0, 30), source: '自己想的', start: { kind: '一句话', label: '一句话开写', text: t } }, say: t })
  }
  return (
    <div className={className}>
      <div className="relative rounded-xl border bg-background shadow-[inset_0_1px_0_var(--border)] focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/20">
        <Textarea autoFocus={autoFocus} value={text} onChange={(e) => setText(e.target.value)} rows={2}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() } }}
          placeholder="说一句就行，比如：降温了，写一篇办公室一个杯子泡白茶" className="min-h-[68px] resize-none border-0 bg-transparent pr-28 text-[15px] shadow-none focus-visible:ring-0" />
        <Button className="absolute right-2.5 bottom-2.5" onClick={submit} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}开始</Button>
      </div>
      <div className="mt-1.5 flex items-center gap-1 text-[11.5px] text-muted-foreground"><CornerDownLeft className="size-3" />⌘ + 回车也能开始。进创作页后，本机 Codex 按小红书的写法翻资料，写第一版。</div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {START_ITEMS.map((s) => (
          <button key={s.kind} type="button" onClick={() => st.open(s.kind)}
            className="group flex min-w-0 items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:border-primary hover:bg-accent/40">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground"><s.icon className="size-4" /></span>
            <span className="min-w-0"><span className="block truncate text-[13px] font-medium group-hover:text-primary">{s.label}</span><span className="block truncate text-[11.5px] text-muted-foreground">{s.desc}</span></span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Pick({ onClick, children, disabled }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="flex w-full min-w-0 items-center gap-3 rounded-lg border bg-card p-2.5 text-left transition-colors hover:border-primary hover:bg-accent/30 disabled:opacity-60">{children}</button>
}

/** 选起点的弹窗（?start=topic|note|tea|bench） */
export function StartPicker() {
  const st = useStartParam()
  const { data } = useApi<Starts>(st.kind ? '/content/starts' : null)
  const { begin, pending } = useBegin()
  const [q, setQ] = useState('')
  const item = START_ITEMS.find((s) => s.kind === st.kind)
  const has = (s: string) => !q || s.includes(q)
  return (
    <Dialog open={!!st.kind} onOpenChange={(o) => { if (!o) { st.close(); setQ('') } }}>
      <DialogContent className="max-h-[84vh] overflow-y-auto sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">{item?.label}</DialogTitle>
          <DialogDescription>选一条就进创作页：左边和 AI 聊，右边是稿件和手机预览。</DialogDescription>
        </DialogHeader>
        <div className="relative"><Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜一下" className="pl-8" /></div>
        {!data ? <p className="py-8 text-center text-sm text-muted-foreground">读取中…</p> : (
          <div className="grid gap-2">
            {st.kind === 'topic' && data.topics.filter((t) => has(t.title)).map((t) => (
              <Pick key={t.id} disabled={pending} onClick={() => begin({ piece: t })}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><StatusBadge value={SOURCE_SHORT[t.source] ?? t.source} tone="primary" />{t.pillar_name ?? '不在支柱里'}</div>
                  <div className="mt-1 truncate text-sm font-medium">{t.title}</div>
                  <div className="line-clamp-1 text-xs text-muted-foreground">{t.reason}</div>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </Pick>
            ))}
            {st.kind === 'note' && data.notes.filter((n) => has(n.title)).map((n) => (
              <Pick key={n.id} disabled={pending} onClick={() => begin({ create: { title: `${n.title}（翻新）`.slice(0, 40), source: '旧笔记翻新', reason: `翻新 ${md(n.date)} 发的「${n.title}」：自然收藏 ${n.saves}`, start: { kind: '旧笔记', ref: n.piece_id, label: n.title, text: `原来那篇《${n.title}》${md(n.date)} 发，自然阅读 ${n.reads}、收藏 ${n.saves}。换个角度再写一版，别和原文重复。` } } })}>
                <div className="w-12 shrink-0 overflow-hidden rounded-md">{n.cover && <CoverArt text={n.cover_text ?? n.title} cover={n.cover} pages={n.pages} seed={n.title} />}</div>
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{n.title}</div><div className="num text-xs text-muted-foreground">{md(n.date)} · {n.pillar_name} · 自然阅读 {thousands(n.reads)} · 收藏 {thousands(n.saves)}</div></div>
              </Pick>
            ))}
            {st.kind === 'tea' && data.teas.filter((t) => has(t.name)).map((t) => (
              <Pick key={t.name} disabled={pending} onClick={() => begin({ create: { title: t.secret ? '秋冬新品试喝（先不说名字）' : `从「${t.name}」写一篇`, source: '从一款茶开始', reason: `${t.kind} · ${t.spec} · ${t.price} 元`, start: { kind: '一款茶', label: t.secret ? '秋冬新品（上线前不说名字）' : t.name, text: `${t.secret ? '一款还没上线的秋冬新品白茶（上线前保密，不能写名字和上线日）' : t.name}：${t.kind}，${t.spec}，标价 ${t.price} 元，${t.status}。${t.note && !t.secret ? `备注：${t.note}` : ''}` } } })}>
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-md', t.secret ? 'bg-warn-soft text-warn' : 'bg-accent text-accent-foreground')}>{t.secret ? <Lock className="size-4" /> : <Leaf className="size-4" />}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.secret ? '秋冬新品（上线前不说名字）' : t.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{t.kind} · {t.spec} · {t.price} 元{t.secret ? ' · 11/5 起四平台' : t.note ? ` · ${t.note}` : ''}</div>
                </div>
              </Pick>
            ))}
            {st.kind === 'bench' && data.benchmarks.filter((b) => has(b.title)).map((b) => (
              <Pick key={b.id} disabled={pending} onClick={() => begin({ create: { title: `借《${b.title}》的结构`.slice(0, 40), source: '对标笔记', reason: b.borrow, start: { kind: '对标笔记', ref: b.id, label: `${b.account}《${b.title}》`, text: `结构：${b.structure}\n我们可以怎么借：${b.borrow}` } } })}>
                <div className="w-12 shrink-0 overflow-hidden rounded-md"><CoverArt text={b.cover_text ?? b.title} cover={null} peer={b.account} /></div>
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{b.title}</div><div className="num truncate text-xs text-muted-foreground">{b.account} · 赞 {thousands(b.likes)} · 藏 {thousands(b.saves)} · {b.borrow}</div></div>
              </Pick>
            ))}
            {st.kind === 'note' && <p className="text-center text-[11.5px] text-muted-foreground">按自然收藏排，前 12 篇</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

