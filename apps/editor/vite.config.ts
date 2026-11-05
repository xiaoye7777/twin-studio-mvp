import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defaultClientConditions, defineConfig, loadEnv } from 'vite'
import { mockApi } from './mock/mockApi'

export default defineConfig(({ mode }) => {
  // 配了 VITE_API_BASE 就连真实后端，否则开发服务器自带一个模拟后端。
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)))
  return {
    plugins: [vue(), tailwindcss(), ...(env.VITE_API_BASE ? [] : [mockApi()])],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
      // 工作区的包通过 source 导出直接跑源码，不用先构建。
      conditions: ['source', ...defaultClientConditions],
      dedupe: ['three', 'vue'],
    },
  }
})
