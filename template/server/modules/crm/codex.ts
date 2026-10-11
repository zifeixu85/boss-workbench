// 调本机的 Codex（codex exec）：只读、工作目录是知识库根目录、不读用户配置、要它按 JSON 格式回答。归属：大客户模块。
// 找 Codex 的顺序：环境变量 CODEX_BIN → Codex App 自带的程序 → PATH 里的 codex。都没有就如实说“不可用”。
// 超时就停掉进程，如实说“超时”；不拿预置内容冒充 AI 结果。
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

const APP_BIN = '/Applications/Codex.app/Contents/Resources/codex-cli/bin/codex'

export function findCodex(): string | null {
  const env = process.env.CODEX_BIN?.trim()
  if (env) return existsSync(env) ? env : null
  if (existsSync(APP_BIN)) return APP_BIN
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const name of process.platform === 'win32' ? ['codex.cmd', 'codex.exe'] : ['codex']) {
      const p = join(dir, name)
      if (dir && existsSync(p)) return p
    }
  }
  return null
}

export type CodexResult =
  | { status: '完成'; json: unknown; model: string | null; ms: number }
  | { status: '超时' | '出错' | '不可用'; error: string; model: string | null; ms: number }

/** 默认最多等 90 秒（关怀草稿）；提取另设 150 秒（extract.ts 的 EXTRACT_TIMEOUT_MS） */
export const CODEX_TIMEOUT_MS = Number(process.env.CRM_CARE_TIMEOUT_MS || 90_000)

/** Codex 的运行日志（stderr）按段落认出它在做什么：开头的 model: 一行、user（读提示）、thinking、exec（读文件的命令）、codex（开始回答）。
 *  只报真发生的事，不按时间编进度（第四轮修数据评审 #12：台上等 40—50 秒时让演示的人看得到它到了哪一步） */
function progressWatcher(cwd: string, onProgress: (text: string) => void) {
  let section = ''
  let buf = ''
  const seen = new Set<string>()
  const say = (text: string) => { if (!seen.has(text)) { seen.add(text); onProgress(text) } }
  const line = (raw: string) => {
    const l = raw.trim()
    const model = l.match(/^model:\s*(\S+)/)
    if (model && !section) { say(`Codex 启动了（${model[1]}），只能看、不能改文件`); return }
    if (/^(user|thinking|exec|codex|tokens used)$/.test(l)) {
      section = l
      if (l === 'user') say('在读材料和判断规则')
      if (l === 'thinking') say('在对照判断规则和礼盒价格')
      if (l === 'codex') say('想好了，正在按格式写结果')
      return
    }
    if (section === 'exec') {
      const files = [...l.matchAll(/([^\s'"|;&<>]+\.md)/g)].map((m) => m[1].replace(cwd, '').replace(/^\.?\//, '').split('/').pop()!.replace(/\.md$/, ''))
      if (files.length) say(`在翻知识库：${[...new Set(files)].slice(0, 3).join('、')}`)
    }
  }
  return (chunk: string) => {
    buf += chunk
    let at: number
    while ((at = buf.indexOf('\n')) >= 0) { line(buf.slice(0, at)); buf = buf.slice(at + 1) }
  }
}

/** 跑一次 codex exec。prompt 从标准输入给，schema 让它只回 JSON；onProgress 报它做到哪一步了（可选） */
export function runCodex(opts: { prompt: string; schema: object; cwd: string; timeoutMs?: number; onProgress?: (text: string) => void }): Promise<CodexResult> {
  const bin = findCodex()
  const t0 = Date.now()
  if (!bin) return Promise.resolve({ status: '不可用', error: '这台电脑上没找到 Codex（Codex App 或 codex 命令）。装好 Codex App 后再试。', model: null, ms: 0 })
  const dir = mkdtempSync(join(tmpdir(), 'crm-codex-'))
  const schemaFile = join(dir, 'schema.json')
  const outFile = join(dir, 'out.json')
  writeFileSync(schemaFile, JSON.stringify(opts.schema))
  const args = ['exec', '--ignore-user-config', '-s', 'read-only', '--skip-git-repo-check', '--ephemeral', '--color', 'never',
    '-C', opts.cwd, '-c', `model_reasoning_effort="${process.env.CRM_CODEX_EFFORT || 'low'}"`, '--output-schema', schemaFile, '-o', outFile]
  if (process.env.CRM_CODEX_MODEL) args.push('-m', process.env.CRM_CODEX_MODEL)
  args.push('-')
  return new Promise((resolve) => {
    let log = ''
    let done = false
    let timer: NodeJS.Timeout | undefined
    const finish = (r: CodexResult) => { if (done) return; done = true; if (timer) clearTimeout(timer); rmSync(dir, { recursive: true, force: true }); resolve(r) }
    const model = () => log.match(/^model:\s*(\S+)/m)?.[1] ?? null
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(bin, args, { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } })
    } catch (err) {
      return finish({ status: '不可用', error: `Codex 启动不了：${(err as Error).message}`, model: null, ms: Date.now() - t0 })
    }
    const timeoutMs = opts.timeoutMs ?? CODEX_TIMEOUT_MS
    timer = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 3000)
      finish({ status: '超时', error: `Codex ${Math.round(timeoutMs / 1000)} 秒内没做完，已经停掉。可以再试一次，或者只粘贴关键的几段。`, model: model(), ms: Date.now() - t0 })
    }, timeoutMs)
    const watch = opts.onProgress ? progressWatcher(opts.cwd, opts.onProgress) : null
    child.stdout?.on('data', (d) => { log += String(d) })
    child.stderr?.on('data', (d) => { log += String(d); watch?.(String(d)) })
    child.on('error', (err) => finish({ status: '不可用', error: `Codex 启动不了：${err.message}`, model: null, ms: Date.now() - t0 }))
    child.on('close', (code) => {
      const ms = Date.now() - t0
      if (!existsSync(outFile)) {
        const tail = log.trim().split('\n').slice(-3).join(' ').slice(0, 300)
        return finish({ status: '出错', error: `Codex 没给出结果（退出码 ${code}）${tail ? `：${tail}` : ''}`, model: model(), ms })
      }
      const text = readFileSync(outFile, 'utf8').trim()
      try {
        const json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''))
        finish({ status: '完成', json, model: model(), ms })
      } catch {
        finish({ status: '出错', error: `Codex 回的不是 JSON：${text.slice(0, 200)}`, model: model(), ms })
      }
    })
    child.stdin?.end(opts.prompt)
  })
}
