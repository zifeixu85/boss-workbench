// 关怀草稿是谁写的：分 5 类，网页按类型给图标和颜色（不再从文字里猜，“没用 AI”里也有“AI”两个字）。归属：大客户模块。
// author 字段统一写成“类型 · 细节 · 细节”：
//   Codex 定时任务 · 10/27 07:12 写
//   Codex 现场写 · 10/27 10:15（gpt-6.1-sol）      括号里的模型名网页只放在悬停提示里
//   知识库草稿 · Codex 10/25 整理知识库时起草 · 老板还没改
//   模板 · 工作台按口味和日子套的，没用 AI
//   老板自己写的：写设置里的称呼，如“张总”“张总（在工作台模板上改的）”
// 老板改过 AI 写的草稿，后面加“ · 张总改过”，类型不变。

/** 本人 = 老板自己写的（显示时用设置里的称呼） */
export type AuthorKind = '定时任务' | '现场写' | '知识库' | '模板' | '本人'

export function authorKind(author: string | null | undefined): AuthorKind {
  const a = author ?? ''
  if (a.startsWith('模板')) return '模板'
  if (a.startsWith('Codex 定时任务')) return '定时任务'
  if (a.startsWith('Codex 现场写')) return '现场写'
  if (a.startsWith('知识库')) return '知识库'
  return '本人'
}

export const TEMPLATE_AUTHOR = '模板 · 工作台按口味和日子套的，没用 AI'
