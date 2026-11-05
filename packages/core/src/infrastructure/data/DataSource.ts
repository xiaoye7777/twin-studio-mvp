export type DataSourceType = 'websocket' | 'http' | 'static'
/** 'unconfigured': the project has no enabled data source, so no runtime values exist. */
export type DataSourceConnectionStatus = 'unconfigured' | 'connecting' | 'connected' | 'disconnected' | 'error'

/** 一个数据接口此刻的运行状态。 */
export interface DataSourceRuntimeState {
  id: string
  name: string
  type: DataSourceType
  status: DataSourceConnectionStatus
  error: string | null
  messageCount: number
}

export interface DataSource {
  start(): void
  stop(): void
}
