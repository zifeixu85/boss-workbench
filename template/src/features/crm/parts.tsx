// 大客户模块共用的小零件：等级章、大客户标记、提醒标签、谁写的、知识库原文（只读弹窗）、复制、在 Codex 里改、金额列。归属：大客户模块
// 第二轮：等级章改成带字的方角小章“A 级”（原来的圆字母像头像）；“谁写的”按作者类型给图标，不再从文字里猜；金额同一列都用“万”并对齐。
import { useState, type ReactNode } from 'react'
import { BookOpen, CalendarClock, Check, Copy, FileText, Info, LayoutTemplate, Mail, MessageCircle, Phone, Sparkles, Star, Store, UserRound, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useApi } from '@/lib/api'
import { NBSP } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { Markdown } from '@/components/markdown'
import { StatusBadge } from '@/components/status'
import { cn } from '@/lib/utils'
import type { AuthorKind, Flag, Level } from './types'
import { levelRule } from './rules'
import { useIdentity } from '@/lib/identity'

const LEVEL_CLS: Record<Level, string> = {
  A: 'bg-accent text-accent-foreground ring-primary/35',
  B: 'bg-card text-foreground ring-border',
  C: 'bg-transparent text-muted-foreground ring-border',
}

/** 等级口径的文字（称呼从设置读） */
function LevelRuleText() {
  return <>{levelRule(useIdentity().owner)}</>
}

/** 等级章：方角小章“A 级”，悬停看规则 */
export function LevelMark({ level, className }: { level: Level; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex h-5 shrink-0 items-center rounded-[5px] px-1.5 text-[12px] font-semibold whitespace-nowrap ring-1 ring-inset', LEVEL_CLS[level], className)} aria-label={`${level} 级客户`}>
          {level}{NBSP}级
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64"><LevelRuleText /></TooltipContent>
    </Tooltip>
  )
}

/** 表头“等级 ⓘ”：悬停看等级怎么算 */
export function LevelHead() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help items-center gap-1">等级<Info className="size-3.5 text-muted-foreground" /></span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64"><LevelRuleText /></TooltipContent>
    </Tooltip>
  )
}

/** 大客户：名字前的小星标（知识库里有档案的） */
export function KeyMark({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Star className={cn('size-3.5 shrink-0 fill-primary text-primary', className)} aria-label="大客户" />
      </TooltipTrigger>
      <TooltipContent>大客户：知识库里有档案，<OwnerName />亲自跟</TooltipContent>
    </Tooltip>
  )
}

const FLAG_TONE: Record<Flag, 'warn' | 'info' | 'primary'> = { 久未联系: 'warn', 有新材料: 'info', 生日临近: 'primary', 有冲突待定: 'warn', 撞上门店停业: 'warn' }
export function FlagChips({ flags, className }: { flags: Flag[]; className?: string }) {
  if (!flags.length) return null
  return <span className={cn('flex flex-wrap gap-1', className)}>{flags.map((f) => <StatusBadge key={f} value={f} tone={FLAG_TONE[f]} />)}</span>
}

const CHANNEL_ICON = { 微信: MessageCircle, 电话: Phone, 面谈: Users, 到店: Store, 邮件: Mail, 其他: FileText } as const
export function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  const I = CHANNEL_ICON[channel as keyof typeof CHANNEL_ICON] ?? FileText
  return <I className={cn('size-3.5', className)} aria-hidden />
}

/** 知识库里的原件（只读）：点开在弹窗里看，不离开当前页面 */
export function SourceLink({ path, label, className }: { path: string; label?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('inline-flex max-w-full min-w-0 items-center gap-1 text-left text-xs text-primary hover:underline', className)}>
        <FileText className="size-3.5 shrink-0" /><span className="truncate">{label ?? path.split('/').pop()?.replace(/\.md$/, '')}</span>
      </button>
      {open && <KbDocDialog path={path} onClose={() => setOpen(false)} />}
    </>
  )
}

export function KbDocDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const { data, error } = useApi<{ body: string }>(`/kb/file?path=${encodeURIComponent(path)}`)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle className="font-heading text-base">{path.split('/').pop()?.replace(/\.md$/, '')}</DialogTitle>
          <DialogDescription>知识库原文 · {path} · 只读，要改请交给 Codex</DialogDescription>
        </DialogHeader>
        {data ? <Markdown source={data.body} basePath={path} className="text-[14px] leading-7" /> : error ? <p className="text-sm text-muted-foreground">打不开：{error.message}</p> : <Skeleton className="h-48" />}
      </DialogContent>
    </Dialog>
  )
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch {
    const ta = document.createElement('textarea')
    ta.value = text; document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy'); ta.remove(); return ok
  }
}

export function CopyButton({ text, label = '复制', done = '已复制', size = 'xs', variant = 'outline' }: { text: string; label?: string; done?: string; size?: 'xs' | 'sm'; variant?: 'outline' | 'ghost' | 'default' }) {
  const [ok, setOk] = useState(false)
  return (
    <Button type="button" size={size} variant={variant} onClick={async () => {
      if (await copyText(text)) { setOk(true); toast.success(done); setTimeout(() => setOk(false), 1800) } else toast.error('没复制成功，手动选中文字复制')
    }}>
      {ok ? <Check /> : <Copy />}{ok ? done : label}
    </Button>
  )
}

/** 给 Codex 的一段话：带上客户档案和关怀做法的位置，到 Codex 对话里粘贴就能接着改 */
export function codexEditPrompt(clientName: string, kbPath: string | null | undefined, occasion: string, draft: string) {
  return `帮我改一下给${clientName}的“${occasion}”消息草稿。先读${kbPath ? ` ${kbPath} 和` : ''} 05-方法与判断/大客户关怀.md、02-关于我/说话方式.md。
现在的草稿：「${draft}」
要求：话短，像我平常发微信；送礼和问候里不提单子、不报价；还没上线的新品不提名字；只出草稿，我自己发。改好后用工作台命令存回去（care-set），或者直接给我看。`
}

// ───────────── 谁写的 ─────────────

const KIND_LOOK: Record<AuthorKind, { icon: typeof Sparkles; cls: string; label: string }> = {
  定时任务: { icon: CalendarClock, cls: 'text-info', label: 'Codex 定时任务' },
  现场写: { icon: Sparkles, cls: 'text-info', label: 'Codex 现场写' },
  知识库: { icon: BookOpen, cls: 'text-primary', label: '知识库草稿' },
  模板: { icon: LayoutTemplate, cls: 'text-muted-foreground', label: '模板' },
  本人: { icon: UserRound, cls: 'text-foreground/70', label: '' }, // 老板自己写的：显示设置里的称呼
}

/** 前端兜底：没给作者类型时按开头判断（和服务端 authors.ts 同一套） */
export function kindOf(author: string | null | undefined): AuthorKind {
  const a = author ?? ''
  if (a.startsWith('模板')) return '模板'
  if (a.startsWith('Codex 定时任务')) return '定时任务'
  if (a.startsWith('Codex 现场写')) return '现场写'
  if (a.startsWith('知识库')) return '知识库'
  return '本人'
}

/** 设置里的称呼（“张总”；没设置时“老板”） */
export function OwnerName() {
  return <>{useIdentity().owner}</>
}

/** 草稿来源：“图标 类型 · 细节 · 细节”，最多两行、不截断；模型名只放悬停提示 */
export function AuthorNote({ author, kind, className, extra }: { author: string | null; kind?: AuthorKind; className?: string; extra?: ReactNode }) {
  const owner = useIdentity().owner
  const k = kind ?? kindOf(author)
  const look = KIND_LOOK[k]
  const raw = author ?? owner
  const model = raw.match(/（(gpt[^）]*|o\d[^）]*)）/)?.[1] ?? null
  const parts = raw.replace(/（(gpt[^）]*|o\d[^）]*)）/, '').split(/\s*·\s*/).filter(Boolean)
  const first = parts[0] ?? owner
  const label = k !== '本人' && first.startsWith(look.label.slice(0, 4)) ? look.label : first
  const rest = parts.slice(1)
  const Icon = look.icon
  const body = (
    <span className={cn('inline-flex min-w-0 items-start gap-1.5 text-[12px] leading-snug text-muted-foreground', className)}>
      <Icon className={cn('mt-[1px] size-3.5 shrink-0', look.cls)} aria-hidden />
      <span className="min-w-0">
        <span className={cn('font-medium', k === '模板' ? 'text-muted-foreground' : 'text-foreground/80')}>{label}</span>
        {rest.map((p, i) => <span key={i}><span className="mx-1 text-muted-foreground/60">·</span>{p}</span>)}
        {extra}
      </span>
    </span>
  )
  if (!model) return body
  return <Tooltip><TooltipTrigger asChild>{body}</TooltipTrigger><TooltipContent>用的模型：{model}</TooltipContent></Tooltip>
}

/** “35 天”“今天” */
export const silentText = (n: number | null) => (n === null ? '—' : n <= 0 ? '今天' : `${n} 天`)

// ───────────── 金额 ─────────────

/** 表格同一列的“万”：一律两位小数（2.40 万、0.54 万），右对齐时小数点自然对齐，不再补空白字符（第三轮修产品评审 #17） */
export function wanCell(n: number | null | undefined) {
  if (n === null || n === undefined) return '—'
  return `${(Math.round(n * 100) / 100).toFixed(2)}${NBSP}万`
}
/** 按元记的钱写成“万”（订单累计、今年成交），和商机、应收同一个单位 */
export const yuanToWan = (yuan: number) => Math.round(yuan / 100) / 100
