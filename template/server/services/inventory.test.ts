import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const area = mkdtempSync(join(tmpdir(), 'inventory-'))
process.env.WORKBENCH_ROOT = area
process.env.WORKBENCH_DB = join(area, 'data.db')
const { run } = await import('../db.ts')
const { inventory } = await import('../modules/biz/service.ts')
after(() => rmSync(area, { recursive: true, force: true }))
run("INSERT INTO warehouses(id,name) VALUES ('w','测试仓')")
run("INSERT INTO channels(id,name,kind,warehouse_id) VALUES ('c','测试店','线上','w')")
run("INSERT INTO skus(id,name,category,price) VALUES ('s','测试商品','白茶',100)")
run("INSERT INTO inventory(sku_id,warehouse_id,stock,updated_at) VALUES ('s','w',20,'2026-10-15')")
const row = () => inventory('2026-10-15')[0]
const sales = (day: number, units: number) => run("INSERT INTO channel_products(date,channel_id,sku_id,units,gmv) VALUES (:d,'c','s',:n,0)", { d: `2026-10-${String(day).padStart(2, '0')}`, n: units })
test('没有销量、只有一天、缺另一个渠道都不是零；完整七天零才是零', () => {
  assert.equal(row().avg_daily, null)
  assert.equal(row().level, '资料不足')
  sales(9, 0)
  assert.equal(row().avg_daily, null)
  for (let day = 10; day <= 15; day++) sales(day, 0)
  assert.equal(row().avg_daily, 0)
  assert.equal(row().level, '近7天无销量')
  assert.equal(row().days_left, null)
  run('UPDATE channel_products SET units=10')
  assert.equal(row().avg_daily, 10)
  assert.equal(row().days_left, 2)
  assert.equal(row().level, '告急')
  run("INSERT INTO channels(id,name,kind,warehouse_id) VALUES ('c2','另一店','线上','w')")
  assert.equal(row().avg_daily, null)
  assert.equal(row().level, '资料不足')
  run("UPDATE skus SET status='待上线'")
  assert.equal(row().level, '待上线')
})
