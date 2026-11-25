/**
 * 场景节点对应的三维对象（模型节点除外，模型由 SceneSync 加载）。每种节点一个文件，在 nodes/ 目录：
 *
 *   primitive.ts  基本体        path.ts   路径（能流线）    area.ts   区域
 *   label.ts      文字标签      light.ts  灯光              shared.ts 共用：动画时钟、资源释放、表面图案
 *
 * 每种节点有 create…Object（新建）和 apply…/update…（属性变化时原地更新）两类函数，由 SceneSync 调用。
 */
export { disposeOwned, sceneTime } from './nodes/shared'
export { applyPrimitiveMaterial, createPrimitiveObject, primitiveDefaults, primitiveGeometry } from './nodes/primitive'
export { createPathObject } from './nodes/path'
export { createAreaObject } from './nodes/area'
export { createLabelObject, updateLabelObject } from './nodes/label'
export { createLightObject, updateLightObject } from './nodes/light'
