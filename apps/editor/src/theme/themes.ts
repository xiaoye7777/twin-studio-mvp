import { computed, ref, watch } from 'vue'

/**
 * 界面主题。颜色本身写在 tokens.css 的 [data-theme='…'] 块里，这里只登记有哪些主题。
 * 新增主题：tokens.css 复制一段改色值 → 下面 themes 加一行。
 */
export interface UiTheme {
  id: string
  name: string
  /** 决定 Element Plus 用深色还是浅色组件样式。 */
  mode: 'dark' | 'light'
}

export const themes: UiTheme[] = [
  { id: 'dark', name: '深色', mode: 'dark' },
  { id: 'light', name: '浅色', mode: 'light' },
]

/** 用户的选择：某个主题的 id，或 'system'（跟随系统深浅色）。 */
export type ThemeChoice = string

const STORAGE_KEY = 'twin-studio:theme'
/** 第一次打开默认深色。 */
const DEFAULT_CHOICE: ThemeChoice = 'dark'

function readChoice(): ThemeChoice {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_CHOICE
  } catch {
    return DEFAULT_CHOICE
  }
}

const choice = ref<ThemeChoice>(readChoice())
const systemQuery = window.matchMedia('(prefers-color-scheme: dark)')
const systemIsDark = ref(systemQuery.matches)
systemQuery.addEventListener('change', event => (systemIsDark.value = event.matches))

/** 实际生效的主题。 */
const active = computed<UiTheme>(
  () =>
    themes.find(theme => theme.id === choice.value) ??
    themes.find(theme => theme.id === (systemIsDark.value ? 'dark' : 'light'))!,
)

/** 把主题写到 <html> 上：tokens.css 读 data-theme，Element Plus 读 dark 类。 */
function apply(theme: UiTheme): void {
  const root = document.documentElement
  root.dataset.theme = theme.id
  root.classList.toggle('dark', theme.mode === 'dark')
}

/** 应用启动时调用一次，之后主题变化（包括跟随系统）自动生效。 */
export function installTheme(): void {
  watch(active, apply, { immediate: true })
}

export function useTheme() {
  function setTheme(next: ThemeChoice): void {
    choice.value = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // 隐私模式下可能存不了，只是下次不记得而已。
    }
  }
  return { themes, choice, active, setTheme }
}
