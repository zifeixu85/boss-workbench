// 知识库里的一篇文档：路径面包屑 + 更新时间 + 正文（只读）
import { Fragment } from 'react'
import { useApi } from '@/lib/api'
import { Panel } from '@/components/page'
import { Markdown } from '@/components/markdown'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { fileName, updatedText, type KbFile } from './kb-utils'

export function KbDoc({ path, onHome }: { path: string; onHome: () => void }) {
  const { data, isLoading, error } = useApi<KbFile>(`/kb/file?path=${encodeURIComponent(path)}`)

  if (error && !data) {
    return (
      <Empty className="border bg-card">
        <EmptyHeader>
          <EmptyTitle>打不开这个文件</EmptyTitle>
          <EmptyDescription>{error.message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent><Button variant="outline" onClick={onHome}>回到知识库首页</Button></EmptyContent>
      </Empty>
    )
  }

  const folders = path.split('/').slice(0, -1)
  return (
    <Panel className="min-w-0" bodyClass="p-0">
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b px-5 pt-4 pb-3">
        <PathCrumbs folders={folders} name={fileName(path)} onHome={onHome} />
        {data && (
          <time dateTime={data.updated} className="shrink-0 pt-0.5 text-xs whitespace-nowrap text-muted-foreground" title={data.updated.length === 10 ? `文件开头写的更新日期：${data.updated}` : new Date(data.updated).toLocaleString('zh-CN', { hour12: false })}>
            更新于 {updatedText(data.updated)}
          </time>
        )}
      </header>
      <div className="px-5 py-5 md:px-8 md:py-6">
        {isLoading || !data ? (
          <div className="grid gap-3"><Skeleton className="h-7 w-1/2" /><Skeleton className="h-4" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-32" /></div>
        ) : (
          <article className="max-w-3xl min-w-0 break-words">
            <Markdown source={data.body} basePath={data.path} />
          </article>
        )}
        <p className="mt-6 border-t pt-3 text-xs text-muted-foreground">
          这里只能看。想改这篇，对 Codex 说：“改一下知识库里的 {path}：……”
        </p>
      </div>
    </Panel>
  )
}

function PathCrumbs({ folders, name, onHome }: { folders: string[]; name: string; onHome: () => void }) {
  return (
    <Breadcrumb>
      <BreadcrumbList className="text-[13px]">
        <BreadcrumbItem>
          <button type="button" onClick={onHome} className="transition-colors hover:text-foreground">知识库</button>
        </BreadcrumbItem>
        {folders.map((f, i) => (
          <Fragment key={`${i}-${f}`}>
            <BreadcrumbSeparator />
            <BreadcrumbItem>{f}</BreadcrumbItem>
          </Fragment>
        ))}
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbPage className="font-medium">{name}</BreadcrumbPage></BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
