import { z } from 'zod'

/** A string with at least one character (whitespace counts, as in the v1 validators). */
export const nonEmptyString = z.string().min(1)

/** A string that is not blank after trimming; the stored value keeps its original spacing. */
export const trimmedString = z.string().refine(value => value.trim().length > 0, { message: '不能为空白' })

/** Array refinement: every item's `key` must be unique. */
export function uniqueBy<T>(key: (item: T) => string, label: string) {
  return (items: readonly T[], ctx: z.RefinementCtx) => {
    const seen = new Set<string>()
    items.forEach((item, index) => {
      const value = key(item)
      if (seen.has(value)) ctx.addIssue({ code: 'custom', path: [index], message: `${label}重复：${value}` })
      seen.add(value)
    })
  }
}

/** Plain object check used where a value may be any JSON. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
