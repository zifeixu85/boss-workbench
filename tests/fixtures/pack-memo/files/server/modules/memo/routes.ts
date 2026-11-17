import { moduleApp, ok } from '../../module-kit.ts'
import { items, title } from './service.ts'

export const memoRoutes = moduleApp()
memoRoutes.get('/', (c) => c.json(ok({ title: title(), items: items() })))
