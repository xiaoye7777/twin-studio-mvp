/*
 * 定时请求一个 HTTP 接口取设备数据。请求怎么拼（参数、请求头、请求体、认证）在 buildHttpRequest，
 * 轮询和「试请求」（probeDataSource）用同一份，保证试出来的结果和实际运行一致。
 */
import type { HttpDataSourceConfig, SourceMapping } from '../../domain/dataSources'
import type { TwinBinding, TwinRuntimeValueData } from '../../domain/twin'
import type { DataSource, DataSourceConnectionStatus } from './DataSource'
import { mapDeviceMessages, readPath } from './messageMapping'
import { subscriptionMessage } from './WebSocketDataSource'

/** 发一次请求需要的配置。 */
export type HttpRequestConfig = Pick<HttpDataSourceConfig, 'url' | 'method' | 'withCredentials'> &
  Partial<Pick<HttpDataSourceConfig, 'params' | 'headers' | 'body' | 'envelope' | 'timeout' | 'interval'>>

export interface HttpPollingDataSourceOptions extends HttpRequestConfig {
  /** 秒。 */
  interval: number
  /** 设备消息在返回值中的位置，如 data.list。 */
  resultPath: string
  mapping?: SourceMapping
  /** 认证请求头：由运行环境提供，不进场景文件。 */
  requestHeaders?: () => Record<string, string> | Promise<Record<string, string> | undefined> | undefined
  getBindings(): readonly TwinBinding[]
  setRuntimeValue(bindingId: string, variableKey: string, value: TwinRuntimeValueData): void
  onStatus(status: DataSourceConnectionStatus, error?: string): void
  onMessage?(): void
}

function withParams(url: string, params: HttpRequestConfig['params']): string {
  const query = (params ?? [])
    .filter(param => param.key.trim())
    .map(param => `${encodeURIComponent(param.key.trim())}=${encodeURIComponent(param.value)}`)
    .join('&')
  if (!query) return url
  return `${url}${url.includes('?') ? '&' : '?'}${query}`
}

/** 拼出实际发送的请求。POST 且请求体留空：发送本接口涉及的设备清单（与 WebSocket 的订阅消息相同）。 */
export function buildHttpRequest(
  config: HttpRequestConfig,
  bindings: readonly TwinBinding[],
  authHeaders?: Record<string, string>,
): { url: string; init: RequestInit } {
  const body =
    config.method === 'POST' ? config.body?.trim() || JSON.stringify(subscriptionMessage(bindings)) : undefined
  const headers: Record<string, string> = {}
  if (body) headers['Content-Type'] = 'application/json'
  for (const header of config.headers ?? []) if (header.key.trim()) headers[header.key.trim()] = header.value
  Object.assign(headers, authHeaders)
  return {
    url: withParams(config.url, config.params),
    init: { method: config.method, headers, body, credentials: config.withCredentials ? 'include' : 'same-origin' },
  }
}

const successCodes = new Set(['0', '200', 'success', 'ok', 'true'])

/** `{ code, msg, data }` 风格的失败（HTTP 200 但 code 表示错误）；没有问题时返回空字符串。 */
export function envelopeError(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ''
  const record = body as Record<string, unknown>
  const code = record.code ?? record.status ?? record.errcode
  if (code === undefined || typeof code === 'object') return ''
  if (record.success === true || successCodes.has(String(code).toLowerCase())) return ''
  // `status` alone is often a business field ("running"); only a numeric one is a result code.
  if (record.code === undefined && record.errcode === undefined && typeof record.status !== 'number') return ''
  const message = record.msg ?? record.message ?? record.errmsg ?? record.error
  return `接口返回错误：${typeof message === 'string' && message ? message : '未说明原因'}（code = ${String(code)}）`
}

function statusError(status: number): string {
  if (status === 401 || status === 403) return `没有访问权限（HTTP ${status}）：请检查「认证」设置`
  if (status === 404) return '接口地址不存在（HTTP 404）'
  return `接口返回 HTTP ${status}`
}

/** 发一次请求，返回解析好的 JSON；任何失败都抛出一句给配置人员看的话。 */
export async function requestHttpSource(
  config: HttpRequestConfig,
  bindings: readonly TwinBinding[],
  options: { signal?: AbortSignal; authHeaders?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown }> {
  const { url, init } = buildHttpRequest(config, bindings, options.authHeaders)
  const response = await fetch(url, { ...init, signal: options.signal })
  if (!response.ok) throw new Error(statusError(response.status))
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('返回的不是 JSON 数据，请确认接口地址是否正确')
  }
  const failure = config.envelope === 'off' ? '' : envelopeError(body)
  if (failure) throw new Error(failure)
  return { status: response.status, body }
}

/** 把一次请求的异常翻译成一句话。 */
export function httpErrorMessage(error: unknown, timedOut: boolean, timeout: number): string {
  if (timedOut) return `请求超时（超过 ${timeout} 秒没有响应）`
  if (error instanceof TypeError) return '无法连接：服务未启动、地址有误或跨域被拒绝'
  return error instanceof Error ? error.message : String(error)
}

/**
 * 定时轮询：每次成功就更新数值；失败时清空数值并报告原因（和 WebSocket 断开时一样，屏幕上不会留着
 * 过期的值），下一次照常重试。
 */
export class HttpPollingDataSource implements DataSource {
  private timer: ReturnType<typeof setTimeout> | null = null
  private controller: AbortController | null = null
  private running = false

  constructor(private readonly options: HttpPollingDataSourceOptions) {}

  start(): void {
    if (this.running) return
    this.running = true
    this.options.onStatus('connecting')
    void this.poll()
  }

  private async poll(): Promise<void> {
    if (!this.running) return
    const { options } = this
    const controller = new AbortController()
    this.controller = controller
    const seconds = options.timeout ?? Math.min(options.interval, 15)
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, seconds * 1000)
    try {
      const authHeaders = await options.requestHeaders?.()
      const { body } = await requestHttpSource(options, options.getBindings(), {
        signal: controller.signal,
        authHeaders,
      })
      if (!this.running || this.controller !== controller) return
      const updates = mapDeviceMessages(readPath(body, options.resultPath), options.getBindings(), options.mapping)
      for (const update of updates) options.setRuntimeValue(update.bindingId, update.variableKey, update.value)
      options.onStatus('connected', updates.length ? undefined : '请求成功，但返回的数据里没有已绑定设备的值')
      if (updates.length) options.onMessage?.()
    } catch (error) {
      if (!this.running || this.controller !== controller) return
      options.onStatus('error', httpErrorMessage(error, timedOut, seconds))
    } finally {
      clearTimeout(timeout)
    }
    if (this.running) this.timer = setTimeout(() => void this.poll(), options.interval * 1000)
  }

  stop(): void {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.controller?.abort()
    this.controller = null
    this.options.onStatus('disconnected')
  }
}
