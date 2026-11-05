// Replaced at build time by Vite in every consumer (Editor dev/build, Viewer library build).
interface ImportMetaEnv {
  readonly DEV: boolean
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
// Asset URL imports, resolved by Vite to an emitted file (apps) or a data URL (library build).
declare module '*?url' {
  const url: string
  export default url
}
