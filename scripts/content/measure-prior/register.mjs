/** Installs `./ts-hooks.mjs` before `main.ts` is loaded. Passed to node as `--import`. */
import { register } from 'node:module'

register('./ts-hooks.mjs', import.meta.url)
