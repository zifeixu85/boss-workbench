// 看板拖拽：卡片拖到另一列就改状态 / 阶段。基于 @dnd-kit（鼠标、触屏、键盘都能拖）
import type { ReactNode } from 'react'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export function DndBoard({ children, onMove, renderOverlay }: { children: ReactNode; onMove: (itemId: string, column: string) => void; renderOverlay?: (id: string) => ReactNode }) {
  const [active, setActive] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )
  const end = (e: DragEndEvent) => {
    setActive(null)
    const col = e.over?.id
    if (col && e.active.data.current?.column !== col) onMove(String(e.active.id), String(col))
  }
  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActive(String(e.active.id))} onDragEnd={end} onDragCancel={() => setActive(null)}>
      {children}
      <DragOverlay dropAnimation={null}>{active && renderOverlay ? <div className="rotate-1 shadow-float">{renderOverlay(active)}</div> : null}</DragOverlay>
    </DndContext>
  )
}

/** 可以放卡片的列 */
export function DropColumn({ id, children }: { id: string; children: (isOver: boolean) => ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return <div ref={setNodeRef} className="min-w-0">{children(isOver)}</div>
}

/** 可以拖的卡片 */
export function DragCard({ id, column, children, className }: { id: string; column: string; children: ReactNode; className?: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, data: { column } })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }} {...attributes} {...listeners}
      className={cn('cursor-grab touch-manipulation active:cursor-grabbing', isDragging && 'opacity-40', className)} aria-roledescription="可拖动的卡片">
      {children}
    </div>
  )
}
