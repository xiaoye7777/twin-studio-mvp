// 编译期检查：index.d.ts 是手写给宿主看的，它和真实类型不一致时 `pnpm type-check` 会报错。
// SDK 产出的值要符合公开类型；宿主传入的值两边都要符合。运行时不会用到这个文件。
import type * as Core from '@twin-studio/core'
import type * as Public from '../index'

type Fits<A, B> = [A] extends [B] ? true : false
type Same<A, B> = Fits<A, B> extends true ? Fits<B, A> : false
type Assert<T extends true> = T

export type PublicTypeChecks = [
  Assert<Same<Core.TwinBindingTarget, Public.TwinBindingTarget>>,
  Assert<Same<Core.TwinPackageSource, Public.TwinPackageSource>>,
  Assert<Same<Core.ProjectDataSource, Public.ProjectDataSource>>,
  Assert<Same<Core.DataSourceConnectionStatus, Public.DataSourceConnectionStatus>>,
  Assert<Fits<Core.ViewerLoadedEvent, Public.ViewerLoadedEvent>>,
  Assert<Fits<Core.ViewerTargetClick, Public.ViewerTargetClick>>,
  Assert<Fits<Core.ViewerObjectData, Public.ViewerObjectData>>,
  Assert<Fits<Core.ViewerRuntimeState, Public.ViewerRuntimeState>>,
  Assert<Fits<Core.TwinSceneViewerPublicApi, Public.TwinSceneViewerPublicApi>>,
  Assert<Fits<Core.SceneDocumentV2, Public.SceneDocumentV2>>,
  Assert<Same<Core.ViewerQuality, Public.ViewerQuality>>,
  Assert<Fits<typeof Core.SCENE_DOCUMENT_VERSION, typeof Public.SCENE_DOCUMENT_VERSION>>,
]
