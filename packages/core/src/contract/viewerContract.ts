/*
 * Viewer SDK 对外的类型：事件、运行时状态、公开 API。
 * 改这里要同步 packages/viewer/index.d.ts（手写的对外声明），pnpm type-check 会检查两者是否一致。
 *
 * 双向联动：
 *   场景 → 宿主  target-click：点击对象时相机聚焦过去，并带上这个对象的数据
 *   宿主 → 场景  focusTarget / focusDevice：让相机聚焦到某个对象；getObjectData：取某个对象的数据
 */
import type { DeepReadonly } from 'vue'
import type {
  TwinBinding,
  TwinBindingResolution,
  TwinBindingTarget,
  TwinDevice,
  TwinRuntimeValue,
  TwinRuntimeValueData,
} from '../domain/twin'
import type { SceneNodeV2 } from '../domain/scene'
import type { DataSourceConnectionStatus, DataSourceRuntimeState, DataSourceType } from '../infrastructure/data'

export type { TwinBindingTarget } from '../domain/twin'

export interface ViewerLoadedEvent {
  projectId: string
  projectName: string
  objectCount: number
  bindingCount: number
  warnings: string[]
}

/** 对象绑定设备的一个变量。没有收到数据时 value 是 null。 */
export interface ViewerObjectValue {
  key: string
  name: string
  unit?: string
  value: TwinRuntimeValueData | null
  updatedAt: string | null
}

/** 一个场景对象的数据。 */
export interface ViewerObjectData {
  nodeId: string
  name: string
  kind: SceneNodeV2['kind']
  device: TwinDevice | null
  bindingId: string | null
  values: ViewerObjectValue[]
}

/** 点击命中了什么（还没带数据）。 */
export interface ViewerClickHit {
  target: TwinBindingTarget
  bindingTarget?: TwinBindingTarget
  device?: TwinDevice
  bindingId?: string
}

/** target-click 的内容：命中的对象，加上它的数据。 */
export interface ViewerTargetClick extends ViewerClickHit {
  data: ViewerObjectData
}

export interface ViewerBookmark {
  id: string
  name: string
}

export type ViewerQuality = 'auto' | 'low' | 'medium' | 'high'

export type TwinSceneViewerEvents = {
  loaded: [info: ViewerLoadedEvent]
  error: [message: string]
  'target-click': [event: ViewerTargetClick]
}

export type ViewerRuntimeState = DeepReadonly<{
  projectId: string | null
  bindings: TwinBinding[]
  runtimeValues: Record<string, TwinRuntimeValue>
  resolutionByBindingId: Record<string, TwinBindingResolution>
  bindingRevision: number
  runtimeRevision: number
  resolutionRevision: number
  dataSourceType: DataSourceType
  dataSourceStatus: DataSourceConnectionStatus
  dataSourceMessageCount: number
  dataSourceError: string | null
  /** 每个数据接口的状态；上面几项是它们的汇总。 */
  dataSourceStates: DataSourceRuntimeState[]
}> & {
  getRuntimeValue(bindingId: string, variableKey: string): DeepReadonly<TwinRuntimeValue> | null
}

export interface TwinSceneViewerPublicApi {
  /** 相机聚焦到对象。 */
  focusTarget(target: TwinBindingTarget): Promise<boolean>
  /** 相机聚焦到绑定了这台设备的对象。 */
  focusDevice(deviceId: string): Promise<boolean>
  /** 取一个对象的数据；对象不存在时返回 null。 */
  getObjectData(target: TwinBindingTarget): ViewerObjectData | null
  getRuntimeState(): ViewerRuntimeState | null
  /** 编辑器里保存的镜头。 */
  getBookmarks(): ViewerBookmark[]
  flyToBookmark(bookmarkId: string, durationSeconds?: number): Promise<boolean>
  /** 回到打开场景时的视角。 */
  resetView(durationSeconds?: number): Promise<boolean>
}
