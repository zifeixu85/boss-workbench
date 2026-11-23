// 今日页重点卡：知识库里要你确认的资料（收件箱里的、标着待确认的对象和往来记录）
import { HomeCard } from './parts'
import type { CardData } from './types'

export default function ConfirmCard({ data }: { data: unknown }) {
  return <HomeCard title="要你确认的资料" desc="知识库里拿不准、等你点头的" data={data as CardData} to="/kb" go="知识库" empty="知识库里没有等你确认的。" tone="warn" />
}
