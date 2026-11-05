/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端接口地址；不配就用开发服务器自带的模拟后端。 */
  readonly VITE_API_BASE?: string
}
