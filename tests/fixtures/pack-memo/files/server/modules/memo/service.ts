// 测试用的假模块：备忘。全部虚构。
import { all, get } from '../../db.ts'
import { moduleSetting } from '../../services/identity.ts'

export const title = () => moduleSetting('memo_title') || '备忘'
export const items = () => all<{ id: string; text: string }>('SELECT id, text FROM memo_items ORDER BY id')
export const count = () => get<{ n: number }>('SELECT COUNT(*) AS n FROM memo_items')?.n ?? 0
