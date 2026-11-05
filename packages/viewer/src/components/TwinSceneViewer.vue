<script setup lang="ts">
/*
 * Viewer SDK 的组件：加载一份场景 JSON（文件按资源 ID 向宿主要），显示场景，
 * 点击对象时聚焦并把对象的数据告诉宿主。场景里的信息面板默认一起显示。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  type AssetResolver,
  loadSceneDocument,
  type SceneDocument,
  type TwinBindingTarget,
  TwinSceneRuntime,
  type TwinSceneRuntimeOptions,
  type TwinSceneViewerEvents,
  type TwinSceneViewerPublicApi,
  UrlAssetRepository,
  type ViewerQuality,
} from '@twin-studio/core'

const props = withDefaults(
  defineProps<{
    /** 场景 JSON：解析好的对象，或一个返回 JSON 的地址。 */
    scene: object | string
    /** 资源 ID → 文件地址（也可以直接给 Blob）。 */
    resolveAsset: AssetResolver
    /** 画质；auto 按设备和屏幕自适应。 */
    quality?: ViewerQuality
    /** 显示场景里的信息面板；宿主有自己的界面时可以关掉。 */
    panels?: boolean
    /** HTTP 接口的认证请求头：Token 不进场景 JSON，由集成方提供。 */
    dataRequestHeaders?: TwinSceneRuntimeOptions['dataRequestHeaders']
  }>(),
  { quality: 'auto', panels: true, dataRequestHeaders: undefined },
)
const emit = defineEmits<TwinSceneViewerEvents>()
const canvas = ref<HTMLCanvasElement>()
const canvasKey = ref(0)
const session = shallowRef<TwinSceneRuntime | null>(null)
const loading = ref(false)
const error = ref('')
const warnings = ref<string[]>([])
let mounted = false
let generation = 0
let controller: AbortController | null = null

function release(): void {
  controller?.abort()
  controller = null
  session.value?.dispose()
  session.value = null
}

/** 读出场景 JSON：地址要先下载；内容都要过校验。 */
async function readScene(signal: AbortSignal): Promise<{ document: SceneDocument; dropped: string[] }> {
  if (typeof props.scene !== 'string') return loadSceneDocument(props.scene)
  const response = await fetch(props.scene, { signal })
  if (!response.ok) throw new Error(`场景 JSON 读取失败（HTTP ${response.status}）`)
  let raw: unknown
  try {
    raw = await response.json()
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new Error(`场景地址返回的不是 JSON：${props.scene}`)
  }
  return loadSceneDocument(raw)
}

async function load(): Promise<void> {
  const request = ++generation
  release()
  canvasKey.value += 1
  await nextTick()
  if (!mounted || request !== generation || !canvas.value) return
  error.value = ''
  warnings.value = []
  loading.value = true
  controller = new AbortController()
  const { signal } = controller
  try {
    const { document, dropped } = await readScene(signal)
    if (!mounted || request !== generation) return
    const hdrAssetId = document.settings.sky.hdrAssetId
    const assets = new UrlAssetRepository(id => props.resolveAsset(id), {
      signal,
      typeOf: id => (id === hdrAssetId ? 'environment' : 'model'),
    })
    const runtime = new TwinSceneRuntime(
      canvas.value,
      assets,
      event => {
        if (!mounted || request !== generation) return
        emit('target-click', {
          ...event,
          target: { ...event.target },
          bindingTarget: event.bindingTarget ? { ...event.bindingTarget } : undefined,
          device: event.device ? { ...event.device } : undefined,
        })
      },
      {
        quality: props.quality,
        panels: props.panels,
        dataRequestHeaders: source => props.dataRequestHeaders?.(source),
      },
    )
    session.value = runtime
    const result = [...dropped, ...(await runtime.load(document))]
    if (!mounted || request !== generation) return
    warnings.value = result
    emit('loaded', {
      projectId: document.projectId,
      projectName: document.metadata.name ?? '',
      objectCount: document.nodes.length,
      bindingCount: runtime.twin.bindings.length,
      warnings: result,
    })
  } catch (cause) {
    if (request !== generation || (cause instanceof DOMException && cause.name === 'AbortError')) return
    error.value = cause instanceof Error ? cause.message : String(cause)
    emit('error', error.value)
  } finally {
    if (request === generation) {
      loading.value = false
      controller = null
    }
  }
}
onMounted(() => {
  mounted = true
  void load()
})
watch(
  () => props.scene,
  () => {
    if (mounted) void load()
  },
)
watch(
  () => props.quality,
  quality => session.value?.setQuality(quality),
)
watch(
  () => props.panels,
  panels => session.value?.setPanelsEnabled(panels),
)
onBeforeUnmount(() => {
  mounted = false
  generation++
  release()
})

const publicApi: TwinSceneViewerPublicApi = {
  focusTarget: (target: TwinBindingTarget) => session.value?.focusTarget(target) ?? Promise.resolve(false),
  focusDevice: (id: string) => session.value?.focusDevice(id) ?? Promise.resolve(false),
  getObjectData: (target: TwinBindingTarget) => session.value?.getObjectData(target) ?? null,
  getRuntimeState: () => session.value?.runtimeState ?? null,
  getBookmarks: () => session.value?.getBookmarks() ?? [],
  flyToBookmark: (id: string, duration?: number) =>
    session.value?.flyToBookmark(id, duration) ?? Promise.resolve(false),
  resetView: (duration?: number) => session.value?.resetView(duration) ?? Promise.resolve(false),
}
defineExpose(publicApi)
</script>

<template>
  <div
    class="twin-viewer"
    data-testid="twin-scene-viewer"
    :data-loaded="!loading && !error && !!session"
    :data-object-count="session?.roots.length ?? 0"
    :data-binding-count="session?.twin.bindings.length ?? 0"
    :data-source-status="session?.twin.dataSourceStatus ?? 'disconnected'"
  >
    <canvas :key="canvasKey" ref="canvas" class="twin-viewer__canvas" aria-label="数字孪生场景" />
    <div v-if="loading || error" role="status" class="twin-viewer__overlay">
      <span v-if="!error" class="twin-viewer__spinner" aria-hidden="true" />{{ error || '正在加载场景…' }}
    </div>
    <div v-else-if="warnings.length" role="status" class="twin-viewer__warning">{{ warnings.join('；') }}</div>
  </div>
</template>

<style>
.twin-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #15181c;
}
.twin-viewer__canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.twin-viewer__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75em;
  padding: 2rem;
  background: rgba(14, 16, 19, 0.82);
  color: #e6e4df;
  /* Scales with the viewer so the message stays readable on large screens. */
  font:
    clamp(14px, 1.6vmin, 28px) / 1.5 system-ui,
    sans-serif;
}
.twin-viewer__spinner {
  width: 1.1em;
  height: 1.1em;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: #e08a45;
  border-radius: 50%;
  animation: twin-viewer-spin 0.9s linear infinite;
}
@keyframes twin-viewer-spin {
  to {
    transform: rotate(360deg);
  }
}
.twin-viewer__warning {
  position: absolute;
  left: 0.75rem;
  bottom: 0.75rem;
  max-width: 28rem;
  border-radius: 0.4rem;
  padding: 0.5rem 0.75rem;
  background: rgba(69, 26, 3, 0.86);
  color: #fde68a;
  font:
    12px/1.5 system-ui,
    sans-serif;
}
</style>
