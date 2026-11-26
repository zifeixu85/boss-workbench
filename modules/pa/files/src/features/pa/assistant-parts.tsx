// 助理页共用的小零件：头像（IDENTITY 里的 emoji；还没写的用名字的头一个字）、token 数的写法。
import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const SIZE = { sm: 'size-8 text-base', md: 'size-11 text-2xl', lg: 'size-12 text-[26px]', xl: 'size-16 text-[34px]' } as const

export function Avatar({ a, size = 'md', className }: { a: { avatar: string; name: string; chief?: boolean }; size?: keyof typeof SIZE; className?: string }) {
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-2xl border bg-muted/60 leading-none', a.chief && 'border-primary/30 bg-primary/10', SIZE[size], className)}>
      {a.avatar || <span className="font-heading text-[0.6em] font-semibold text-muted-foreground">{a.name.slice(0, 1)}</span>}
    </span>
  )
}

/** token 数：上万写“万”，上亿写“亿” */
export function tokens(n: number): { value: string; unit: string } {
  if (n >= 1e8) return { value: (n / 1e8).toFixed(1), unit: '亿' }
  if (n >= 1e4) return { value: (n / 1e4).toFixed(1), unit: '万' }
  return { value: String(Math.round(n)), unit: '' }
}

/** 宽屏（minWidth 以上）时让一块从自己的位置撑到窗口底（留 16px），里面的几栏各自滚动；窄屏不定高、整页滚。窗口变大小、上面折行时重新量 */
/** ready：那一块画出来了没有（数据没到时还没画，画出来再量） */
export function useFillHeight(minWidth = 768, ready = true): [React.RefObject<HTMLDivElement | null>, number | null] {
  const ref = useRef<HTMLDivElement>(null)
  const [h, setH] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const wide = window.matchMedia(`(min-width: ${minWidth}px)`)
    let scroller: HTMLElement | null = null
    for (let p = el.parentElement; p; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) { scroller = p; break }
    const measure = () => {
      if (!wide.matches) { setH(null); return }
      const box = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
      const top = el.getBoundingClientRect().top - box.top + (scroller ? scroller.scrollTop : window.scrollY)
      setH(Math.max(420, Math.floor(box.bottom - box.top - top - 16)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (el.parentElement?.parentElement) ro.observe(el.parentElement.parentElement)
    window.addEventListener('resize', measure)
    wide.addEventListener('change', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); wide.removeEventListener('change', measure) }
  }, [minWidth, ready])
  return [ref, h]
}
