import type { z } from 'zod'
import type { SceneTransformSchema, Vector3TupleSchema } from './sceneSchema'
import type {
  CameraBookmarkSchema,
  CameraViewSchemaV2,
  GroupNodeSchemaV2,
  PrimitiveNodeSchemaV2,
  PathNodeSchemaV2,
  AreaNodeSchemaV2,
  LabelNodeSchemaV2,
  LightNodeSchemaV2,
  PrimitiveShapeSchema,
  SurfacePatternSchema,
  ModelNodeSchemaV2,
  PanelGroupNodeSchemaV2,
  PanelNodeSchemaV2,
  SceneDocumentSchemaV2,
  SceneNodeSchemaV2,
} from './sceneSchemaV2'

export type Vector3Tuple = z.infer<typeof Vector3TupleSchema>
export type SceneTransform = z.infer<typeof SceneTransformSchema>
export type SceneDocumentV2 = z.infer<typeof SceneDocumentSchemaV2>
export type SceneNodeV2 = z.infer<typeof SceneNodeSchemaV2>
export type ModelNodeV2 = z.infer<typeof ModelNodeSchemaV2>
export type GroupNodeV2 = z.infer<typeof GroupNodeSchemaV2>
export type PanelGroupNodeV2 = z.infer<typeof PanelGroupNodeSchemaV2>
export type PanelNodeV2 = z.infer<typeof PanelNodeSchemaV2>
export type CameraViewV2 = z.infer<typeof CameraViewSchemaV2>
export type CameraBookmark = z.infer<typeof CameraBookmarkSchema>
export type PrimitiveNodeV2 = z.infer<typeof PrimitiveNodeSchemaV2>
export type PathNodeV2 = z.infer<typeof PathNodeSchemaV2>
export type AreaNodeV2 = z.infer<typeof AreaNodeSchemaV2>
export type LabelNodeV2 = z.infer<typeof LabelNodeSchemaV2>
export type LightNodeV2 = z.infer<typeof LightNodeSchemaV2>
export type PrimitiveShape = z.infer<typeof PrimitiveShapeSchema>
export type SurfacePatternV2 = z.infer<typeof SurfacePatternSchema>
