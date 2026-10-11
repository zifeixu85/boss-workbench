// 知识库：左边目录树，右边文档。地址栏 ?path=04-客户/企业客户/澜拓科技.md 打开某篇。只读，修改交给 Codex
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Home, PanelLeft } from 'lucide-react'
import type { KbNode } from '@/lib/types'
import { useApi } from '@/lib/api'
import { PageBody, PageHeader, Panel } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { KbTree } from './KbTree'
import { KbDoc } from './KbDoc'
import { KbHome } from './KbHome'

export default function KbPage() {
  const [sp, setSp] = useSearchParams()
  const path = sp.get('path')
  const tree = useApi<KbNode[]>('/kb/tree')
  const [drawer, setDrawer] = useState(false)

  const open = (p: string | null) => {
    setSp((prev) => {
      const n = new URLSearchParams(prev)
      if (p) n.set('path', p)
      else n.delete('path')
      return n
    })
    setDrawer(false)
  }

  const treeView = tree.data ? (
    <KbTree tree={tree.data} active={path} onOpen={open} />
  ) : tree.error ? (
    <p className="px-2 py-3 text-[13px] text-muted-foreground">目录没取到：{tree.error.message}</p>
  ) : (
    <div className="grid gap-2">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-7" />)}</div>
  )

  return (
    <>
      <PageHeader
        eyebrow="资料"
        title="知识库"
        desc="关于我、生意、客户、项目、资料……知识库里的笔记都在这里。这里只能看；要新增或修改，直接跟 Codex 说。"
        actions={
          <>
            <Button variant="outline" className="md:hidden" onClick={() => setDrawer(true)}><PanelLeft />目录</Button>
            {path && <Button variant="ghost" onClick={() => open(null)}><Home />知识库首页</Button>}
          </>
        }
      />
      <PageBody>
        <div className="grid gap-5 md:grid-cols-[250px_minmax(0,1fr)] md:items-start lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden md:block">
            <Panel bodyClass="max-h-[calc(100dvh-200px)] overflow-y-auto overscroll-contain p-3">{treeView}</Panel>
          </aside>
          {path ? <KbDoc key={path} path={path} onHome={() => open(null)} /> : <KbHome onOpen={open} />}
        </div>
      </PageBody>

      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="w-[86vw] max-w-sm gap-0 bg-card p-0">
          <SheetHeader className="border-b px-4 pt-4 pb-3">
            <SheetTitle>知识库目录</SheetTitle>
            <SheetDescription>点文件名打开，可以按名字筛选</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">{treeView}</div>
        </SheetContent>
      </Sheet>
    </>
  )
}
