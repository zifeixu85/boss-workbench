// 9. 空状态 / 加载 / 出错 / 提示：每个列表和图表都要想好这四种样子
import { ListPlus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyNote, Failed } from '@/components/chart-kit'
import { Stat } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Code, Example, Rules, Section } from '../parts'

export function StatesSection() {
  return (
    <Section title="空 / 加载 / 出错" desc="数据还没有、正在取、没取到，这三种情况每个页面都会遇到。写清楚发生了什么、下一步做什么。">
      <div className="grid gap-5 lg:grid-cols-2">
        <Example title="空状态：整块" tag="<Empty />" desc="一个模块完全没有数据时。标题说现状，说明给下一步，按钮直接能做。"
          use="列表、周报正文这种“主体”为空。" avoid="只写“暂无数据”四个字；放一张大插画占满屏。">
          <Empty className="border bg-background/50 py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ListPlus /></EmptyMedia>
              <EmptyTitle>还没有待办</EmptyTitle>
              <EmptyDescription>和客户约好的事、要交的东西，记在这里。按 T 也能随时新建。</EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row justify-center">
              <Button onClick={() => toast('实际页面会打开“新建待办”弹窗')}><ListPlus />新建待办</Button>
              <Button variant="outline" onClick={() => toast('示例：从随手记生成')}><Sparkles />从随手记生成</Button>
            </EmptyContent>
          </Empty>
        </Example>
        <Example title="空状态：一小块" tag="<EmptyNote />" desc="图表、面板里的一部分没有数据时，用虚线框写一句。"
          use="图表没数据、某个分组为空。" avoid="画一个空坐标轴让人猜。">
          <EmptyNote>客户还没填来源。在客户详情里补上来源，就能看出哪个渠道最值得投入。</EmptyNote>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="本月新客户" value="0" unit="个" hint="真的是零" />
            <Stat label="毛利率" value="暂无" hint="这个月还没记成本" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">左边是 0（确实没有），右边是“暂无”（不知道）。两者不能混。</p>
        </Example>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Example title="加载中：骨架屏" tag="<Skeleton /> / <Loading />" desc="形状接近真实内容，加载完不跳动。第一次加载才显示；刷新时保留旧内容。图表页整页加载可以直接用 chart-kit 的 Loading。"
          use="页面、面板第一次取数。" avoid="整页转圈；每次自动刷新都闪一下骨架。">
          <div className="grid gap-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-4 rounded" />
                <div className="grid flex-1 gap-1.5"><Skeleton className="h-3.5" style={{ width: `${78 - i * 12}%` }} /><Skeleton className="h-2.5 w-1/3" /></div>
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </Example>
        <Example title="出错：能重试" tag="<Failed />" desc="说清楚哪里没取到，给一个重试按钮。写入失败用右下角的红色提示（toast）。"
          use="接口没响应、本地服务没开。" avoid="把英文报错原样甩给老板；出错后整页白屏。">
          <Failed message="本地服务没有响应（502）" onRetry={() => toast('示例：重新取数')} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => toast.success('已新增待办')}>成功提示</Button>
            <Button size="sm" variant="outline" onClick={() => toast.error('正文还是空的，写几句再保存')}>出错提示</Button>
            <Button size="sm" variant="outline" onClick={() => toast('Codex 刚更新了数据', { description: '页面已同步' })}>同步提示</Button>
          </div>
        </Example>
      </div>

      <Rules items={[
        '空状态三句话：现在是什么情况、为什么、下一步点哪里。',
        <>写操作成功或失败都用 toast（<Code>useWrite</Code> 已经自动处理），文字写结果：“已新增待办”“周报已定稿”。</>,
        '出错提示用中文说人话，附上能做的事（“确认本地服务开着，再点一次重试”）。',
        '加载不超过半秒的地方不用骨架屏，直接等数据。',
      ]} />
    </Section>
  )
}
