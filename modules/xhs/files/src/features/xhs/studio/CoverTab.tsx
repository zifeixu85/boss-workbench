// 封面页签：3:4 大封面 + 换模板、换垫图、换底色、改大字；下面是这篇的全部图片。封面用模板实时画，不依赖生图。归属：小红书内容模块。 封面设置随稿件栏实际宽度排列。
import { charCount } from '@shared/xhs-check'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { CoverArt, PageArt, TEMPLATE_NAMES, TONE_NAMES } from '../phone/Cover'
import { Pad, PAD_NAMES } from '../phone/pads'
import type { Draft } from '../types'

function Opt({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} title={label}
      className={cn('min-w-0 overflow-hidden rounded-lg border-2 bg-background text-left transition-colors', on ? 'border-primary' : 'border-transparent hover:border-border')}>
      {children}
      <div className={cn('truncate px-1.5 py-1 text-[12px]', on ? 'font-medium text-primary' : 'text-muted-foreground')}>{label}</div>
    </button>
  )
}

export function CoverTab({ draft, onChange, readOnly }: { draft: Draft; onChange: (p: Partial<Draft>) => void; readOnly: boolean }) {
  const set = (k: 'template' | 'pad' | 'tone', v: string) => onChange({ cover: { ...draft.cover, [k]: v } })
  return (
    <fieldset disabled={readOnly} className="grid min-w-0 grid-cols-1 gap-6 px-5 py-5 disabled:opacity-70">
      <div className="xhs-cover-layout grid gap-6">
        <div>
          <div className="overflow-hidden rounded-xl shadow-float"><CoverArt text={draft.cover_text} cover={draft.cover} pages={draft.pages} seed={draft.title} /></div>
          <p className="mt-2 text-center text-[12px] text-muted-foreground">3:4 · 按模板实时画，改字马上变</p>
        </div>
        <div className="grid content-start gap-5">
          <div className="grid gap-1.5">
            <div className="flex items-baseline justify-between"><label className="text-[13px] font-semibold">封面大字</label><span className={cn('num text-xs', charCount(draft.cover_text) > 12 ? 'text-danger' : 'text-muted-foreground')}>{charCount(draft.cover_text)}/12</span></div>
            <Input value={draft.cover_text} onChange={(e) => onChange({ cover_text: e.target.value, pages: draft.pages.length ? [{ ...draft.pages[0], text: e.target.value.replace(/｜/g, '\n') }, ...draft.pages.slice(1)] : [{ role: '封面', text: e.target.value }] })} />
            <p className="text-xs text-muted-foreground">用“｜”分两行，第二行会加一道底色</p>
          </div>
          <div>
            <div className="mb-1.5 text-[13px] font-semibold">模板</div>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(TEMPLATE_NAMES).map(([k, v]) => (
                <Opt key={k} on={draft.cover.template === k} onClick={() => set('template', k)} label={v}>
                  <CoverArt text={draft.cover_text} cover={{ ...draft.cover, template: k }} pages={draft.pages} seed={draft.title} />
                </Opt>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[13px] font-semibold">垫图 <span className="font-normal text-muted-foreground">（当前图片、占位和示例插画）</span></div>
            <div className="grid grid-cols-5 gap-2">
              {/^a_(img|gen)_/.test(draft.cover.pad) && (
                <Opt on onClick={() => {}} label={draft.cover.pad.startsWith('a_gen_') ? 'AI 生成的图' : '放进来的图'}>
                  <div className="aspect-[5/4]"><Pad pad={draft.cover.pad} className="size-full" /></div>
                </Opt>
              )}
              {Object.entries(PAD_NAMES).map(([k, v]) => (
                <Opt key={k} on={draft.cover.pad === k} onClick={() => set('pad', k)} label={v.split('：')[0].replace('+', '')}>
                  <div className="aspect-[5/4]"><Pad pad={k} className="size-full" /></div>
                </Opt>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[13px] font-semibold">底色</div>
            <div className="flex flex-wrap gap-2">
              {TONE_NAMES.map((t) => (
                <button key={t} type="button" onClick={() => set('tone', t)} aria-pressed={draft.cover.tone === t}
                  className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', draft.cover.tone === t ? 'border-primary text-primary' : 'text-muted-foreground hover:border-foreground/30')}>
                  <span className="xc-swatch" data-tone={t} />{t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-baseline justify-between"><span className="text-[13px] font-semibold">这篇的 {draft.pages.length} 张图</span><span className="text-xs text-muted-foreground">内页的字在“稿件”里改</span></div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
          <div className="overflow-hidden rounded-lg shadow-paper"><CoverArt text={draft.cover_text} cover={draft.cover} pages={draft.pages} seed={draft.title} /></div>
          {draft.pages.slice(1).map((p, i) => <div key={i} className="overflow-hidden rounded-lg shadow-paper"><PageArt page={p} index={i + 1} total={draft.pages.length} cover={draft.cover} /></div>)}
        </div>
      </div>
      <p className="rounded-lg bg-muted/60 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">可以在对话里放入图片，再选作封面。AI 生成的图会标明来源；没放图的内页保留实拍占位，也能在“稿件”里逐页调整。</p>
    </fieldset>
  )
}
