// 助理页共用的小零件：头像（IDENTITY 里的 emoji；还没写的用名字的头一个字）、token 数的写法。
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
