/**
 * Module resolution hooks so `main.ts` can import the real `src/lib/teaching` modules.
 *
 * Node runs TypeScript directly, but it does not know about the `@/*` path alias in tsconfig
 * and it will not guess a `.ts` extension for an extensionless relative import. Both are things
 * a bundler does; this file is the twenty lines that stand in for one, so the tool adds no
 * dependency and measures against the SAME `runAttempt` and `buildAttemptPrompt` that production
 * calls rather than against a copy that could drift.
 */
import { statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SRC = new URL('../../../src/', import.meta.url)

function isFile(url) {
  try {
    return statSync(fileURLToPath(url)).isFile()
  } catch {
    return false
  }
}

/** `@/lib/avatars` -> `src/lib/avatars/index.ts`; `./contract` -> `./contract.ts`. */
function firstExisting(url) {
  for (const candidate of [url, new URL(`${url.href}.ts`), new URL(`${url.href}/index.ts`)]) {
    if (isFile(candidate)) return candidate
  }
  return null
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const hit = firstExisting(new URL(specifier.slice(2), SRC))
    if (hit) return { url: hit.href, shortCircuit: true, format: 'module-typescript' }
  }
  if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts')) {
    const hit = firstExisting(new URL(specifier, context.parentURL))
    if (hit) return { url: hit.href, shortCircuit: true, format: 'module-typescript' }
  }
  return nextResolve(specifier, context)
}
