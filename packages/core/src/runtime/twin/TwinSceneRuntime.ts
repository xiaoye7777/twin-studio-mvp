/*
 * Viewer 的总装：一块画布上把引擎、SceneSync、数据运行时拼在一起，并把点击翻译成对外的事件。
 * Viewer SDK 的组件就是包了一层它。编辑器不用它，编辑器在 EditorSession 里自己组装。
 */
import { reactive } from 'vue'
import { Box3, type Object3D } from 'three'
import {
  targetForNode,
  targetNodeId,
  twinBindingTargetKey,
  type TwinBinding,
  type TwinBindingTarget,
} from '../../domain/twin'
import type { SceneDocumentV2 } from '../../domain/scene'
import type {
  TwinSceneViewerEvents,
  ViewerBookmark,
  ViewerClickHit,
  ViewerInteractionEvent,
  ViewerObjectData,
  ViewerQuality,
  ViewerTargetClick,
  ViewerSelection,
} from '../../contract/viewerContract'
import { createViewerRuntimeState } from './viewerRuntimeState'
import type { AssetRepository } from '../../infrastructure/assets/AssetRepository'
import { TwinEngine } from '../../engine/TwinEngine'
import { PanelLayer } from '../panels/PanelLayer'
import { dataOwnerOf } from '../panels/resolvePanel'
import { SceneSync } from '../scene/SceneSync'
import { bindingTargetFromObject, BindingTargetResolver } from './BindingTargetResolver'
import { createTwinState } from './createTwinState'
import { readObjectData } from './readObjectData'
import { TwinDataRuntime, type TwinDataRuntimeOptions } from './TwinDataRuntime'
import { InteractionRuntime } from '../interactions/InteractionRuntime'

export interface TwinSceneRuntimeOptions {
  onInteractionEvent?: (event: ViewerInteractionEvent) => void
  quality?: ViewerQuality
  shouldFocusOnClick?: (event: ViewerTargetClick) => boolean
  onSelectionChange?: (selection: ViewerSelection) => void
  /** HTTP 接口的认证请求头（Token 不进场景文件，由集成方提供）。 */
  dataRequestHeaders?: TwinDataRuntimeOptions['requestHeaders']
  /** 显示场景里的信息面板。默认显示；宿主有自己的界面时可以关掉。 */
  panels?: boolean
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
  private readonly panels: PanelLayer
  private interactions: InteractionRuntime | null = null
  private disposed = false
  private started = false
  private selection: ViewerSelection = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    assets: AssetRepository,
    private readonly onClick: (event: ViewerTargetClick) => void,
    private readonly options: TwinSceneRuntimeOptions = {},
  ) {
    this.engine = new TwinEngine(canvas, { quality: options.quality ?? 'auto' })
    this.sync = new SceneSync(this.engine, assets)
    this.resolver = new BindingTargetResolver(id => this.sync.objectFor(id))
    this.data = new TwinDataRuntime(this.twin, this.resolver, { requestHeaders: options.dataRequestHeaders })
    this.panels = new PanelLayer(this.engine, id => this.sync.objectFor(id), this.twin)
    this.panels.setPlaying(true)
    this.panels.setEnabled(options.panels ?? true)
  }

  /** 显示一份场景 JSON。 */
  async load(document: SceneDocumentV2): Promise<string[]> {
    if (this.started || this.disposed) throw new Error('Runtime session already used')
    this.started = true
    try {
      this.document = document
      const { warnings } = await this.sync.mount(document)
      if (this.disposed) return []
      this.roots = this.sync.roots
      this.panels.setDocument(document)
      if (!document.cameraView) await this.engine.fitAll(0)
      this.data.initialize(document.projectId, document.bindings)
      this.data.start(document.dataSources)
      this.interactions = new InteractionRuntime(
        this.canvas,
        this.engine,
        () => this.roots,
        this.twin,
        document.interactions ?? [],
        {
          resolver: this.resolver,
          select: target => this.selectTarget(target),
          clear: () => this.clearSelection(),
          focus: target => this.focusTarget(target),
          flyToBookmark: id => this.flyToBookmark(id),
          deviceId: target => this.resolveBinding(target)?.device.id ?? null,
          emit: event => this.options.onInteractionEvent?.(event),
        },
        (hit, autoFocus) => this.handleClick(hit, autoFocus),
        () => {
          this.clearSelection()
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
  private handleClick(hit: ViewerClickHit, autoFocus: boolean): void {
    if (this.disposed) return
    const binding = this.resolveBinding(hit.target, hit.bindingTarget)
    const data = this.objectData(hit.target, binding)
    if (!data) return
    this.updateSelection(hit.target, binding)
    const event = {
      target: hit.target,
      bindingTarget: binding ? { ...binding.target } : undefined,
      device: data.device ?? undefined,
      bindingId: data.bindingId ?? undefined,
      data,
    }
    if (autoFocus && (this.options.shouldFocusOnClick?.(event) ?? true)) void this.focusTarget(hit.target)
    this.onClick(event)
  }

  getSelection(): ViewerSelection {
    return this.selection
  }

  selectDevice(deviceId: string): boolean {
    const binding = this.resolvedDevice(deviceId)
    return binding ? this.selectTarget(binding.target) : false
  }

  selectTarget(target: TwinBindingTarget): boolean {
    if (!this.getRuntimeObject(target)) return false
    this.updateSelection(target, this.resolveBinding(target))
    return true
  }

  private updateSelection(target: TwinBindingTarget, binding: TwinBinding | null): void {
    this.highlight(this.getRuntimeObject(target))
    this.panels.setClicked(targetNodeId(target))
    const bindingId = binding?.id ?? null
    if (
      this.selection &&
      twinBindingTargetKey(this.selection.target) === twinBindingTargetKey(target) &&
      this.selection.bindingId === bindingId
    )
      return
    this.selection = Object.freeze({
      target: Object.freeze({ ...target }),
      bindingTarget: binding ? Object.freeze({ ...binding.target }) : null,
      bindingId,
      deviceId: binding?.device.id ?? null,
      deviceName: binding?.device.name ?? null,
    })
    this.options.onSelectionChange?.(this.selection)
  }

  clearSelection(): void {
    if (this.disposed) return
    this.highlight(null)
    this.panels.setClicked(null)
    if (!this.selection) return
    this.selection = null
    this.options.onSelectionChange?.(null)
  }

  private highlight(object: Object3D | null): void {
    if (!this.disposed) this.engine.setOutlined('selection', object ? [object] : [])
  }

  getRuntimeObject(target: TwinBindingTarget): Object3D | null {
    return this.disposed ? null : this.resolver.resolve(target)
  }

  getObjectData(target: TwinBindingTarget): ViewerObjectData | null {
    return this.objectData(target, this.resolveBinding(target))
  }

  private objectData(target: TwinBindingTarget, binding: TwinBinding | null): ViewerObjectData | null {
    const node = this.document?.nodes.find(item => item.id === targetNodeId(target))
    return node && !this.disposed ? readObjectData(node, this.twin, binding?.target ?? node) : null
  }

  private resolveBinding(target: TwinBindingTarget, hitBinding?: TwinBindingTarget): TwinBinding | null {
    const document = this.document
    if (!document || this.disposed) return null
    const node = document.nodes.find(item => item.id === targetNodeId(target))
    if (!node) return null
    const owner = dataOwnerOf(document, node)
    // 命中的模型部件、模型本身、外层分组都可能是设备的绑定位置。
    const direct = this.twin.getBindingByTarget(hitBinding ?? target)
    if (direct) return direct
    for (let object = this.sync.objectFor(owner.id); object; object = object.parent) {
      const identity = bindingTargetFromObject(object)
      const binding = identity && this.twin.getBindingByTarget(identity)
      if (binding) return binding
    }
    return this.twin.getBindingByTarget(targetForNode(owner))
  }

  private resolvedDevice(deviceId: string): TwinBinding | undefined {
    return this.twin.bindings.find(
      item => item.device.id === deviceId && this.twin.resolutionByBindingId[item.id] === 'resolved',
    )
  }

  async focusTarget(target: TwinBindingTarget): Promise<boolean> {
    const object = this.getRuntimeObject(target)
    if (!object) return false
    const box = new Box3().setFromObject(object, true)
    this.panels.expandWithPanels(box, targetNodeId(target))
    return this.engine.focusBox(box)
  }

  async focusDevice(deviceId: string): Promise<boolean> {
    const binding = this.resolvedDevice(deviceId)
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

  setPanelsEnabled(enabled: boolean): void {
    this.panels.setEnabled(enabled)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.selection = null
    this.interactions?.dispose()
    this.interactions = null
    this.panels.dispose()
    this.data.stop()
    this.sync.dispose()
    this.engine.dispose()
    this.roots = []
    if (this.twin.projectId) this.twin.resetProject(this.twin.projectId)
  }
}

export type { TwinSceneViewerEvents }
