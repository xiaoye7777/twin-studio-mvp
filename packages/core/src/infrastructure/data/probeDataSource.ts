/*
 * 「试请求」：不影响运行中的接口，临时请求一次（WebSocket 则连上等第一条消息），把原始返回交给配置界面，
 * 用来挑数据位置、看字段、确认能认出哪些设备。
 */
import type { HttpDataSourceConfig, WebSocketDataSourceConfig } from '../../domain/dataSources'
import type { TwinBinding } from '../../domain/twin'
import { httpErrorMessage, requestHttpSource } from './HttpPollingDataSource'
import { subscriptionMessage } from './WebSocketDataSource'

export interface DataSourceProbeResult {
  ok: boolean
  /** 毫秒。 */
  duration: number
  /** 原始返回（失败时没有）。 */
  body?: unknown
  error: string
}

const WEBSOCKET_WAIT_SECONDS = 8

function probeWebSocket(config: WebSocketDataSourceConfig, bindings: readonly TwinBinding[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(config.url)
    const finish = (settle: () => void) => {
      clearTimeout(timer)
      socket.close(1000, 'Probe finished')
      settle()
    }
    const timer = setTimeout(
      () => finish(() => reject(new Error(`连上了，但 ${WEBSOCKET_WAIT_SECONDS} 秒内没有收到消息`))),
      WEBSOCKET_WAIT_SECONDS * 1000,
    )
    socket.addEventListener('open', () =>
      socket.send(config.subscribe?.trim() || JSON.stringify(subscriptionMessage(bindings))),
    )
    socket.addEventListener('message', event => {
      try {
        const parsed: unknown = JSON.parse(String(event.data))
        finish(() => resolve(parsed))
      } catch {
        finish(() => reject(new Error('收到的消息不是 JSON')))
      }
    })
    socket.addEventListener('error', () => finish(() => reject(new Error('无法连接：服务未启动或地址有误'))))
  })
}

/** 试一次。不会抛异常，失败原因在 error 里。 */
export async function probeDataSource(
  config: HttpDataSourceConfig | WebSocketDataSourceConfig,
  bindings: readonly TwinBinding[],
  authHeaders?: Record<string, string>,
): Promise<DataSourceProbeResult> {
  const started = performance.now()
  const done = (patch: Partial<DataSourceProbeResult>): DataSourceProbeResult => ({
    ok: false,
    error: '',
    ...patch,
    duration: Math.round(performance.now() - started),
  })
  if (config.type === 'websocket') {
    try {
      return done({ ok: true, body: await probeWebSocket(config, bindings) })
    } catch (error) {
      return done({ error: (error as Error).message })
    }
  }
  const seconds = config.timeout ?? 15
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, seconds * 1000)
  try {
    const { body } = await requestHttpSource(config, bindings, { signal: controller.signal, authHeaders })
    return done({ ok: true, body })
  } catch (error) {
    return done({ error: httpErrorMessage(error, timedOut, seconds) })
  } finally {
    clearTimeout(timeout)
  }
}
