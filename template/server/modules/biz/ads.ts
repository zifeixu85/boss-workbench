// 推广的前后对比：异常标题、异常抽屉、推广计划表、早报建议共用这一份算法，时间段都是 period.ts 的“之前两周 / 近 3 天”。归属：经营模块。
// “出价”是平台里设置的值（运营记录、channel_ads.bid）；“每次点击实际花费”= 花费 ÷ 点击，一定比出价低，两个不混着说。
import { all, get } from '../../db.ts'
import { ruleWindows, type Win } from './period.ts'

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

export type AdWindow = { days: number; spend: number; gmv: number; clicks: number; per_day: number; roi: number | null; cpc: number | null; bid: number | null }
export type BidChange = { at: string; who: string; action: string; from: number; to: number }
export type CampaignShift = { campaign: string; base: AdWindow; now: AdWindow; bid_change: BidChange | null }

function win(ch: string, campaign: string | null, w: Win): AdWindow {
  const r = get<{ spend: number | null; gmv: number | null; clicks: number | null; days: number }>(`SELECT SUM(spend) AS spend, SUM(gmv) AS gmv, SUM(clicks) AS clicks, COUNT(DISTINCT date) AS days
    FROM channel_ads WHERE channel_id = :c AND (:k IS NULL OR campaign = :k) AND date BETWEEN :f AND :t`, { c: ch, k: campaign, f: w.f, t: w.t })
  const bid = campaign ? get<{ bid: number | null }>('SELECT bid FROM channel_ads WHERE channel_id = :c AND campaign = :k AND date <= :t ORDER BY date DESC LIMIT 1', { c: ch, k: campaign, t: w.t })?.bid ?? null : null
  const spend = r?.spend ?? 0
  const days = r?.days ?? 0
  return {
    days, spend: Math.round(spend), gmv: Math.round(r?.gmv ?? 0), clicks: r?.clicks ?? 0, per_day: days ? Math.round(spend / days) : 0,
    roi: spend > 0 ? r1((r?.gmv ?? 0) / spend) : null, cpc: r?.clicks ? r2(spend / r.clicks) : null, bid,
  }
}

/** 运营记录里最近一次改出价（“「秋冬白茶」计划出价 1.20 → 3.60”），只看 date 往前 14 天 */
export function bidChanges(ch: string, upTo: string, from?: string): BidChange[] {
  return all<{ at: string; who: string; action: string }>("SELECT at, who, action FROM biz_ops_log WHERE channel_id = :c AND kind = '出价' AND substr(at,1,10) BETWEEN :f AND :t ORDER BY at",
    { c: ch, f: from ?? '0000-00-00', t: upTo })
    .map((o) => ({ ...o, m: o.action.match(/(\d+(?:\.\d+)?)\s*→\s*(\d+(?:\.\d+)?)/) }))
    .filter((o) => o.m)
    .map((o) => ({ at: o.at, who: o.who, action: o.action, from: Number(o.m![1]), to: Number(o.m![2]) }))
}

/** 每个推广计划：之前两周 vs 近 3 天（每天花费、ROI、出价、每次点击实际花费） */
export function campaignShifts(ch: string, date: string): CampaignShift[] {
  const w = ruleWindows(date)
  const names = all<{ campaign: string }>('SELECT DISTINCT campaign FROM channel_ads WHERE channel_id = :c AND date BETWEEN :f AND :t', { c: ch, f: w.base.f, t: w.now.t }).map((r) => r.campaign)
  const ops = bidChanges(ch, date, w.base.f)
  return names.map((campaign) => {
    const op = ops.filter((o) => o.action.includes(`「${campaign}」`)).at(-1) ?? null
    return { campaign, base: win(ch, campaign, w.base), now: win(ch, campaign, w.now), bid_change: op }
  }).sort((a, b) => (b.now.per_day - b.base.per_day) - (a.now.per_day - a.base.per_day))
}

/** 整个渠道的推广（所有计划加起来）：之前两周 vs 近 3 天。ROI 用 channel_daily 的推广成交，和指标卡、对比表一致 */
export function channelAds(ch: string, date: string) {
  const w = ruleWindows(date)
  const sum = (x: Win) => get<{ spend: number | null; ad_gmv: number | null; days: number }>('SELECT SUM(ad_spend) AS spend, SUM(ad_gmv) AS ad_gmv, COUNT(*) AS days FROM channel_daily WHERE channel_id = :c AND date BETWEEN :f AND :t', { c: ch, f: x.f, t: x.t })
  const shape = (x: Win) => {
    const r = sum(x)
    const spend = r?.spend ?? 0
    return { spend: Math.round(spend), ad_gmv: Math.round(r?.ad_gmv ?? 0), per_day: r?.days ? Math.round(spend / r.days) : 0, roi: spend > 0 ? r1((r?.ad_gmv ?? 0) / spend) : null }
  }
  return { base: shape(w.base), now: shape(w.now), windows: w }
}

/** 一个渠道近 3 天的 ROI（对比表“近 3 天 ROI”一列） */
export function roiLast3(ch: string, date: string) {
  return channelAds(ch, date).now.roi
}
