// 测试用的假模块的接入点：今日页重点卡的数、今日概况里的一段、导入目标、示例数据。
import { get, run, tx, uid } from '../../db.ts'
import type { ModuleHooks } from '../../module-types.ts'
import type { ImportTarget } from '../data/targets.ts'
import { writeRows } from '../data/batches.ts'
import { count, items, title } from './service.ts'

const SOURCE = 'src_memo'
/** 导入目标：把“导入文件夹里的一条备忘”写进 memo_items（测试里不真读文件，写死一行），能整批撤销 */
const target: ImportTarget = {
  id: 'memo_items', source: SOURCE, name: '备忘清单', writes: '备忘 · 清单', page: { to: '/memo', label: '去备忘看' }, nav: 'memo',
  fields: [{ value: 'memo_items.text', label: '备忘内容' }],
  how: '把备忘清单放进导入文件夹',
  tables: { memo_items: { keys: ['id'], cols: ['text'] } },
  state: () => ({ pending: 0, pending_cols: [], file: null, can_import: true }),
  run: (actor) => tx(() => {
    const batch = writeRows({ origin: '自己的', source_id: SOURCE, rule_id: null, channel_id: null, label: '备忘清单 1 条', file_name: null, date_from: null, date_to: null, created_by: actor, target: 'memo_items' },
      [{ tbl: 'memo_items', key: 'm_imported', values: { text: '导入进来的一条' } }])
    return { message: `导入了 1 条备忘（批次 ${batch}）`, batch_id: batch }
  }),
  afterUndo: (sourceId) => { run("UPDATE data_sources SET note = '撤销过一次' WHERE id = :s", { s: sourceId ?? SOURCE }) },
  seed: seedSource,
}

function seedSource() {
  run('DELETE FROM data_sources WHERE id = :s', { s: SOURCE })
  run(`INSERT INTO data_sources (id, name, kind, feeds, method, schedule, owner, status, sort) VALUES (:s, '备忘 · 清单导出', '平台导出', '备忘', '手动放进导入文件夹', '想起来就导', '林总', '正常', 95)`, { s: SOURCE })
}

export const memoHooks: ModuleHooks = {
  home: { 'memo-today': (day) => ({ day, title: title(), count: count() }) },
  today: () => ({ title: `${title()}（${count()} 条）`, lines: items().map((x) => x.text), brief: count() ? `${title()}里有 ${count()} 条` : null }),
  importTargets: [target],
  seed: {
    tables: ['memo_items'],
    seed: () => {
      run("INSERT INTO memo_items (id, text) VALUES ('m_1', '给锦川孙蕾回电话：春节茶礼的数量'), ('m_2', '门店的茶样补一批')")
      seedSource()
      if (!get('SELECT 1 FROM memo_items')) throw new Error(`示例数据没写进去（${uid('x')}）`)
    },
  },
}
