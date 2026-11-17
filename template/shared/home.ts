// 今日页顶上的重点卡（最多 3 张）：按老板在确认页选的“最想先看到”排，存在设置 home（逗号隔开的卡片 id）。
// 服务端算 overview、网页排卡片、命令行 settings-set --home 共用这一份。
// 卡片归哪个模块：模块没开的卡片不出现。没设过 = 开着的业务模块在前（经营、客户、装进来的模块登记的），再补项目、收件箱。
// 装进来的模块在 module.json 的 home 里登记自己的卡（scripts/module.mjs 写进 shared/modules.gen.ts 的 INSTALLED_HOME），核心不写模块的名字。
import { INSTALLED_HOME } from './modules.gen.ts'

export type HomeCardDef = { id: string; name: string; module: string }
/** 核心的卡：前两张是业务卡，后两张是基础版的（没设过时用来补位） */
const CORE_CARDS: HomeCardDef[] = [
  { id: 'sales', name: '各平台昨天卖得怎样', module: 'biz' },
  { id: 'clients', name: '今天该跟进的客户', module: 'clients' },
  { id: 'projects', name: '项目推进到哪', module: 'projects' },
  { id: 'inbox', name: '收件箱等你看的', module: 'inbox' },
]
const FILL = ['projects', 'inbox']
const withInstalled = (extra: HomeCardDef[]) => [...CORE_CARDS.filter((c) => !FILL.includes(c.id)), ...extra.filter((x) => !CORE_CARDS.some((c) => c.id === x.id)), ...CORE_CARDS.filter((c) => FILL.includes(c.id))]

export let HOME_CARDS: HomeCardDef[] = withInstalled(INSTALLED_HOME)
export let HOME_IDS: string[] = HOME_CARDS.map((c) => c.id)
export type HomeCard = string
/** 服务端开着时又装了模块（server/modules-live.ts）：换成新的一份。网页这边按构建时的清单 */
export function setInstalledHome(extra: HomeCardDef[]) {
  HOME_CARDS = withInstalled(extra)
  HOME_IDS = HOME_CARDS.map((c) => c.id)
}
const MAX = 3
const split = (s: string) => s.split(/[\s,，、]+/).map((x) => x.trim()).filter(Boolean)

/** 存的值 + 打开着的模块 → 这次要放的重点卡（顺序就是老板定的顺序） */
export function homeFocus(stored: string | null | undefined, on: string[]): HomeCard[] {
  const usable = (id: string) => on.includes(HOME_CARDS.find((c) => c.id === id)!.module)
  const picked = [...new Set(split(stored ?? '').filter((s) => HOME_IDS.includes(s)))].filter(usable)
  if (picked.length) return picked.slice(0, MAX)
  const biz = HOME_IDS.filter((id) => !FILL.includes(id)).filter(usable)
  const fill = FILL.filter(usable)
  return [...biz, ...fill].slice(0, Math.max(biz.length, 2)).slice(0, MAX)
}

/** settings-set --home 的检查：写错的 id 列出来，不悄悄忽略 */
export function checkHome(input: string) {
  const ids = split(input)
  return { ids: ids.filter((id) => HOME_IDS.includes(id)), unknown: ids.filter((id) => !HOME_IDS.includes(id)) }
}
