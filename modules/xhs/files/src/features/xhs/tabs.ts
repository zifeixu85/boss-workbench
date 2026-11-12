// 小红书各子页面的页内标签（简单导航下显示；复杂 / 顶部导航里子页面已经在菜单里）
import { NAV } from '@/app/nav'

export const CONTENT_TABS = NAV.find((n) => n.key === 'content')!.children!
