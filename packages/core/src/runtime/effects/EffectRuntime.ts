/*
 * 特效运行时：把特效实例（发光、描边、数据标牌、告警标牌、扫描…）画到目标对象上。
 * 特效配置是纯数据；three.js 资源都归这里管理和释放。具体每种特效长什么样在 effectVisuals.ts。
 */
import { Box3, Color, Group, Mesh, Vector3 } from 'three'
import type { Material, Object3D } from 'three'
import { cloneEffects, isEffectInstance, type EffectInstance } from '../../domain/effects'
import type { TwinBindingTarget } from '../../domain/twin'
import type { OutlineChannel } from '../../engine/RenderPipeline'
import type { BindingTargetResolver } from '../twin/BindingTargetResolver'
import { createEffectVisual, type EffectDataLines, type EffectVisual, sceneTime } from './effectVisuals'

/** What effects need from the engine. */
export interface EffectHost {
  readonly overlay: Object3D
  setOutlined(channel: OutlineChannel, objects: readonly Object3D[]): void
  onFrame(listener: (delta: number, elapsed: number) => void): () => void
}

interface Visual {
  instance: EffectInstance
  signature: string
  target: Object3D
  visual: EffectVisual
}
interface IsolatedMaterial {
  mesh: Mesh
  original: Material | Material[]
  clones: Material[]
  signature: string
}

/** Whether the mesh still wears the highlight copies (nothing replaced its material since). */
const wears = (record: IsolatedMaterial): boolean =>
  record.mesh.material === (Array.isArray(record.original) ? record.clones : record.clones[0])

let activeLoops = 0
export function getEffectDiagnostics(): { activeLoops: number } {
  return { activeLoops }
}

/** Shared atomic effects. Configuration is pure data; Three resources belong here. */
export class EffectRuntime {
  readonly root = new Group()
  private instances: EffectInstance[] = []
  private transient = new Map<string, EffectInstance[]>()
  private visuals: Visual[] = []
  private materials: IsolatedMaterial[] = []
  private outlined: Object3D[] = []
  private stopFrame: (() => void) | null = null
  private disposed = false
  private lastDataRefresh = 0
  readonly unresolved = new Set<string>()
  private readonly bounds = new Box3()
  private readonly size = new Vector3()
  private readonly center = new Vector3()
  /** Supplies live device data for data labels. */
  dataProvider: ((target: TwinBindingTarget, variables?: readonly string[]) => EffectDataLines | null) | null = null

  constructor(
    private readonly host: EffectHost,
    private readonly resolver: BindingTargetResolver,
  ) {
    this.root.name = 'Runtime Effects'
    this.root.userData.editorInternal = true
    this.root.userData.runtimeEffect = true
    host.overlay.add(this.root)
  }

  setEffects(effects: readonly EffectInstance[]): void {
    if (this.disposed) return
    if (!effects.every(isEffectInstance)) throw new Error('Invalid effect configuration')
    this.instances = cloneEffects(effects)
    this.reconcile()
  }
  setTransientEffects(owner: string, effects: readonly EffectInstance[]): void {
    if (this.disposed || !owner) return
    if (!effects.every(isEffectInstance)) throw new Error('Invalid transient effect configuration')
    if (effects.length) this.transient.set(owner, cloneEffects(effects))
    else this.transient.delete(owner)
    this.reconcile()
  }
  clearTransientEffects(owner: string): void {
    if (this.disposed || !this.transient.delete(owner)) return
    this.reconcile()
  }
  /** Re-resolves targets (call after the scene's objects changed). */
  refresh(): void {
    if (!this.disposed) this.reconcile()
  }

  private reconcile(): void {
    const rendered = [...this.instances, ...[...this.transient.values()].flat()]
    this.unresolved.clear()
    const oldVisuals = new Map(this.visuals.map(visual => [visual.instance.id, visual]))
    const visuals: Visual[] = []
    const outlined: Object3D[] = []
    const highlights: Array<{ target: Object3D; instance: EffectInstance }> = []
    for (const instance of rendered) {
      const target = this.resolver.resolve(instance.target)
      if (!target) {
        this.unresolved.add(instance.id)
        continue
      }
      if (instance.kind === 'outline') outlined.push(target)
      else if (instance.kind === 'child-highlight') highlights.push({ target, instance })
      else {
        const signature = JSON.stringify(instance)
        const previous = oldVisuals.get(instance.id)
        if (previous && previous.target === target && previous.signature === signature) {
          visuals.push(previous)
          oldVisuals.delete(instance.id)
          continue
        }
        const visual = createEffectVisual(instance)
        if (!visual) continue
        this.root.add(visual.object)
        visuals.push({ instance, signature, target, visual })
      }
    }
    oldVisuals.forEach(({ visual }) => {
      visual.object.removeFromParent()
      visual.dispose()
    })
    this.visuals = visuals
    this.outlined = outlined
    this.host.setOutlined('effect', outlined)
    this.applyHighlights(highlights)
    this.lastDataRefresh = 0
    this.update()
    if (this.visuals.length && !this.stopFrame) {
      activeLoops += 1
      this.stopFrame = this.host.onFrame(() => this.update())
    }
    if (!this.visuals.length && this.stopFrame) {
      this.stopFrame()
      this.stopFrame = null
      activeLoops--
    }
  }

  getSnapshot(): EffectInstance[] {
    return cloneEffects(this.instances)
  }
  getDiagnostics(): {
    effects: number
    transientOwners: number
    helpers: number
    isolatedMeshes: number
    outlined: number
    unresolved: string[]
  } {
    return {
      effects: this.instances.length,
      transientOwners: this.transient.size,
      helpers: this.visuals.length,
      isolatedMeshes: this.materials.length,
      outlined: this.outlined.length,
      unresolved: [...this.unresolved],
    }
  }

  private applyHighlights(effects: Array<{ target: Object3D; instance: EffectInstance }>): void {
    const depth = (node: Object3D): number => {
      let value = 0
      for (let p = node.parent; p; p = p.parent) value++
      return value
    }
    // More-specific child wins; a deterministic single clone per mesh avoids stacked restoration bugs.
    effects.sort((a, b) => depth(a.target) - depth(b.target))
    const byMesh = new Map<Mesh, EffectInstance>()
    for (const effect of effects)
      effect.target.traverse(node => {
        if (node instanceof Mesh && !node.userData.editorInternal) byMesh.set(node, effect.instance)
      })
    const signature = (effect: EffectInstance) => JSON.stringify([effect.parameters.color, effect.parameters.opacity])
    this.materials = this.materials.filter(record => {
      // The scene may have given the mesh a new material since (a part's material override); then the
      // highlight is re-derived from that one instead of restoring the old original.
      const worn = wears(record)
      const desired = byMesh.get(record.mesh)
      if (worn && desired && signature(desired) === record.signature) {
        byMesh.delete(record.mesh)
        return true
      }
      if (worn) record.mesh.material = record.original
      record.clones.forEach(material => material.dispose())
      return false
    })
    for (const [mesh, effect] of byMesh) {
      const original = mesh.material
      const clones = (Array.isArray(original) ? original : [original]).map(material => {
        const clone = material.clone()
        if ('emissive' in clone && clone.emissive instanceof Color) {
          clone.emissive.set(effect.parameters.color)
          if ('emissiveIntensity' in clone) clone.emissiveIntensity = effect.parameters.opacity * 2
        } else if ('color' in clone && clone.color instanceof Color)
          clone.color.lerp(new Color(effect.parameters.color), effect.parameters.opacity)
        return clone
      })
      mesh.material = Array.isArray(original) ? clones : clones[0]!
      this.materials.push({ mesh, original, clones, signature: signature(effect) })
    }
  }

  private update(): void {
    const time = sceneTime()
    // Device values change at most a few times a second; labels redraw only when their text changes.
    const refreshData = time - this.lastDataRefresh > 0.25
    if (refreshData) this.lastDataRefresh = time
    for (const entry of this.visuals) {
      const { target, visual, instance } = entry
      let visible = true
      for (let node: Object3D | null = target; node; node = node.parent) if (!node.visible) visible = false
      target.updateWorldMatrix(true, true)
      this.bounds.setFromObject(target, true)
      visual.object.visible = visible && !this.bounds.isEmpty()
      if (!visual.object.visible) continue
      this.bounds.getSize(this.size).max(new Vector3(0.01, 0.01, 0.01))
      this.bounds.getCenter(this.center)
      const data =
        instance.kind === 'data-label' && refreshData && this.dataProvider
          ? this.dataProvider(instance.target, instance.parameters.variables)
          : null
      if (instance.kind === 'data-label' && !refreshData) continue
      visual.update({ bounds: this.bounds, size: this.size, center: this.center, time, data })
    }
  }

  private clear(): void {
    if (this.stopFrame) {
      this.stopFrame()
      this.stopFrame = null
      activeLoops -= 1
    }
    this.visuals.forEach(({ visual }) => {
      visual.object.removeFromParent()
      visual.dispose()
    })
    this.visuals = []
    for (const record of this.materials) {
      if (wears(record)) record.mesh.material = record.original
      record.clones.forEach(material => material.dispose())
    }
    this.materials = []
    this.host.setOutlined('effect', [])
    this.outlined = []
    this.unresolved.clear()
  }
  dispose(): void {
    if (this.disposed) return
    this.clear()
    this.instances = []
    this.transient.clear()
    this.root.removeFromParent()
    this.disposed = true
  }
}
