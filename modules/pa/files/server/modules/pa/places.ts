// 知识库里几样东西放在哪（约定第 9.2 节“位置”）：档案里登记的优先，没登记的用默认。
// 档案按顺序找：根目录 知识库档案.md；老板知识库工具建的 01-AI协作/建库档案.md。认法和检测（模板 scripts/kb-check.mjs）是同一份。
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../../db.ts'
import { canReadKbPath, readKbTextFile } from '../../services/kb.ts'
import { readPositions } from '../../../scripts/kb-check.mjs'

export const PROFILE_FILE = '知识库档案.md'
export const OLD_PROFILE = '01-AI协作/建库档案.md'
const readable = (rel: string) => { const abs = join(ROOT, rel); return existsSync(abs) && canReadKbPath(abs) }

/** 找到的档案：路径和全文；都没有是 null */
export function profileFile(): { path: string; text: string } | null {
  for (const path of [PROFILE_FILE, OLD_PROFILE]) if (readable(path)) return { path, text: readKbTextFile(join(ROOT, path)) }
  return null
}

/** 七个位置：关于我、你是谁这一页、助理、报告、原件、收件箱、往来记录（写不进原文件时放这） */
export function places(): Record<string, string> {
  try { return readPositions(profileFile()?.text ?? '') } catch { return readPositions('') }
}
