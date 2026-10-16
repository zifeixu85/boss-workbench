// 设置 → 我的资料（2026-10-15）：上面是称呼、工作台名称（能改），下面是知识库里讲“你是谁、怎么跟你说话”的几份（只读，点开在知识库里看）。
// AI 助手和 Codex 每次都按这几份理解你；要改内容，跟 Codex 说“更新一下我的基本情况：……”，由知识库 Skill 去改
import { Link } from 'react-router'
import { FileText } from 'lucide-react'
import type { Settings } from '@/lib/types'
import { useApi } from '@/lib/api'
import { relDay } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { BasicInfoForm } from './sections'

type ProfileDoc = { title: string; path: string | null; excerpt: string; updated: string | null }

export function ProfilePanel({ settings }: { settings: Settings }) {
  const { data: docs } = useApi<ProfileDoc[]>('/kb/profile')
  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-accent font-heading text-2xl font-semibold text-accent-foreground">{settings.owner.slice(0, 1)}</span>
        <div className="min-w-0">
          <div className="font-heading text-lg font-semibold">{settings.owner}</div>
          <div className="truncate text-sm text-muted-foreground">{settings.business}</div>
        </div>
      </div>
      <BasicInfoForm key={`${settings.owner}|${settings.business}|${settings.xhs_name}`} settings={settings} />
      <div className="grid gap-2">
        <div className="text-sm font-medium">AI 读到的你</div>
        <p className="text-xs text-muted-foreground">AI 助手和 Codex 每次都先读这几份。要改，直接跟 Codex 说“更新一下我的基本情况：……”，它会改知识库里的原文。</p>
        {!docs ? <Skeleton className="h-32" /> : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {docs.map((d) => (
              <li key={d.title} className="rounded-lg border bg-card px-3.5 py-3">
                <div className="flex items-center gap-1.5 text-sm font-medium"><FileText className="size-4 text-muted-foreground" />{d.title}</div>
                {d.path ? (
                  <>
                    <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{d.excerpt || '（还没写内容）'}</p>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground"><Link to={`/kb?path=${encodeURIComponent(d.path)}`} className="text-primary hover:underline">在知识库里看</Link>{d.updated && <span>· {relDay(String(d.updated).slice(0, 10))}更新</span>}</div>
                  </>
                ) : <p className="mt-1 text-[13px] text-muted-foreground">知识库里还没有这份。跟 Codex 说“继续建库”，或“帮我补一下{d.title}”。</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
