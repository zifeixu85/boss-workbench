// 内容列表：表格，标题点开单篇抽屉；按状态、内容支柱筛，搜标题。归属：小红书内容模块。
import { useMemo, useState } from 'react'
import { Search, Sparkles } from 'lucide-react'
import { StickyTable } from '@/components/data-view'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Choice } from '@/components/form'
import { md, thousands } from '@/lib/format'
import { SOURCE_SHORT, usePieceParam, useParam } from '../lib'
import { StatusTag, TrafficTag } from '../badges'
import { CoverArt } from '../phone/Cover'
import type { Piece } from '../types'

const ORDER = ['写稿中', '待发布', '已选', '灵感池', '已发布', '已放弃']
const when = (p: Piece) => (p.status === '已发布' ? `${md(p.published_at)} ${p.published_at?.slice(11, 16)}` : p.scheduled_date ? `${md(p.scheduled_date)} ${p.scheduled_time ?? ''}` : null)

export function ListView({ pieces }: { pieces: Piece[] }) {
  const sheet = usePieceParam()
  const [status, setStatus] = useParam<string>('status', '全部')
  const [pillar, setPillar] = useParam<string>('pillar', '全部')
  const [q, setQ] = useState('')
  const pillars = [...new Map(pieces.filter((p) => p.pillar_id).map((p) => [p.pillar_id!, p.pillar_name!])).entries()]
  const rows = useMemo(() => pieces
    .filter((p) => (status === '全部' ? p.status !== '已放弃' : p.status === status))
    .filter((p) => pillar === '全部' || p.pillar_id === pillar)
    .filter((p) => !q || p.title.includes(q) || (p.draft?.title ?? '').includes(q))
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (a.status === '已发布' ? (b.published_at ?? '').localeCompare(a.published_at ?? '') : (a.scheduled_date ?? '9').localeCompare(b.scheduled_date ?? '9'))),
  [pieces, status, pillar, q])
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64"><Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜标题" className="pl-8" /></div>
        <Choice className="w-36" value={status} onChange={(v) => setStatus(v ?? '全部')} options={['全部', ...ORDER].map((s) => ({ value: s, label: s === '全部' ? '全部状态' : s }))} />
        <Choice className="w-44" value={pillar} onChange={(v) => setPillar(v ?? '全部')} options={[{ value: '全部', label: '全部内容支柱' }, ...pillars.map(([id, name]) => ({ value: id, label: name }))]} />
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} 篇 · 数据是自然 + 投流合计，没有的写“—”</span>
      </div>
      <StickyTable maxHeight="calc(100dvh - 320px)">
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[300px]">标题</TableHead><TableHead className="hidden sm:table-cell">状态</TableHead><TableHead className="hidden sm:table-cell">排期 / 发布</TableHead><TableHead>来源</TableHead>
            <TableHead className="text-right">阅读</TableHead><TableHead className="text-right">点赞</TableHead><TableHead className="text-right">收藏</TableHead><TableHead className="text-right">评论</TableHead><TableHead>流量</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <button type="button" onClick={() => sheet.open(p.id)} className="flex min-w-0 items-center gap-2.5 text-left">
                  <span className="w-8 shrink-0 overflow-hidden rounded-sm">{p.draft ? <CoverArt text={p.draft.cover_text} cover={p.draft.cover} pages={p.draft.pages} seed={p.draft.title} /> : <span className="block aspect-[3/4] rounded-sm border border-dashed" />}</span>
                  <span className="min-w-0">
                    <span className="line-clamp-1 font-medium hover:text-primary">{p.draft?.title || p.title}</span>
                    <span className="block text-xs text-muted-foreground">{p.format} · {p.pillar_name ?? '不在支柱里'}{p.version ? ` · 稿件 v${p.version}` : ''}</span>
                    <span className="num mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground sm:hidden"><StatusTag s={p.status} />{when(p)}</span>
                  </span>
                </button>
              </TableCell>
              <TableCell className="hidden sm:table-cell"><StatusTag s={p.status} /></TableCell>
              <TableCell className="num hidden text-[13px] whitespace-nowrap sm:table-cell">{when(p) ?? <span className="text-muted-foreground">未定</span>}</TableCell>
              <TableCell className="text-[13px] whitespace-nowrap text-muted-foreground">{p.ai && <Sparkles className="mr-1 inline size-3 text-primary" />}{SOURCE_SHORT[p.source] ?? p.source}</TableCell>
              {(['reads', 'likes', 'saves', 'comments'] as const).map((k) => <TableCell key={k} className="num text-right">{p.total ? thousands(p.total[k]) : '—'}</TableCell>)}
              <TableCell>{p.status !== '已发布' ? <span className="text-muted-foreground">—</span> : <TrafficTag boosted={p.boosted} spend={p.paid_spend} none={!p.total} />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </StickyTable>
    </div>
  )
}
