import type { Object3D } from 'three'
import type { ViewerClickHit, ViewerInteractionEvent } from '../../contract/viewerContract'
import type { InteractionTrigger, SceneInteraction } from '../../domain/interactions'
import { twinBindingTargetKey, type TwinBindingTarget } from '../../domain/twin'
import type { TwinEngine } from '../../engine'
import type { BindingTargetResolver } from '../twin/BindingTargetResolver'
import type { TwinRuntimeState } from '../twin/TwinDataRuntime'
import { ViewerPointerEvents } from '../twin/ViewerPointerEvents'

interface InteractionHost {
  resolver: BindingTargetResolver
  select(target: TwinBindingTarget): void
  clear(): void
  focus(target: TwinBindingTarget): Promise<boolean>
  flyToBookmark(id: string): Promise<boolean>
  emit(event: ViewerInteractionEvent): void
  deviceId(target: TwinBindingTarget): string | null
}

/** 每次预览 / 播放独立持有临时显隐和描边，退出时还原。 */
export class InteractionRuntime {
  private readonly pointers: ViewerPointerEvents
  private readonly originals = new Map<Object3D, boolean>()
  private disposed = false
  private hoverRevision = 0

  constructor(
    canvas: HTMLCanvasElement,
    private readonly engine: TwinEngine,
    roots: () => readonly Object3D[],
    twin: TwinRuntimeState,
    private readonly rules: readonly SceneInteraction[],
    private readonly host: InteractionHost,
    click: (hit: ViewerClickHit, autoFocus: boolean) => void,
    blank: () => void,
  ) {
    const hover = rules.some(rule => rule.enabled && rule.trigger.startsWith('hover-'))
    this.pointers = new ViewerPointerEvents(
      canvas,
      engine,
      roots,
      twin,
      hit => {
        const matches = this.match('click', hit)
        click(hit, !matches.some(({ action }) => action.type === 'focus' || action.type === 'fly-to-bookmark'))
        void this.run(matches, hit)
      },
      blank,
      hit => void this.run(this.match('double-click', hit), hit),
      hit => void this.run(this.match('hover-enter', hit), hit),
      hover
        ? hit => {
            this.hoverRevision++
            this.engine.setOutlined('hover', [])
            void this.run(this.match('hover-leave', hit), hit)
          }
        : undefined,
      hit => this.match('double-click', hit).length > 0,
    )
  }

  private match(trigger: InteractionTrigger, hit: ViewerClickHit): SceneInteraction[] {
    const key = twinBindingTargetKey(hit.target)
    return this.rules.filter(rule => {
      if (!rule.enabled || rule.trigger !== trigger) return false
      if (twinBindingTargetKey(rule.source) === key) return true
      const source = this.host.resolver.resolve(rule.source)
      for (let object = this.host.resolver.resolve(hit.target); object; object = object.parent) {
        if (object === source) return true
      }
      return false
    })
  }

  private async run(rules: readonly SceneInteraction[], hit: ViewerClickHit): Promise<void> {
    const hovered: Object3D[] = []
    const revision = this.hoverRevision
    for (const rule of rules) {
      if (this.disposed) return
      const action = rule.action
      const target = action.target ?? rule.source
      switch (action.type) {
        case 'select':
          this.host.select(target)
          break
        case 'clear-selection':
          this.host.clear()
          break
        case 'focus':
          await this.host.focus(target)
          break
        case 'fly-to-bookmark':
          await this.host.flyToBookmark(action.bookmarkId)
          break
        case 'show':
        case 'hide':
        case 'toggle': {
          const object = this.host.resolver.resolve(target)
          if (!object) break
          if (!this.originals.has(object)) this.originals.set(object, object.visible)
          object.visible = action.type === 'toggle' ? !object.visible : action.type === 'show'
          break
        }
        case 'highlight': {
          const object = this.host.resolver.resolve(target)
          if (object && this.hoverRevision === revision) {
            hovered.push(object)
            this.engine.setOutlined('hover', hovered)
          }
          break
        }
        case 'emit-event':
          this.host.emit({
            eventName: action.eventName,
            interactionId: rule.id,
            trigger: rule.trigger,
            sourceTarget: { ...rule.source },
            triggerTarget: { ...hit.target },
            actionTarget: { ...target },
            deviceId: this.host.deviceId(rule.source) ?? hit.device?.id ?? null,
            metadata: JSON.parse(JSON.stringify(action.metadata ?? {})),
          })
          break
      }
    }
  }

  dispose(): void {
    this.disposed = true
    this.pointers.dispose()
    this.engine.setOutlined('hover', [])
    for (const [object, visible] of this.originals) object.visible = visible
    this.originals.clear()
  }
}
