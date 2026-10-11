// 示例数据（ABC茶社，全部虚构）。按模块拆文件：crm 客户 → base 公共 → biz 经营 → content 小红书 → data 数据源。
//
// 用法（在 工作台/程序/ 下）：
//   node server/seed/index.ts --demo                  还没有数据库时：建表、写入全部示例数据
//   node server/seed/index.ts --demo --reset          删掉数据库，从零建表、写入全部示例数据（npm run seed 就是这条）
//   node server/seed/index.ts --only biz              只重建经营模块的数据（也可以 content、data、crm-follow，逗号分开写几个）
// crm 和 base 互相引用（待办、日程挂在客户上），只能用 --reset 一起重建。
// 安全：示例数据只在演示时用。不加 --demo 时，只有“本来就是示例库”（settings 里有 demo_today）才让重灌，
// 免得在老板自己的真数据库上误跑，把真数据换成 ABC茶社。
import { rmSync, existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { DB_PATH, open, run, tx, all } from '../db.ts'
import { applyStoredDemoToday } from '../clock.ts'
import { DEMO_TODAY, type SeedModule } from './lib.ts'
import { crm } from './crm.ts'
import { base } from './base.ts'
import { biz } from './biz.ts'
import { content } from './content.ts'
import { data } from './data.ts'
import { crmFollow } from './crm-follow.ts' // 大客户模块 E5：客户详情加深（八项信息、改阶段留痕、关怀来源）

const ORDER: SeedModule[] = [crm, base, biz, content, data, crmFollow]
const ALONE = new Set(['biz', 'content', 'data', 'crm-follow'])

const args = process.argv.slice(2)
const onlyArg = args.find((a) => a.startsWith('--only'))
const only = onlyArg ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean) : null

function seedModules(mods: SeedModule[]) {
  for (const m of mods) {
    const t0 = Date.now()
    tx(() => m.seed())
    const counts = m.tables.slice().reverse().map((t) => `${t} ${all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)[0].n}`)
    console.log(`  ${m.name.padEnd(8)}${Date.now() - t0} ms  ${counts.join(' · ')}`)
  }
}

const DEMO = args.includes('--demo')
/** 现有数据库是不是示例库（示例种子会写 settings.demo_today） */
function isDemoDb() {
  if (!existsSync(DB_PATH)) return false
  // 单独只读打开：不能用 open()，它会缓存连接，后面 --reset 删掉文件后还会拿着旧连接
  let d: DatabaseSync | null = null
  try {
    d = new DatabaseSync(DB_PATH, { readOnly: true })
    return !!(d.prepare("SELECT value FROM settings WHERE key = 'demo_today'").get() as { value?: string } | undefined)?.value
  } catch { return false } finally { d?.close() }
}
if (!DEMO && !isDemoDb()) {
  console.error(existsSync(DB_PATH)
    ? '没办成：这个数据库不是示例库，重灌示例数据会把现有数据换成 ABC茶社（全部虚构）。确实要演示，请加 --demo（整库换掉还要加 --reset）。'
    : '没办成：示例数据（ABC茶社，全部虚构）只在演示时用，要写入请加 --demo。建空数据库用 node scripts/install.mjs。')
  process.exit(1)
}

if (only) {
  const bad = only.filter((n) => !ALONE.has(n))
  if (bad.length || !only.length) {
    console.error(`--only 只能是 ${[...ALONE].join(' / ')}（crm 和 base 互相引用，请用 --reset 一起重建）`)
    process.exit(1)
  }
  if (!existsSync(DB_PATH)) { console.error('还没有数据库，先运行 node server/seed/index.ts --demo'); process.exit(1) }
  open()
  const mods = ORDER.filter((m) => only.includes(m.name))
  tx(() => { for (const m of mods) for (const t of m.tables) run(`DELETE FROM ${t}`) })
  console.log(`重建 ${only.join('、')} 的示例数据：`)
  seedModules(mods)
} else {
  if (!args.includes('--reset') && existsSync(DB_PATH)) {
    console.error('数据库已存在。要恢复示例数据请加 --demo --reset（会清空现有数据），或用 --only biz 只重建一个模块')
    process.exit(1)
  }
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) rmSync(f, { force: true })
  open()
  console.log(`写入 ABC茶社 示例数据（演示日期 ${DEMO_TODAY}）：`)
  seedModules(ORDER)
  applyStoredDemoToday(DEMO_TODAY)
  const { writeSnapshots } = await import('../snapshot.ts')
  console.log(`  快照    ${writeSnapshots().join('、')}`)
}
console.log(`完成：${DB_PATH}`)
