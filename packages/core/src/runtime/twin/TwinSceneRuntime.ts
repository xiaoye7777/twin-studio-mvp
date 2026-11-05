/*
 * Viewer 的总装：一块画布上把引擎、SceneSync、数据运行时拼在一起，并把点击翻译成对外的事件。
 * Viewer SDK 的组件就是包了一层它。编辑器不用它，编辑器在 EditorSession 里自己组装。
 */
import { reactive } from 'vue'
import type { Object3D } from 'three'
import { targetNodeId, type TwinBindingTarget } from '../../domain/twin'
import type { SceneDocumentV2 } from '../../domain/scene'
import type {
  TwinSceneViewerEvents,
  ViewerBookmark,
  ViewerClickHit,
  ViewerObjectData,
  ViewerQuality,
  ViewerTargetClick,
} from '../../contract/viewerContract'
import { createViewerRuntimeState } from './viewerRuntimeState'
import type { SceneRepository } from '../../infrastructure/scenes/SceneRepository'
import type { AssetRepository } from '../../infrastructure/assets/AssetRepository'
import { TwinEngine } from '../../engine/TwinEngine'
import { SceneSync } from '../scene/SceneSync'
import { BindingTargetResolver } from './BindingTargetResolver'
import { createTwinState } from './createTwinState'
import { readObjectData } from './readObjectData'
import { TwinDataRuntime, type TwinDataRuntimeOptions } from './TwinDataRuntime'
import { ViewerPointerEvents } from './ViewerPointerEvents'

export interface TwinSceneRuntimeOptions {
  quality?: ViewerQuality
  /** 定时请求接口的认证请求头（Token 不进场景文件，由集成方提供）。 */
  dataRequestHeaders?: TwinDataRuntimeOptions['requestHeaders']
  /** 点到空白处。 */
  onBlank?: () => void
}

/** 每个 Viewer 一个独立的运行时。 */
export class TwinSceneRuntime {
  readonly twin = reactive(createTwinState())
  readonly runtimeState = createViewerRuntimeState(this.twin)
  readonly engine: TwinEngine
  readonly sync: SceneSync
  roots: Object3D[] = []
  document: SceneDocumentV2 | null = null
  private readonly resolver: BindingTargetResolver
  private readonly data: TwinDataRuntime
  private pointers: ViewerPointerEvents | null = null
  private disposed = false
  private started = false

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly scenes: SceneRepository,
    assets: AssetRepository,
    private readonly onClick: (event: ViewerTargetClick) => void,
    private readonly options: TwinSceneRuntimeOptions = {},
  ) {
    this.engine = new TwinEngine(canvas, { quality: options.quality ?? 'auto' })
    this.sync = new SceneSync(this.engine, assets)
    this.resolver = new BindingTargetResolver(id => this.sync.objectFor(id))
    this.data = new TwinDataRuntime(this.twin, this.resolver, { requestHeaders: options.dataRequestHeaders })
  }

  async load(projectId: string): Promise<string[]> {
    if (this.started || this.disposed) throw new Error('Runtime session already used')
    this.started = true
    try {
      const document = await this.scenes.load(projectId)
      if (this.disposed) return []
      if (!document) throw new Error('该项目尚未保存场景，请先在编辑器中保存')
      this.document = document
      const { warnings } = await this.sync.mount(document)
      if (this.disposed) return []
      this.roots = this.sync.roots
      if (!document.cameraView) await this.engine.fitAll(0)
      this.data.initialize(projectId, document.bindings)
      this.data.start(document.dataSources)
      this.pointers = new ViewerPointerEvents(
        this.canvas,
        this.engine,
        () => this.roots,
        this.twin,
        hit => this.handleClick(hit),
        () => {
          this.highlight(null)
          this.options.onBlank?.()
        },
      )
      const unresolved = this.twin.bindings.filter(
        binding => this.twin.resolutionByBindingId[binding.id] === 'unresolved',
      )
      return [...warnings, ...unresolved.map(binding => `设备绑定未解析: ${binding.device.id}`)]
    } catch (error) {
      this.dispose()
      throw error
    }
  }

  /** 点击对象：高亮、相机聚焦，并把对象的数据交给宿主。 */
  private handleClick(hit: ViewerClickHit): void {
    if (this.disposed) return
    const data = this.getObjectData(hit.target)
    if (!data) return
    this.highlight(this.getRuntimeObject(hit.target))
    void this.focusTarget(hit.target)
    this.onClick({ ...hit, data })
  }

  private highlight(object: Object3D | null): void {
    if (!this.disposed) this.engine.setOutlined('selection', object ? [object] : [])
  }

  getRuntimeObject(target: TwinBindingTarget): Object3D | null {
    return this.disposed ? null : this.resolver.resolve(target)
  }

  getObjectData(target: TwinBindingTarget): ViewerObjectData | null {
    const node = this.document?.nodes.find(item => item.id === targetNodeId(target))
    return node && !this.disposed ? readObjectData(node, this.twin) : null
  }

  async focusTarget(target: TwinBindingTarget): Promise<boolean> {
    const object = this.getRuntimeObject(target)
    if (!object) return false
    await this.engine.focus(object)
    return true
  }

  async focusDevice(deviceId: string): Promise<boolean> {
    const binding = this.twin.bindings.find(
      item => item.device.id === deviceId && this.twin.resolutionByBindingId[item.id] === 'resolved',
    )
    return binding ? this.focusTarget(binding.target) : false
  }

  getBookmarks(): ViewerBookmark[] {
    return (this.document?.bookmarks ?? []).map(({ id, name }) => ({ id, name }))
  }

  flyToBookmark(bookmarkId: string, duration = 1.2): Promise<boolean> {
    const bookmark = this.document?.bookmarks.find(item => item.id === bookmarkId)
    return bookmark ? this.engine.flyTo(bookmark.view, duration) : Promise.resolve(false)
  }

  resetView(duration = 1): Promise<boolean> {
    const view = this.document?.cameraView
    return view ? this.engine.flyTo(view, duration) : this.engine.fitAll(duration)
  }

  setQuality(quality: ViewerQuality): void {
    this.engine.setQuality(quality)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.pointers?.dispose()
    this.pointers = null
    this.data.stop()
    this.sync.dispose()
    this.engine.dispose()
    this.roots = []
    if (this.twin.projectId) this.twin.resetProject(this.twin.projectId)
  }
}

export type { TwinSceneViewerEvents }
