// 行业资讯：一句“回到 Codex 说”的话，带复制按钮（空状态、设置页都用）
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { copyText } from './types'

export function Say({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-start gap-2 rounded-lg border bg-card px-3 py-2', className)}>
      <p className="min-w-0 flex-1 py-0.5 text-sm leading-relaxed break-words">{text}</p>
      <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 px-2 text-xs text-muted-foreground" onClick={() => copyText(text)} aria-label={`复制：${text}`}>
        <Copy aria-hidden />复制
      </Button>
    </div>
  )
}
