// 没选文件时：最近更新的文档 + 知识库里有哪些文件夹（按实际目录列出）+ 什么该放知识库
import { FileText, Folder, Map as MapIcon } from 'lucide-react'
import type { KbNode } from '@/lib/types'
import { useApi } from '@/lib/api'
import { Panel } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { countFiles, displayName, folderOf, hintOf, isMapFile, updatedText } from './kb-utils'

export function KbHome({ onOpen }: { onOpen: (path: string) => void }) {
  const recent = useApi<KbNode[]>('/kb/recent')
  const tree = useApi<KbNode[]>('/kb/tree')
  const map = tree.data?.find(isMapFile)
  const dirs = tree.data?.filter((n) => n.type === 'dir') ?? []
  return (
    <div className="grid min-w-0 gap-5">
      {map && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-accent/50 px-5 py-3.5">
          <MapIcon className="size-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1"><div className="text-sm font-semibold">先看《{displayName(map)}》</div><p className="text-[13px] text-muted-foreground">知识库的地图：东西放在哪、还缺什么、哪些不要读。AI 也是先读这一份。</p></div>
          <Button size="sm" onClick={() => onOpen(map.path)}>打开</Button>
        </div>
      )}
      <Panel title="最近更新" desc="你或 Codex 最近改过的文档">
        {recent.isLoading ? (
          <div className="grid gap-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : recent.data?.length ? (
          <ul className="-mx-2 grid gap-px">
            {recent.data.map((f) => (
              <li key={f.path}>
                <button type="button" onClick={() => onOpen(f.path)} className="flex w-full min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{displayName(f)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{folderOf(f.path) || '知识库根目录'}</span>
                  </span>
                  {f.updated && <span className="shrink-0 text-xs text-muted-foreground">{updatedText(f.updated)}</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{recent.error ? `没取到：${recent.error.message}` : '知识库里还没有文档。'}</p>
        )}
      </Panel>

      <Panel title="知识库里有什么" desc="按实际的文件夹列出；文件夹改名、重新整理后这里自动跟着变">
        <ul className="grid gap-3 sm:grid-cols-2">
          {dirs.map((d) => (
            <li key={d.path} className="flex gap-3 rounded-lg border bg-background/60 p-3.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"><Folder className="size-4" aria-hidden /></span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-2"><span className="text-sm font-semibold">{d.name}</span><span className="num text-xs text-muted-foreground">{countFiles(d)} 篇</span></span>
                <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">{hintOf(d.name) ?? '自定义的文件夹'}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-lg border-l-2 border-primary/50 bg-accent/50 px-4 py-3 text-[13.5px] leading-relaxed">
          <p className="font-medium">过一个月还有用的放知识库，只对这几天有用的放工作台。</p>
          <p className="mt-1 text-muted-foreground">比如客户的送礼对象和忌讳、你定下的接单原则，写进知识库；明天几点见面、要回谁的电话，记在工作台里就行。</p>
        </div>
      </Panel>
    </div>
  )
}
