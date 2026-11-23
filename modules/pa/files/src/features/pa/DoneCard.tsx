// 今日页重点卡：AI 做完了、等你看的对话（状态是推断的）
import { HomeCard } from './parts'
import type { CardData } from './types'

export default function DoneCard({ data }: { data: unknown }) {
  return <HomeCard title="做完了，等你看" desc="AI 把一轮做完了，之后你还没看（推断）" data={data as CardData} to="/progress?status=做完未读" go="进展" empty="没有做完没看的。" />
}
