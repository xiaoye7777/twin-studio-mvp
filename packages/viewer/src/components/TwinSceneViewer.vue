<script setup lang="ts">
/*
 * Viewer SDK 的组件：加载 .twin.zip，显示场景，点击对象时聚焦并把对象的数据告诉宿主。
 * 项目里配了数据面板的对象，点击时还会弹出面板（宿主有自己的界面时可以用 :panels="false" 关掉）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  type LoadedTwinPackage,
  loadTwinPackage,
  type PanelAnchor,
  PanelTracker,
  resolvePanel,
  targetNodeId,
  type TwinBindingTarget,
  type TwinPackageSource,
  TwinSceneRuntime,
  type TwinSceneRuntimeOptions,
  type TwinSceneViewerEvents,
  type TwinSceneViewerPublicApi,
  type ViewerQuality,
} from '@twin-studio/core'
import TwinPanelCard from './TwinPanelCard.vue'

const props = withDefaults(
  defineProps<{
    source: TwinPackageSource
    /** 画质；auto 按设备和屏幕自适应。 */
    quality?: ViewerQuality
    /** 点击对象时显示项目里配的数据面板。 */
    panels?: boolean
    /** 定时请求接口的认证请求头：Token 不进场景文件，由集成方提供。 */
    dataRequestHeaders?: TwinSceneRuntimeOptions['dataRequestHeaders']
  }>(),
  { quality: 'auto', panels: true, dataRequestHeaders: undefined },
)
const emit = defineEmits<TwinSceneViewerEvents>()
const canvas = ref<HTMLCanvasElement>()
const canvasKey = ref(0)
const session = shallowRef<TwinSceneRuntime | null>(null)
const loadedPackage = shallowRef<LoadedTwinPackage | null>(null)
const loading = ref(false)
const error = ref('')
const warnings = ref<string[]>([])
const panelNodeId = ref<string | null>(null)
const panelAnchor = ref<PanelAnchor>({ x: 0, y: 0, visible: false })
let tracker: PanelTracker | null = null
let mounted = false
let generation = 0
let controller: AbortController | null = null

/** 当前要显示的面板；读 runtimeRevision，数值变了会跟着刷新。 */
const panelView = computed(() => {
  // 先读 panelNodeId：document 不是响应式的，放在它后面判断的话，场景加载完之前短路，就收集不到这个依赖了。
  const nodeId = panelNodeId.value
  const runtime = session.value
  if (!nodeId || !props.panels || !runtime?.document) return null
  void runtime.twin.runtimeRevision
  return resolvePanel(runtime.document, runtime.twin, nodeId)
})

function openPanel(target: TwinBindingTarget): void {
  const runtime = session.value
  if (!runtime?.document) return
  const nodeId = targetNodeId(target)
  panelNodeId.value = nodeId
  tracker?.track(runtime.sync.objectFor(resolvePanel(runtime.document, runtime.twin, nodeId)?.nodeId ?? nodeId))
}

function closePanel(): void {
  panelNodeId.value = null
  tracker?.track(null)
}

function release(): void {
  controller?.abort()
  controller = null
  closePanel()
  tracker?.dispose()
  tracker = null
  session.value?.dispose()
  session.value = null
  loadedPackage.value?.dispose()
  loadedPackage.value = null
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
  try {
    const portable = await loadTwinPackage(props.source, { signal: controller.signal })
    if (!mounted || request !== generation) {
      portable.dispose()
      return
    }
    loadedPackage.value = portable
    const runtime = new TwinSceneRuntime(
      canvas.value,
      portable.sceneRepository,
      portable.assetRepository,
      event => {
        if (!mounted || request !== generation) return
        openPanel(event.target)
        emit('target-click', {
          ...event,
          target: { ...event.target },
          bindingTarget: event.bindingTarget ? { ...event.bindingTarget } : undefined,
          device: event.device ? { ...event.device } : undefined,
        })
      },
      {
        quality: props.quality,
        dataRequestHeaders: source => props.dataRequestHeaders?.(source),
        onBlank: () => {
          if (mounted && request === generation) closePanel()
        },
      },
    )
    session.value = runtime
    tracker = new PanelTracker(runtime.engine, anchor => (panelAnchor.value = anchor))
    const result = await runtime.load(portable.projectId)
    if (!mounted || request !== generation) return
    warnings.value = result
    emit('loaded', {
      projectId: portable.projectId,
      projectName: portable.projectName,
      objectCount: runtime.document?.nodes.length ?? runtime.roots.length,
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
  () => props.source,
  () => {
    if (mounted) void load()
  },
)
watch(
  () => props.quality,
  quality => session.value?.setQuality(quality),
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
      <span v-if="!error" class="twin-viewer__spinner" aria-hidden="true" />{{ error || '正在加载项目包…' }}
    </div>
    <div v-else-if="warnings.length" role="status" class="twin-viewer__warning">{{ warnings.join('；') }}</div>
    <TwinPanelCard v-if="panelView" :view="panelView" :anchor="panelAnchor" @close="closePanel" />
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
