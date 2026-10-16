import { createContext, useContext } from 'react'

export type NavMode = 'simple' | 'complex' | 'dual' | 'top'
/** 头像菜单里切换导航样式用的名字（设置页的大卡片见 features/settings/NavStylePicker.tsx） */
export const NAV_MODES = [['simple', '简单：一列，按分区分段'], ['complex', '复杂：侧栏三级（分区 › 分组 › 页面）'], ['dual', '双层：顶部分区 + 左栏'], ['top', '顶部：分区下拉']] as const satisfies readonly (readonly [NavMode, string])[]
export const NavModeContext = createContext<NavMode>('complex')
export const useNavMode = () => useContext(NavModeContext)
