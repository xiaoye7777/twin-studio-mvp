import { adapter, type ApiResult } from './adapter'

/** 后端返回的错误；msg 可以直接显示给用户。 */
export class ApiError extends Error {
  constructor(readonly result: ApiResult) {
    super(result.msg)
    this.name = 'ApiError'
  }
}

/** 请求 JSON 接口，返回 data 部分；失败时抛 ApiError。 */
export async function request(path: string, init: RequestInit & { json?: unknown } = {}): Promise<unknown> {
  const { json, ...rest } = init
  const response = await fetch(`${adapter.base}${path}`, {
    ...rest,
    headers: json === undefined ? rest.headers : { 'Content-Type': 'application/json', ...rest.headers },
    body: json === undefined ? rest.body : JSON.stringify(json),
  })
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // 网关报错时常常返回 HTML，这里按没有内容处理，错误信息用 HTTP 状态码。
  }
  const result = adapter.unwrap(response.status, body)
  if (!result.ok) throw new ApiError(result)
  return result.data
}

/** 下载文件内容。 */
export async function download(path: string): Promise<Blob> {
  const response = await fetch(`${adapter.base}${path}`)
  if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）`)
  return response.blob()
}

/** 接口地址的完整 URL（给 <img> 这类直接用）。 */
export function apiUrl(path: string): string {
  return `${adapter.base}${path}`
}
