import type { SceneDocumentV2 } from '../../domain/scene'
import type { BindingTargetResolver } from '../twin/BindingTargetResolver'
import { formatRuntimeValue } from '../twin/formatValue'
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
    this.effects.dataProvider = (target, variables) => {
      const binding = state.getBindingByTarget(target)
      if (!binding) return null
      const shown = binding.variables.filter(v => !variables?.length || variables.includes(v.key))
      return {
        title: binding.device.name || binding.device.id,
        rows: shown
          .slice(0, 8)
          .map(
            v => `${v.name || v.key}\t${formatRuntimeValue(state.getRuntimeValue(binding.id, v.key)?.value, v.unit)}`,
          ),
      }
    }
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
