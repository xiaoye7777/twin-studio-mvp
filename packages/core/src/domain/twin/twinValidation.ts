import type { TwinBinding } from './bindingTypes'
import { TwinBindingSchema } from './schema'

export function isTwinBinding(value: unknown): value is TwinBinding {
  return TwinBindingSchema.safeParse(value).success
}
