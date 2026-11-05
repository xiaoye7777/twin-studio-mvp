/*
 * 让场景里的面板保持最新：文档变了、数值变了、选中变了就重画变化的面板，并决定每个面板现在显不显示。
 * 编辑器和 Viewer 各有一个。每帧只比较版本号，没变化时不做任何事。
 */
import type { Box3, Object3D } from 'three'
import { ancestorIds } from '../../document/sceneOps'
import type { PanelTemplate } from '../../domain/panels'
import type { PanelNodeV2, SceneDocumentV2 } from '../../domain/scene'
import { PanelObject } from './PanelObject'
import { type PanelDataReader, resolvePanel } from './resolvePanel'

export interface PanelLayerData extends PanelDataReader {
  readonly runtimeRevision: number
  readonly bindingRevision: number
}

export class PanelLayer {
  private document: SceneDocumentV2 | null = null
  private selected = new Set<string>()
  private enabled = true
  /** 预览和 Viewer 里按模板的显示方式走；编辑时所有面板都显示。 */
  private playing = false
  private clicked: string | null = null
  private dirty = true
  private revision = -1
  private readonly stopFrame: () => void

  constructor(
    engine: { onFrame(listener: () => void): () => void },
    private readonly objectFor: (nodeId: string) => Object3D | null,
    private readonly data: PanelLayerData,
  ) {
    this.stopFrame = engine.onFrame(() => this.tick())
  }

  setDocument(document: SceneDocumentV2): void {
    this.document = document
    this.dirty = true
  }

  setSelected(ids: readonly string[]): void {
    this.selected = new Set(ids)
    this.dirty = true
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.dirty = true
  }

  setPlaying(playing: boolean): void {
    this.playing = playing
    this.clicked = null
    this.dirty = true
  }

  /** 预览和 Viewer 里点到了哪个节点；点到空白传 null。 */
  setClicked(nodeId: string | null): void {
    this.clicked = nodeId
    this.dirty = true
  }

  /** 立刻重画（截图、算范围前用）。 */
  flush(): void {
    this.dirty = false
    this.refresh()
  }

  /**
   * 把和这个节点有关、正显示着的面板算进范围：它自己、它下面的、关联它的。
   * 聚焦对象时要用：面板在对象上方，不算进去的话相机一靠近，面板就被切到画面外了。
   */
  expandWithPanels(box: Box3, nodeId: string): void {
    const document = this.document
    if (!document) return
    this.flush()
    const chain = [nodeId, ...ancestorIds(document, nodeId)]
    for (const node of document.nodes) {
      if (node.kind !== 'panel') continue
      const related =
        node.id === nodeId ||
        node.parentId === nodeId ||
        (!!node.panel.targetNodeId && chain.includes(node.panel.targetNodeId))
      const object = this.objectFor(node.id)
      if (related && object instanceof PanelObject && object.visible && object.sprite.visible) object.expandBox(box)
    }
  }

  private tick(): void {
    const revision = this.data.runtimeRevision + this.data.bindingRevision
    if (!this.dirty && revision === this.revision) return
    this.dirty = false
    this.revision = revision
    this.refresh()
  }

  private refresh(): void {
    const document = this.document
    if (!document) return
    for (const node of document.nodes) {
      if (node.kind !== 'panel') continue
      const object = this.objectFor(node.id)
      if (!(object instanceof PanelObject)) continue
      const group = document.nodes.find(item => item.id === node.parentId)
      const shown = group?.kind === 'panel-group' && this.isShown(document, node, group.template)
      object.sprite.visible = shown
      const view = shown ? resolvePanel(document, this.data, node.id) : null
      if (view) object.render(view, this.selected.has(node.id))
    }
  }

  private isShown(document: SceneDocumentV2, node: PanelNodeV2, template: PanelTemplate): boolean {
    if (!this.enabled) return false
    if (!this.playing || template.trigger === 'always') return true
    const clicked = this.clicked
    if (!clicked) return false
    if (clicked === node.id) return true
    const target = node.panel.targetNodeId
    return !!target && (target === clicked || ancestorIds(document, clicked).includes(target))
  }

  dispose(): void {
    this.stopFrame()
  }
}
