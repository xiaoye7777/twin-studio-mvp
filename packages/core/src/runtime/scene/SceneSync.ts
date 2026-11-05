/*
 * SceneSync：把场景文档变成三维对象，并在文档变化时只更新变了的部分。编辑器和 Viewer 都用它。
 *
 * 用法：mount(doc) 第一次建好场景；之后每次文档变化调用 update(newDoc)（排队串行执行，不用等待）。
 *
 * 一次更新（apply）分五步：
 *   1. 新节点、类型变了或换了模型文件的节点：新建三维对象（模型要异步加载）
 *   2. 删除的节点、要重建的节点：从场景里移除旧对象
 *   3. 内容变了的节点（引用和上次不同）：原地更新名字、显隐和变换
 *   4. 父子关系变了的节点：重新挂到新的父对象下；新的顶层对象最后交给引擎（引擎此时为它建拾取索引）
 *   5. 场景设置（天空、光照、后期）变了就更新
 *
 * 「变没变」只看对象引用：DocumentStore 产出的新文档里，没改的节点和旧文档是同一个对象。
 */
import { Group, type Object3D } from 'three'
import { applySceneTransform, type SceneDocumentV2, type SceneNodeV2 } from '../../domain/scene'
import type { AssetRepository } from '../../infrastructure/assets/AssetRepository'
import type { TwinEngine } from '../../engine/TwinEngine'
import { ImportedAssetResourceRegistry } from './ImportedAssetResourceRegistry'
import { setEditorMetadata } from './objectMetadata'

/** 渲染场景文档要用到的引擎能力；TwinEngine 满足它。 */
export type SceneHost = Pick<
  TwinEngine,
  'addObject' | 'removeObject' | 'loadGLTFModel' | 'getScene' | 'applySettings' | 'setHelpers' | 'flyTo'
> & { readonly environmentStatus: string }

export interface SceneSyncOptions {
  /** 编辑器要显示辅助线（网格、坐标轴）。 */
  editor?: boolean
}

export interface SceneSyncResult {
  warnings: string[]
}

interface MountedNode {
  /** 上次应用到 object 的节点；还没应用过是 null。 */
  node: SceneNodeV2 | null
  object: Object3D
}

function needsRebuild(before: SceneNodeV2, after: SceneNodeV2): boolean {
  return (
    before.kind !== after.kind ||
    (before.kind === 'model' && after.kind === 'model' && before.model.assetId !== after.model.assetId)
  )
}

export class SceneSync {
  private document: SceneDocumentV2 | null = null
  private readonly mounted = new Map<string, MountedNode>()
  /** 每个节点挂在哪：父节点 id，顶层是 null。 */
  private readonly attachedTo = new Map<string, string | null>()
  /** 交给引擎的顶层对象。 */
  private readonly topLevel = new Set<Object3D>()
  /**
   * 更新期间因结构变化而暂时从引擎取下的顶层对象。引擎在添加时才建拾取索引，
   * 所以结构要变的对象先取下，改完再加回去。
   */
  private readonly suspended = new Set<Object3D>()
  /** 加载失败的模型节点（节点 id → 资产 id）：资产没变就不重试。 */
  private readonly failed = new Map<string, string>()
  private queue: Promise<unknown> = Promise.resolve()
  private started = false
  private disposed = false

  constructor(
    private readonly host: SceneHost,
    private readonly assets: AssetRepository,
    readonly resources = new ImportedAssetResourceRegistry(),
    private readonly options: SceneSyncOptions = {},
  ) {}

  get environmentStatus(): string {
    return this.host.environmentStatus
  }

  get current(): SceneDocumentV2 | null {
    return this.document
  }

  /** 按文档顺序的顶层对象。 */
  get roots(): Object3D[] {
    return (this.document?.nodes ?? [])
      .filter(node => node.parentId === null)
      .flatMap(node => this.mounted.get(node.id)?.object ?? [])
  }

  objectFor(nodeId: string): Object3D | null {
    return this.mounted.get(nodeId)?.object ?? null
  }

  /** 对象属于哪个文档节点（从模型内部的网格往上找）。 */
  nodeIdOf(object: Object3D): string | null {
    for (let current: Object3D | null = object; current; current = current.parent) {
      const id: unknown = current.userData.sceneNodeId
      if (typeof id === 'string' && this.mounted.get(id)?.object === current) return id
    }
    return null
  }

  /** 建好场景，并把相机移到打开视角。 */
  async mount(document: SceneDocumentV2): Promise<SceneSyncResult> {
    if (this.started) throw new Error('SceneSync is already mounted')
    this.started = true
    const result = await this.update(document)
    if (document.cameraView) await this.host.flyTo(document.cameraView, 0)
    this.assertActive()
    return result
  }

  update(document: SceneDocumentV2): Promise<SceneSyncResult> {
    const task = this.queue.then(() => this.apply(document))
    this.queue = task.catch(() => {})
    return task
  }

  /** 所有排队的更新都完成后 resolve。 */
  settled(): Promise<void> {
    return this.queue.then(() => {})
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.resources.dispose()
    this.mounted.clear()
    this.attachedTo.clear()
    this.topLevel.clear()
  }

  private assertActive(): void {
    if (this.disposed) throw new DOMException('Scene loading cancelled', 'AbortError')
  }

  private async apply(next: SceneDocumentV2): Promise<SceneSyncResult> {
    this.assertActive()
    const previous = this.document
    const warnings: string[] = []
    const nextIds = new Set(next.nodes.map(node => node.id))

    // 1. 新节点、类型或模型文件变了的节点：建对象。
    const toBuild = next.nodes.filter(node => {
      const current = this.mounted.get(node.id)
      if (current) return needsRebuild(current.node!, node)
      return !(node.kind === 'model' && this.failed.get(node.id) === node.model.assetId)
    })
    const built = await Promise.all(toBuild.map(node => this.build(node, warnings)))
    this.assertActive()

    try {
      // 2. 移除删掉的和要重建的节点。
      const rebuilt = new Set(toBuild.map(node => node.id))
      for (const id of [...this.mounted.keys()]) {
        if (!nextIds.has(id) || rebuilt.has(id)) this.remove(id)
      }
      for (const id of this.failed.keys()) if (!nextIds.has(id)) this.failed.delete(id)
      toBuild.forEach((node, index) => {
        const entry = built[index]
        if (entry) this.mounted.set(node.id, entry)
      })

      // 3. 更新内容变了的节点。
      for (const node of next.nodes) {
        const entry = this.mounted.get(node.id)
        if (!entry || entry.node === node) continue
        entry.object.name = node.name
        entry.object.visible = node.visible
        applySceneTransform(entry.object, node.transform)
        entry.node = node
      }

      // 4. 挂到父节点下；新的顶层对象最后交给引擎，让它为完整的树建索引。
      const added: Object3D[] = []
      for (const node of next.nodes) {
        const entry = this.mounted.get(node.id)
        if (!entry || this.attachedTo.get(node.id) === node.parentId) continue
        if (this.attachedTo.has(node.id)) this.detach(entry.object)
        if (node.parentId === null) added.push(entry.object)
        else {
          const parent = this.mounted.get(node.parentId)!.object
          this.suspend(parent)
          parent.add(entry.object)
        }
        this.attachedTo.set(node.id, node.parentId)
      }
      for (const object of added) {
        if (!this.host.addObject(object)) throw new Error(`无法加载场景对象 ${object.name}`)
        this.topLevel.add(object)
      }
      this.sortChildren(next)
    } finally {
      for (const root of this.suspended) if (this.topLevel.has(root)) this.host.addObject(root)
      this.suspended.clear()
    }

    // 5. 场景设置。打开视角只在 mount 时用：它不是实时状态。
    this.document = next
    if (next.settings !== previous?.settings) {
      try {
        this.host.setHelpers(this.options.editor ? next.settings.helpers : { grid: false, axes: false })
        await this.host.applySettings(next.settings, { hdrUrl: await this.hdrUrl(next) })
      } catch (error) {
        this.assertActive()
        warnings.push(error instanceof Error ? error.message : String(error))
      }
    }
    this.assertActive()
    return { warnings }
  }

  private async hdrUrl(document: SceneDocumentV2): Promise<string | null> {
    const id = document.settings.sky.mode === 'hdr' ? document.settings.sky.hdrAssetId : null
    if (!id) return null
    const asset = await this.assets.get(id)
    if (!asset || asset.assetType !== 'environment') throw new Error('环境贴图资产不存在或类型不正确')
    return this.resources.getOrCreate(asset).objectUrl
  }

  /** 同级顺序和文档一致（也是场景树的显示顺序）。 */
  private sortChildren(document: SceneDocumentV2): void {
    const order = new Map(document.nodes.map((node, index) => [node.id, index]))
    for (const entry of this.mounted.values()) {
      if (entry.node?.kind !== 'group') continue
      entry.object.children.sort(
        (a, b) =>
          (order.get(a.userData.sceneNodeId as string) ?? 1e9) - (order.get(b.userData.sceneNodeId as string) ?? 1e9),
      )
    }
  }

  /** 为节点创建对象；模型加载失败时返回 null 并记一条警告，场景其余部分照常打开。 */
  private async build(node: SceneNodeV2, warnings: string[]): Promise<MountedNode | null> {
    if (node.kind === 'group') return { node: null, object: this.tag(new Group(), node) }
    try {
      const asset = await this.assets.get(node.model.assetId)
      this.assertActive()
      if (!asset) throw new Error(`缺少资产 ${node.model.assetId}`)
      const model = await this.host.loadGLTFModel(this.resources.getOrCreate(asset).objectUrl)
      this.assertActive()
      this.failed.delete(node.id)
      setEditorMetadata(model, {
        kind: 'assetInstance',
        assetRoot: true,
        assetId: node.model.assetId,
        instanceId: node.id,
      })
      return { node: null, object: this.tag(model, node) }
    } catch (error) {
      this.assertActive()
      this.failed.set(node.id, node.model.assetId)
      warnings.push(`${node.name || node.id}：${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  private tag(object: Object3D, node: SceneNodeV2): Object3D {
    object.userData.sceneNodeId = node.id
    object.userData.nodeKind = node.kind
    return object
  }

  private remove(id: string): void {
    const entry = this.mounted.get(id)!
    if (this.attachedTo.has(id)) this.detach(entry.object)
    this.mounted.delete(id)
    this.attachedTo.delete(id)
    // 模型和引擎的模型缓存共用几何体，不在这里释放；分组自己没有资源。作为节点的子对象先摘下来。
    if (entry.node?.kind === 'group') {
      for (const child of [...entry.object.children]) if (child.userData.sceneNodeId) child.removeFromParent()
    }
  }

  private detach(object: Object3D): void {
    if (this.topLevel.delete(object)) {
      if (!this.suspended.delete(object)) this.host.removeObject(object)
    } else {
      this.suspend(object)
      object.removeFromParent()
    }
  }

  /** 把包含 object 的顶层树暂时从引擎取下，直到本次更新结束。 */
  private suspend(object: Object3D): void {
    for (let current: Object3D | null = object; current; current = current.parent) {
      if (!this.topLevel.has(current)) continue
      if (!this.suspended.has(current)) {
        this.host.removeObject(current)
        this.suspended.add(current)
      }
      return
    }
  }
}
