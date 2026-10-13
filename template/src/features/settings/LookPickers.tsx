// 风格与手机导航：点一下马上保存、马上生效。建台时可以让老板选，或按行业推荐一个
import { Check } from 'lucide-react'
import type { Settings, Theme } from '@/lib/types'
import { api, useWrite } from '@/lib/api'
import { applyTheme } from '@/app/AppShell'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

export const THEMES: { value: Theme; name: string; fit: string; swatch: string[] }[] = [
  { value: 'jade', name: '松石', fit: '默认。安静耐看，什么行业都合适', swatch: ['#f6f5f0', '#fffefa', '#2e6b55', '#a8661a', '#1f2d27'] },
  { value: 'wood', name: '原木', fit: '家居、餐饮、手作、民宿', swatch: ['#f8f4ec', '#fffdf8', '#8a5a2b', '#b4432f', '#33291f'] },
  { value: 'navy', name: '墨蓝', fit: '咨询、贸易、制造、财务', swatch: ['#f3f5f9', '#1d2738', '#2f5bd3', '#a8661a', '#1b2433'] },
  { value: 'mono', name: '素白', fit: '设计、内容创作、看重留白', swatch: ['#fafafa', '#ffffff', '#171717', '#a8661a', '#6b6b6b'] },
  { value: 'night', name: '夜墨', fit: '晚上用、长时间看屏幕', swatch: ['#131a17', '#1b2420', '#5fae8c', '#e2b04f', '#e3ebe4'] },
]

function Option({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick}
      className={cn('min-w-0 rounded-xl border bg-background/50 p-3 text-left transition-[border-color,box-shadow] hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-80', on && 'border-primary ring-2 ring-primary/25')}>
      {children}
    </button>
  )
}

const Using = () => <span className="inline-flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 text-[12px] font-medium text-primary-foreground"><Check className="size-3" />正在用</span>

export function ThemePicker({ value }: { value?: Theme }) {
  const save = useWrite((theme: Theme) => api.patch<Settings>('/settings', { theme }), (o) => `已换成「${THEMES.find((t) => t.value === o.theme)?.name}」风格`)
  if (!value) return <Skeleton className="h-36" />
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="风格">
      {THEMES.map((t) => {
        const on = (save.isPending ? save.variables : value) === t.value
        return (
          <Option key={t.value} on={on} disabled={save.isPending} onClick={() => { applyTheme(t.value); save.mutate(t.value) }}>
            <div className="flex h-14 overflow-hidden rounded-lg border">
              {t.swatch.map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}
            </div>
            <div className="mt-2.5 flex items-center gap-2"><span className="font-semibold">{t.name}</span>{on && <Using />}</div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t.fit}</p>
          </Option>
        )
      })}
    </div>
  )
}

export function MobileNavPicker({ value }: { value?: Settings['mobile_nav'] }) {
  const save = useWrite((mobile_nav: Settings['mobile_nav']) => api.patch<Settings>('/settings', { mobile_nav }), (o) => `手机导航已换成${o.mobile_nav === 'tabs' ? '底部标签' : '汉堡菜单'}`)
  if (!value) return <Skeleton className="h-48" />
  const opts = [
    { v: 'tabs' as const, name: '底部标签', desc: '每个分区一个入口放在底部（今日、客户、经营、内容），大拇指一点就到；全部页面按分区放在“更多”里。' },
    { v: 'drawer' as const, name: '汉堡菜单', desc: '左上角一个菜单按钮，点开是按分区分段的完整菜单；屏幕留给内容。' },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="手机导航">
      {opts.map((o) => {
        const on = (save.isPending ? save.variables : value) === o.v
        return (
          <Option key={o.v} on={on} disabled={save.isPending} onClick={() => save.mutate(o.v)}>
            <div className="flex gap-4">
              <PhoneSketch drawer={o.v === 'drawer'} />
              <div className="min-w-0 pt-1">
                <div className="flex items-center gap-2"><span className="font-semibold">{o.name}</span>{on && <Using />}</div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{o.desc}</p>
              </div>
            </div>
          </Option>
        )
      })}
    </div>
  )
}

function PhoneSketch({ drawer }: { drawer: boolean }) {
  return (
    <div aria-hidden className="relative flex h-32 w-[68px] shrink-0 flex-col overflow-hidden rounded-[12px] border-2 border-foreground/25 bg-background">
      <div className="flex h-5 items-center gap-1 border-b px-1.5">
        {drawer && <div className="grid gap-[2px]"><span className="h-[2px] w-2.5 bg-foreground/50" /><span className="h-[2px] w-2.5 bg-foreground/50" /><span className="h-[2px] w-2.5 bg-foreground/50" /></div>}
        <div className="size-2 rounded-[2px] bg-primary" />
      </div>
      <div className="grid flex-1 content-start gap-1 p-1.5">{[0, 1, 2].map((i) => <div key={i} className="h-4 rounded-sm border bg-card" />)}</div>
      {!drawer && <div className="grid h-5 grid-cols-4 items-center border-t px-1">{[0, 1, 2, 3].map((i) => <span key={i} className={cn('mx-auto size-1.5 rounded-full', i === 0 ? 'bg-primary' : 'bg-foreground/25')} />)}</div>}
      {drawer && <div className="absolute inset-y-0 left-0 w-[58%] border-r bg-sidebar p-1.5 opacity-90"><div className="grid gap-1">{[0, 1, 2, 3, 4].map((i) => <span key={i} className={cn('h-1 rounded-full', i === 1 ? 'bg-primary/70' : 'bg-foreground/20')} />)}</div></div>}
    </div>
  )
}
