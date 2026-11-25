export const NEXT_SAY: string
export const DEFAULT_POSITIONS: Record<string, string>
export type KbCheckClass = { name: string; folder: string; ok: boolean; why?: string; derived?: boolean }
export type KbCheckPage = { id: 'progress' | 'outputs' | 'focus' | 'roles' | 'reports' | 'confirm'; label: string; status: '能用' | '要升级检查'; does: string; where?: string; need?: string; classes?: KbCheckClass[]; note?: string; kb?: boolean }
export type KbCheck = { root: string; exists: boolean; profile: { path: string | null; kind: string | null }; positions: Record<string, string>; pages: KbCheckPage[]; ready: boolean; next: string }
export function checkKb(root: string): KbCheck
export function checkText(r: KbCheck): string
export type DerivedClass = { name: string; layer: string; folder: string; state: 'ok' | 'empty' | 'missing' }
export function deriveClasses(text: string, probe: (folder: string) => boolean | 'ok' | 'empty' | 'missing'): DerivedClass[]
