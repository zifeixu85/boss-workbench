// 工作台现在有什么（2026-11-12，Codex 插件的两个入口工具用）：有哪些页面、能打开哪些对象、Codex 能读什么、能写什么。
// 不写死：页面来自菜单（src/app/nav.ts，装进来的模块的菜单项也在里面），模块的命令和能打开的对象来自模块的 module.json
// （scripts/module.mjs 生成的 server/modules.gen.ts）。所以装了新模块、加了新页面，这里自动带上，不用改插件。
// 这个文件只算，不读数据库、不起服务：读设置、核对对象在 ./cli.ts，拉起工作台在 ./launch.ts。
import type { ModuleOpen, ServerModule } from '../module-types.ts'

/** 核心命令：命令名 → [归哪个模块开关, 一句话说它做什么]。模块收起来时，capabilities 里不列它的命令 */
type CommandTable = Record<string, readonly [module: string, what: string]>

export const CORE_READ = {
  today: ['today', '今日概况：最该做的事、今天的日程和待办、该跟进的客户、有风险的项目'],
  todos: ['tasks', '没做完的待办（带待办 id）'],
  events: ['tasks', '日程（默认今天起 7 天；--from / --to 改范围）'],
  projects: ['projects', '项目列表：阶段、下一步、风险（带项目 id）'],
  clients: ['clients', '客户列表：阶段、下次跟进（带客户 id）'],
  client: ['clients', '某个客户的全部信息：args 写客户名或联系人名'],
  receivables: ['clients', '没收清的应收款'],
  modules: ['settings', '每个模块开没开'],
  materials: ['clients', '知识库收件箱里的新材料：是谁的、提取过没有'],
  care: ['clients', '接下来该关心谁：生日、节气、太久没联系'],
  biz: ['biz', '某天各渠道的成绩单和异常（默认昨天）'],
  sources: ['data', '数据源状态：哪个没导进来、哪个超时'],
  'biz-report': ['biz', '经营早报（默认最新一份）'],
  'biz-anomalies': ['biz', '现在的经营异常和处理状态'],
  reminders: ['reminders', '提醒：现在有哪些、读没读'],
  jobs: ['settings', '定时任务：几点跑、今天跑了没'],
  'calendar-status': ['tasks', '日历来源：接的是哪种、最后同步时间'],
} as const satisfies CommandTable

export const CORE_WRITE = {
  'todo-add': ['tasks', '加一条待办（谁做、哪天前）'],
  'todo-set': ['tasks', '改待办：状态、截止、谁做'],
  'event-add': ['tasks', '加一条日程'],
  'project-add': ['projects', '新建项目'],
  'project-set': ['projects', '更新项目：阶段、下一步、在等谁、截止'],
  'milestone-add': ['projects', '给项目加一个里程碑（关键日期）'],
  inbox: ['inbox', '往收件箱放一条（带上判断和建议去向）'],
  'inbox-done': ['inbox', '收件箱某条处理完了'],
  log: ['clients', '给客户加一条往来记录'],
  'client-add': ['clients', '新建客户'],
  'client-set': ['clients', '改客户的下次跟进、备注'],
  follow: ['clients', '改下次跟进（自动建或改跟进待办）'],
  stage: ['clients', '改客户阶段（要写原因；先问老板）'],
  'promise-add': ['clients', '记一件答应客户的事（先问老板）'],
  'promise-done': ['clients', '答应的事标成已兑现'],
  'care-add': ['clients', '存一条关怀草稿'],
  'care-set': ['clients', '改关怀草稿、标已送出'],
} as const satisfies CommandTable

type ModuleCommands = Pick<ServerModule, 'id' | 'read' | 'write'>
export const CORE_READ_COMMANDS = Object.keys(CORE_READ)
export const CORE_WRITE_COMMANDS = Object.keys(CORE_WRITE)

/** 命令归哪个模块开关：核心命令看上面两张表，模块登记的命令归那个模块；不认识的返回 undefined */
export function commandModule(command: string, mods: readonly ModuleCommands[]): string | undefined {
  const core = (CORE_READ as CommandTable)[command] ?? (CORE_WRITE as CommandTable)[command]
  return core ? core[0] : mods.find((m) => m.read?.includes(command) || m.write?.includes(command))?.id
}
/** 一张清单（apply）里的步骤归哪个模块开关：客户往来、答应的事、阶段、跟进都是“客户与跟进”的 */
export const APPLY_STEP_MODULE: Record<string, string> = { log: 'clients', promise: 'clients', stage: 'clients', follow: 'clients' }

/** 要先问老板、他点头才写的命令（报价、承诺、阶段这类） */
const ASK_FIRST = new Set(['stage', 'promise-add'])

/** 能读 / 能写的全部命令名：核心的 + 模块在 module.json 里登记的（和核心重名的不算，核心优先） */
export const readCommands = (mods: readonly ModuleCommands[]): string[] => [...CORE_READ_COMMANDS, ...mods.flatMap((m) => m.read ?? []).filter((c) => !(c in CORE_READ) && !(c in CORE_WRITE))]
export const writeCommands = (mods: readonly ModuleCommands[]): string[] => [...CORE_WRITE_COMMANDS, ...mods.flatMap((m) => m.write ?? []).filter((c) => !(c in CORE_READ) && !(c in CORE_WRITE))]

// ───────────────────────────── 页面和对象

/** 菜单项里这里用得到的几样（src/app/nav.ts 的 NavItem 去掉图标和角标） */
export type NavLike = { key: string; to: string; label: string; section: string; module?: string; children?: { to: string; label: string }[] }
export type PageCap = { key: string; title: string; trail: string; to: string; module?: string }
/** 能打开的一类对象：id 是编号（核心对象也认名字） */
export type ObjectCap = { kind: string; title: string; id: string; find?: string; to: string; module?: string }
export type CommandCap = { command: string; what: string; module?: string; ask_first?: true }

const slug = (to: string) => to.replace(/^\/+|\/+$/g, '').replace(/\//g, '-') || 'today'
const trailOf = (section: string, label: string) => (section === label ? label : `${section} › ${label}`)

/** 菜单 → 页面清单。没有子页面的模块就是它自己（key 用菜单的 key）；有子页面的每个子页面一条（第一页沿用模块的 key） */
export function pagesFromNav(nav: readonly NavLike[]): PageCap[] {
  const out: PageCap[] = []
  for (const n of nav) {
    const kids = n.children?.length ? n.children : [{ to: n.to, label: n.label }]
    for (const c of kids) {
      const key = c.to === n.to ? n.key : slug(c.to)
      if (out.some((p) => p.key === key || p.to === c.to)) continue
      out.push({ key, title: c.label, trail: trailOf(n.section, c.label), to: c.to, ...(n.module ? { module: n.module } : {}) })
    }
  }
  return out
}

/** 核心对象：地址栏参数打开详情抽屉（src/app/overlay.ts），所以地址是“所在页面 + ?参数=id” */
export const CORE_OBJECTS: readonly (ObjectCap & { param: string })[] = [
  { kind: 'project', title: '项目', id: '项目 id 或名称', find: 'workbench_read projects', to: '/projects', param: 'project', module: 'projects' },
  { kind: 'client', title: '客户', id: '客户 id、称呼或联系人名', find: 'workbench_read clients', to: '/clients', param: 'client', module: 'clients' },
  { kind: 'todo', title: '待办', id: '待办 id', find: 'workbench_read todos', to: '/todos', param: 'todo', module: 'tasks' },
  { kind: 'event', title: '日程', id: '日程 id', find: 'workbench_read events', to: '/calendar', param: 'event', module: 'tasks' },
  { kind: 'kb', title: '知识库里的一份文件', id: '相对知识库根目录的路径', find: 'kb_search', to: '/kb', param: 'path', module: 'kb' },
]

type ModuleLike = Pick<ServerModule, 'id' | 'name' | 'read' | 'write' | 'about' | 'open'>
export type CapabilityInput = {
  nav: readonly NavLike[]
  modules: readonly ModuleLike[]
  /** 打开着的模块 id；不传 = 全部算开着 */
  enabled?: readonly string[]
  /** 模块 id → 名字（列“收起来的模块”用） */
  moduleNames?: Record<string, string>
}
export type Capabilities = {
  usage: string
  pages: PageCap[]
  objects: Omit<ObjectCap, 'to'>[]
  read: CommandCap[]
  write: CommandCap[]
  apply: string
  /** 装着但收起来的模块：页面和命令都不列，老板要用先打开模块开关 */
  off: string[]
}

const USAGE = [
  '打开页面：workbench_open {page: 页面 key}；打开某个对象：workbench_open {target: {kind, id}}（id 先用 find 那一列的命令查）。地址只用 workbench_open 返回的，不要自己拼。',
  '读：workbench_read {command, args}；命令的参数写法看 workbench_help。',
  '写：老板说了进展、会议、聊天，先拆成清单用 workbench_apply 预演（yes=false），把预演结果给老板核对，他确认后原样再发一次 yes=true 并带上他的原话；老板明说的单条小事（加一条待办、改个状态）才用 workbench_write 直接写。',
].join('\n')
const APPLY = '一张清单一次写入，步骤种类：log（客户往来）、todo、todo-set、promise（答应的事）、stage（改阶段）、follow（下次跟进）、project（更新项目进展）、milestone、event、inbox-done。格式见 workbench_help 的 apply；先 yes=false 预演，老板确认后 yes=true。'

/** 模块登记的 open：带 {id} 的是对象，不带的是多出来的固定页面 */
const moduleObjects = (m: ModuleLike): ObjectCap[] => (m.open ?? []).filter((o) => o.to.includes('{id}'))
  .map((o: ModuleOpen) => ({ kind: o.key, title: `${m.name} · ${o.label}`, id: o.id ?? '编号', to: o.to, module: m.id }))
const modulePages = (m: ModuleLike): PageCap[] => (m.open ?? []).filter((o) => !o.to.includes('{id}'))
  .map((o: ModuleOpen) => ({ key: o.key, title: o.label, trail: `${m.name} › ${o.label}`, to: o.to, module: m.id }))

/** 全部页面和对象（不看模块开关；workbench_open 用它认页面，再自己判断模块开没开） */
export function allTargets(input: CapabilityInput): { pages: PageCap[]; objects: ObjectCap[] } {
  const pages = pagesFromNav(input.nav)
  for (const p of input.modules.flatMap(modulePages)) if (!pages.some((x) => x.key === p.key)) pages.push(p)
  // 核心对象跟着它的页面走：页面被模块接管、菜单里没有了（比如装了个人助理，项目、客户从“我关注的”进），对象也不列
  const objects: ObjectCap[] = CORE_OBJECTS.filter((o) => pages.some((p) => p.to === o.to)).map(({ param: _param, ...o }) => o)
  for (const o of input.modules.flatMap(moduleObjects)) if (!objects.some((x) => x.kind === o.kind)) objects.push(o)
  return { pages, objects }
}

export function buildCapabilities(input: CapabilityInput): Capabilities {
  const on = (id?: string) => !id || !input.enabled || input.enabled.includes(id)
  const { pages, objects } = allTargets(input)
  const core = (table: CommandTable): CommandCap[] => Object.entries(table).filter(([, [mod]]) => on(mod))
    .map(([command, [, what]]) => ({ command, what, ...(ASK_FIRST.has(command) ? { ask_first: true as const } : {}) }))
  const fromModules = (kind: 'read' | 'write'): CommandCap[] => input.modules.filter((m) => on(m.id)).flatMap((m) => (m[kind] ?? [])
    .filter((c) => !(c in CORE_READ) && !(c in CORE_WRITE)).map((command) => ({ command, what: m.about?.[command] ?? `${m.name}模块的命令（参数看 workbench_help）`, module: m.id })))
  const ids = new Set([...input.nav.map((n) => n.module), ...input.modules.map((m) => m.id)].filter((x): x is string => !!x))
  return {
    usage: USAGE,
    pages: pages.filter((p) => on(p.module)),
    objects: objects.filter((o) => on(o.module)).map(({ to: _to, ...o }) => o),
    read: [...core(CORE_READ), ...fromModules('read')],
    write: [...core(CORE_WRITE), ...fromModules('write')],
    apply: APPLY,
    off: [...ids].filter((id) => !on(id)).map((id) => `${input.moduleNames?.[id] ?? id}（${id}）`),
  }
}

// ───────────────────────────── 打开：换成地址

export class OpenError extends Error {}
export type OpenArgs = { page?: string; target?: { kind?: string; id?: string } }
/** 核对对象在不在：返回真正的 id 和显示用的名字；不在就抛错。不传 = 不核对（模块登记的对象没法核对） */
export type Lookup = (kind: string, id: string) => { id: string; title: string }
export type Opened = { kind: 'page' | string; key?: string; id?: string; title: string; trail: string; path: string; module?: string; verified: boolean }

/** 地址加上 embed=1（侧边栏模式：不显示导航），再带上别的参数：/projects?embed=1&project=p_1 */
export function embedPath(to: string, extra: Record<string, string> = {}): string {
  const [path, query = ''] = to.split('?')
  const sp = new URLSearchParams(query)
  const rest = [...sp.entries()].filter(([k]) => k !== 'embed')
  const out = new URLSearchParams([['embed', '1'], ...rest, ...Object.entries(extra)])
  return `${path || '/'}?${out.toString()}`
}

const norm = (s: string) => s.normalize('NFC').trim().toLowerCase()

/** 认页面：key、地址、名字、“分区 › 页面”都行；对上几个就列出来让老板选 */
export function findPage(pages: readonly PageCap[], want: string): PageCap {
  const q = norm(want)
  const path = q.startsWith('/') ? q.split('?')[0].replace(/\/+$/, '') || '/' : null
  const exact = pages.filter((p) => norm(p.key) === q || (path !== null && p.to === path) || norm(p.title) === q || norm(p.trail) === q)
  if (exact.length === 1) return exact[0]
  const loose = exact.length ? exact : pages.filter((p) => norm(p.trail).includes(q) || q.includes(norm(p.title)))
  if (loose.length === 1) return loose[0]
  if (loose.length > 1) throw new OpenError(`“${want}”对上了几个页面：${loose.map((p) => `${p.trail}（${p.key}）`).join('、')}。先问老板要哪一个，再用 key 打开`)
  throw new OpenError(`没有“${want}”这个页面。有哪些页面看 workbench_capabilities；要打开某个项目、客户、待办，用 target={kind,id}`)
}

/** 把“页面”或“对象”换成侧边栏地址（只有路径，不带主机和端口）。对象先核对存在，查不到就报错，不硬拼 */
export function resolveOpen(args: OpenArgs, input: CapabilityInput, lookup?: Lookup): Opened {
  const on = (id?: string) => !id || !input.enabled || input.enabled.includes(id)
  const { pages, objects } = allTargets(input)
  const closed = (module?: string) => new OpenError(`“${input.moduleNames?.[module ?? ''] ?? module}”这个模块现在收着，页面打不开。老板要用的话先打开模块开关：modules --on ${module}`)
  const kind = args.target?.kind?.trim()
  if (kind) {
    const id = String(args.target?.id ?? '').trim()
    const obj = objects.find((o) => o.kind === kind)
    if (!obj) throw new OpenError(`不认识“${kind}”这类对象。能打开的：${objects.filter((o) => on(o.module)).map((o) => `${o.kind}（${o.title}）`).join('、')}`)
    if (!id) throw new OpenError(`要写打开哪一个${obj.title}：target.id 写${obj.id}`)
    if (!on(obj.module)) throw closed(obj.module)
    const core = CORE_OBJECTS.find((o) => o.kind === kind)
    const page = pages.find((p) => p.to === obj.to.split('?')[0])
    if (core) {
      const hit = lookup ? lookup(kind, id) : { id, title: obj.title }
      return { kind, id: hit.id, title: hit.title, trail: page?.trail ?? obj.title, path: embedPath(core.to, { [core.param]: hit.id }), module: obj.module, verified: !!lookup }
    }
    return { kind, id, title: `${obj.title}：${id}`, trail: page?.trail ?? obj.title, path: embedPath(obj.to.replaceAll('{id}', encodeURIComponent(id))), module: obj.module, verified: false }
  }
  const want = args.page?.trim()
  if (!want) throw new OpenError('告诉我打开什么：page（页面 key、名字或地址）或 target（{kind, id}）。有哪些看 workbench_capabilities')
  const page = findPage(pages, want)
  if (!on(page.module)) throw closed(page.module)
  return { kind: 'page', key: page.key, title: page.title, trail: page.trail, path: embedPath(page.to), module: page.module, verified: true }
}
