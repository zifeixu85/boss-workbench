// 设置页的几块内容：基本信息表单、数据在哪里、快捷键
import { useState } from 'react'
import { Archive, BookOpen, Camera, Database, Terminal, type LucideIcon } from 'lucide-react'
import type { Settings } from '@/lib/types'
import { api, useWrite } from '@/lib/api'
import { FormField, issuesToErrors } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Kbd, KbdGroup } from '@/components/ui/kbd'

const LIMITS = { owner: 20, business: 40, xhs: 30 } as const

export function BasicInfoForm({ settings }: { settings: Settings }) {
  const [owner, setOwner] = useState(settings.owner)
  const [business, setBusiness] = useState(settings.business)
  const [xhs, setXhs] = useState(settings.xhs_name ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useWrite((b: Pick<Settings, 'owner' | 'business' | 'xhs_name'>) => api.patch<Settings>('/settings', b), '基本信息已保存')
  const dirty = owner.trim() !== settings.owner || business.trim() !== settings.business || xhs.trim() !== (settings.xhs_name ?? '')

  const submit = () => {
    const o = owner.trim()
    const b = business.trim()
    const next: Record<string, string> = {}
    if (!o) next.owner = '写个称呼，比如“张总”'
    if (!b) next.business = '写店名，或者给工作台起个名字'
    setErrors(next)
    if (Object.keys(next).length) return
    save.mutate({ owner: o, business: b, xhs_name: xhs.trim() }, { onError: (e) => setErrors(issuesToErrors(e)) })
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <FormField label="称呼" error={errors.owner} hint="页面上怎么称呼你">
        <Input aria-label="称呼" value={owner} maxLength={LIMITS.owner} aria-invalid={!!errors.owner} onChange={(e) => { setOwner(e.target.value); setErrors((x) => ({ ...x, owner: '' })) }} placeholder="张总" />
      </FormField>
      <FormField label="店名 / 工作台名称" error={errors.business} hint="显示在左上角；给 Codex 的提示词里当店名用">
        <Input aria-label="店名 / 工作台名称" value={business} maxLength={LIMITS.business} aria-invalid={!!errors.business} onChange={(e) => { setBusiness(e.target.value); setErrors((x) => ({ ...x, business: '' })) }} placeholder="张记花店" />
      </FormField>
      {(!settings.modules || settings.modules.includes('content')) && <FormField label="小红书账号名" error={errors.xhs_name} hint={`小红书手机预览、选题和写稿时用；空着就用店名（现在是“${settings.xhs}”）`}>
        <Input aria-label="小红书账号名" value={xhs} maxLength={LIMITS.xhs} aria-invalid={!!errors.xhs_name} onChange={(e) => { setXhs(e.target.value); setErrors((x) => ({ ...x, xhs_name: '' })) }} placeholder={settings.business} />
      </FormField>}
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={!dirty || save.isPending}>{save.isPending ? '保存中…' : '保存'}</Button>
      </div>
    </form>
  )
}

const PLACES: { icon: LucideIcon; title: string; path: string; desc: string }[] = [
  { icon: Database, title: '业务记录', path: '工作台/数据/workbench.db', desc: '客户、跟进、待办、日程、回款这些天天在变的记录，存在一个 SQLite 数据库文件里。' },
  { icon: BookOpen, title: '知识', path: 'AGENTS.md 和各个文件夹', desc: '长期有用的内容，都是 Markdown 文件，用 Obsidian 或任何文本编辑器都能打开。AGENTS.md 是这张地图，AI 每次先读它。' },
  { icon: Archive, title: '备份', path: '工作台/数据/备份/', desc: '数据库旁边：改功能前的数据库备份（命令 backup），工作台改知识库文件前存的原文件（知识库/）。程序和数据库放在知识库外时，备份也在外面。' },
  { icon: Camera, title: '快照', path: '工作台/快照/', desc: '工作台自动导出的现状（今日概况、客户现状），给 Codex 和别的对话读。不要在这里改。' },
  { icon: Terminal, title: 'Codex 怎么写入', path: 'node 工作台/程序/server/cli.ts …', desc: '和网页走同一套规则，不直接改数据库。每次改动都记在“最近改动”里，操作人写 Codex。' },
]

export function DataLocations() {
  return (
    <div>
      <ul className="grid gap-4">
        {PLACES.map((p) => (
          <li key={p.title} className="flex gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"><p.icon className="size-4" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{p.title}</div>
              <code className="mt-1 inline-block max-w-full rounded-md bg-muted px-2 py-0.5 font-mono text-[12px] break-all">{p.path}</code>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{p.desc}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">以上路径都从知识库根目录算起。</p>
    </div>
  )
}

const KEYS: { keys: string[]; label: string }[] = [
  { keys: ['⌘', 'K'], label: '搜索' },
  { keys: ['T'], label: '新建待办' },
  { keys: ['E'], label: '新建日程' },
  { keys: ['L'], label: '记一笔跟进' },
  { keys: ['C'], label: '新建客户' },
  { keys: ['N'], label: '随手记' },
]

export function Shortcuts() {
  return (
    <div>
      <ul className="divide-y">
        {KEYS.map((k) => (
          <li key={k.label} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0">
            <span>{k.label}</span>
            <KbdGroup>{k.keys.map((x) => <Kbd key={x} className="min-w-6">{x}</Kbd>)}</KbdGroup>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">Windows 电脑上把 ⌘ 换成 Ctrl。光标在输入框里时，单个字母的快捷键不生效。</p>
    </div>
  )
}
