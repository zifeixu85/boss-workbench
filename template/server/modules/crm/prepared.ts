// 预先跑好的提取结果（备用）：演示时 Codex 用不了、超时时，换成开发时在同一份材料上真跑过的那一次。归属：大客户模块。
// 文件在 prepared/ 下，一份材料一个 JSON：{ source_path, ran_at（不写）, ran_at_label（“事先”）, model, seconds, result }。
// 网页和命令行都写明“事先用 Codex 跑过一次的结果，不是现场生成”（第三轮：不写日子——材料是 10/26 晚才丢进来的，写 10/10 对不上）；
// 不拿它冒充现场结果，也不会自动替换。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'prepared')

export type Prepared = { source_path: string; ran_at: string | null; ran_at_label: string; model: string | null; seconds: number; result: unknown }

function load(): Prepared[] {
  if (!existsSync(DIR)) return []
  return readdirSync(DIR).filter((f) => f.endsWith('.json')).flatMap((f) => {
    try { return [JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Prepared] } catch { return [] }
  })
}

export function preparedFor(sourcePath: string): Prepared | null {
  return load().find((p) => p.source_path === sourcePath) ?? null
}
