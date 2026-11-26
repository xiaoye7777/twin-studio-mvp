import { afterEach, expect, it, vi } from 'vitest'
import { createUuid } from '../src/domain/uuid'

afterEach(() => vi.unstubAllGlobals())

it('prefers the native UUID when available', () => {
  const randomUUID = vi.fn(() => '75f4819b-3609-410f-a954-80460375274a')
  vi.stubGlobal('crypto', { randomUUID })
  expect(createUuid()).toBe('75f4819b-3609-410f-a954-80460375274a')
  expect(randomUUID).toHaveBeenCalledOnce()
})

it('creates a fresh v4 UUID on HTTP with only getRandomValues', () => {
  let sequence = 0
  vi.stubGlobal('crypto', {
    getRandomValues(bytes: Uint8Array) {
      bytes.fill(0xff)
      bytes[0] = sequence++
      return bytes
    },
  })
  expect(createUuid()).toBe('00ffffff-ffff-4fff-bfff-ffffffffffff')
  expect(createUuid()).toBe('01ffffff-ffff-4fff-bfff-ffffffffffff')
})
