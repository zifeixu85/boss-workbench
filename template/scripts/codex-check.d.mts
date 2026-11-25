// codex-check.mjs 的类型（服务端 TypeScript 用）
export type CodexInfo = { ready: boolean; bin: string | null; version: string | null; loggedIn: boolean; detail: string; fix: string | null }
export type FindOpts = { remember?: string | null; spotlight?: boolean; system?: boolean }
export const NOT_FOUND: string
export const REMEMBER_FILE: string
export function codexCandidates(env?: NodeJS.ProcessEnv): string[]
export function findCodexBin(env?: NodeJS.ProcessEnv, opts?: FindOpts): string | null
export function rememberCodex(bin: string, file?: string | null): void
export function small(bin: string, args: string[], ms?: number): Promise<{ ok: boolean; text: string }>
export function findCodex(env?: NodeJS.ProcessEnv, opts?: FindOpts): Promise<CodexInfo>
