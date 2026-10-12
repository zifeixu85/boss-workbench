// 内容中心的弹窗：新建一篇、AI 出选题、排期（定稿）、标记已发布。归属：小红书内容模块。
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react'
import { FormDialog } from '@/features/forms/FormDialog'
import { FormField, TextInput, TextArea, Choice, DatePicker } from '@/components/form'
import { ViewTabs } from '@/components/view-tabs'
import { useApi } from '@/lib/api'
import { md, todayStr } from '@/lib/format'
import { now } from '@/lib/clock'
import { issuesToErrors } from '@/components/form'
import { useCreatePiece, useGenerateTopics, usePatchPiece, usePiece, usePublish } from './api'
import { verdictOf } from './ChecksPanel'
import type { Piece, Pillar, Rules } from './types'

const TIMES = ['08:00', '10:30', '12:10', '18:30', '20:00', '21:30']
/** 门店停业的日子：服务端按“门店改造”这类项目的里程碑和日程算（/content/check-rules 的 store_closed），不写死；没有就是 null */
export function useStoreClosed(): { from: string; to: string } | null {
  const { data } = useApi<Rules>('/content/check-rules')
  return data?.store_closed ?? null
}
export const inRange = (r: { from: string; to: string } | null, d: string) => !!r && d >= r.from && d <= r.to

export function NewPieceDialog({ onClose, status = '灵感池' }: { onClose: () => void; status?: '灵感池' | '已选' }) {
  const { data: pillars = [] } = useApi<Pillar[]>('/content/pillars')
  const create = useCreatePiece()
  const [f, setF] = useState({ title: '', angle: '', format: '图文', pillar_id: null as string | null, reason: '', status })
  const [err, setErr] = useState<Record<string, string>>({})
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }))
  return (
    <FormDialog open onClose={onClose} title="记一个选题" desc="先放进灵感池或已选，想写的时候点开它进创作页。" submitText="放进去" submitting={create.isPending}
      onSubmit={() => create.mutate({ ...f, source: '自己想的', angle: f.angle || null, reason: f.reason || null }, { onSuccess: onClose, onError: (e) => setErr(issuesToErrors(e)) })}>
      <FormField label="标题" error={err.title} hint="20 字以内最好，先说场景或麻烦"><TextInput autoFocus value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="例：加班到 9 点，桌上那杯茶怎么续" /></FormField>
      <FormField label="切入角度"><TextInput value={f.angle} onChange={(e) => set('angle', e.target.value)} placeholder="从什么场景、什么麻烦说起" /></FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="形式"><ViewTabs label="形式" value={f.format} onChange={(v) => set('format', v)} items={[{ value: '图文', label: '图文' }, { value: '视频', label: '视频' }]} /></FormField>
        <FormField label="放在"><ViewTabs label="放在" value={f.status} onChange={(v) => set('status', v)} items={[{ value: '灵感池', label: '灵感池' }, { value: '已选', label: '已选' }]} /></FormField>
      </div>
      <FormField label="内容支柱"><Choice value={f.pillar_id} onChange={(v) => set('pillar_id', v)} options={pillars.map((p) => ({ value: p.id, label: p.name }))} allowEmpty emptyLabel="不在四个支柱里" placeholder="选一个" /></FormField>
      <FormField label="为什么做"><TextArea rows={2} value={f.reason} onChange={(e) => set('reason', e.target.value)} placeholder="评论区有人问、天气变了、同行这类笔记收藏高……" /></FormField>
    </FormDialog>
  )
}

export function TopicsDialog({ onClose, direction = '' }: { onClose: () => void; direction?: string }) {
  const gen = useGenerateTopics()
  const [dir, setDir] = useState(direction)
  const [count, setCount] = useState('5')
  return (
    <FormDialog open onClose={onClose} title="让 AI 出几个选题" desc="本机 Codex 按小红书的写法读账号定位、作品索引和客户常问，写好的直接进灵感池，单独一组标“刚出的”。一般 1 分钟左右，可以先去做别的。"
      submitText="开始出选题" submitting={gen.isPending} onSubmit={() => gen.mutate({ direction: dir, count: Number(count) }, { onSuccess: onClose })}>
      <FormField label="这次往哪个方向想？（可不填）" hint="例：降温喝热茶、双 11 囤茶、门店停业那几天"><TextInput autoFocus value={dir} onChange={(e) => setDir(e.target.value)} /></FormField>
      <FormField label="出几个"><ViewTabs label="数量" value={count} onChange={setCount} items={[{ value: '3', label: '3 个' }, { value: '5', label: '5 个' }, { value: '10', label: '10 个' }]} /></FormField>
    </FormDialog>
  )
}

/** 发布前检查还有要改的、还没稿子：定稿和标记发布前提醒一次 */
function CheckNotice({ id, mode }: { id: string; mode: 'final' | 'publish' }) {
  const { data } = usePiece(id)
  if (!data) return null
  if (!data.has_draft) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
        <OctagonAlert className="mt-0.5 size-4 shrink-0" />
        <span className="flex-1">{mode === 'final' ? '还没有稿子，先去写一版再定稿。' : '工作台里没有这篇的稿子，标了发布也对不上原文。'}</span>
        <Link to={`/content/studio/${id}`} className="shrink-0 text-xs font-medium text-primary hover:underline">去写</Link>
      </div>
    )
  }
  const bad = data.checks?.items.filter((i) => i.level === 'block') ?? []
  if (!bad.length) return <p className="flex items-center gap-1.5 text-[12.5px] text-ok"><CircleCheck className="size-4" />发布前检查：{data.checks ? verdictOf(data.checks) : '—'}</p>
  return (
    <div className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2.5 text-[13px] text-warn">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <span className="flex-1">发布前检查还有 {bad.length} 处要改：{bad.map((i) => `${i.label.replace(/ \d+\/\d+ 字/, '')}（${i.detail}）`).join('；')}。{mode === 'final' ? '确定照样定稿？' : '确定已经照这样发出去了？'}</span>
    </div>
  )
}

/** 排期 / 定稿：选日子和时间；finalize 时顺便移到“待发布”。过去的日子不能排；定稿前看一眼检查 */
export function ScheduleDialog({ piece, onClose, finalize }: { piece: Piece; onClose: () => void; finalize?: boolean }) {
  const patch = usePatchPiece(finalize ? '已定稿，排进日历了' : '排期改好了')
  const { data } = usePiece(finalize ? piece.id : null)
  const [date, setDate] = useState<string | null>(piece.scheduled_date && piece.scheduled_date >= todayStr() ? piece.scheduled_date : null)
  const [time, setTime] = useState<string | null>(piece.scheduled_time ?? '12:10')
  const [err, setErr] = useState('')
  const past = !!date && date < todayStr()
  const shut = useStoreClosed()
  const closed = !!date && inRange(shut, date) && /品茶会|门店/.test(piece.title)
  const noDraft = finalize && data && !data.has_draft
  const risky = finalize && (data?.checks?.blocks ?? 0) > 0
  return (
    <FormDialog open onClose={onClose} title={finalize ? '定稿 · 排期' : '改排期'} desc={finalize ? '定稿后移到“待发布”，那天早上今天页会提醒。小红书要你自己在 App 里发。' : `「${piece.title}」`}
      submitText={finalize ? (risky ? '照样定稿' : '定稿') : '保存'} submitting={patch.isPending}
      onSubmit={() => {
        if (!date) { setErr('选一个日子'); return }
        if (past) { setErr('这天已经过了，换个日子'); return }
        if (noDraft) { setErr('还没有稿子，先去写一版'); return }
        patch.mutate({ id: piece.id, scheduled_date: date, scheduled_time: time, ...(finalize ? { status: '待发布' } : {}) }, { onSuccess: onClose, onError: (e) => setErr((e as Error).message) })
      }}>
      {finalize && <CheckNotice id={piece.id} mode="final" />}
      <FormField label="哪天发" error={err || (past ? '这天已经过了' : undefined)} hint={closed && shut ? `门店 ${md(shut.from)}—${md(shut.to)} 停业，品茶会、门店活动这几天别排` : '12:10 午休、18:30 下班、20:00 前后是账号常发的时间'}><DatePicker value={date} onChange={(v) => { setDate(v); setErr('') }} clearable={false} /></FormField>
      <FormField label="几点"><Choice value={time} onChange={setTime} options={TIMES} /></FormField>
    </FormDialog>
  )
}

/** 标记已发布：默认现在；晚于现在的拦住（还没发出去） */
export function PublishDialog({ piece, onClose }: { piece: Piece; onClose: () => void }) {
  const pub = usePublish()
  const n = now()
  const [date, setDate] = useState<string | null>(todayStr())
  const [time, setTime] = useState(n.toTimeString().slice(0, 5))
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')
  const at = `${date ?? todayStr()}T${time}`
  const future = at > `${todayStr()}T${now().toTimeString().slice(0, 5)}`
  return (
    <FormDialog open onClose={onClose} title="标记已发布" desc="在小红书 App 里发出去以后点这里。链接可以不填：数据导进来时按标题和日期对上这篇。" submitText="标记已发布" submitting={pub.isPending}
      onSubmit={() => {
        if (!/^\d{2}:\d{2}$/.test(time)) { setErr('时间写成 12:10'); return }
        if (future) { setErr('这个时间还没到：发出去以后再标'); return }
        pub.mutate({ id: piece.id, published_at: at, publish_url: url || null }, { onSuccess: onClose, onError: (e) => setErr((e as Error).message) })
      }}>
      <CheckNotice id={piece.id} mode="publish" />
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <FormField label="发布日期" error={err || (future ? '这个时间还没到' : undefined)}><DatePicker value={date} onChange={(v) => { setDate(v); setErr('') }} clearable={false} /></FormField>
        <FormField label="几点发的"><TextInput type="time" value={time} onChange={(e) => { setTime(e.target.value); setErr('') }} /></FormField>
      </div>
      {piece.scheduled_date && <p className="-mt-2 text-xs text-muted-foreground">原来排的是 {Number(piece.scheduled_date.slice(5, 7))}/{Number(piece.scheduled_date.slice(8, 10))} {piece.scheduled_time ?? ''}；默认填的是现在。</p>}
      <FormField label="笔记链接（可不填）"><TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://xhslink.com/…" /></FormField>
    </FormDialog>
  )
}

/** 从一篇已发的笔记翻新：新建一篇（起点 = 旧笔记），直接进创作页 */
export function useRemake() {
  const create = useCreatePiece()
  const nav = useNavigate()
  return (p: Piece) => create.mutate(
    { title: `${p.title}（翻新）`.slice(0, 40), format: p.format, pillar_id: p.pillar_id, source: '旧笔记翻新', status: '写稿中', reason: `翻新 ${p.published_at?.slice(5, 10).replace('-', '/')} 发的「${p.title}」`, start: { kind: '旧笔记', ref: p.id, label: p.title, text: `原来那篇：${p.title}${p.reads != null ? `（自然阅读 ${p.reads}、收藏 ${p.saves}）` : ''}` } },
    { onSuccess: (np) => nav(`/content/studio/${np.id}`) },
  )
}
