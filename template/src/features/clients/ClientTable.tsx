// 客户列表的表格：等级、客户、联系人、阶段、累计消费（万）、上次联系、下次跟进、提醒、在谈（万；按去年估的灰字写“估”）。归属：大客户模块
import { useOverlay } from '@/app/overlay'
import { dateWithRel, relDay, shortDate } from '@/lib/format'
import { StatusBadge } from '@/components/status'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StickyTable } from '@/components/data-view'
import { FlagChips, KeyMark, LevelHead, LevelMark, wanCell, yuanToWan } from '@/features/crm/parts'
import { silentLine } from '@/features/crm/rules'
import type { ClientRow } from '@/features/crm/types'
import { cn } from '@/lib/utils'

/** 在谈：真谈过的单用正文色；只有按去年估的，灰字前面写“估”，悬停看怎么估的 */
export function OpenAmount({ c, className }: { c: ClientRow; className?: string }) {
  if (c.open_amount) return <span className={className}>{wanCell(c.open_amount)}</span>
  if (c.est_amount) {
    return (
      <Tooltip>
        <TooltipTrigger asChild><span className={cn('cursor-help text-muted-foreground', className)}>估 {wanCell(c.est_amount)}</span></TooltipTrigger>
        <TooltipContent className="max-w-64">按去年的单估的，还没开口谈：{c.est_basis ?? '没写依据'}。不算进在谈和等级。</TooltipContent>
      </Tooltip>
    )
  }
  return <span className="text-muted-foreground">—</span>
}

export function ClientTable({ rows, showKeyMark }: { rows: ClientRow[]; showKeyMark: boolean }) {
  const ov = useOverlay()
  return (
    <StickyTable>
      <TableHeader><TableRow className="bg-surface-2/60 hover:bg-surface-2/60">
        <TableHead className="w-[76px] pl-4"><LevelHead /></TableHead>
        <TableHead>客户</TableHead><TableHead>联系人</TableHead><TableHead>阶段</TableHead>
        <TableHead className="text-right">累计消费</TableHead><TableHead>上次联系</TableHead><TableHead>下次跟进</TableHead><TableHead>提醒</TableHead><TableHead className="pr-4 text-right">在谈</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {rows.map((c) => {
          const late = (c.follow_overdue ?? -1) > 0
          return (
            <TableRow key={c.id} className="cursor-pointer" onClick={() => ov.openDetail('client', c.id)}>
              <TableCell className="pl-4">{c.kind === '客户' ? <LevelMark level={c.level} /> : <span className="text-xs text-muted-foreground">伙伴</span>}</TableCell>
              <TableCell className="max-w-[240px]">
                <div className="flex min-w-0 items-center gap-1.5">
                  {showKeyMark && c.key_account === 1 && <KeyMark />}
                  <button className="truncate text-left font-medium hover:text-primary" onClick={(e) => { e.stopPropagation(); ov.openDetail('client', c.id) }}>{c.name}</button>
                </div>
                <div className="truncate text-xs text-muted-foreground">{c.label}</div>
              </TableCell>
              <TableCell className="whitespace-nowrap"><div>{c.contact_name ?? '—'}</div><div className="text-xs text-muted-foreground">{c.contact_title}</div></TableCell>
              <TableCell><StatusBadge value={c.stage} /></TableCell>
              <TableCell className="num text-right whitespace-nowrap">{c.total_spent ? wanCell(yuanToWan(c.total_spent)) : <span className="text-muted-foreground">—</span>}{c.order_count > 0 && <div className="text-xs text-muted-foreground">{c.order_count} 单</div>}</TableCell>
              <TableCell className="num whitespace-nowrap"><div>{c.last_contact ? (c.days_silent !== null && c.days_silent <= 0 ? '今天' : shortDate(c.last_contact)) : '—'}</div><div className={cn('text-xs text-muted-foreground', c.flags.includes('久未联系') && 'font-medium text-warn')}>{silentLine(c.days_silent)}</div></TableCell>
              <TableCell className="max-w-[260px]">
                <div className={cn('num whitespace-nowrap', late && 'font-medium text-danger')}>{c.next_follow ? dateWithRel(c.next_follow) : <span className="text-muted-foreground">未定</span>}</div>
                {c.next_step && <div className="truncate text-xs text-muted-foreground">{c.next_step}</div>}
              </TableCell>
              <TableCell className="max-w-[180px]"><FlagChips flags={c.flags} />{c.birthday && <div className="mt-0.5 text-[11.5px] whitespace-nowrap text-muted-foreground">{c.birthday.label} {relDay(c.birthday.date)}</div>}</TableCell>
              <TableCell className="num pr-4 text-right whitespace-nowrap"><OpenAmount c={c} /></TableCell>
            </TableRow>
          )
        })}
        {!rows.length && <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">这个分类下没有客户，换个页签或清掉搜索看看</TableCell></TableRow>}
      </TableBody>
    </StickyTable>
  )
}
