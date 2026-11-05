import { z } from 'zod'

// Zod 的 number 不接受 NaN 和无穷大。
export const Vector3TupleSchema = z.tuple([z.number(), z.number(), z.number()])

export const SceneTransformSchema = z.object({
  position: Vector3TupleSchema,
  rotation: Vector3TupleSchema,
  scale: Vector3TupleSchema,
})
