import type { ActiveDataSourceConfig, DataSourceRuntimeState } from '@twin-studio/core'

export const sourceTypeLabels: Record<ActiveDataSourceConfig['type'], string> = {
  websocket: '推送',
  http: 'HTTP',
  static: '静态数据',
}

/** 接口状态的文字和颜色。 */
export function sourceStatusView(
  source: ActiveDataSourceConfig,
  state: DataSourceRuntimeState | undefined,
): { label: string; tone: 'ok' | 'warn' | 'danger' | 'off' } {
  if (!source.enabled) return { label: '已停用', tone: 'off' }
  if (source.type === 'static') return { label: '已生效', tone: 'ok' }
  const http = source.type === 'http'
  switch (state?.status) {
    case 'connected':
      return { label: http ? '请求成功' : '已连接', tone: 'ok' }
    case 'error':
      return { label: http ? '请求失败' : '连接错误', tone: 'danger' }
    case 'disconnected':
      return { label: '已断开', tone: 'warn' }
    default:
      return { label: http ? '请求中…' : '连接中…', tone: 'warn' }
  }
}

/** 接口折叠时显示的一行摘要。 */
export function sourceSummary(source: ActiveDataSourceConfig): string {
  const scope = source.devices ? `${source.devices.length} 台设备` : '全部设备'
  if (source.type === 'http') {
    const timing = source.polling === false ? '只请求一次' : `每 ${source.interval} 秒`
    return `${sourceTypeLabels.http} · ${timing} · ${scope}`
  }
  return `${sourceTypeLabels[source.type]} · ${scope}`
}
