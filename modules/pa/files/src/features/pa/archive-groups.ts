// 助理档案在页面上怎么分组（2026-11-27 A梦 定界面用语：“分组的按钮也太大白话了吧？这是在产品界面上。”）。
// 只改页面上的字，知识库里的文件名不动；页签显示界面用语，真实文件名在页签下面一行、“在 Codex 里改”“看知识库原文”里照用。
// 设定：身份、准则、记忆；能力：方法、行业知识、工具；协作：路由表、派单记录、起名规则（只有总助有）；资料：完整画像、岗位调研、其余认不出的（显示原文件名）。
// 组里没有文件的组不显示；默认打开“设定 › 身份”。

export type ArchiveFile = { name: string; path: string }
export type ArchiveItem<F extends ArchiveFile = ArchiveFile> = { label: string; file: F }
export type ArchiveGroup<F extends ArchiveFile = ArchiveFile> = { key: string; label: string; items: ArchiveItem<F>[] }

const GROUPS: { key: string; label: string; files: [string, string][] }[] = [
  // 11.11 以前的旧格式（角色、规矩、记忆，最早的身份、性格）也归设定，页签上标“旧格式”
  { key: '设定', label: '设定', files: [['IDENTITY', '身份'], ['SOUL', '准则'], ['MEMORY', '记忆'], ['角色', '角色（旧格式）'], ['规矩', '规矩（旧格式）'], ['记忆', '记忆（旧格式）'], ['身份', '身份（旧格式）'], ['性格', '性格（旧格式）']] },
  { key: '能力', label: '能力', files: [['看家本领', '方法'], ['行业门道', '行业知识'], ['会用的家伙', '工具']] },
  { key: '协作', label: '协作', files: [['路由表', '路由表'], ['派单记录', '派单记录'], ['起名规则', '起名规则']] },
  { key: '资料', label: '资料', files: [['画像', '完整画像'], ['岗位调研', '岗位调研']] },
]

/** 把助理文件夹里的文件分进四组；认不出的放进“资料”，显示原文件名 */
export function archiveGroups<F extends ArchiveFile>(files: F[]): ArchiveGroup<F>[] {
  const known = new Set(GROUPS.flatMap((g) => g.files.map(([n]) => n)))
  return GROUPS.map((g) => {
    const items = g.files.flatMap(([n, label]) => { const f = files.find((x) => x.name === n); return f ? [{ label, file: f }] : [] })
    if (g.key === '资料') items.push(...files.filter((f) => !known.has(f.name)).map((f) => ({ label: f.name, file: f })))
    return { key: g.key, label: g.label, items }
  }).filter((g) => g.items.length > 0)
}
