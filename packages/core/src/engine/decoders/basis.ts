// Bundled with the app (or inlined into the Viewer SDK chunk), so KTX2 textures load without a CDN.
import transcoder from 'three/examples/jsm/libs/basis/basis_transcoder.js?url'
import wasm from 'three/examples/jsm/libs/basis/basis_transcoder.wasm?url'

export const files: Record<string, string> = {
  'basis_transcoder.js': transcoder,
  'basis_transcoder.wasm': wasm,
}
