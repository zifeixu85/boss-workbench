// 对话栏里“叫哪位助理”（2026-11-27，约定 11.11；A梦：“在对话里面，他可能能够知道唤起哪个角色来进行处理”）。
// 助理由装了的模块给（个人助理模块给知识库里的助理）；一个都没有就不出这个选择。
// 选了：这句句首加“叫<名字>，”，并记在这个对话上，下次打开还是它。默认：这个对话记着的那位；新对话在某位助理自己的页上打开时选它；
// 都没有就是“不指定”（知识库的规矩是默认找总协调的那位）。
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { Check, ChevronDown, Users } from 'lucide-react'
import { useApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export type Persona = { key: string; name: string; avatar: string; duty: string; call: string; page?: string }

/** 这个对话叫的是哪位：undefined = 还没手动选（跟着对话记的 / 本页的）；null = 不指定 */
export function usePersona(thread: string | null, threadPersona: string | null | undefined) {
  const { data: list } = useApi<Persona[]>('/assistant/personas')
  const { pathname } = useLocation()
  const [picked, setPicked] = useState<string | null | undefined>(undefined)
  // 换了对话、新对话换了页面：重新按默认来
  useEffect(() => { setPicked(undefined) }, [thread, thread ? null : pathname])
  const onPage = list?.find((p) => p.page && decodeURIComponent(pathname) === p.page)?.key ?? null
  const key = picked !== undefined ? picked : thread ? (threadPersona ?? null) : onPage
  const persona = list?.find((p) => p.key === key) ?? null
  return { list: list ?? [], persona, set: setPicked }
}

export function PersonaPicker({ list, persona, onPick, disabled }: { list: Persona[]; persona: Persona | null; onPick: (key: string | null) => void; disabled?: boolean }) {
  if (!list.length) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button type="button" aria-label={persona ? `这句叫${persona.name}，点了换一位` : '叫哪位助理'} title={persona ? `这句会以“${persona.call || `叫${persona.name}`}，”开头` : '叫哪位助理（不选就是默认的总助）'}
          className={cn('inline-flex h-7 max-w-36 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs transition-colors hover:bg-muted disabled:opacity-50', persona ? 'bg-primary/10 font-medium text-primary hover:bg-primary/15' : 'text-muted-foreground hover:text-foreground')}>
          {persona ? <span aria-hidden className="text-sm leading-none">{persona.avatar || persona.name.slice(0, 1)}</span> : <Users className="size-3.5 shrink-0" />}
          <span className="truncate">{persona ? persona.name : '叫谁'}</span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">这句交给哪位助理</DropdownMenuLabel>
        {list.map((p) => (
          <DropdownMenuItem key={p.key} onSelect={() => onPick(p.key)} className="gap-2">
            <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-sm leading-none">{p.avatar || p.name.slice(0, 1)}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{p.name}</span>{p.duty && <span className="block truncate text-[11px] text-muted-foreground">{p.duty}</span>}</span>
            {persona?.key === p.key && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onPick(null)} className="gap-2 text-[13px]">
          <span className="grid size-6 shrink-0 place-items-center"><Users className="size-4 text-muted-foreground" /></span>
          <span className="flex-1">不指定（默认找总助）</span>
          {!persona && <Check className="size-4 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
