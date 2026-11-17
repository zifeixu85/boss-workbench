// 数据页的笔记表格：封面缩略图 + 标题、流量、曝光、阅读、点赞、收藏、评论、涨粉、自然收藏率；点名字开单篇抽屉。归属：小红书内容模块。
import { StickyTable } from '@/components/data-view'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TrafficTag } from '../badges'
import { md, thousands } from '@/lib/format'
import { cn } from '@/lib/utils'
import { usePieceParam, pct } from '../lib'
import { CoverArt } from '../phone/Cover'
import type { DataPage, Metrics } from '../types'

const COLS: [keyof Metrics, string][] = [['impressions', '曝光'], ['reads', '阅读'], ['likes', '点赞'], ['saves', '收藏'], ['comments', '评论'], ['new_followers', '涨粉']]

export function NotesTable({ data, traffic }: { data: DataPage; traffic: string }) {
  const sheet = usePieceParam()
  const pick = (n: DataPage['rows'][number]) => (traffic === '自然' ? n.organic : traffic === '投流' ? n.paid : n.total)
  const medRate = data.account_median_rate
  return (
    <StickyTable maxHeight="calc(100dvh - 200px)">
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-[320px]">笔记（{data.rows.length} 篇）</TableHead><TableHead>流量</TableHead>
          {COLS.map(([k, l]) => <TableHead key={k} className="text-right">{l}</TableHead>)}
          <TableHead className="text-right" title={`账号一篇的中位数 ${medRate ?? '—'}%，高出三成的加粗`}>自然收藏率</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.rows.map((n) => {
          const m = pick(n)
          const rate = n.organic ? pct(n.organic.saves, n.organic.reads) : null
          return (
            <TableRow key={n.id}>
              <TableCell>
                <button type="button" onClick={() => n.piece_id && sheet.open(n.piece_id)} className="flex min-w-0 items-center gap-2.5 text-left">
                  <span className="w-9 shrink-0 overflow-hidden rounded-sm shadow-sm">{n.cover ? <CoverArt text={n.cover_text ?? n.title} cover={n.cover} pages={n.pages} seed={n.title} /> : <span className="block aspect-[3/4] bg-muted" />}</span>
                  <span className="min-w-0">
                    <span className="line-clamp-1 font-medium hover:text-primary">{n.title}</span>
                    <span className="block text-xs text-muted-foreground">{n.kind} · {md(n.date)} {n.published_at.slice(11, 16)} · {n.pillar_name}</span>
                  </span>
                </button>
              </TableCell>
              <TableCell><TrafficTag boosted={n.boosted} spend={n.paid?.spend} none={!n.organic && !n.paid} /></TableCell>
              {COLS.map(([k]) => <TableCell key={k} className="num text-right">{m ? thousands(m[k]) : '—'}</TableCell>)}
              <TableCell className={cn('num text-right', rate != null && medRate != null && rate >= medRate * 1.3 && 'font-semibold')}>{rate != null ? `${rate.toFixed(1)}%` : '—'}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </StickyTable>
  )
}
