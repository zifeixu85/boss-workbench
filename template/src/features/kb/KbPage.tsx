// 知识库：左边目录树，右边文档。地址栏 ?path=04-客户/企业客户/澜拓科技.md 打开某篇。只读，修改交给 Codex
// 宽屏时目录和正文各自滚动、各有滚动条（2026-11-27 A梦：“目录跟正文应该分开滚动”），两栏的高度撑满到窗口底，页面整体不跟着滚；
// 窄屏（目录收进抽屉）照旧整页滚。
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import { useIdentity } from '@/lib/identity'

export default function KbPage() {
  const kb = useIdentity().kb
  const [sp, setSp] = useSearchParams()
  const path = sp.get('path')
  const tree = useApi<KbNode[]>('/kb/tree')
  const [drawer, setDrawer] = useState(false)
  const [cols, height] = useFillHeight()
  const docBox = useRef<HTMLDivElement>(null)
  // 换一篇从头看
  useEffect(() => { docBox.current?.scrollTo({ top: 0 }) }, [path])

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
        title={kb}
        desc={`关于我、生意、客户、项目……${kb}里的笔记都在这里。这里只能看；要新增或修改，直接跟 Codex 说。`}
        actions={
          <>
            <Button variant="outline" className="md:hidden" onClick={() => setDrawer(true)}><PanelLeft />目录</Button>
            {path && <Button variant="ghost" onClick={() => open(null)}><Home />{kb}首页</Button>}
          </>
        }
      />
      <PageBody className="md:pb-4">
        <div ref={cols} style={height ? { height } : undefined} className="grid gap-5 md:grid-cols-[250px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden min-h-0 md:block">
            <Panel className="flex h-full flex-col" bodyClass="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">{treeView}</Panel>
          </aside>
          <div ref={docBox} className="min-h-0 min-w-0 md:overflow-y-auto md:overscroll-contain md:pr-1" aria-label="正文">
            {path ? <KbDoc key={path} path={path} onHome={() => open(null)} /> : <KbHome onOpen={open} />}
          </div>
        </div>
      </PageBody>

      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="w-[86vw] max-w-sm gap-0 bg-card p-0">
          <SheetHeader className="border-b px-4 pt-4 pb-3">
            <SheetTitle>{kb}目录</SheetTitle>
            <SheetDescription>点文件名打开，可以按名字筛选</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">{treeView}</div>
        </SheetContent>
      </Sheet>
    </>
  )
}

/** 宽屏时让两栏从自己的位置一直撑到窗口底（留一点边）；窄屏不定高。窗口变大小、标题折行时重新量 */
function useFillHeight(): [React.RefObject<HTMLDivElement | null>, number | null] {
  const ref = useRef<HTMLDivElement>(null)
  const [h, setH] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const wide = window.matchMedia('(min-width: 768px)')
    const scroller = scrollParent(el)
    const measure = () => {
      if (!wide.matches) { setH(null); return }
      const box = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
      const top = el.getBoundingClientRect().top - box.top + (scroller ? scroller.scrollTop : window.scrollY)
      setH(Math.max(320, Math.floor(box.bottom - box.top - top - 16)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (el.parentElement?.parentElement) ro.observe(el.parentElement.parentElement)
    window.addEventListener('resize', measure)
    wide.addEventListener('change', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); wide.removeEventListener('change', measure) }
  }, [])
  return [ref, h]
}

/** 往上找第一个自己会滚的容器（各种导航外壳里是 main；顶栏导航是整个窗口，返回 null） */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p
  return null
}
