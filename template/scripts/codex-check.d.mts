// codex-check.mjs 的类型（服务端 TypeScript 用）
export type CodexInfo = { ready: boolean; bin: string | null; version: string | null; loggedIn: boolean; detail: string; fix: string | null }
export function codexCandidates(env?: NodeJS.ProcessEnv): string[]
export function small(bin: string, args: string[], ms?: number): Promise<{ ok: boolean; text: string }>
export function findCodex(env?: NodeJS.ProcessEnv): Promise<CodexInfo>
