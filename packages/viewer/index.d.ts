import type { DeepReadonly, DefineComponent } from 'vue'

export type TwinPackageSource = string | URL | Blob | ArrayBuffer | Uint8Array
export type TwinBindingTarget =
  | { type: 'asset-instance'; instanceId: string }
  | { type: 'asset-node'; instanceId: string; assetNodeId: string }
  | { type: 'primitive'; nodeId: string }
  /** Any scene node by id, such as a group. */
  | { type: 'node'; nodeId: string }
export interface TwinDevice {
  id: string
  name: string
  type?: string
}
export interface TwinVariableDefinition {
  id: string
  key: string
  name: string
  dataType: 'number' | 'boolean' | 'string'
  unit?: string
}
export interface TwinBinding {
  id: string
  target: TwinBindingTarget
  device: TwinDevice
  variables: TwinVariableDefinition[]
}
export interface TwinRuntimeValue {
  bindingId: string
  variableKey: string
  value: number | boolean | string
  updatedAt: string
}
export interface ViewerLoadedEvent {
  projectId: string
  projectName: string
  objectCount: number
  bindingCount: number
  warnings: string[]
}
/** One variable of the object's device. `value` is null until data has arrived. */
export interface ViewerObjectValue {
  key: string
  name: string
  unit?: string
  value: number | boolean | string | null
  updatedAt: string | null
}
/** The data of one scene object. */
export interface ViewerObjectData {
  nodeId: string
  name: string
  kind: 'model' | 'group'
  device: TwinDevice | null
  bindingId: string | null
  values: ViewerObjectValue[]
}
/** target-click: the camera focuses on the clicked object and the host receives its data. */
export interface ViewerTargetClick {
  target: TwinBindingTarget
  bindingTarget?: TwinBindingTarget
  device?: TwinDevice
  bindingId?: string
  data: ViewerObjectData
}
export interface ViewerBookmark {
  id: string
  name: string
}
export type ViewerQuality = 'auto' | 'low' | 'medium' | 'high'
export type DataSourceType = 'websocket' | 'http' | 'static'
/** 'unconfigured': the package has no enabled data source, so no runtime values will ever appear. */
export type DataSourceConnectionStatus = 'unconfigured' | 'connecting' | 'connected' | 'disconnected' | 'error'
/** The live state of one data interface. */
export interface DataSourceRuntimeState {
  id: string
  name: string
  type: DataSourceType
  status: DataSourceConnectionStatus
  error: string | null
  messageCount: number
}
export type ViewerRuntimeState = DeepReadonly<{
  projectId: string | null
  bindings: TwinBinding[]
  runtimeValues: Record<string, TwinRuntimeValue>
  resolutionByBindingId: Record<string, 'resolved' | 'unresolved'>
  bindingRevision: number
  runtimeRevision: number
  resolutionRevision: number
  dataSourceType: DataSourceType
  dataSourceStatus: DataSourceConnectionStatus
  dataSourceMessageCount: number
  dataSourceError: string | null
  /** One entry per data interface; the fields above summarize them. */
  dataSourceStates: DataSourceRuntimeState[]
}> & { getRuntimeValue(bindingId: string, variableKey: string): DeepReadonly<TwinRuntimeValue> | null }
export interface TwinSceneViewerPublicApi {
  /** Moves the camera to an object. */
  focusTarget(target: TwinBindingTarget): Promise<boolean>
  /** Moves the camera to the object bound to a device. */
  focusDevice(deviceId: string): Promise<boolean>
  /** The data of one object; null when it does not exist. */
  getObjectData(target: TwinBindingTarget): ViewerObjectData | null
  getRuntimeState(): ViewerRuntimeState | null
  /** Camera views saved in the editor. */
  getBookmarks(): ViewerBookmark[]
  flyToBookmark(bookmarkId: string, durationSeconds?: number): Promise<boolean>
  /** Back to the project's opening view. */
  resetView(durationSeconds?: number): Promise<boolean>
}
export interface LoadedTwinPackage {
  readonly projectId: string
  readonly projectName: string
  readonly document: Readonly<SceneDocumentV2>
  dispose(): void
}
/** Newest scene format this SDK can open; packages from a newer editor are rejected with an upgrade hint. */
export declare const SCENE_DOCUMENT_VERSION: number
export function loadTwinPackage(
  source: TwinPackageSource,
  options?: { signal?: AbortSignal },
): Promise<LoadedTwinPackage>
export type Vector3Tuple = [number, number, number]
export interface SceneTransform {
  position: Vector3Tuple
  rotation: Vector3Tuple
  scale: Vector3Tuple
}
export interface SceneSettingsV2 {
  helpers: { grid: boolean; axes: boolean }
  ground: { enabled: boolean; size: number; color: string }
  sky: {
    mode: 'physical' | 'gradient' | 'color' | 'hdr'
    color: string
    hdrAssetId: string | null
    environmentIntensity: number
  }
  time: { hour: number; azimuth: number }
  lighting: { ambientIntensity: number; sunIntensity: number; shadows: boolean }
  fog: { enabled: boolean; density: number }
  post: {
    exposure: number
    bloom: { enabled: boolean; intensity: number; threshold: number }
    vignette: boolean
    contrast: number
    saturation: number
  }
}
export interface CameraViewV2 {
  position: Vector3Tuple
  target: Vector3Tuple
  fov?: number
  aspect?: number
}
interface SceneNodeBaseV2 {
  id: string
  parentId: string | null
  name: string
  transform: SceneTransform
  visible: boolean
  locked: boolean
}
export type SceneNodeV2 = SceneNodeBaseV2 & ({ kind: 'model'; model: { assetId: string } } | { kind: 'group' })
export interface CameraBookmark {
  id: string
  name: string
  view: CameraViewV2
  thumbnail?: string
}
/** A panel template: what the click panel shows. Changing it changes every instance. */
export interface PanelTemplate {
  id: string
  name: string
  /** Empty: the device's name, or the node's. */
  title: string
  fields: Array<{ id: string; label: string; variableKey: string; unit?: string }>
}
/** A template placed on a scene node, with what differs from the template. */
export interface PanelInstance {
  id: string
  templateId: string
  nodeId: string
  title?: string
  hiddenFields?: string[]
}
export interface SceneDocumentV2 {
  version: 2
  projectId: string
  metadata: { name?: string; updatedAt: string }
  dataSources?: ProjectDataSource[]
  settings: SceneSettingsV2
  cameraView?: CameraViewV2
  nodes: SceneNodeV2[]
  bindings: TwinBinding[]
  bookmarks: CameraBookmark[]
  panelTemplates: PanelTemplate[]
  panels: PanelInstance[]
}
export const TwinSceneViewer: DefineComponent<{
  source: TwinPackageSource
  /** Render quality; 'auto' adapts to the device and screen. */
  quality?: ViewerQuality
  /** Show the project's data panels when an object is clicked. Default true; hosts with their own UI can turn it off. */
  panels?: boolean
  /** Auth headers for HTTP data sources: tokens never live in the package, the host provides them. */
  dataRequestHeaders?: (
    source: Extract<ProjectDataSource, { type: 'http' }>,
  ) => Record<string, string> | Promise<Record<string, string> | undefined> | undefined
}>
export type ProjectDataSource = {
  id: string
  name: string
  enabled: boolean
  /** The devices this interface provides; omitted = every device found in its data. */
  devices?: Array<{ deviceId: string; variables?: string[] }>
} & (
  | {
      type: 'websocket'
      url: string
      /** Where the device messages are inside each message, e.g. "payload"; empty = the whole message. */
      resultPath?: string
      /** First message after connecting; empty sends the interface's device list. */
      subscribe?: string
      heartbeat?: { interval: number; message: string }
      mapping?: DataSourceMapping
    }
  | {
      type: 'http'
      /** http(s):// or a same-origin path starting with /. */
      url: string
      method: 'GET' | 'POST'
      /** Seconds between requests. */
      interval: number
      /** Seconds; omitted = at most the interval, at most 15. */
      timeout?: number
      params?: Array<{ key: string; value: string }>
      /** No sign-in headers here: see `authRef`. */
      headers?: Array<{ key: string; value: string }>
      /** Where the device messages are in the response, e.g. "data.list"; empty = the whole response. */
      resultPath: string
      /** POST body; empty sends the interface's device list (the WebSocket subscribe message). */
      body?: string
      /** Send the browser's cookies for that site. */
      withCredentials: boolean
      /** Names a credential; the `dataRequestHeaders` prop turns it into headers. */
      authRef?: string
      /** 'auto' (default) treats a `{ code, msg }` failure with HTTP 200 as an error. */
      envelope?: 'auto' | 'off'
      mapping?: DataSourceMapping
    }
  | {
      type: 'static'
      /** deviceId → variable key → value. */
      values: Record<string, Record<string, number | string | boolean>>
    }
)

/** How a response becomes device values; omitted = `{ deviceId, <variable>: value }` rows. */
export interface DataSourceMapping {
  /** One row per device (default), one row per variable, or an object keyed by device id. */
  format?: 'device-row' | 'metric-row' | 'device-map'
  /** Default "deviceId"; empty = the data belongs to the interface's `devices`. */
  deviceField?: string
  valuesPath?: string
  /** metric-row: default "metric". */
  metricField?: string
  /** metric-row: default "value". */
  valueField?: string
  /** Variable key → field name in the response, when they differ. */
  fields?: Record<string, string>
}
