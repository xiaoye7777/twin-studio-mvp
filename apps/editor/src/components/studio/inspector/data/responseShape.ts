/** 看接口返回的数据长什么样：试请求后用来提示字段名、自动定位数据列表。 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** 返回里的数据列表（元素是对象的数组），层级浅的、条数多的排前面。 */
export function findLists(value: unknown, depth = 4): Array<{ path: string; length: number }> {
  const found: Array<{ path: string; length: number; depth: number }> = []
  const walk = (node: unknown, path: string, level: number) => {
    if (Array.isArray(node)) {
      if (node.some(isRecord)) found.push({ path, length: node.length, depth: level })
      return
    }
    if (!isRecord(node) || level >= depth) return
    for (const [key, child] of Object.entries(node)) walk(child, path ? `${path}.${key}` : key, level + 1)
  }
  walk(value, '', 0)
  return found.sort((a, b) => a.depth - b.depth || b.length - a.length).map(({ path, length }) => ({ path, length }))
}

const wrapperKeys = ['data', 'result', 'results', 'body', 'payload', 'content']

/** 数据多半在哪：有列表就是列表，否则是常见的外壳字段，否则是整个返回值。 */
export function guessResultPath(body: unknown): string {
  const lists = findLists(body)
  if (lists.length) return lists[0]!.path
  if (isRecord(body)) return wrapperKeys.find(key => key in body) ?? ''
  return ''
}

/** 数据里的字段名（往里看一层）。 */
export function inferFieldKeys(data: unknown): string[] {
  const records = (Array.isArray(data) ? data : [data]).filter(isRecord).slice(0, 50)
  const keys = new Set<string>()
  for (const record of records)
    for (const [key, value] of Object.entries(record)) {
      if (isRecord(value)) for (const inner of Object.keys(value)) keys.add(`${key}.${inner}`)
      else if (!Array.isArray(value)) keys.add(key)
    }
  return [...keys]
}
