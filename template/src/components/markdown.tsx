// Markdown 显示：知识库文档、周报正文、客户背景笔记都用它
import ReactMarkdown from 'react-markdown'
import { Link } from 'react-router'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { metaLabels, splitFrontmatter, type MetaLabel } from '@shared/frontmatter'

/** 把知识库里的相对 .md 链接解析成知识库路径，例如 ../客户/澜拓科技.md → 生意/客户/澜拓科技.md */
function resolveKb(href: string, basePath?: string) {
  const parts = (basePath ? basePath.split('/').slice(0, -1) : [])
  for (const seg of decodeURIComponent(href).split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

export function Markdown({ source, className, basePath }: { source: string; className?: string; basePath?: string }) {
  const { meta, body } = splitFrontmatter(source)
  const labels = metaLabels(meta)
  return (
    <div className={cn('text-[14.5px] leading-7', className)}>
      {labels.length > 0 && <MetaRow labels={labels} />}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="mt-2 mb-3 font-heading text-[22px] font-semibold" {...p} />,
          h2: (p) => <h2 className="mt-6 mb-2 text-[16px] font-semibold" {...p} />,
          h3: (p) => <h3 className="mt-4 mb-1.5 text-[15px] font-semibold" {...p} />,
          p: (p) => <p className="my-2" {...p} />,
          ul: (p) => <ul className="my-2 list-disc pl-5 marker:text-muted-foreground" {...p} />,
          ol: (p) => <ol className="my-2 list-decimal pl-5" {...p} />,
          li: (p) => <li className="my-0.5" {...p} />,
          blockquote: (p) => <blockquote className="my-3 border-l-2 border-primary/40 bg-accent/50 px-4 py-1.5 text-muted-foreground" {...p} />,
          a: ({ href = '', children }) => /^[a-z]+:/i.test(href) || !href.endsWith('.md')
            ? <a className="text-primary underline underline-offset-2" href={href} target="_blank" rel="noreferrer">{children}</a>
            : <Link className="text-primary underline underline-offset-2" to={`/kb?path=${encodeURIComponent(resolveKb(href, basePath))}`}>{children}</Link>,
          code: (p) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12.5px]" {...p} />,
          table: (p) => <div className="my-3 overflow-x-auto rounded-lg border"><table className="w-full text-[13px]" {...p} /></div>,
          th: (p) => <th className="border-b bg-muted px-3 py-2 text-left font-medium text-muted-foreground" {...p} />,
          td: (p) => <td className="border-b px-3 py-2 align-top" {...p} />,
          hr: () => <hr className="my-5" />,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  )
}

const TONE: Record<string, string> = {
  已确认: 'border-ok/30 bg-ok-soft text-ok',
  待确认: 'border-warn/30 bg-warn-soft text-warn',
  已过期: 'bg-muted text-muted-foreground',
  私密: 'border-danger/30 bg-danger-soft text-danger',
  可公开: 'border-info/30 bg-info-soft text-info',
}

/** 文件开头那几行换成一小排标签：已确认 / 待确认 / 已过期、私密 / 可公开、来源（能打开的来源点了就去那份）。其余的键不显示 */
function MetaRow({ labels }: { labels: MetaLabel[] }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px] leading-5">
      {labels.map((l) => l.kind === 'source' ? (
        <span key="source" className="min-w-0 text-muted-foreground">
          来源：{l.paths.map((p, i) => {
            const name = (p.split('/').pop() ?? p).replace(/\.md$/, '')
            return (
              <span key={p}>
                {i > 0 && '、'}
                {p.endsWith('.md') && !p.startsWith('..') && !/^[a-z]+:/i.test(p)
                  ? <Link className="underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground" title={p} to={`/kb?path=${encodeURIComponent(p)}`}>{name}</Link>
                  : <span title={p}>{name}</span>}
              </span>
            )
          })}
        </span>
      ) : (
        <span key={l.kind} className={cn('inline-flex h-5 items-center rounded-md border border-transparent px-1.5 font-medium', TONE[l.text])}>{l.text}</span>
      ))}
    </div>
  )
}
