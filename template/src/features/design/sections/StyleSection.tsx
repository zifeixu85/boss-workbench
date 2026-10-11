// 1. 风格：5 套风格的缩略样子 + 临时预览；颜色令牌在 colors.tsx
import { useMemo } from 'react'
import { Link } from 'react-router'
import { Check, Eye, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Section, Sub } from '../parts'
import { THEMES, readThemeTokens, scopeStyle, useThemePreview } from '../theme-tokens'
import { ChartPalette, RiseFall, SemanticColors, StatusColors } from './colors'

export function StyleSection() {
  const { active, saved, preview, reset } = useThemePreview()
  const tokens = useMemo(() => readThemeTokens(), [])
  return (
    <Section title="风格与颜色" desc="所有颜色、字体、圆角都来自 src/index.css 的设计令牌。组件里只写令牌（bg-primary、text-muted-foreground…），不写具体色值，这样换风格时整站一起变。">
      <Sub title="5 套风格" desc="建台时按行业推荐一套。点“预览”整页临时换上，离开本页自动恢复；要长期换，去设置里改。">
        {active !== saved && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-accent/50 px-4 py-2.5 text-sm">
            <span>正在预览「{THEMES.find((t) => t.id === active)?.name}」，只在这个页面生效。</span>
            <Button size="sm" variant="outline" onClick={reset} className="ml-auto"><RotateCcw />换回「{THEMES.find((t) => t.id === saved)?.name}」</Button>
            <Button size="sm" variant="ghost" asChild><Link to="/settings">去设置</Link></Button>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {THEMES.map((t) => (
            <ThemeCard key={t.id} theme={t} tokens={tokens?.[t.id]} active={active === t.id} saved={saved === t.id} onPreview={() => preview(t.id)} />
          ))}
        </div>
      </Sub>
      <SemanticColors />
      <StatusColors />
      <div className="grid gap-5 xl:grid-cols-2">
        <RiseFall />
        <ChartPalette />
      </div>
    </Section>
  )
}

function ThemeCard({ theme, tokens, active, saved, onPreview }: {
  theme: (typeof THEMES)[number]; tokens?: Record<string, string>; active: boolean; saved: boolean; onPreview: () => void
}) {
  return (
    <div className={cn('flex min-w-0 flex-col rounded-xl border bg-card p-3 shadow-paper transition-shadow', active && 'border-primary ring-2 ring-primary/25')}>
      {tokens ? <MiniUI tokens={tokens} /> : <div className="grid h-36 place-items-center rounded-lg border border-dashed text-xs text-muted-foreground">读不到样式表，点预览看效果</div>}
      <div className="mt-3 flex items-center gap-2 px-0.5">
        <span className="text-[15px] font-semibold">{theme.name}</span>
        <code className="font-mono text-[11px] text-muted-foreground">{theme.id}</code>
        {saved && <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 text-[11px] leading-5 text-muted-foreground"><Check className="size-3" />设置里在用</span>}
        <Button size="sm" variant={active ? 'secondary' : 'outline'} disabled={active} onClick={onPreview} className="ml-auto" aria-label={`预览${theme.name}风格`}>
          <Eye />{active ? '正在看' : '预览'}
        </Button>
      </div>
      <p className="mt-1.5 px-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{theme.note}。适合：{theme.fit}。</p>
    </div>
  )
}

const CHIP = 'inline-flex h-4 items-center rounded px-1 text-[9px] font-medium'

/** 用那套风格的令牌画一个缩小的工作台：侧栏、标题、状态标签、图表色、按钮 */
function MiniUI({ tokens }: { tokens: Record<string, string> }) {
  return (
    <div aria-hidden style={scopeStyle(tokens)} className="flex h-36 overflow-hidden rounded-lg border">
      <div className="flex w-[26%] flex-col gap-1.5 border-r border-sidebar-border bg-sidebar p-2">
        <span className="mb-1 size-3.5 rounded-[3px] bg-sidebar-primary" />
        <span className="h-3 rounded bg-sidebar-accent" />
        {[0.7, 0.55, 0.8, 0.6, 0.5].map((w, i) => <span key={i} className="block h-1.5 rounded-full bg-sidebar-foreground/25" style={{ width: `${w * 100}%` }} />)}
      </div>
      <div className="min-w-0 flex-1 p-2.5">
        <div className="flex items-center justify-between">
          <span className="font-heading text-[13px] leading-none font-semibold">今日</span>
          <span className="rounded bg-primary px-1.5 py-0.5 text-[9px] leading-none text-primary-foreground">新建</span>
        </div>
        <div className="mt-2 rounded-md border bg-card p-2 text-card-foreground">
          <div className="flex flex-wrap gap-1">
            <span className={cn(CHIP, 'bg-ok-soft text-ok')}>已签约</span>
            <span className={cn(CHIP, 'bg-warn-soft text-warn')}>待签约</span>
            <span className={cn(CHIP, 'bg-danger-soft text-danger')}>逾期</span>
            <span className={cn(CHIP, 'bg-info-soft text-info')}>进行中</span>
          </div>
          <div className="mt-2 flex h-8 items-end gap-1">
            {[0.55, 0.8, 0.65, 0.95, 0.4].map((h, i) => <span key={i} className="w-2.5 rounded-t-[2px]" style={{ height: `${h * 100}%`, background: `var(--chart-${i + 1})` }} />)}
            <span className="ml-auto self-center text-[9px] text-muted-foreground">图表 5 色</span>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[9px]">
          <span className="rounded bg-accent px-1.5 py-0.5 text-accent-foreground">选中</span>
          <span className="rounded border px-1.5 py-0.5 text-muted-foreground">次要</span>
          <span className="ml-auto text-rise">▲ 涨</span><span className="text-fall">▼ 跌</span>
        </div>
      </div>
    </div>
  )
}
