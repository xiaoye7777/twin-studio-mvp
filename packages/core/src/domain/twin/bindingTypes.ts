import type { z } from 'zod'
import type { TwinBindingSchema } from './schema'

export type TwinBinding = z.infer<typeof TwinBindingSchema>

export type TwinBindingResolution = 'resolved' | 'unresolved'
