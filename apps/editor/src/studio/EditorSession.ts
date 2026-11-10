import { reactive, shallowRef } from 'vue'
import { Box3, type Matrix4, Vector3 } from 'three'
import {
  type AssetRepository,
  BindingTargetResolver,
  type CameraView,
  createEmptyDocument,
  createTwinState,
  type DocumentChange,
  DocumentStore,
  isLockedOrHidden,
  loadSceneDocument,
  nodeById,
  PanelLayer,
  type SceneDocumentV2,
  type SceneNodeV2,
  type SceneRepository,
  type SceneSettingsV2,
  scenePresets,
  SceneSync,
  targetNodeId,
  topmost,
  transformOf,
  TwinDataRuntime,
  TwinEngine,
  ViewerPointerEvents,
  worldMatrixOf,
} from '@twin-studio/core'
import type { SceneConflict } from '@/api/adapter'
import { SceneConflictError } from '@/api/repositories'
import { CameraViews } from './session/CameraViews'
import { DeviceData } from './session/DeviceData'
import { NodeEditing } from './session/NodeEditing'
import { PanelManager } from './session/PanelManager'
import { ViewportPointer } from './session/ViewportPointer'
import { type GizmoMode, TransformGizmo } from './TransformGizmo'

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'

/** 视口左侧快捷栏的工具。select 只选中，不显示变换手柄。 */
export type EditorTool = 'select' | GizmoMode

/** 场景仓库，加上选择「覆盖别人的修改」时要用的方法。 */
export interface EditorSceneRepository extends SceneRepository {
  overwrite(document: SceneDocumentV2, currentRevision: number): Promise<void>
}

export interface EditorSessionDeps {
  projectId: string
  projectName: string
  assets: AssetRepository
  scenes: EditorSceneRepository
  /** 每次保存后把场景的小图交出去，用作场景卡片的封面。 */
  onCover?: (cover: Blob) => void
}

/**
 * 编辑器里一个打开的场景。
 *
 * 文档（DocumentStore）是唯一的真相：每次修改都是一个事务（edit），SceneSync 把文档画成三维场景，面板读 `doc`。
 * 三维对象从不被直接修改。
 *
 * 这个类只放核心：生命周期、文档与撤销、保存、选择、预览模式。其余功能按主题分在 `session/` 下，
 * 通过字段访问，例如 `session.nodes.addModel()`、`session.panels.addGroup()`。
 */
export class EditorSession {
  readonly engine: TwinEngine
  readonly sync: SceneSync
  readonly store: DocumentStore<SceneDocumentV2>
  readonly doc = shallowRef<SceneDocumentV2>(createEmptyDocument('', ''))
  readonly selection = shallowRef<string[]>([])
  /** 鼠标悬停的节点（视口和场景树互相高亮）。 */
  readonly hovered = shallowRef<string | null>(null)
  readonly twin = reactive(createTwinState())
  readonly ui = reactive({
    ready: false,
    error: '',
    warnings: [] as string[],
    mode: 'edit' as 'edit' | 'preview',
    tool: 'translate' as EditorTool,
    canUndo: false,
    canRedo: false,
    undoLabel: '',
    redoLabel: '',
    /** 三维对象同步完成一次就加一；场景树靠它知道对象都建好了。 */
    syncRevision: 0,
    saveState: 'saved' as SaveState,
    saveError: '',
    /** 保存时发现场景被别人改过。 */
    conflict: null as SceneConflict | null,
    /** 数据接口配置有问题时的提示。 */
    dataError: '',
    /** 右键菜单：屏幕位置和点到的场景位置。 */
    contextMenu: null as { x: number; y: number; point: [number, number, number] | null } | null,
    hasClipboard: false,
    /** 正在往这个标签组里放置面板。 */
    placing: null as string | null,
  })

  readonly nodes = new NodeEditing(this)
  readonly cameras = new CameraViews(this)
  readonly devices = new DeviceData(this)
  readonly panels = new PanelManager(this)
  readonly pointer: ViewportPointer
  readonly projectId: string
  readonly assets: AssetRepository
  readonly gizmo: TransformGizmo
  private readonly scenes: EditorSceneRepository
  private readonly resolver: BindingTargetResolver
  private readonly dataRuntime: TwinDataRuntime
  private readonly panelLayer: PanelLayer
  private previewPointers: ViewerPointerEvents | null = null
  private gizmoIds: string[] = []
  /** 已关闭：异步工作（截图、悬停检测）看到它就停止。 */
  disposed = false

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly deps: EditorSessionDeps,
  ) {
    this.projectId = deps.projectId
    this.assets = deps.assets
    this.scenes = deps.scenes
    this.engine = new TwinEngine(canvas, { preserveDrawingBuffer: true })
    this.sync = new SceneSync(this.engine, this.assets, undefined, { editor: true })
    this.store = new DocumentStore(createEmptyDocument(deps.projectId, deps.projectName), 300)
    this.resolver = new BindingTargetResolver(id => this.sync.objectFor(id))
    this.dataRuntime = new TwinDataRuntime(this.twin, this.resolver)
    this.gizmo = new TransformGizmo(this.engine, {
      onStart: () => {},
      onChange: ({ worlds }) => this.applyGizmo(worlds),
      onEnd: () => this.store.seal(),
    })
    this.gizmo.setMode('translate')
    this.panelLayer = new PanelLayer(this.engine, id => this.sync.objectFor(id), this.twin)
    this.store.subscribe(change => this.onDocumentChange(change))
    this.pointer = new ViewportPointer(this)
  }

  // ================================================================ 生命周期

  async open(): Promise<void> {
    try {
      const saved = await this.scenes.load(this.projectId)
      if (this.disposed) return
      const document = saved ?? createEmptyDocument(this.projectId, this.deps.projectName)
      this.store.reset(document)
      const { warnings } = await this.sync.mount(this.store.document)
      if (this.disposed) return
      this.ui.warnings = warnings
      this.panelLayer.setDocument(this.store.document)
      this.dataRuntime.initialize(this.projectId, document.bindings)
      this.startData(document)
      if (!document.cameraView) await this.engine.fitAll(0)
      this.ui.saveState = saved ? 'saved' : 'unsaved'
      this.ui.ready = true
    } catch (error) {
      if (this.disposed) return
      this.ui.error = error instanceof Error ? error.message : String(error)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.pointer.dispose()
    this.exitPreview()
    this.panelLayer.dispose()
    this.dataRuntime.stop()
    this.gizmo.dispose()
    this.sync.dispose()
    this.engine.dispose()
  }

  // ================================================================ 文档

  /** 一次可撤销的修改。预览时不生效。 */
  edit(label: string, recipe: (draft: SceneDocumentV2) => void, options: { coalesceKey?: string } = {}): boolean {
    if (this.ui.mode === 'preview' || !this.ui.ready) return false
    return this.store.transaction(label, recipe, options)
  }

  /** 结束一串合并的修改（拖动数值后松手）。 */
  commit(): void {
    this.store.seal()
  }

  undo(): void {
    if (this.ui.mode === 'edit') this.store.undo()
  }

  redo(): void {
    if (this.ui.mode === 'edit') this.store.redo()
  }

  /** 改场景环境（天空、光照、雾、天气等）。拖滑块时传 coalesceKey，松手前合并成一步撤销。 */
  updateSettings(recipe: (settings: SceneSettingsV2) => void, label = '场景设置', coalesceKey?: string): void {
    this.edit(label, draft => recipe(draft.settings), { coalesceKey })
  }

  /** 套用一个氛围预设，算一步撤销。 */
  applyPreset(id: string): void {
    const preset = scenePresets.find(item => item.id === id)
    if (preset) this.edit(`氛围：${preset.name}`, draft => void (draft.settings = preset.apply(draft.settings)))
  }

  node(id: string): SceneNodeV2 | undefined {
    return nodeById(this.doc.value, id)
  }

  get selectedNodes(): SceneNodeV2[] {
    return this.selection.value.flatMap(id => this.node(id) ?? [])
  }

  private onDocumentChange(change: DocumentChange<SceneDocumentV2>): void {
    const { document: next, previous } = change
    this.doc.value = next
    this.ui.canUndo = this.store.canUndo
    this.ui.canRedo = this.store.canRedo
    this.ui.undoLabel = this.store.undoLabel ?? ''
    this.ui.redoLabel = this.store.redoLabel ?? ''
    void this.sync.update(next).then(({ warnings }) => {
      if (this.disposed) return
      if (warnings.length) this.ui.warnings = warnings
      this.ui.syncRevision++
      this.panelLayer.setDocument(next)
      this.dataRuntime.refresh()
      this.refreshSelectionVisuals()
    })
    if (change.origin === 'reset') return
    if (next.bindings !== previous.bindings) {
      this.dataRuntime.initialize(this.projectId, next.bindings)
      this.startData(next)
    } else if (next.dataSources !== previous.dataSources) this.startData(next)
    this.ui.saveState = this.store.isDirty ? 'unsaved' : 'saved'
    const ids = new Set(next.nodes.map(node => node.id))
    if (this.selection.value.some(id => !ids.has(id))) this.select(this.selection.value.filter(id => ids.has(id)))
    if (this.ui.placing && !ids.has(this.ui.placing)) this.panels.stopPlacing()
  }

  /** 启动数据接口。配置有问题时不影响编辑，只给提示。 */
  private startData(document: SceneDocumentV2): void {
    try {
      this.dataRuntime.start(document.dataSources)
      this.ui.dataError = ''
    } catch (error) {
      this.ui.dataError = error instanceof Error ? error.message : String(error)
    }
  }

  // ================================================================ 保存

  async save(): Promise<boolean> {
    const current = this.store.document
    this.ui.saveState = 'saving'
    try {
      await this.scenes.save(this.documentToSave(current))
      this.afterSave(current)
      return true
    } catch (error) {
      this.ui.saveState = 'error'
      if (error instanceof SceneConflictError) this.ui.conflict = error.conflict
      else this.ui.saveError = error instanceof Error ? error.message : String(error)
      return false
    }
  }

  /** 场景被别人改过时选择覆盖：用当前内容替换最新版本。 */
  async overwriteConflict(): Promise<boolean> {
    const conflict = this.ui.conflict
    if (!conflict) return false
    const current = this.store.document
    this.ui.conflict = null
    this.ui.saveState = 'saving'
    try {
      await this.scenes.overwrite(this.documentToSave(current), conflict.currentRevision)
      this.afterSave(current)
      return true
    } catch (error) {
      this.ui.saveState = 'error'
      this.ui.saveError = error instanceof Error ? error.message : String(error)
      return false
    }
  }

  /** 场景被别人改过时选择加载最新：放弃当前未保存的修改。 */
  async reloadLatest(): Promise<void> {
    this.ui.conflict = null
    const latest = await this.scenes.load(this.projectId)
    this.select([])
    this.store.reset(latest ?? createEmptyDocument(this.projectId, this.deps.projectName))
    this.dataRuntime.initialize(this.projectId, this.store.document.bindings)
    this.startData(this.store.document)
    this.ui.saveState = 'saved'
    this.ui.saveError = ''
  }

  /** 绝不保存读取时会被拒绝的文档，否则这个场景就再也打不开了。 */
  private documentToSave(current: SceneDocumentV2): SceneDocumentV2 {
    return loadSceneDocument({
      ...current,
      metadata: { ...current.metadata, name: this.deps.projectName, updatedAt: new Date().toISOString() },
    }).document
  }

  private afterSave(saved: SceneDocumentV2): void {
    if (this.store.document === saved) this.store.markSaved()
    this.ui.saveState = this.store.isDirty ? 'unsaved' : 'saved'
    this.ui.saveError = ''
    void this.captureBlob(480).then(cover => cover && !this.disposed && this.deps.onCover?.(cover))
  }

  // ================================================================ 截图

  /** 从指定视角截一张不含辅助线的图，不移动用户的相机。 */
  captureFrom(view: CameraView, width: number): Promise<string | null> {
    return this.withCleanFrame(() => this.engine.renderView(view, width)).then(blob => (blob ? dataUrlOf(blob) : null))
  }

  private captureBlob(width: number): Promise<Blob | null> {
    return this.withCleanFrame(() => this.engine.screenshot(width))
  }

  private async withCleanFrame(render: () => Promise<Blob | null>): Promise<Blob | null> {
    const helpers = this.doc.value.settings.helpers
    this.engine.setHelpers({ grid: false, axes: false })
    this.gizmo.setVisible(false)
    this.engine.setOutlined('selection', [])
    this.engine.setOutlined('hover', [])
    this.panelLayer.setSelected([])
    this.panelLayer.flush()
    try {
      return await render()
    } finally {
      if (!this.disposed) {
        if (this.ui.mode === 'edit') this.engine.setHelpers(helpers)
        this.refreshSelectionVisuals()
      }
    }
  }

  // ================================================================ 选择

  select(ids: readonly string[], mode: 'replace' | 'toggle' | 'add' = 'replace'): void {
    let next: string[]
    if (mode === 'replace') next = [...new Set(ids)]
    else if (mode === 'add') next = [...new Set([...this.selection.value, ...ids])]
    else {
      next = [...this.selection.value]
      for (const id of ids) {
        const at = next.indexOf(id)
        if (at >= 0) next.splice(at, 1)
        else next.push(id)
      }
    }
    const same = next.length === this.selection.value.length && next.every((id, i) => id === this.selection.value[i])
    if (!same) this.selection.value = next
    this.refreshSelectionVisuals()
  }

  selectAll(): void {
    this.select(this.doc.value.nodes.filter(node => node.parentId === null && !node.locked).map(node => node.id))
  }

  clearSelection(): void {
    this.select([])
  }

  refreshSelectionVisuals(): void {
    if (this.disposed || this.ui.mode !== 'edit') return
    const objects = this.selection.value.flatMap(id => this.sync.objectFor(id) ?? [])
    this.engine.setOutlined('selection', objects)
    this.panelLayer.setSelected(this.selection.value)
    const ids = topmost(this.doc.value, this.selection.value)
    // 选择工具和放置面板时不显示手柄：手柄会挡住点击。
    const hideGizmo = this.ui.tool === 'select' || !!this.ui.placing
    this.gizmoIds = hideGizmo ? [] : ids.filter(id => !isLockedOrHidden(this.doc.value, id).locked)
    this.gizmo.attach(this.gizmoIds.flatMap(id => this.sync.objectFor(id) ?? []))
    this.gizmo.setVisible(this.gizmoIds.length > 0)
  }

  setTool(tool: EditorTool): void {
    this.ui.tool = tool
    if (tool !== 'select') this.gizmo.setMode(tool)
    this.refreshSelectionVisuals()
  }

  async focusSelection(): Promise<void> {
    const ids = this.selection.value.filter(id => this.sync.objectFor(id))
    if (ids.length) await this.focusNodes(ids)
    else await this.engine.fitAll()
  }

  /** 相机框住这些节点和它们显示着的面板。 */
  private focusNodes(ids: readonly string[]): Promise<boolean> {
    const box = new Box3()
    for (const id of ids) {
      box.expandByObject(this.sync.objectFor(id)!, true)
      this.panelLayer.expandWithPanels(box, id)
    }
    return this.engine.focusBox(box)
  }

  /** 固定视角：透视、顶、前、右，都框住整个场景。 */
  async viewFrom(direction: 'top' | 'front' | 'right' | 'perspective'): Promise<void> {
    const box = new Box3()
    for (const object of this.sync.roots) box.expandByObject(object, true)
    if (box.isEmpty()) box.set(new Vector3(-20, 0, -20), new Vector3(20, 10, 20))
    const directions = {
      top: new Vector3(0, 1, 0.0001),
      front: new Vector3(0, 0.25, 1),
      right: new Vector3(1, 0.25, 0),
      perspective: new Vector3(1, 0.8, 1),
    }
    await this.engine.rig.fitBox(box, { direction: directions[direction], duration: 0.6, padding: 1.05 })
  }

  private applyGizmo(worlds: Matrix4[]): void {
    const ids = this.gizmoIds
    const label = this.ui.tool === 'rotate' ? '旋转' : this.ui.tool === 'scale' ? '缩放' : '移动'
    this.edit(
      label,
      draft => {
        ids.forEach((id, index) => {
          const node = nodeById(draft, id)
          const world = worlds[index]
          if (!node || !world) return
          node.transform = transformOf(worldMatrixOf(draft, node.parentId).invert().multiply(world))
        })
      },
      { coalesceKey: `gizmo:${ids.join(',')}` },
    )
  }

  // ================================================================ 预览

  /** 预览：和 Viewer SDK 看到的一样，点击对象相机聚焦，面板按模板的显示方式出现。 */
  enterPreview(): void {
    if (this.ui.mode === 'preview') return
    this.panels.stopPlacing()
    this.clearSelection()
    this.ui.contextMenu = null
    this.ui.mode = 'preview'
    this.panelLayer.setPlaying(true)
    this.engine.setHelpers({ grid: false, axes: false })
    this.engine.setOutlined('hover', [])
    this.gizmo.setVisible(false)
    this.previewPointers = new ViewerPointerEvents(
      this.canvas,
      this.engine,
      () => this.sync.roots,
      this.twin,
      hit => {
        const object = this.resolver.resolve(hit.target)
        if (!object) return
        const nodeId = targetNodeId(hit.target)
        this.engine.setOutlined('selection', [object])
        this.panelLayer.setClicked(nodeId)
        void this.focusNodes([nodeId])
      },
      () => {
        this.engine.setOutlined('selection', [])
        this.panelLayer.setClicked(null)
      },
    )
  }

  exitPreview(): void {
    if (!this.previewPointers) return
    this.previewPointers.dispose()
    this.previewPointers = null
    this.panelLayer.setPlaying(false)
    this.ui.mode = 'edit'
    this.engine.setOutlined('selection', [])
    this.engine.setHelpers(this.doc.value.settings.helpers)
    this.refreshSelectionVisuals()
  }
}

function dataUrlOf(blob: Blob): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}
