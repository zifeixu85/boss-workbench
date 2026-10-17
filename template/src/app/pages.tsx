// 页面登记用的两个小工具（router.tsx 和装进来的模块的 modules.routes.gen.tsx 共用）
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { ModuleGate } from './ModuleGate'
import { Skeleton } from '@/components/ui/skeleton'

/** 按需加载一个页面：用到时才下载，加载时显示骨架 */
export const page = <P extends object>(load: () => Promise<{ default: ComponentType<P> }>) => {
  const C = lazy(load)
  return (props: P) => (
    <Suspense fallback={<div className="grid gap-3 p-7"><Skeleton className="h-9 w-48" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>}>
      <C {...props} />
    </Suspense>
  )
}

/** 模块没打开时显示说明页（模块开关，见 shared/modules.ts）；id 和 nav.ts 里菜单项的 module 一致 */
export const gate = (id: string, el: ReactNode) => <ModuleGate id={id}>{el}</ModuleGate>
