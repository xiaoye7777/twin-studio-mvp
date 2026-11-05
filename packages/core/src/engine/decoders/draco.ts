// Bundled with the app (or inlined into the Viewer SDK chunk), so Draco models load without a CDN.
import wrapper from 'three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url'
import wasm from 'three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url'

export const files: Record<string, string> = {
  'draco_wasm_wrapper.js': wrapper,
  'draco_decoder.wasm': wasm,
}
