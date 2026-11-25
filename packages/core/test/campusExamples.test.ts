import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadSceneDocument } from '../src/domain/scene'
import { createEffect } from '../src/domain/effects'
import { targetForNode, targetNodeId } from '../src/domain/twin'
import { duplicateNodes, removeNodes } from '../src/document/sceneOps'

describe.each(['cartoon', 'detailed'])('%s campus', style => {
  it('round-trips the template, resources, scene hierarchy and alarm bindings', () => {
    const publicDir = new URL('../../../apps/editor/public/', import.meta.url)
    const template = JSON.parse(readFileSync(new URL(`campuses/${style}.json`, publicDir), 'utf8'))
    const manifest = JSON.parse(readFileSync(new URL('../src/demo/campusAssets.json', publicDir), 'utf8'))
    const { document, dropped } = loadSceneDocument(template)
    expect(dropped).toEqual([])
    expect(loadSceneDocument(document).document).toEqual(document)
    for (const file of new Set(document.nodes.flatMap(n => (n.kind === 'model' ? [n.model.assetId] : [])))) {
      const bytes = readFileSync(new URL(manifest[file].path, publicDir))
      expect(bytes.toString('ascii', 0, 4)).toBe('glTF')
    }
    expect(document.bookmarks.length).toBeGreaterThan(1)
    const ids = new Set(document.nodes.map(n => n.id))
    for (const binding of document.bindings) {
      if (binding.target.type === 'asset-node') continue
      const node = document.nodes.find(n => n.id === targetNodeId(binding.target))
      expect(node && targetForNode(node)).toEqual(binding.target)
    }
    for (const rule of document.visualRules!) {
      expect(ids.has(targetNodeId(rule.target))).toBe(true)
      const binding = document.bindings.find(b => b.id === rule.bindingId)
      expect(binding?.variables.some(v => v.key === rule.variableKey)).toBe(true)
    }
    // An example can use alarms without permanent effects. Verify edits on a real bound device.
    const effect = createEffect('beam', document.bindings[0]!.target)
    ;(document.effects ??= []).push(effect)
    const source = targetNodeId(effect.target)
    expect(ids.has(source)).toBe(true)
    const [copy] = duplicateNodes(document, [source], [1, 0, 0])
    expect(document.effects?.some(e => targetNodeId(e.target) === copy)).toBe(true)
    removeNodes(document, [source])
    expect(document.effects?.some(e => targetNodeId(e.target) === source)).toBe(false)
    expect(document.visualRules?.some(r => targetNodeId(r.target) === source)).toBe(false)
  })
})
