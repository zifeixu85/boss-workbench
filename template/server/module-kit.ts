// 接口共用的小工具（核心和装进来的模块都用）：统一返回 { ok, data } 或 { ok:false, error }，出错说人话
import { Hono, type Context } from 'hono'
import { ZodError } from 'zod'

export const ok = <T>(data: T) => ({ ok: true as const, data })
export const body = async (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => ({}))

/** 出错时的回答：字段校验错误给第一条说明；4xx 原样说；5xx 记日志 */
export function errorResponse(err: Error, c: Context) {
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    return c.json({ ok: false, error: issues[0]?.message ?? '填写有误', issues }, 400)
  }
  const status = (err as { status?: number }).status ?? 500
  if (status >= 500) console.error(err)
  return c.json({ ok: false, error: status >= 500 ? `服务出错：${err.message}` : err.message }, status as 400)
}

/** 模块的接口：new 一个带统一出错处理的 Hono；路径写模块自己的（/、/today），核心挂到 /api/m/<模块编号>/ 下 */
export function moduleApp() {
  const app = new Hono()
  app.onError(errorResponse)
  return app
}
