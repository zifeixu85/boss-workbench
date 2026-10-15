// 今日页顶上的重点卡（最多 3 张）：按老板在确认页选的“最想先看到”排，存在设置 home（逗号隔开的卡片 id）。
// 服务端算 overview、网页排卡片、命令行 settings-set --home 共用这一份。
// 卡片归哪个模块：模块没开的卡片不出现。没设过 = 开着的业务模块在前（经营、客户、小红书），再补项目、收件箱。

export const HOME_CARDS = [
  { id: 'sales', name: '各平台昨天卖得怎样', module: 'biz' },
  { id: 'clients', name: '今天该跟进的客户', module: 'clients' },
  { id: 'xhs', name: '小红书今天发什么', module: 'content' },
  { id: 'projects', name: '项目推进到哪', module: 'projects' },
  { id: 'inbox', name: '收件箱等你看的', module: 'inbox' },
] as const
export type HomeCard = (typeof HOME_CARDS)[number]['id']
export const HOME_IDS = HOME_CARDS.map((c) => c.id) as HomeCard[]
const MAX = 3

/** 存的值 + 打开着的模块 → 这次要放的重点卡（顺序就是老板定的顺序） */
export function homeFocus(stored: string | null | undefined, on: string[]): HomeCard[] {
  const usable = (id: HomeCard) => on.includes(HOME_CARDS.find((c) => c.id === id)!.module)
  const asked = (stored ?? '').split(/[\s,，、]+/).map((s) => s.trim()).filter((s): s is HomeCard => (HOME_IDS as string[]).includes(s))
  const picked = [...new Set(asked)].filter(usable)
  if (picked.length) return picked.slice(0, MAX)
  const biz = (['sales', 'clients', 'xhs'] as HomeCard[]).filter(usable)
  const fill = (['projects', 'inbox'] as HomeCard[]).filter(usable)
  return [...biz, ...fill].slice(0, Math.max(biz.length, 2)).slice(0, MAX)
}

/** settings-set --home 的检查：写错的 id 列出来，不悄悄忽略 */
export function checkHome(input: string) {
  const ids = input.split(/[\s,，、]+/).map((s) => s.trim()).filter(Boolean)
  const unknown = ids.filter((id) => !(HOME_IDS as string[]).includes(id))
  return { ids: ids.filter((id) => (HOME_IDS as string[]).includes(id)), unknown }
}
