// 展示方式用的示例数据（虚构，不读数据库）。日期按今天往前后推，所以“3 天后”“已过 2 天”总是对的
import { addDays, todayStr } from '@/lib/format'

export type SampleClient = {
  id: string; name: string; label: string; stage: string; budget: number | null
  next: string; last: string; source: string; city: string; note: string
}

const d = (n: number) => addDays(todayStr(), n)

const ROWS: [string, string, string, number | null, number, number, string, string, string][] = [
  ['衡言律所', '合伙人送客户', '报价中', 2.2, 1, -11, '朋友介绍', '杭州', '在比价，嫌包装普通；答应先发两款升级包装的效果图'],
  ['澜拓科技', '约 300 人 · 员工礼', '待复购', 5.4, 11, -35, '小红书私信', '杭州', '中秋 300 份已交付，春节可能还要，11 月再聊'],
  ['康屿医疗', '客户礼 · 合规限额', '新线索', null, 2, -8, '茶博会', '杭州', '单份不能超过 200，报价单发了还没回'],
  ['栖木资本', '年会伴手礼 60 份', '方案中', 2.4, 2, -5, '老客户介绍', '杭州', '要小而精，岩茶配白瓷盖碗'],
  ['锦川置业', '送业主和合作方', '售后', null, 1, -6, '老客户介绍', '杭州', '6 盒外箱压坏，补发后当面道歉'],
  ['青砚设计院', '约 150 人 · 员工礼', '待复购', 2.4, -7, -266, '展会', '杭州', '去年春节 150 份花草茶礼，设计师很喜欢'],
  ['禾木瑜伽', '3 家店 · 会员礼', '新线索', 3.2, 5, -3, '小红书私信', '杭州', '要“轻、健康”的调性，不要太甜'],
  ['南屿精品酒店', '客房茶包 · 月结', '合作中', 1.6, 3, -7, '酒店用品展', '杭州', '每月 2000 袋，11 月想加到 2500'],
  ['兰亭会计所', '约 100 人 · 员工礼', '报价中', 1.8, 3, -5, '行业活动', '杭州', '想要能放下 A4 贺卡的盒子'],
  ['汇远物流', '工会福利 500 份', '需求确认', 6.0, 6, -7, '茶博会', '杭州', '预算每份 120，比最便宜的礼盒还低'],
  ['云帆跨境', '约 120 人 · 员工礼', '待复购', 1.9, 9, -259, '小红书私信', '杭州', '去年春节 120 份花草茶礼'],
  ['许国平', '门店老茶客', '维护中', null, 3, -12, '门店到访', '杭州', '只喝岩茶，常带客户来门店谈事'],
  ['方雅琴', '门店会员', '维护中', null, 4, -2, '门店活动', '杭州', '爱白茶，周末品茶会常客'],
  ['三木工作室', '团建茶礼 15 份', '交付中', 0.24, 1, -3, '老客户介绍', '杭州', '明天送到'],
  ['浩瑞医药', '年会抽奖礼品', '新线索', 0.8, 3, -10, '茶博会', '杭州', '先问清合规金额上限'],
]

export const CLIENTS: SampleClient[] = ROWS.map(([name, label, stage, budget, next, last, source, city, note], i) => ({
  id: `s${i + 1}`, name, label, stage, budget, next: d(next), last: d(last), source, city, note,
}))

export const BOARD_STAGES = ['新线索', '需求确认', '方案中', '报价中', '待签约'] as const

export type SampleLog = { id: string; date: string; time: string; who: string; channel: string; summary: string }

export const LOGS: SampleLog[] = [
  { id: 'l1', date: d(0), time: '10:20', who: '三木工作室', channel: '微信', summary: '团建茶礼 15 份，约好明天下午送到' },
  { id: 'l2', date: d(-1), time: '16:05', who: '鸿印包装', channel: '微信', summary: '纸张涨价，春节礼盒报价要再等两天' },
  { id: 'l3', date: d(-1), time: '11:30', who: '方雅琴', channel: '到店', summary: '来了周末品茶会，买了 6 盒便携装' },
  { id: 'l4', date: d(-2), time: '15:00', who: '禾木瑜伽', channel: '电话', summary: '会员礼约 200 份，约好到门店品鉴' },
  { id: 'l5', date: d(-2), time: '09:40', who: '栖木资本', channel: '微信', summary: '发了两个组合思路，下周给合伙人看' },
  { id: 'l6', date: d(-4), time: '14:10', who: '衡言律所', channel: '电话', summary: '还在比两家，觉得包装有点普通' },
]

export type SampleTask = { id: string; title: string; who: string; due: string; priority: '紧急' | '重要' | '普通'; done: boolean }

export const TASKS: SampleTask[] = [
  { id: 't1', title: '给衡言出两款升级包装效果图', who: '衡言律所', due: d(0), priority: '紧急', done: false },
  { id: 't2', title: '去锦川送补发的 6 盒', who: '锦川置业', due: d(1), priority: '重要', done: false },
  { id: 't3', title: '联系青砚吴老师问春节安排', who: '青砚设计院', due: d(-7), priority: '重要', done: false },
  { id: 't4', title: '问康屿报价单看了没', who: '康屿医疗', due: d(2), priority: '普通', done: false },
  { id: 't5', title: '给康屿发报价单', who: '康屿医疗', due: d(-8), priority: '普通', done: true },
]
