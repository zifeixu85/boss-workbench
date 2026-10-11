// 经营模块的接口：/api/biz/…  归属：经营模块
// 页面用：GET /board（汇总页一次取齐）、GET /channel/:id（渠道页一次取齐）、GET /trace（数字的来源）、异常、日报、日报设置。
// 写入只有两处：PATCH /anomalies/:id（处理状态、谁跟、处理记录）、PATCH /config（日报设置）。日报由 Codex 用命令 biz-report-set 写回，网页只读。
// 其余 GET 是给今日页、命令行和其他模块读的骨架接口，返回形状不变。
import { Hono } from 'hono'
import * as biz from './service.ts'
import { board } from './board.ts'
import { channelPage } from './channel.ts'
import { trace } from './trace.ts'
import { freshness } from './freshness.ts'
import { anomalyDetail, listAnomalies, setAnomaly } from './anomaly.ts'
import { getReport, latestReport, listReports } from './reports.ts'
import { getConfig, saveConfig } from './config.ts'
import { realDate } from './period.ts'

const WEB = '网页' as const
const ok = <T>(data: T) => ({ ok: true as const, data })
type Q = { req: { query: (k: string) => string | undefined } }
const body = async (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => ({}))

/** 查询参数都先校验：日期只认 2026-10-26 这种写法，条数和天数限定范围，乱写的按默认值处理（不再 500） */
const date = (v?: string) => realDate(v) // 2026-13-45 这种不是真日期，按没写处理
const int = (v: string | undefined, def: number, min: number, max: number) => {
  const n = Number.parseInt(v ?? '', 10)
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def
}
/** 时间范围：7 / 14 / 30 天，默认 14 天（30 天里“比上一段”没有数，9/27 以前没导） */
const days = (c: Q) => { const n = int(c.req.query('days'), 14, 7, 30); return [7, 14, 30].includes(n) ? n : 14 }
const range = (c: Q) => ({ channel: c.req.query('channel') || undefined, from: date(c.req.query('from')), to: date(c.req.query('to')) })

export const bizRoutes = new Hono()

// 页面
bizRoutes.get('/board', (c) => c.json(ok(board(days(c)))))
bizRoutes.get('/channel/:id', (c) => c.json(ok(channelPage(c.req.param('id'), days(c)))))
bizRoutes.get('/trace', (c) => c.json(ok(trace({ metric: c.req.query('metric'), channel: c.req.query('channel') || undefined, from: date(c.req.query('from')), to: date(c.req.query('to')) }))))
bizRoutes.get('/freshness', (c) => c.json(ok(freshness())))

// 异常：/anomalies 保持原来的形状（今日页、命令行在用）；/anomalies/all 带处理状态和处理过的旧异常
bizRoutes.get('/anomalies', (c) => c.json(ok(biz.anomalies(date(c.req.query('date'))))))
bizRoutes.get('/anomalies/all', (c) => c.json(ok(listAnomalies(date(c.req.query('date'))))))
bizRoutes.get('/anomalies/:id', (c) => c.json(ok(anomalyDetail(c.req.param('id')))))
bizRoutes.patch('/anomalies/:id', async (c) => c.json(ok(setAnomaly(c.req.param('id'), await body(c), WEB))))

// 经营早报（AI 日报）和日报设置
bizRoutes.get('/reports', (c) => c.json(ok(listReports(int(c.req.query('limit'), 10, 1, 60)))))
bizRoutes.get('/reports/latest', (c) => c.json(ok(latestReport())))
bizRoutes.get('/reports/:id', (c) => c.json(ok(getReport(c.req.param('id')))))
bizRoutes.get('/config', (c) => c.json(ok(getConfig())))
bizRoutes.patch('/config', async (c) => c.json(ok(saveConfig(await body(c), WEB))))

// 骨架接口
bizRoutes.get('/channels', (c) => c.json(ok(biz.channels())))
bizRoutes.get('/skus', (c) => c.json(ok(biz.skus())))
bizRoutes.get('/summary', (c) => c.json(ok(biz.summary(date(c.req.query('date'))))))
bizRoutes.get('/daily', (c) => c.json(ok(biz.daily(range(c)))))
bizRoutes.get('/totals', (c) => c.json(ok(biz.totals(range(c)))))
bizRoutes.get('/traffic', (c) => c.json(ok(biz.traffic(range(c)))))
bizRoutes.get('/products', (c) => c.json(ok(biz.products({ ...range(c), limit: int(c.req.query('limit'), 5, 1, 50) }))))
bizRoutes.get('/refunds', (c) => c.json(ok(biz.refunds(range(c)))))
bizRoutes.get('/ads', (c) => c.json(ok(biz.ads(range(c)))))
bizRoutes.get('/ops', (c) => c.json(ok(biz.ops(range(c)))))
bizRoutes.get('/inventory', (c) => c.json(ok(biz.inventory())))
