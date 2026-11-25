/*
 * 灯光：点光源或聚光灯。类型改变时换一个新的灯光对象，其余属性原地更新。
 */
import { Group, type Object3D, PointLight, SpotLight } from 'three'
import type { LightNodeV2 } from '../../../domain/scene'

export function createLightObject(node: LightNodeV2): Object3D {
  const group = new Group()
  updateLightObject(group, node)
  return group
}

export function updateLightObject(group: Object3D, node: LightNodeV2): void {
  const { type, color, intensity, distance, angle, castShadow } = node.light
  let light = group.children.find(child => child instanceof PointLight || child instanceof SpotLight) as
    PointLight | SpotLight | undefined
  const wanted = type === 'spot' ? SpotLight : PointLight
  if (light && !(light instanceof wanted)) {
    light.removeFromParent()
    light.dispose()
    light = undefined
  }
  if (!light) {
    light = type === 'spot' ? new SpotLight() : new PointLight()
    if (light instanceof SpotLight) {
      light.target.position.set(0, -1, 0)
      light.add(light.target)
      light.penumbra = 0.4
    }
    light.decay = 2
    group.add(light)
  }
  light.color.set(color)
  light.intensity = intensity
  light.distance = distance
  if (light instanceof SpotLight) light.angle = (angle * Math.PI) / 180
  light.castShadow = castShadow
  light.shadow.mapSize.set(512, 512)
}
