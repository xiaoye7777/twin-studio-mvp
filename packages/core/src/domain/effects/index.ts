import { z } from 'zod'
import { nonEmptyString } from '../schemaHelpers'
import { TwinBindingTargetSchema, type TwinBindingTarget } from '../twin'

export const EffectKindSchema = z.enum([
  'box-glow',
  'ground-pulse',
  'outline',
  'child-highlight',
  'floating-label',
  'fence',
  'radar',
  'ripple',
  'beam',
  'data-label',
  'icon-marker',
])

export const EffectParametersSchema = z.object({
  color: z.string().regex(/^#[0-9a-f]{6}$/i, { message: '颜色必须是 #RRGGBB 格式' }),
  opacity: z.number().min(0).max(1),
  speed: z.number().min(0).max(10),
  padding: z.number().min(0).max(100),
  text: z.string().max(200),
  /** Metres; fences, beams and markers. */
  height: z.number().min(0).max(500).optional(),
  /** Size multiplier for labels and markers. */
  scale: z.number().min(0.1).max(10).optional(),
  /** Data labels: which variables to show (all when absent). */
  variables: z.array(z.string().max(64)).max(12).optional(),
})

export const EffectInstanceSchema = z.object({
  id: nonEmptyString,
  kind: EffectKindSchema,
  target: TwinBindingTargetSchema,
  parameters: EffectParametersSchema,
  /** Provenance only: never resolved by the runtime or automatically synchronized. */
  sourceTemplateId: nonEmptyString.optional(),
})

export type EffectKind = z.infer<typeof EffectKindSchema>
export type EffectParameters = z.infer<typeof EffectParametersSchema>
export type EffectInstance = z.infer<typeof EffectInstanceSchema>
export interface EffectDefinition {
  kind: EffectKind
  name: string
  category: '告警' | '高亮' | '标注' | '氛围'
  fields: readonly (keyof EffectParameters)[]
  description: string
}
export const effectDefinitions: readonly EffectDefinition[] = [
  {
    kind: 'box-glow',
    name: '呼吸光框',
    category: '告警',
    fields: ['color', 'opacity', 'speed', 'padding'],
    description: '包围盒线框随呼吸明暗变化',
  },
  {
    kind: 'ground-pulse',
    name: '地面脉冲',
    category: '告警',
    fields: ['color', 'opacity', 'speed', 'padding'],
    description: '对象底部向外扩散的方形光圈',
  },
  {
    kind: 'ripple',
    name: '扩散波纹',
    category: '告警',
    fields: ['color', 'opacity', 'speed', 'padding'],
    description: '多重圆形波纹从对象底部扩散',
  },
  {
    kind: 'radar',
    name: '雷达扫描',
    category: '氛围',
    fields: ['color', 'opacity', 'speed', 'padding'],
    description: '地面扇形扫描光',
  },
  {
    kind: 'fence',
    name: '电子围栏',
    category: '氛围',
    fields: ['color', 'opacity', 'speed', 'padding', 'height'],
    description: '围绕对象的渐变光墙',
  },
  {
    kind: 'beam',
    name: '光柱',
    category: '氛围',
    fields: ['color', 'opacity', 'speed', 'height'],
    description: '从对象顶部升起的光柱',
  },
  { kind: 'outline', name: '描边', category: '高亮', fields: [], description: '对象轮廓发光描边' },
  {
    kind: 'child-highlight',
    name: '材质高亮',
    category: '高亮',
    fields: ['color', 'opacity'],
    description: '对象自身发光着色',
  },
  {
    kind: 'floating-label',
    name: '悬浮标注',
    category: '标注',
    fields: ['color', 'opacity', 'padding', 'text', 'scale'],
    description: '对象上方的文字标签',
  },
  {
    kind: 'data-label',
    name: '数据标牌',
    category: '标注',
    fields: ['color', 'opacity', 'padding', 'text', 'scale', 'variables'],
    description: '显示绑定设备的实时数据',
  },
  {
    kind: 'icon-marker',
    name: '定位图标',
    category: '标注',
    fields: ['color', 'speed', 'text', 'scale', 'height'],
    description: '浮动的定位标记',
  },
]

export function effectDefinition(kind: EffectKind): EffectDefinition {
  return effectDefinitions.find(item => item.kind === kind)!
}
export function createEffect(kind: EffectKind, target: TwinBindingTarget): EffectInstance {
  const parameters = createEffectParameters()
  if (kind === 'fence') Object.assign(parameters, { color: '#3ad1c6', opacity: 0.7, height: 4, padding: 1 })
  if (kind === 'beam') Object.assign(parameters, { color: '#4fc3ff', opacity: 0.75, height: 30 })
  if (kind === 'radar') Object.assign(parameters, { color: '#42e6a4', opacity: 0.6, padding: 4 })
  if (kind === 'ripple') Object.assign(parameters, { color: '#ff7a45', opacity: 0.8, padding: 2 })
  if (kind === 'data-label') Object.assign(parameters, { color: '#7ee0ff', opacity: 0.92, text: '', scale: 1 })
  if (kind === 'icon-marker') Object.assign(parameters, { color: '#ffb020', text: '', scale: 1, height: 2 })
  return { id: `effect_${crypto.randomUUID()}`, kind, target: { ...target }, parameters }
}
export function createEffectParameters(): EffectParameters {
  return { color: '#ffb020', opacity: 0.65, speed: 1, padding: 0.2, text: '设备标注' }
}
export function cloneEffects(effects: readonly EffectInstance[]): EffectInstance[] {
  return effects.map(effect => ({
    ...effect,
    target: { ...effect.target },
    parameters: {
      ...effect.parameters,
      ...(effect.parameters.variables ? { variables: [...effect.parameters.variables] } : {}),
    },
  }))
}
export function isEffectInstance(value: unknown): value is EffectInstance {
  return EffectInstanceSchema.safeParse(value).success
}
export function isEffectParameters(value: unknown): value is EffectParameters {
  return EffectParametersSchema.safeParse(value).success
}
