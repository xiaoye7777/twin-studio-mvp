import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import App from './App.vue'
import router from './router'
import './theme/tokens.css'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.mount('#app')

// 跟随系统的深浅色（颜色写在 theme/tokens.css，Element Plus 看 dark 类）。
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
  document.documentElement.dataset.theme = event.matches ? 'dark' : 'light'
  document.documentElement.classList.toggle('dark', event.matches)
})
