/*
 * 运行时数据状态（Vue 响应式）：设备绑定列表、每个「绑定 + 变量」的当前值、各数据接口的连接状态。
 * 值只在内存里，不写进文档；runtimeRevision 每次有新值加一，界面据此更新。
 * dataSourceStates 是每个接口的状态；dataSourceStatus 等是汇总（只要有一个接口连着就是 connected）。
 */
import { ref, shallowRef } from 'vue'
import {
  twinBindingTargetKey,
  type TwinBinding,
  type TwinBindingResolution,
  type TwinBindingTarget,
  type TwinRuntimeValue,
  type TwinRuntimeValueData,
} from '../../domain/twin'
import type { DataSourceConnectionStatus, DataSourceRuntimeState, DataSourceType } from '../../infrastructure/data'

function cloneBinding(binding: TwinBinding): TwinBinding {
  return {
    id: binding.id,
    target: { ...binding.target },
    device: { ...binding.device },
    variables: binding.variables.map(variable => ({ ...variable })),
  }
}

function runtimeValueKey(bindingId: string, variableKey: string): string {
  return `${bindingId}:${variableKey}`
}

export function createTwinState(onConfigurationChanged: () => void = () => {}) {
  const projectId = ref<string | null>(null)
  const bindings = shallowRef<TwinBinding[]>([])
  const runtimeValues = shallowRef<Record<string, TwinRuntimeValue>>({})
  const resolutionByBindingId = shallowRef<Record<string, TwinBindingResolution>>({})
  const bindingRevision = ref(0)
  const runtimeRevision = ref(0)
  const resolutionRevision = ref(0)
  const dataSourceType = ref<DataSourceType>('websocket')
  const dataSourceStatus = ref<DataSourceConnectionStatus>('disconnected')
  const dataSourceMessageCount = ref(0)
  const dataSourceError = ref<string | null>(null)
  const dataSourceStates = shallowRef<DataSourceRuntimeState[]>([])

  /** 由各接口的状态得出汇总。 */
  function summarizeDataSources(): void {
    const states = dataSourceStates.value
    if (!states.length) return
    const statuses = states.map(state => state.status)
    dataSourceType.value = states[0]!.type
    dataSourceStatus.value = statuses.includes('connected')
      ? 'connected'
      : statuses.includes('connecting')
        ? 'connecting'
        : statuses.includes('error')
          ? 'error'
          : 'disconnected'
    const failed = states.find(state => state.error)
    dataSourceError.value = failed ? (states.length > 1 ? `${failed.name}：${failed.error}` : failed.error) : null
    dataSourceMessageCount.value = states.reduce((sum, state) => sum + state.messageCount, 0)
  }

  function initializeProject(nextProjectId: string, savedBindings: readonly TwinBinding[] = []): void {
    projectId.value = nextProjectId
    bindings.value = savedBindings.map(cloneBinding)
    runtimeValues.value = {}
    resolutionByBindingId.value = {}
    bindingRevision.value += 1
    runtimeRevision.value += 1
    resolutionRevision.value += 1
    dataSourceStatus.value = 'disconnected'
    dataSourceMessageCount.value = 0
    dataSourceError.value = null
    dataSourceStates.value = []
  }

  function resetProject(leavingProjectId: string): void {
    if (projectId.value !== leavingProjectId) return
    projectId.value = null
    bindings.value = []
    runtimeValues.value = {}
    resolutionByBindingId.value = {}
    bindingRevision.value += 1
    runtimeRevision.value += 1
    resolutionRevision.value += 1
    dataSourceStatus.value = 'disconnected'
    dataSourceMessageCount.value = 0
    dataSourceError.value = null
    dataSourceStates.value = []
  }

  function getBindingByTarget(target: TwinBindingTarget): TwinBinding | null {
    const key = twinBindingTargetKey(target)
    return bindings.value.find(binding => twinBindingTargetKey(binding.target) === key) ?? null
  }

  function getBindingById(bindingId: string): TwinBinding | null {
    return bindings.value.find(binding => binding.id === bindingId) ?? null
  }

  function upsertBinding(binding: TwinBinding): void {
    const targetKey = twinBindingTargetKey(binding.target)
    bindings.value = [
      ...bindings.value.filter(item => item.id !== binding.id && twinBindingTargetKey(item.target) !== targetKey),
      cloneBinding(binding),
    ]
    bindingRevision.value += 1
    onConfigurationChanged()
  }

  function removeBindingByTarget(target: TwinBindingTarget): TwinBinding | null {
    const binding = getBindingByTarget(target)
    if (!binding) return null
    bindings.value = bindings.value.filter(item => item.id !== binding.id)
    const nextValues = { ...runtimeValues.value }
    for (const key of Object.keys(nextValues)) {
      if (key.startsWith(`${binding.id}:`)) delete nextValues[key]
    }
    runtimeValues.value = nextValues
    bindingRevision.value += 1
    runtimeRevision.value += 1
    onConfigurationChanged()
    return cloneBinding(binding)
  }

  function removeBindingsForTargets(targets: readonly TwinBindingTarget[]): TwinBinding[] {
    const targetKeys = new Set(targets.map(twinBindingTargetKey))
    const removed = bindings.value.filter(binding => targetKeys.has(twinBindingTargetKey(binding.target)))
    if (!removed.length) return []
    const removedIds = new Set(removed.map(binding => binding.id))
    bindings.value = bindings.value.filter(binding => !removedIds.has(binding.id))
    const nextValues = { ...runtimeValues.value }
    for (const key of Object.keys(nextValues)) {
      if (removed.some(binding => key.startsWith(`${binding.id}:`))) delete nextValues[key]
    }
    runtimeValues.value = nextValues
    bindingRevision.value += 1
    runtimeRevision.value += 1
    onConfigurationChanged()
    return removed.map(cloneBinding)
  }

  function restoreBindings(restored: readonly TwinBinding[]): void {
    if (!restored.length) return
    const restoredIds = new Set(restored.map(binding => binding.id))
    const restoredTargets = new Set(restored.map(binding => twinBindingTargetKey(binding.target)))
    bindings.value = [
      ...bindings.value.filter(
        binding => !restoredIds.has(binding.id) && !restoredTargets.has(twinBindingTargetKey(binding.target)),
      ),
      ...restored.map(cloneBinding),
    ]
    bindingRevision.value += 1
    onConfigurationChanged()
  }

  function setRuntimeValue(
    bindingId: string,
    variableKey: string,
    value: TwinRuntimeValueData,
    sourceId?: string,
  ): void {
    runtimeValues.value = {
      ...runtimeValues.value,
      [runtimeValueKey(bindingId, variableKey)]: {
        bindingId,
        variableKey,
        value,
        updatedAt: new Date().toISOString(),
        sourceId,
      },
    }
    runtimeRevision.value += 1
  }

  /** 清空数值；给了 sourceId 就只清这个接口提供的。 */
  function clearRuntimeValues(sourceId?: string): void {
    const entries = Object.entries(runtimeValues.value)
    const kept = sourceId ? entries.filter(([, value]) => value.sourceId !== sourceId) : []
    if (kept.length === entries.length) return
    runtimeValues.value = Object.fromEntries(kept)
    runtimeRevision.value += 1
  }

  function getRuntimeValue(bindingId: string, variableKey: string): TwinRuntimeValue | null {
    return runtimeValues.value[runtimeValueKey(bindingId, variableKey)] ?? null
  }

  function setResolutionStatus(bindingId: string, status: TwinBindingResolution): void {
    if (resolutionByBindingId.value[bindingId] === status) return
    resolutionByBindingId.value = { ...resolutionByBindingId.value, [bindingId]: status }
    resolutionRevision.value += 1
  }

  function setDataSourceState(type: DataSourceType, status: DataSourceConnectionStatus, error?: string): void {
    dataSourceType.value = type
    dataSourceStatus.value = status
    dataSourceError.value = error ?? null
  }
  /** 现在运行哪些接口。keep 里的接口保留原有状态（它们没有重启），其余从「连接中」开始。 */
  function setDataSourceList(
    sources: ReadonlyArray<{ id: string; name: string; type: DataSourceType }>,
    keep: ReadonlySet<string>,
  ): void {
    dataSourceStates.value = sources.map(source => {
      const existing = keep.has(source.id) ? dataSourceStates.value.find(state => state.id === source.id) : undefined
      return existing
        ? { ...existing, name: source.name }
        : { ...source, status: 'connecting' as const, error: null, messageCount: 0 }
    })
    summarizeDataSources()
  }
  function updateDataSourceState(
    id: string,
    patch: Partial<Pick<DataSourceRuntimeState, 'status' | 'error' | 'messageCount'>>,
  ): void {
    if (!dataSourceStates.value.some(state => state.id === id)) return
    dataSourceStates.value = dataSourceStates.value.map(state => (state.id === id ? { ...state, ...patch } : state))
    summarizeDataSources()
  }
  /** 收到一条有效消息。 */
  function recordDataSourceMessage(id: string): void {
    const state = dataSourceStates.value.find(item => item.id === id)
    if (state) updateDataSourceState(id, { messageCount: state.messageCount + 1 })
  }
  function resetDataSourceMessages(): void {
    dataSourceMessageCount.value = 0
  }

  return {
    projectId,
    bindings,
    runtimeValues,
    resolutionByBindingId,
    bindingRevision,
    runtimeRevision,
    resolutionRevision,
    dataSourceType,
    dataSourceStatus,
    dataSourceMessageCount,
    dataSourceError,
    dataSourceStates,
    initializeProject,
    resetProject,
    getBindingByTarget,
    getBindingById,
    upsertBinding,
    removeBindingByTarget,
    removeBindingsForTargets,
    restoreBindings,
    setRuntimeValue,
    clearRuntimeValues,
    getRuntimeValue,
    setResolutionStatus,
    setDataSourceState,
    setDataSourceList,
    updateDataSourceState,
    recordDataSourceMessage,
    resetDataSourceMessages,
    cloneBindings: () => bindings.value.map(cloneBinding),
  }
}
