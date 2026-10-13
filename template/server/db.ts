// 数据库：用 Node 自带的 node:sqlite，不需要编译原生模块。
// 位置：<知识库根>/工作台/数据/workbench.db（程序放库外时用 WORKBENCH_ROOT、WORKBENCH_DB 指定）。网页接口和 Codex 命令行共用这一份。
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { now, applyStoredDemoToday } from './clock.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
export const APP_DIR = resolve(HERE, '..')
export const ROOT = resolve(process.env.WORKBENCH_ROOT || join(APP_DIR, '..', '..'))
export const DATA_DIR = join(ROOT, '工作台', '数据')
export const DB_PATH = process.env.WORKBENCH_DB || join(DATA_DIR, 'workbench.db')
/** 备份都放数据库旁边的 备份/：数据库备份直接放这里，知识库文件改之前的原样放 备份/知识库/。
 *  程序和数据库放在知识库外面时（知识库在云盘里），备份也跟着在库外，不随知识库同步 */
export const BACKUP_DIR = join(dirname(DB_PATH), '备份')

type Params = Record<string, SQLInputValue>
export type Row = Record<string, unknown>

let db: DatabaseSync | null = null

export function open(): DatabaseSync {
  if (db) return db
  mkdirSync(dirname(DB_PATH), { recursive: true })
  db = new DatabaseSync(DB_PATH)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')
  migrate(db)
  // 演示日期：环境变量 DEMO_TODAY 没写时，用 settings 里的 demo_today（见 clock.ts）
  const demo = db.prepare("SELECT value FROM settings WHERE key = 'demo_today'").get() as { value: string } | undefined
  applyStoredDemoToday(demo?.value)
  return db
}

function migrate(d: DatabaseSync) {
  d.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, at TEXT NOT NULL)')
  const done = new Set((d.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name))
  const dir = join(APP_DIR, 'server', 'migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue
    d.exec('BEGIN')
    try {
      d.exec(readFileSync(join(dir, file), 'utf8'))
      d.prepare('INSERT INTO _migrations (name, at) VALUES (?, ?)').run(file, nowIso())
      d.exec('COMMIT')
    } catch (err) {
      d.exec('ROLLBACK')
      throw new Error(`数据库升级失败（${file}）：${(err as Error).message}`)
    }
  }
}

// node:sqlite 不接受多余的命名参数：只传 SQL 里出现的那些
function only(sql: string, p: Params): Params {
  const names = new Set([...sql.matchAll(/:([A-Za-z_]\w*)/g)].map((m) => m[1]))
  return Object.fromEntries(Object.entries(p).filter(([k]) => names.has(k)))
}
export const all = <T = Row>(sql: string, p: Params = {}) => open().prepare(sql).all(only(sql, p)) as T[]
export const get = <T = Row>(sql: string, p: Params = {}) => open().prepare(sql).get(only(sql, p)) as T | undefined
export const run = (sql: string, p: Params = {}) => open().prepare(sql).run(only(sql, p))

// 事务可以嵌套（2026-10-13）：外层 BEGIN，里层用 SAVEPOINT。一张清单一次写入（services/apply.ts）要把好几个本身就开事务的写入包在一起
let depth = 0
export function tx<T>(fn: () => T): T {
  const d = open()
  const sp = depth > 0 ? `sp_${depth}` : null
  d.exec(sp ? `SAVEPOINT ${sp}` : 'BEGIN IMMEDIATE')
  depth++
  try {
    const out = fn()
    depth--
    d.exec(sp ? `RELEASE ${sp}` : 'COMMIT')
    return out
  } catch (err) {
    depth--
    d.exec(sp ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK')
    throw err
  }
}

/** 备份数据库到 备份/workbench-<日期>T<时分秒>.db（VACUUM INTO 写一份完整副本，-wal 里的改动也在），返回备份文件位置 */
export function backupDatabase(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const file = join(BACKUP_DIR, `workbench-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.db`)
  mkdirSync(BACKUP_DIR, { recursive: true })
  if (existsSync(file)) throw new Error(`这一秒已经备份过了：${file}`)
  open().prepare('VACUUM INTO ?').run(file)
  return file
}

export const uid = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`
export const nowIso = () => now().toISOString()

export function localDate(d = now()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 每次写入都记一笔，网页“最近改动”和撤回都靠它 */
export function logChange(actor: string, entity: string, entityId: string, action: string, summary: string) {
  run('INSERT INTO changes (at, actor, entity, entity_id, action, summary) VALUES (:at, :actor, :entity, :id, :action, :summary)', {
    at: nowIso(), actor, entity, id: entityId, action, summary,
  })
}

/** 其他进程（例如 Codex 命令行）提交后，data_version 会变；本地服务据此推送刷新 */
export function dataVersion(): number {
  const r = get<{ data_version: number }>('PRAGMA data_version')
  return r?.data_version ?? 0
}

export function dbExists() {
  return existsSync(DB_PATH)
}

/** 把 undefined 去掉、布尔转 0/1，便于直接当 SQL 参数 */
export function params(obj: Record<string, unknown>): Params {
  const out: Params = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue
    out[k] = typeof v === 'boolean' ? (v ? 1 : 0) : Array.isArray(v) ? JSON.stringify(v) : (v as SQLInputValue)
  }
  return out
}
