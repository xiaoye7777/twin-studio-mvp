import type { SceneDocumentV2 } from '../../domain/scene'
import type { BindingTargetResolver } from '../twin/BindingTargetResolver'
import type { TwinRuntimeState } from '../twin/TwinDataRuntime'
import { EffectRuntime, type EffectHost } from './EffectRuntime'
import { VisualRuleRuntime } from './VisualRuleRuntime'

/** Renderer and rule subscription owned together by one editor or Viewer scene. */
export class SceneEffects {
  private readonly effects: EffectRuntime
  private readonly rules: VisualRuleRuntime

  constructor(
    host: EffectHost,
    state: TwinRuntimeState,
    resolver: BindingTargetResolver,
    document: () => SceneDocumentV2,
    revision?: () => number,
  ) {
    this.effects = new EffectRuntime(host, resolver)
    this.rules = new VisualRuleRuntime(
      this.effects,
      state,
      resolver,
      () => document().visualRules ?? [],
      () => document().effects ?? [],
      revision,
    )
  }

  dispose(): void {
    this.rules.dispose()
    this.effects.dispose()
  }
}
