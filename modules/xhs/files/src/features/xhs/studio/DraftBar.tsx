// 稿件区右上角：保存状态（已保存 · v3 / 有改动没存）、复制整篇、导出文字稿。⌘+回车保存。归属：小红书内容模块。 保存状态和文字导出菜单。
import { useEffect } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Draft } from '../types'

import { draftText, exportFilename } from './studio-utils'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'

export function DraftBar({ draft, version, dirty, saving, locked, onSave, onDiscard }: {
  draft: Draft; version: number; dirty: boolean; saving: boolean; locked: boolean; onSave: () => void; onDiscard: () => void
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && dirty && !locked) { e.preventDefault(); onSave() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [dirty, locked, onSave])
  const copy = async () => {
    try { await navigator.clipboard.writeText(draftText(draft)); toast.success('整篇复制好了，贴到小红书 App 里') } catch { toast.error('浏览器没让复制，试试导出文字稿') }
  }
  const download = (ext: 'md' | 'txt') => {
    const url = URL.createObjectURL(new Blob([draftText(draft, ext === 'md')], { type: `${ext === 'md' ? 'text/markdown' : 'text/plain'};charset=utf-8` }))
    const a = Object.assign(document.createElement('a'), { href: url, download: exportFilename(draft.title, ext) })
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  return (
    <div className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
      {dirty ? (
        <>
          <span className="font-medium text-warn">有改动没存</span>
          <Button size="xs" variant="ghost" onClick={onDiscard} disabled={saving}>不要了</Button>
          <Button size="xs" onClick={onSave} disabled={saving || locked}>{saving ? <Loader2 className="animate-spin" /> : <Check />}保存（⌘↵）</Button>
        </>
      ) : <span className="inline-flex items-center gap-1 text-muted-foreground"><Check className="size-3.5 text-ok" />{version ? `已保存 · v${version}` : '还没有稿件'}</span>}
      <span className="mx-1 h-4 w-px bg-border" />
      <Button size="xs" variant="ghost" onClick={copy} disabled={!version && !dirty}><Copy />复制</Button>
      <DropdownMenu><DropdownMenuTrigger asChild><Button size="xs" variant="ghost" disabled={!version && !dirty}><Download />导出</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem onSelect={() => { void copy() }}>复制全文</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => download('md')}>下载 .md</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => download('txt')}>下载 .txt</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
