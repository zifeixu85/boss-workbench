// 类型库（约定 v0.2 第 2.1 节）：我们预先定义的九种对象类型。工作台只给类型库里的类型出页面，第一版先做前四种。
// 知识库技能那边带一份同样的；改类型库要升版本（这里的 TYPE_LIBRARY_VERSION 跟着改）。
export const TYPE_LIBRARY_VERSION = '0.2'

export type TypeDef = {
  name: string
  /** 一句话：是什么 */
  what: string
  statuses: string[]
  /** 列表上显示的字段（对象文件开头的属性名） */
  fields: string[]
  /** 常关联的类型 */
  links: string[]
  /** 导航里的图标（lucide 名字，网页只认 src/app/nav-icons.ts 登记的） */
  icon: string
  /** 第一版工作台有没有页面 */
  page: boolean
}

export const TYPE_LIBRARY: TypeDef[] = [
  { name: '项目', what: '有终点的事', statuses: ['进行中', '搁着', '已结束'], fields: ['截止', '负责人'], links: ['客户', '产品'], icon: 'FolderKanban', page: true },
  { name: '客户', what: '付钱或可能付钱的人和公司', statuses: ['在谈', '合作中', '沉默'], fields: ['上次联系', '下次跟进'], links: ['项目', '产品', '案例'], icon: 'Users', page: true },
  { name: '产品', what: '卖的东西，含服务和课程', statuses: ['在卖', '筹备', '下架'], fields: ['价格'], links: ['项目', '渠道'], icon: 'Package', page: true },
  { name: '案例', what: '做成或没做成的一单，可复用', statuses: ['可对外', '仅内部'], fields: ['日期', '结果'], links: ['客户', '产品'], icon: 'FileText', page: true },
  { name: '作品', what: '发出去的内容', statuses: ['草稿', '已发', '下线'], fields: ['平台', '日期'], links: ['渠道', '项目'], icon: 'PenLine', page: true },
  { name: '渠道', what: '卖货或发内容的地方', statuses: ['在做', '观察', '停了'], fields: ['负责人'], links: ['产品', '作品'], icon: 'Megaphone', page: false },
  { name: '门店', what: '线下的点', statuses: ['营业', '筹备', '关停'], fields: ['负责人'], links: ['产品'], icon: 'Store', page: false },
  { name: '伙伴', what: '团队成员、供应商、合作方', statuses: ['在合作', '暂停'], fields: ['角色', '上次联系'], links: ['项目'], icon: 'Handshake', page: false },
  { name: '主题', what: '长期在学、在研究的方向', statuses: ['在学', '放着'], fields: ['更新'], links: ['项目'], icon: 'GraduationCap', page: false },
]

export const PAGE_TYPES = TYPE_LIBRARY.filter((t) => t.page).map((t) => t.name)
export const typeDef = (name: string) => TYPE_LIBRARY.find((t) => t.name === name)
