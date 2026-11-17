import { readKbTextFile as readFileSync, canReadKbPath } from '../../services/kb.ts'
// 发布前检查的词表（本地规则，不用 AI）。归属：小红书内容模块。
// 查的词从知识库和工作台现拿（文件改了自动重读）：
//   ① 03-生意/品牌与口吻.md 的“不能说的话”表（功效、极限词、贬低别家…）
//   ② 工作台客户表里的企业客户和渠道客户名字（“不提企业客户的名字”）
//   ③ 03-生意/产品与服务/零售商品清单.md 里“待上线 / 上线前保密”的新品名字和上线日（找不到再看 06-项目）
// 怎么查（规格、AI 腔、后台字眼）在 shared/xhs-check.ts，网页和服务端共用。
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, all } from '../../db.ts'
import { today } from '../../services/common.ts'
import { runChecks, type CheckRule, type CheckSource, type CheckResult } from '../../../shared/xhs-check.ts'
import type { Draft } from './draft.ts'
import { identity } from '../../services/identity.ts'
import { storeClosure } from '../crm/closure.ts'

const VOICE = '03-生意/品牌与口吻.md'
const PRODUCTS = '03-生意/产品与服务/零售商品清单.md'
const PROJECT = '06-项目/秋冬新品围炉白茶上市.md'

let cache: { key: string; rules: CheckRule[]; sources: CheckSource[] } | null = null
const mtime = (rel: string) => { try { return statSync(join(ROOT, rel)).mtimeMs } catch { return 0 } }
const read = (rel: string) => { try { return readFileSync(join(ROOT, rel), 'utf8') } catch { return '' } }

/** “不能说的话”表：| 类别 | 不说 | 换成 |；客户名字、新品名字两行的词从工作台和商品清单现取 */
function voiceRules(): CheckRule[] {
  const sec = read(VOICE).split(/^##\s+不能说的话/m)[1]?.split(/^##\s/m)[0] ?? ''
  const out: CheckRule[] = []
  for (const line of sec.split('\n')) {
    const c = line.split('|').map((s) => s.trim())
    if (c.length < 4 || !c[1] || /^-+$/.test(c[1]) || c[1] === '类别' || /客户|新品/.test(c[1])) continue
    const [category, said, instead] = [c[1], c[2], c[3]]
    if (category.includes('贬低')) { out.push({ word: '别家', category, level: 'warn', suggest: instead, pattern: '别家|别人家的茶|某宝|某东' }); continue }
    for (const w of said.replace(/这类|等|之类/g, '').split(/[、，,；;]/).map((x) => x.trim()).filter((x) => x && x.length <= 8)) {
      // “最”“第一”太常见：“最近”“最烫的那一圈”“第一泡”“第一步”不算夸自己，只在像夸自己的时候（最好喝、最划算…）提醒
      if (w === '最') out.push({ word: w, category, level: 'warn', suggest: instead, pattern: '最(?:棒|佳|强|美|香|甜|划算|便宜|正宗|好喝|值得|全|专业|受欢迎|火|热门|优|高级|好(?!是|先|别|不|用|放|在|也|还|等))' })
      else if (w === '第一') out.push({ word: w, category, level: 'warn', suggest: instead, pattern: '第一(?![泡步天口批次张个篇周杯遍件种款样眼回页位])' })
      else out.push({ word: w, category, level: 'block', suggest: instead })
    }
  }
  return out
}

/** 企业客户、渠道客户：全名算红线；去掉“科技 / 律师事务所 / 置业…”后的简称算提醒 */
function clientRules(): CheckRule[] {
  const SUFFIX = /(律师事务所|会计师事务所|建筑设计院|设计工作室|医疗器械|精品酒店|跨境电商|科技|置业|资本|瑜伽|财税|广告|物流|教育|建设|地产|医药|民宿|咖啡)$/
  const out: CheckRule[] = []
  const owner = identity().owner
  for (const r of all<{ name: string }>("SELECT name FROM clients WHERE segment IN ('企业茶礼', '渠道合作') ORDER BY name")) {
    out.push({ word: r.name, category: '企业客户名字', level: 'block', suggest: `要讲案例就说“一家科技公司”，而且先问${owner}` })
    const short = r.name.replace(SUFFIX, '')
    if (short !== r.name && short.length >= 2) out.push({ word: short, category: '企业客户名字', level: 'warn', suggest: '看一下是不是在说这家客户' })
  }
  return out
}

/** 还没上线的新品：商品清单“待上线”那几行。名字整个出现算红线；名字里的词出现在标题、封面、图片、话题算红线，正文里算提醒；
 *  上线日的各种写法（11/5、11月5日、下周四……）也算红线。上线那天起都不再拦（知识库 05-方法与判断/小红书内容/新品预热不说名字.md） */
function launchRules(): CheckRule[] {
  const out: CheckRule[] = []
  const year = today().slice(0, 4)
  const add = (name: string, until?: string) => {
    out.push({ word: name, category: '新品名字', level: 'block', until, suggest: '上线前只说“秋冬新品”“一款新白茶”' })
    const part = name.match(/^[一-龥]{2}/)?.[0]
    if (part && name.length >= 4 && !['白茶', '岩茶', '乌龙'].includes(part)) {
      out.push({ word: part, category: '新品名字', level: 'warn', until, blockIn: ['标题', '封面', '图片', '话题'], replace: '冬天', suggest: `名字里的“${part}”也别出现在标题、封面、图片和话题里，连起来一看就猜到了；正文能不用就不用` })
    }
    if (until) out.push({ word: `${Number(until.slice(5, 7))}/${Number(until.slice(8, 10))}`, category: '新品上线日', level: 'block', until, relative: true, suggest: '上线日也别说，写“上线那天在这里说”' })
  }
  for (const line of read(PRODUCTS).split('\n')) {
    const c = line.split('|').map((s) => s.trim())
    if (c.length < 8 || !/待上线|上线前保密/.test(line)) continue
    const name = c[1].replace(/\*/g, '')
    const m = line.match(/(\d{1,2})\/(\d{1,2})\s*起/)
    if (name) add(name, m ? `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : undefined)
  }
  if (!out.length) {
    const md = read(PROJECT)
    const name = md.match(/新品[“"]([^”"]+)[”"]/)?.[1]
    const until = md.match(/截止:\s*(\d{4}-\d{2}-\d{2})/)?.[1]
    if (name) add(name, until)
  }
  return out
}

/** 门店停业的日子（排期时提醒“品茶会、门店活动别排”）：按项目里程碑和日程算，不写死；没有就是 null。读的是大客户模块的同一套算法，只读 */
function storeClosed() {
  try { const c = storeClosure(); return c ? { from: c.from, to: c.to } : null } catch { return null }
}

/** 现在的词表（网页拿去边改边查；文件或客户变了自动重读） */
export function checkRules() {
  const key = [VOICE, PRODUCTS, PROJECT].map(p => `${mtime(p)}:${canReadKbPath(join(ROOT, p))}`).join('|') + `|${all<{ n: number }>('SELECT COUNT(*) AS n FROM clients')[0]?.n}`
  if (cache?.key === key) return { rules: cache.rules, sources: cache.sources, today: today(), store_closed: storeClosed() }
  const v = voiceRules(), c = clientRules(), l = launchRules()
  const launch = l.find((r) => r.category === '新品名字' && r.level === 'block')
  cache = {
    key, rules: [...v, ...c, ...l],
    sources: [
      { label: '品牌与口吻', path: VOICE, count: v.length, note: `${v.length} 个词` },
      { label: '客户名单', count: c.filter((r) => r.level === 'block').length, note: `企业和渠道客户 ${c.filter((r) => r.level === 'block').length} 家` },
      { label: '零售商品清单', path: PRODUCTS, count: l.length, note: launch ? `待上线：${launch.word}${launch.until ? `，${Number(launch.until.slice(5, 7))}/${Number(launch.until.slice(8, 10))} 上线` : ''}` : '没有待上线的' },
    ],
  }
  return { rules: cache.rules, sources: cache.sources, today: today(), store_closed: storeClosed() }
}

export type { CheckResult }
export function checkDraft(d: Draft, publishOn?: string | null): CheckResult {
  const { rules, sources } = checkRules()
  return runChecks(d, rules, sources, publishOn || today())
}
