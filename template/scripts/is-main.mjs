// 比较实际文件路径，兼容中文、空格和通过符号链接启动。
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
export function isMain(url, entry = process.argv[1]) {
  if (!entry) return false
  try { return realpathSync(fileURLToPath(url)) === realpathSync(resolve(entry)) } catch { return false }
}
