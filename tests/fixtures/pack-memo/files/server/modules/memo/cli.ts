import type { ModuleCli } from '../../module-types.ts'
import { items, title } from './service.ts'

const HELP = '  memo [--json]                      全部备忘'
export const memoCli: ModuleCli = {
  help: HELP,
  run: (argv) => {
    const data = { title: title(), items: items() }
    console.log(argv.includes('--json') ? JSON.stringify(data) : `${data.title}：${data.items.map((x) => x.text).join('；') || '（无）'}`)
    return 0
  },
}
