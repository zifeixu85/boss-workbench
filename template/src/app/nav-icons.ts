// 模块运行时给的菜单项（nav.ts 的 DynamicNav）用的图标：只登记常用的一小批，写了不认识的名字就用文件夹图标。
// 固定菜单项的图标不走这里：核心的直接写在 nav.ts，模块包的由 scripts/module.mjs 生成进 modules.nav.gen.ts。
import {
  BookOpen, Box, Briefcase, Building2, FileText, Folder, FolderKanban, GraduationCap, Handshake, Image, Megaphone, Package,
  PenLine, Store, Tag, Target, User, Users, type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  BookOpen, Box, Briefcase, Building2, FileText, Folder, FolderKanban, GraduationCap, Handshake, Image, Megaphone, Package,
  PenLine, Store, Tag, Target, User, Users,
}

export const navIcon = (name?: string): LucideIcon => (name && ICONS[name]) || Folder
