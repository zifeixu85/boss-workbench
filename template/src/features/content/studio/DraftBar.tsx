// 稿件区右上角：保存状态（已保存 · v3 / 有改动没保存）、复制整篇、导出文字稿。⌘+回车保存。归属：小红书内容模块。
import { useEffect } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Draft } from '../types'

/** 复制 / 导出用的 Markdown：小艾贴进小红书 App 时用 */
export function draftMarkdown(d: Draft) {
  return [
    `# ${d.title}`, '',
    d.titles.length > 1 ? `备选标题：${d.titles.filter((t) => t !== d.title).join(' / ')}\n` : '',
    `封面大字：${d.cover_text}`, '',
    d.pages.length ? `图片页：\n${d.pages.map((p, i) => `${i + 1}. ${p.text.replace(/\n/g, ' ')}`).join('\n')}\n` : '',
    d.body.trim(), '', d.tags.map((t) => `#${t}`).join(' '),
  ].filter((x) => x !== '').join('\n')
}

export function DraftBar({ draft, version, dirty, saving, locked, onSave, onDiscard }: {
  draft: Draft; version: number; dirty: boolean; saving: boolean; locked: boolean; onSave: () => void; onDiscard: () => void
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && dirty && !locked) { e.preventDefault(); onSave() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [dirty, locked, onSave])
  const copy = async () => {
    try { await navigator.clipboard.writeText(draftMarkdown(draft)); toast.success('整篇复制好了，贴到小红书 App 里') } catch { toast.error('浏览器没让复制，试试导出文字稿') }
  }
  const exportMd = () => {
    const url = URL.createObjectURL(new Blob([draftMarkdown(draft)], { type: 'text/plain;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${draft.title || '小红书稿件'}.txt` })
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
      {dirty ? (
        <>
          <span className="font-medium text-warn">有改动没保存</span>
          <Button size="xs" variant="ghost" onClick={onDiscard} disabled={saving}>不要了</Button>
          <Button size="xs" onClick={onSave} disabled={saving || locked}>{saving ? <Loader2 className="animate-spin" /> : <Check />}保存（⌘↵）</Button>
        </>
      ) : <span className="inline-flex items-center gap-1 text-muted-foreground"><Check className="size-3.5 text-ok" />{version ? `已保存 · v${version}` : '还没有稿件'}</span>}
      <span className="mx-1 h-4 w-px bg-border" />
      <Button size="xs" variant="ghost" onClick={copy} disabled={!version && !dirty}><Copy />复制</Button>
      <Button size="xs" variant="ghost" onClick={exportMd} disabled={!version && !dirty}><Download />导出文字稿</Button>
    </div>
  )
}
