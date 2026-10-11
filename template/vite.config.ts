import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

// 开发时（npm run dev）也把演示日期写进页面，和 node server/index.ts 一样（见 server/clock.ts、src/lib/clock.ts）。
// 优先用环境变量 DEMO_TODAY；没写就读数据库 settings 里的 demo_today。
async function demoToday(): Promise<string | null> {
  const env = process.env.DEMO_TODAY?.trim()
  if (env) return /^\d{4}-\d{2}-\d{2}$/.test(env) ? env : null
  try {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(path.resolve(__dirname, '../数据/workbench.db'), { readOnly: true })
    const row = db.prepare("SELECT value FROM settings WHERE key = 'demo_today'").get() as { value?: string } | undefined
    db.close()
    return row?.value ?? null
  } catch { return null }
}

const injectDemoToday = (): Plugin => ({
  name: 'wb-demo-today',
  async transformIndexHtml(html) {
    const d = await demoToday()
    return d ? html.replace('<head>', `<head><script>window.__WB_TODAY__=${JSON.stringify(d)}</script>`) : html
  },
  apply: 'serve',
})

export default defineConfig({
  plugins: [react(), tailwindcss(), injectDemoToday()],
  resolve: { alias: { '@': path.resolve(__dirname, './src'), '@shared': path.resolve(__dirname, './shared') } },
  server: { port: 5173, proxy: { '/api': `http://127.0.0.1:${process.env.PORT || 4517}` } },
})
