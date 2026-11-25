import { describe, expect, it } from 'vitest'
import { createEffect, createEffectParameters, isEffectInstance, isEffectParameters } from '../src/domain/effects'
import { patch, REMOVE } from './helpers'

const parameters = { color: '#FFb020', opacity: 0.65, speed: 1, padding: 0.2, text: '设备标注' }
const effect = {
  id: 'effect_1',
  kind: 'floating-label',
  target: { type: 'primitive', nodeId: 'n1' },
  parameters,
}

describe('isEffectParameters', () => {
  it.each([
    ['defaults', createEffectParameters()],
    ['bounds', { color: '#000000', opacity: 0, speed: 0, padding: 0, text: '' }],
    ['upper bounds', { color: '#ffffff', opacity: 1, speed: 10, padding: 100, text: 'x'.repeat(200) }],
    ['extra field', { ...parameters, extra: true }],
  ])('accepts %s', (_label, value) => expect(isEffectParameters(value)).toBe(true))

  it.each([
    ['short colour', ['color'], '#fff'],
    ['named colour', ['color'], 'red'],
    ['colour without hash', ['color'], 'ffb020'],
    ['opacity above 1', ['opacity'], 1.01],
    ['negative opacity', ['opacity'], -0.1],
    ['string opacity', ['opacity'], '0.5'],
    ['speed above 10', ['speed'], 11],
    ['negative padding', ['padding'], -1],
    ['padding above 100', ['padding'], 101],
    ['text over 200', ['text'], 'x'.repeat(201)],
    ['missing text', ['text'], REMOVE],
    ['missing colour', ['color'], REMOVE],
  ])('rejects %s', (_label, path, value) => expect(isEffectParameters(patch(parameters, path, value))).toBe(false))

  it('rejects non-objects', () => {
    expect(isEffectParameters(null)).toBe(false)
    expect(isEffectParameters('#ffffff')).toBe(false)
  })
})

describe('isEffectInstance', () => {
  it.each([
    ['label effect', effect],
    ['created effect', createEffect('box-glow', { type: 'asset-instance', instanceId: 'i1' })],
    ['every kind', { ...effect, kind: 'child-highlight' }],
    ['provenance', { ...effect, sourceTemplateId: 'builtin:critical' }],
    ['extra field', { ...effect, extra: 1 }],
  ])('accepts %s', (_label, value) => expect(isEffectInstance(value)).toBe(true))

  it.each([
    ['empty id', ['id'], ''],
    ['missing id', ['id'], REMOVE],
    ['unknown kind', ['kind'], 'sparkles'],
    ['bad target', ['target'], { type: 'primitive', nodeId: '' }],
    ['missing parameters', ['parameters'], REMOVE],
    ['invalid parameters', ['parameters', 'opacity'], 2],
    ['empty provenance', ['sourceTemplateId'], ''],
    ['numeric provenance', ['sourceTemplateId'], 7],
  ])('rejects %s', (_label, path, value) => expect(isEffectInstance(patch(effect, path, value))).toBe(false))
})
