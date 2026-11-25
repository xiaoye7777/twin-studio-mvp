import { readFileSync } from 'node:fs'

/** Deep copy with a JSON round trip: every input the validators ever see arrives as JSON. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Returns a copy with `path` set to `value` (or removed when value is `REMOVE`). */
export const REMOVE = Symbol('remove')
export function patch<T>(value: T, path: (string | number)[], next: unknown): T {
  const copy = clone(value) as Record<string | number, unknown>
  let cursor = copy
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string | number, unknown>
  const last = path[path.length - 1]!
  if (next === REMOVE) delete cursor[last]
  else cursor[last] = next
  return copy as T
}

export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
}
