import { createEffectParameters, type EffectKind } from '../effects'
import type { EffectTemplate } from './index'

function preset(id: string, name: string, kinds: EffectKind[], color: string, category: string): EffectTemplate {
  return {
    version: 1,
    id: `builtin:${id}`,
    origin: 'builtin',
    name,
    description: '内置只读方案，可复制为自定义模板',
    category,
    effects: kinds.map((kind, index) => ({
      id: `${id}:${index}`,
      kind,
      target: { mode: 'current-target' },
      parameters: { ...createEffectParameters(), color, text: name },
    })),
  }
}
export function getBuiltinTemplates(): EffectTemplate[] {
  return [
    preset('critical', '严重告警', ['box-glow', 'ripple', 'outline', 'floating-label'], '#ff3030', '告警'),
    preset('warning', '高温预警', ['box-glow', 'floating-label'], '#ff9900', '告警'),
    preset('offline', '设备离线', ['box-glow', 'floating-label'], '#8a8f98', '状态'),
    preset('running', '运行中', ['beam'], '#3ad18a', '状态'),
    preset('attention', '重点关注', ['icon-marker', 'outline'], '#ffb020', '高亮'),
    preset('selected', '设备选中', ['outline'], '#ffb020', '高亮'),
  ]
}
