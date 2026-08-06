/**
 * Minimal class-name joiner. Deliberately not `clsx` + `tailwind-merge`
 * + `cva`: the component surface here is small and hand-written, and
 * three dependencies to concatenate strings is not a trade worth making.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  let out = "";
  for (const part of parts) {
    if (!part) continue;
    out = out.length === 0 ? part : `${out} ${part}`;
  }
  return out;
}
