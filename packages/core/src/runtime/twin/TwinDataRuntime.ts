import {
  type ActiveDataSourceConfig,
  activeDataSources,
  bindingsForSource,
  type HttpDataSourceConfig,
  type ProjectDataSource,
} from '../../domain/dataSources'
import type { UnwrapNestedRefs } from 'vue'
import type { TwinBinding, TwinRuntimeValueData } from '../../domain/twin'
import { BindingTargetResolver } from './BindingTargetResolver'
import {
  type DataSource,
  type DataSourceConnectionStatus,
  HttpPollingDataSource,
  StaticDataSource,
  WebSocketDataSource,
} from '../../infrastructure/data'
import type { createTwinState } from './createTwinState'

export type TwinRuntimeState = UnwrapNestedRefs<ReturnType<typeof createTwinState>>

export interface TwinDataRuntimeOptions {
  /**
   * 定时请求接口的认证请求头。场景文件里只有引用（authRef），Token 由运行环境提供：
   * Viewer SDK 由集成方传入。
   */
  requestHeaders?: (
    source: HttpDataSourceConfig,
  ) => Record<string, string> | Promise<Record<string, string> | undefined> | undefined
}

/** 决定一个接口要不要重启：改名不用重启。 */
function signatureOf(config: ActiveDataSourceConfig): string {
  const { name: _name, ...settings } = config
  return JSON.stringify(settings)
}

/**
 * 一个场景的数据生命周期（编辑器和 Viewer 共用）：按场景配置同时运行多个数据接口，把收到的值写进运行时状态。
 *
 * - 接口之间互不影响：一个断开只清空它自己提供的值，其他接口照常。
 * - 改配置时只重启改过的接口，其他接口不断线。
 * - 同一个变量有多个接口提供时，以列表靠前的为准；靠前的断开、值被清空后，靠后的自然接管（静态数据立即接管）。
 */
export class TwinDataRuntime {
  private readonly running = new Map<string, { signature: string; source: DataSource }>()
  /** 接口 ID → 优先级（列表顺序，越小越优先）。 */
  private priority = new Map<string, number>()

  constructor(
    readonly state: TwinRuntimeState,
    private readonly resolver: BindingTargetResolver,
    private readonly options: TwinDataRuntimeOptions = {},
  ) {}

  initialize(projectId: string, bindings: readonly TwinBinding[]): void {
    this.stop()
    this.state.initializeProject(projectId, bindings)
    this.refresh()
  }

  refresh(): void {
    for (const binding of this.state.bindings) {
      this.state.setResolutionStatus(binding.id, this.resolver.resolve(binding.target) ? 'resolved' : 'unresolved')
    }
  }

  private resolvedBindings(): readonly TwinBinding[] {
    return this.state.bindings.filter(binding => this.state.resolutionByBindingId[binding.id] === 'resolved')
  }

  start(sources?: ProjectDataSource[]): void {
    this.refresh()
    const configs = activeDataSources(sources)
    this.priority = new Map(configs.map((config, index) => [config.id, index]))
    for (const [id, running] of [...this.running]) {
      const next = configs.find(config => config.id === id)
      if (next && signatureOf(next) === running.signature) continue
      this.running.delete(id)
      running.source.stop()
    }
    this.state.setDataSourceList(configs, new Set(this.running.keys()))
    if (!configs.length) {
      this.state.resetDataSourceMessages()
      this.state.setDataSourceState('websocket', 'unconfigured')
      return
    }
    for (const config of configs) {
      if (this.running.has(config.id)) continue
      const source = this.createSource(config)
      this.running.set(config.id, { signature: signatureOf(config), source })
      source.start()
    }
  }

  private createSource(config: ActiveDataSourceConfig): DataSource {
    const common = {
      getBindings: () => bindingsForSource(config, this.resolvedBindings()),
      setRuntimeValue: (bindingId: string, key: string, value: TwinRuntimeValueData) =>
        this.writeValue(config.id, bindingId, key, value),
      onStatus: (status: DataSourceConnectionStatus, error?: string) => {
        this.state.updateDataSourceState(config.id, { status, error: error ?? null })
        // 连接不在了就清空它提供的值，不留过期的值；其他接口不受影响。
        if (status !== 'connected') this.releaseValues(config.id)
      },
      onMessage: () => this.state.recordDataSourceMessage(config.id),
    }
    switch (config.type) {
      case 'websocket':
        return new WebSocketDataSource({ ...common, ...config })
      case 'http':
        return new HttpPollingDataSource({
          ...common,
          ...config,
          requestHeaders: () => this.options.requestHeaders?.(config),
        })
      case 'static':
        return new StaticDataSource({ ...common, values: config.values })
    }
  }

  /** 写入一个值，除非这个变量现在由优先级更高的接口提供。 */
  private writeValue(sourceId: string, bindingId: string, key: string, value: TwinRuntimeValueData): void {
    const owner = this.state.getRuntimeValue(bindingId, key)?.sourceId
    if (owner && owner !== sourceId) {
      const rank = (id: string) => this.priority.get(id) ?? Number.POSITIVE_INFINITY
      if (rank(owner) < rank(sourceId)) return
    }
    this.state.setRuntimeValue(bindingId, key, value, sourceId)
  }

  private releaseValues(sourceId: string): void {
    this.state.clearRuntimeValues(sourceId)
    // 静态数据只写一次，不会自己补上：这里让它接管刚空出来的变量。
    for (const { source } of this.running.values()) if (source instanceof StaticDataSource) source.apply()
  }

  stop(): void {
    const running = [...this.running.values()]
    this.running.clear()
    for (const { source } of running) source.stop()
    this.state.clearRuntimeValues()
    this.state.setDataSourceList([], new Set())
    this.state.setDataSourceState(this.state.dataSourceType, 'disconnected')
  }
}
