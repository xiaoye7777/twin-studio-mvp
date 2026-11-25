import { z } from 'zod'
import {
  createEffect,
  createEffectParameters,
  EffectKindSchema,
  EffectParametersSchema,
  type EffectInstance,
  type EffectKind,
} from '../effects'
import { nonEmptyString, trimmedString, uniqueBy } from '../schemaHelpers'
import { twinBindingTargetKey, type TwinBindingTarget } from '../twin'

/** Relative selectors only: strict objects so a template can never carry a concrete scene identity. */
export const RelativeEffectTargetSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('current-target') }),
  z.strictObject({ mode: z.literal('root-instance') }),
  z.strictObject({ mode: z.literal('asset-node'), assetNodeId: trimmedString }),
])

export const TemplateEffectSchema = z.object({
  id: nonEmptyString,
  kind: EffectKindSchema,
  parameters: EffectParametersSchema,
  target: RelativeEffectTargetSchema,
})

export const EffectTemplateSchema = z.object({
  version: z.literal(1),
  id: nonEmptyString,
  origin: z.enum(['builtin', 'local']),
  name: trimmedString.pipe(z.string().max(80)),
  description: z.string().max(500),
  category: z.string().max(40),
  effects: z
    .array(TemplateEffectSchema)
    .min(1)
    .max(50)
    .superRefine(uniqueBy(effect => effect.id, '特效 ID')),
})

export type RelativeEffectTarget = z.infer<typeof RelativeEffectTargetSchema>
export type TemplateEffect = z.infer<typeof TemplateEffectSchema>
export type EffectTemplate = z.infer<typeof EffectTemplateSchema>

export function createTemplateEffect(kind: EffectKind): TemplateEffect {
  return { id: crypto.randomUUID(), kind, parameters: createEffectParameters(), target: { mode: 'current-target' } }
}
export function cloneTemplate(template: EffectTemplate): EffectTemplate {
  return {
    ...template,
    effects: template.effects.map(e => ({ ...e, target: { ...e.target }, parameters: { ...e.parameters } })),
  }
}
export function isEffectTemplate(value: unknown): value is EffectTemplate {
  return EffectTemplateSchema.safeParse(value).success
}

/** Pure expansion, reusable by a future rule layer; no store, Three, or runtime dependency. */
export function instantiateTemplate(
  template: EffectTemplate,
  current: TwinBindingTarget,
  targetExists: (target: TwinBindingTarget) => boolean,
): EffectInstance[] {
  if (!isEffectTemplate(template)) throw new Error('模板配置无效：请填写名称并检查特效参数和相对目标')
  const keys = new Set<string>()
  return template.effects.map(atom => {
    let target: TwinBindingTarget
    if (atom.target.mode === 'current-target') target = { ...current }
    else {
      if (current.type === 'primitive' || current.type === 'node')
        throw new Error('此模板需要模型实例，不能应用到其他类型的对象')
      target =
        atom.target.mode === 'root-instance'
          ? { type: 'asset-instance', instanceId: current.instanceId }
          : { type: 'asset-node', instanceId: current.instanceId, assetNodeId: atom.target.assetNodeId }
    }
    if (!targetExists(target))
      throw new Error(
        `模板目标不存在：${target.type === 'asset-node' ? target.assetNodeId : target.type}，未应用任何特效`,
      )
    const key = `${twinBindingTargetKey(target)}|${atom.kind}`
    if (keys.has(key)) throw new Error('模板中存在解析到同一目标的重复类型特效，请调整目标或移除重复项')
    keys.add(key)
    return { ...createEffect(atom.kind, target), parameters: { ...atom.parameters }, sourceTemplateId: template.id }
  })
}
