#!/usr/bin/env node
/**
 * measure-prior: command line entry point.
 *
 *   node scripts/content/measure-prior/run.mjs --limit 40
 *   node scripts/content/measure-prior/run.mjs --source jsonl --file path/to/candidates.jsonl
 *
 * All this does is load `.env.local` and re-launch node with TypeScript enabled and the
 * resolution hooks installed. The work is in `./main.ts`. See ./README.md.
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = new URL('.', import.meta.url)

/**
 * Parse `.env.local` by hand, exactly as `src/lib/teaching/model-prior.live.test.ts` does.
 * `dotenv` is not a dependency of this repo, direct or transitive, and a measurement tool is a
 * poor reason to make it one.
 */
function loadEnvLocal(path = '.env.local') {
  const env = {}
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return env
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

// Process env wins, so `ANTHROPIC_API_KEY=... node run.mjs` overrides the file.
const env = { ...loadEnvLocal(), ...process.env }

const child = spawn(
  process.execPath,
  [
    // Parameter properties in `src/lib/judge/judge.ts` are not erasable, so strip-only mode is
    // not enough. This flag is the transform.
    '--experimental-transform-types',
    '--disable-warning=ExperimentalWarning',
    // main.ts is unambiguously ESM; the repo's package.json has no "type" field and adding one
    // would change how every other file in it is loaded.
    '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
    '--import',
    fileURLToPath(new URL('register.mjs', here)),
    fileURLToPath(new URL('main.ts', here)),
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', env },
)

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
