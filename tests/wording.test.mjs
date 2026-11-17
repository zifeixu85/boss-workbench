// 全仓说法（2026-11-17 A梦 定）：界面、文档、工具说明里不再出现“记一笔”，按钮叫“写一条跟进”。
// 只扫进了版本库的文本文件；插件技能的测试里拿“记一笔”当反例，那一处除外。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ALLOW = new Set(['template/scripts/codex-plugin.test.mjs', 'tests/wording.test.mjs'])
const TEXT = /\.(md|mjs|js|ts|tsx|json|sql|css|html|txt)$/

test('仓库里不再写“记一笔”（界面按钮是“写一条跟进”）', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter((f) => f && TEXT.test(f) && !ALLOW.has(f))
  const hits = files.filter((f) => { try { return readFileSync(join(ROOT, f), 'utf8').includes('记一笔') } catch { return false } })
  assert.deepEqual(hits, [])
})
