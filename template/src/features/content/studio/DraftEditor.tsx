// 稿件页签：形式、标题和备选、封面大字、图片页、正文、话题、Codex 自己核过的、发布前检查。直接能改，⌘+回车存一版。归属：小红书内容模块。
import { useState, type ReactNode } from 'react'
import { ArrowLeftRight, Plus, Trash2, X } from 'lucide-react'
import { charCount } from '@shared/xhs-check'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/form'
import { useChecks } from '../lib'
import { ChecksPanel } from '../ChecksPanel'
import { PAD_NAMES } from '../phone/pads'
import type { AiCheck, Draft } from '../types'

function Field({ label, count, max, hint, children }: { label: string; count?: number; max?: number; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-[13px] font-semibold">{label}</label>
        {count != null && <span className={cn('num text-xs', max && count > max ? 'font-medium text-danger' : 'text-muted-foreground')}>{count}/{max}</span>}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function DraftEditor({ draft, onChange, readOnly, hasDraft, publishOn, ai, dirty }: { draft: Draft; onChange: (p: Partial<Draft>) => void; readOnly: boolean; hasDraft: boolean; publishOn?: string | null; ai?: AiCheck | null; dirty?: boolean }) {
  const [tag, setTag] = useState('')
  const checks = useChecks(hasDraft ? draft : null, publishOn)
  if (!hasDraft) {
    return (
      <div className="grid place-items-center px-8 py-16 text-center">
        <div className="text-xs tracking-[0.2em] text-muted-foreground">稿件</div>
        <h3 className="mt-2 font-heading text-xl font-semibold">稿件会在这里慢慢成形</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">在左边和 Codex 聊，它写好的稿件会自动落到这里；你也可以直接在下面动手写。</p>
        <Button className="mt-5" variant="outline" onClick={() => onChange({ title: draft.title || '新的一篇', body: draft.body || '' })}>我自己先写</Button>
      </div>
    )
  }
  const setPage = (i: number, patch: Partial<Draft['pages'][number]>) => onChange({ pages: draft.pages.map((p, k) => (k === i ? { ...p, ...patch } : p)) })
  const addTag = () => { const t = tag.trim().replace(/^#/, ''); if (t && !draft.tags.includes(t)) onChange({ tags: [...draft.tags, t] }); setTag('') }
  return (
    <fieldset disabled={readOnly} className="grid min-w-0 grid-cols-1 gap-6 px-5 py-5 disabled:opacity-70">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        形式
        <div className="inline-flex rounded-lg border p-0.5">
          {(['图文', '视频'] as const).map((f) => <button key={f} type="button" onClick={() => onChange({ format: f })} className={cn('rounded-md px-2.5 py-0.5', draft.format === f ? 'bg-primary text-primary-foreground' : 'hover:text-foreground')}>{f}</button>)}
        </div>
        <span>{draft.pages.length} 张图 · 正文 {charCount(draft.body)} 字 · {draft.tags.length} 个话题</span>
      </div>

      <Field label="标题" count={charCount(draft.title)} max={20} hint="先点麻烦再给结果（账号规律）；点一下备选可以换上去">
        <Input value={draft.title} onChange={(e) => onChange({ title: e.target.value })} className="h-11 font-heading text-[18px] font-semibold" />
        {draft.titles.filter((t) => t !== draft.title).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {draft.titles.filter((t) => t !== draft.title).map((t) => (
              <button key={t} type="button" onClick={() => onChange({ title: t, titles: [t, ...draft.titles.filter((x) => x !== t)] })}
                className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs hover:border-primary hover:text-primary"><ArrowLeftRight className="size-3" />{t}<span className="num text-muted-foreground">{charCount(t)}</span></button>
            ))}
          </div>
        )}
      </Field>

      <Field label="封面大字" count={charCount(draft.cover_text)} max={12} hint="用“｜”分成两行；封面按模板实时画，去“封面”页签换模板和垫图">
        <Input value={draft.cover_text} onChange={(e) => onChange({ cover_text: e.target.value, pages: draft.pages.length ? [{ ...draft.pages[0], text: e.target.value.replace(/｜/g, '\n') }, ...draft.pages.slice(1)] : draft.pages })} />
      </Field>

      <Field label={`图片页 · ${draft.pages.length} 张`} hint="封面一句大字，内页一页一个要点；第一行是大字，换行后是小字">
        <ol className="grid gap-2">
          {draft.pages.map((p, i) => (
            <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-2">
              <span className={cn('num mt-2 grid size-6 place-items-center rounded text-[12px] font-semibold', i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{i === 0 ? '封' : i + 1}</span>
              <Textarea rows={2} value={p.text} onChange={(e) => setPage(i, { text: e.target.value })} className={cn('min-h-0 text-[13px]', /【待补/.test(p.text) && 'border-warn bg-warn-soft/40')} />
              <div className="flex items-center gap-1">
                {i > 0 && (
                  <Choice className="h-8 w-[104px] text-xs" value={p.pad ?? null} onChange={(v) => setPage(i, { pad: v })} allowEmpty emptyLabel="垫图自动挑"
                    options={Object.entries(PAD_NAMES).map(([k, v]) => ({ value: k, label: v.split('：')[0].slice(0, 7) }))} />
                )}
                {i > 0 && <Button type="button" size="icon-sm" variant="ghost" aria-label="删掉这页" onClick={() => onChange({ pages: draft.pages.filter((_, k) => k !== i) })}><Trash2 /></Button>}
              </div>
            </li>
          ))}
        </ol>
        <Button type="button" size="xs" variant="outline" className="w-fit" onClick={() => onChange({ pages: [...draft.pages, { role: '内页', text: '' }] })}><Plus />加一页</Button>
      </Field>

      <Field label="正文" count={charCount(draft.body)} max={1000}>
        <Textarea value={draft.body} onChange={(e) => onChange({ body: e.target.value })} className="min-h-[220px] text-[14px] leading-7" />
      </Field>

      <Field label={`话题 · ${draft.tags.length} 个`} hint="5—8 个：品类词 + 场景词 + 人群词。回车添加">
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-background p-2">
          {draft.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-0.5 rounded-full bg-info-soft px-2 py-0.5 text-[12.5px] text-info">#{t}
              <button type="button" aria-label={`去掉 ${t}`} onClick={() => onChange({ tags: draft.tags.filter((x) => x !== t) })} className="opacity-60 hover:opacity-100"><X className="size-3" /></button>
            </span>
          ))}
          <Input value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addTag() } }} placeholder="加话题" className="h-7 w-28 border-0 px-1 shadow-none focus-visible:ring-0" />
        </div>
      </Field>

      <ChecksPanel checks={checks} ai={ai} dirty={dirty} />
    </fieldset>
  )
}
