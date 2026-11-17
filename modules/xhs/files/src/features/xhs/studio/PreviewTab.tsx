// 预览页签：手机（发现页 / 笔记页）跟着稿件实时变（包括还没保存的修改），旁边是发布前检查。归属：小红书内容模块。
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useChecks } from '../lib'
import { PhonePreview, type PhoneView } from '../phone/PhonePreview'
import { ChecksPanel } from '../ChecksPanel'
import type { AiCheck, Draft, Piece } from '../types'

const NOTE: Record<PhoneView, string> = {
  发现页: '红框是这篇，旁边是自己最近的笔记和收藏的同行笔记。先看封面和标题，能不能让人在一堆笔记里想点进来。',
  笔记页: '点图片翻页。看图片顺序、标题、正文的段落和话题在手机上的样子；封面和内页都是按模板实时画的。',
}

export function PreviewTab({ draft, piece, ai, dirty }: { draft: Draft; piece: Piece; ai?: AiCheck | null; dirty?: boolean }) {
  const [view, setView] = useState<PhoneView>('发现页')
  const checks = useChecks(draft, piece.scheduled_date)
  return (
    <div className="grid gap-6 px-5 py-5 xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="flex flex-col items-center gap-3">
        <div className="inline-flex rounded-lg border p-0.5 text-sm" role="group" aria-label="手机画面">
          {(['发现页', '笔记页'] as PhoneView[]).map((v) => <button key={v} type="button" onClick={() => setView(v)} className={cn('rounded-md px-3 py-1', view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{v}</button>)}
        </div>
        <PhonePreview draft={draft} view={view} selfNote={piece.note_id} />
      </div>
      <div className="min-w-0">
        <p className="mb-4 rounded-lg bg-muted/60 px-3.5 py-2.5 text-[13px] leading-relaxed text-muted-foreground">{NOTE[view]}</p>
        <ChecksPanel checks={checks} ai={ai} dirty={dirty} />
      </div>
    </div>
  )
}
