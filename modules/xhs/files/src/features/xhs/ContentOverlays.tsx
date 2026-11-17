// 内容中心几页共用的抽屉和弹窗（都由地址栏参数控制）：?piece= 单篇抽屉、?doc= 读知识库原文、?create=piece|topics 新建弹窗。
// 放在内容中心自己的页面里，不改公共的 app/Overlays.tsx。归属：小红书内容模块。
import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { PieceSheet } from './PieceSheet'
import { KbDocDialog } from './KbDoc'
import { NewPieceDialog, TopicsDialog } from './dialogs'

export function useCreateParam() {
  const [sp, setSp] = useSearchParams()
  const open = useCallback((kind: 'piece' | 'topics', dir?: string) => setSp((p) => { const n = new URLSearchParams(p); n.set('create', kind); if (dir) n.set('dir', dir); else n.delete('dir'); return n }), [setSp])
  const close = useCallback(() => setSp((p) => { const n = new URLSearchParams(p); n.delete('create'); n.delete('dir'); return n }), [setSp])
  return { kind: sp.get('create'), dir: sp.get('dir') ?? '', open, close }
}

export function ContentOverlays() {
  const c = useCreateParam()
  return (
    <>
      <PieceSheet />
      <KbDocDialog />
      {c.kind === 'piece' && <NewPieceDialog onClose={c.close} />}
      {c.kind === 'topics' && <TopicsDialog key={c.dir} onClose={c.close} direction={c.dir} />}
    </>
  )
}
