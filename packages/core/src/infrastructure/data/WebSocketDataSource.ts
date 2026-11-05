/*
 * WebSocket 数据源：连接网关，收到的消息按「设备编号 + 变量名」写入运行时状态；断线后 1s → 10s 退避重连。
 * 连上后先发一条订阅消息（本场景有哪些设备和变量），模拟器据此生成数据，真实网关可以忽略。
 * 消息解析在 messageMapping.ts（和 HTTP 轮询共用）。
 */
import type { SourceMapping } from '../../domain/dataSources'
import type { TwinBinding, TwinRuntimeValueData, TwinVariableDataType } from '../../domain/twin'
import type { DataSource, DataSourceConnectionStatus } from './DataSource'
import { mapDeviceMessages, readPath } from './messageMapping'

export interface WebSocketDataSourceOptions {
  url: string
  /** 设备消息在每条推送里的位置；空 = 整条消息。 */
  resultPath?: string
  /** 连上后发送的第一条消息；空 = 本接口涉及的设备清单。 */
  subscribe?: string
  heartbeat?: { interval: number; message: string }
  mapping?: SourceMapping
  getBindings(): readonly TwinBinding[]
  setRuntimeValue(bindingId: string, variableKey: string, value: TwinRuntimeValueData): void
  onStatus(status: DataSourceConnectionStatus, error?: string): void
  onMessage?(): void
}

export interface WebSocketDeviceMessage {
  deviceId: string
  [variableKey: string]: unknown
}

let activeSocketCount = 0

export function getWebSocketDataSourceDiagnostics(): { activeSocketCount: number } {
  return { activeSocketCount }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValueOfType(value: unknown, dataType: TwinVariableDataType): value is TwinRuntimeValueData {
  if (dataType === 'number') return typeof value === 'number' && Number.isFinite(value)
  return typeof value === dataType
}

/** The optional first client message: the devices and variables this scene displays. */
export function subscriptionMessage(bindings: readonly TwinBinding[]): {
  type: 'subscribe'
  devices: Array<{ deviceId: string; variables: Array<{ key: string; dataType: TwinVariableDataType }> }>
} {
  const devices = new Map<string, Map<string, TwinVariableDataType>>()
  for (const binding of bindings) {
    const variables = devices.get(binding.device.id) ?? new Map<string, TwinVariableDataType>()
    for (const variable of binding.variables) variables.set(variable.key, variable.dataType)
    devices.set(binding.device.id, variables)
  }
  return {
    type: 'subscribe',
    devices: [...devices].map(([deviceId, variables]) => ({
      deviceId,
      variables: [...variables].map(([key, dataType]) => ({ key, dataType })),
    })),
  }
}

/** Maps the transport envelope to existing binding/variable identities. */
export function mapWebSocketDeviceMessage(
  message: unknown,
  bindings: readonly TwinBinding[],
): Array<{ bindingId: string; variableKey: string; value: TwinRuntimeValueData }> {
  if (!isRecord(message) || typeof message.deviceId !== 'string' || !message.deviceId) return []
  const matching = bindings.filter(item => item.device.id === message.deviceId)
  const values = isRecord(message.values) ? message.values : message
  return matching.flatMap(binding =>
    binding.variables.flatMap(variable => {
      const value = values[variable.key]
      return isValueOfType(value, variable.dataType)
        ? [{ bindingId: binding.id, variableKey: variable.key, value }]
        : []
    }),
  )
}

export class WebSocketDataSource implements DataSource {
  private socket: WebSocket | null = null
  private stopping = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retries = 0
  private heartbeat: ReturnType<typeof setInterval> | null = null

  constructor(private readonly options: WebSocketDataSourceOptions) {}

  start(): void {
    if (this.socket || this.retryTimer) return
    if (typeof WebSocket === 'undefined') {
      this.options.onStatus('error', '当前环境不支持 WebSocket')
      return
    }
    this.stopping = false
    this.connect()
  }

  private connect(): void {
    this.options.onStatus('connecting', this.retries ? `连接中断，正在第 ${this.retries} 次重连…` : undefined)
    try {
      const socket = new WebSocket(this.options.url)
      this.socket = socket
      activeSocketCount += 1
      socket.addEventListener('open', () => {
        if (this.socket !== socket) return
        this.retries = 0
        this.options.onStatus('connected')
        // Tell the gateway which devices this scene shows. Gateways that push everything may ignore it;
        // others use it to send data only for these devices.
        try {
          socket.send(this.options.subscribe?.trim() || JSON.stringify(subscriptionMessage(this.options.getBindings())))
        } catch {
          // A failed hint never affects receiving data.
        }
        this.startHeartbeat(socket)
      })
      socket.addEventListener('message', event => {
        if (this.socket !== socket) return
        try {
          const parsed: unknown = JSON.parse(typeof event.data === 'string' ? event.data : '')
          const updates = mapDeviceMessages(
            readPath(parsed, this.options.resultPath ?? ''),
            this.options.getBindings(),
            this.options.mapping,
          )
          for (const update of updates) this.options.setRuntimeValue(update.bindingId, update.variableKey, update.value)
          this.options.onStatus('connected')
          if (updates.length) this.options.onMessage?.()
        } catch {
          // The connection itself is still live; report the bad frame without dropping current values.
          this.options.onStatus('connected', '收到无法解析的 WebSocket JSON 消息')
        }
      })
      socket.addEventListener('error', () => {
        if (this.socket === socket) this.options.onStatus('error', 'WebSocket 连接错误')
      })
      socket.addEventListener('close', () => {
        if (this.socket !== socket) return
        this.socket = null
        this.stopHeartbeat()
        activeSocketCount = Math.max(0, activeSocketCount - 1)
        if (this.stopping) return
        this.options.onStatus('disconnected', 'WebSocket 连接已关闭')
        this.scheduleReconnect()
      })
    } catch (error) {
      this.options.onStatus('error', error instanceof Error ? error.message : 'WebSocket 连接失败')
    }
  }

  private startHeartbeat(socket: WebSocket): void {
    const heartbeat = this.options.heartbeat
    if (!heartbeat) return
    this.stopHeartbeat()
    this.heartbeat = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(heartbeat.message)
    }, heartbeat.interval * 1000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
  }

  /** Demo-grade resilience: back off 1s → 2s → 4s … capped at 10s until stop(). */
  private scheduleReconnect(): void {
    const delay = Math.min(1000 * 2 ** this.retries, 10000)
    this.retries += 1
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (!this.stopping) this.connect()
    }, delay)
  }

  stop(): void {
    this.stopping = true
    this.stopHeartbeat()
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.retries = 0
    const socket = this.socket
    if (!socket) return
    this.socket = null
    activeSocketCount = Math.max(0, activeSocketCount - 1)
    socket.close(1000, 'Viewer data source stopped')
    this.options.onStatus('disconnected')
  }
}
