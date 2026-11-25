export const NEXT_SAY: string
export const ASSISTANT_SAY: string
export const DEFAULT_POSITIONS: Record<string, string>
export const DEFAULT_PATTERNS: string[]
export type KbCheckClass = { name: string; folder: string; ok: boolean; why?: string; derived?: boolean; count?: number }
export type KbCheckStatus = '能用' | '要升级检查' | '还没建助理'
export type KbCheckPage = { id: 'progress' | 'outputs' | 'focus' | 'roles' | 'reports' | 'confirm'; label: string; status: KbCheckStatus; does: string; where?: string; need?: string; classes?: KbCheckClass[]; note?: string; kb?: boolean }
export type KbCheckSay = { say: string; for: '知识库' | '助理' }
export type KbCheck = { root: string; exists: boolean; profile: { path: string | null; kind: string | null }; positions: Record<string, string>; pages: KbCheckPage[]; ready: boolean; kbReady: boolean; says: KbCheckSay[]; next: string }
export function checkKb(root: string): KbCheck
export function checkText(r: KbCheck): string
export type DerivedClass = { name: string; layer: string; folder: string; patterns: string[]; state: 'ok' | 'empty' | 'missing' }
export function deriveClasses(text: string, probe: (folder: string, patterns: string[], type: string) => boolean | 'ok' | 'empty' | 'missing'): DerivedClass[]
export function objectFiles(root: string, folder: string, patterns: string[] | undefined, type?: string): string[]
export function splitPatterns(cell: string): string[]
export function readPositions(text: string): Record<string, string>
export function readProfile(root: string): { path: string; kind: string; text: string } | null
