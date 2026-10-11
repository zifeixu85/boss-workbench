// Markdown 显示：知识库文档、周报正文、客户背景笔记都用它
import ReactMarkdown from 'react-markdown'
import { Link } from 'react-router'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

/** 去掉开头的 --- frontmatter，单独显示成键值 */
export function splitFrontmatter(md: string) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!m) return { meta: [] as [string, string][], body: md }
  const meta = m[1].split('\n').map((l) => l.split(/:\s?(.*)/s).slice(0, 2) as [string, string]).filter(([k]) => k.trim())
  return { meta, body: md.slice(m[0].length) }
}

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
  return (
    <div className={cn('text-[14.5px] leading-7', className)}>
      {meta.length > 0 && (
        <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-muted px-4 py-3 text-[13px]">
          {meta.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd>{v || '—'}</dd></div>)}
        </dl>
      )}
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
