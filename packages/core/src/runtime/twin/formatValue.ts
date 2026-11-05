/** Display text for a live value: numbers rounded to their magnitude, booleans in words, absent as "—". */
export function formatRuntimeValue(value: unknown, unit?: string): string {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—'
    const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2
    return `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}`
  }
  return `${String(value)}${unit ? ` ${unit}` : ''}`
}
