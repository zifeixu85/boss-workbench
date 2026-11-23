// 今日页重点卡：AI 问了问题、停在那里等你回话的对话（状态是推断的）
import { HomeCard } from './parts'
import type { CardData } from './types'

export default function WaitingCard({ data }: { data: unknown }) {
  return <HomeCard title="在等你回话" desc="AI 最后一段话像在问你，停在那里（推断）" data={data as CardData} to="/progress?status=在等我" go="进展" empty="没有在等你回话的。" tone="warn" />
}
