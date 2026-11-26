// 这一篇挂的知识库账号：单个只读，多个可选。
import { useApi } from '@/lib/api'
import { usePatchPiece } from '../api'
import { accountState } from './studio-utils'
export function AccountPicker({ id, account, disabled }: { id: string; account?: string | null; disabled?: boolean }) {
  const { data, error } = useApi<{ name: string }[]>('/m/xhs/accounts')
  const patch = usePatchPiece('账号改好了')
  if (!data) return <span className="rounded-full border px-3 py-1 text-xs">{error ? '账号读取失败' : '读取账号…'}</span>
  const state = accountState(data.map(a => a.name), account)
  const cls = 'max-w-full rounded-full border bg-card px-3 py-1.5 text-xs'
  if (state.mode !== 'select') return <span className={cls} title={state.mode === 'empty' ? '在对话里跟小红书助理说“登记小红书账号”' : undefined}>{state.mode === 'single' ? '@ ' : ''}{state.label}</span>
  return <label className={cls}>@ <select aria-label="这篇的账号" className="max-w-40 bg-transparent" value={account || ''} disabled={disabled || patch.isPending}
    onChange={e => patch.mutate({ id, account: e.target.value })}>
    {!data.some(a => a.name === account) && <option value={account || ''} disabled>{account || '选择账号'}</option>}
    {data.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
  </select></label>
}
