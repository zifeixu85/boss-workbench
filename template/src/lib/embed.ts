// 嵌入模式（Codex 右边面板里打开，地址带 ?embed=1）：组件据此换成适合窄面板的样子——
// 看板列放不下就折到下一行（不左右滑），列和表格不再自己限高（整页一起滚，不会在面板中间截断）。
import { createContext, useContext } from 'react'

export const EmbedContext = createContext(false)
export const useEmbedded = () => useContext(EmbedContext)
