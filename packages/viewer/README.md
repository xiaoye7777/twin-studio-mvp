# @twin-studio/viewer 0.10.0

Vue 3 项目运行组件。支持 Node 20.16+ 和 pnpm 10.20.0；加载编辑器保存的场景 JSON，按资源 ID 取模型文件，恢复模型、设备绑定、实时数据、镜头和信息面板。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { TwinSceneViewer, type TwinSceneViewerPublicApi, type ViewerTargetClick } from '@twin-studio/viewer'
import '@twin-studio/viewer/style.css'

const viewer = ref<TwinSceneViewerPublicApi | null>(null)
// 场景 JSON 从后端取：GET /projects/{projectId}/scene 返回的 document
const scene = ref<object | null>(null)

function onClick(event: ViewerTargetClick) {
  console.log(event.data.name, event.data.device, event.data.values)
}
</script>
<template>
  <TwinSceneViewer
    v-if="scene"
    ref="viewer"
    :scene="scene"
    :resolve-asset="id => `/api/v1/assets/${id}/content`"
    @target-click="onClick"
  />
</template>
```

## 属性

| 属性 | 默认 | 说明 |
| --- | --- | --- |
| `scene` | 必填 | 场景 JSON：解析好的对象，或一个返回 JSON 的地址。换一份就重新加载 |
| `resolve-asset` | 必填 | 资源 ID → 模型文件。返回地址（SDK 自己下载），或 `Blob`（需要带登录信息时宿主下载好再给），可以是异步函数 |
| `focus-on-click` | `true` | 宿主控制点击聚焦。可传布尔值，或传入函数，按点击的设备 / 场景实例返回布尔值 |
| `quality` | `auto` | 画质：`auto`、`low`、`medium`、`high` |
| `panels` | `true` | 显示场景里的信息面板；宿主有自己的界面时设为 `false` |
| `data-request-headers` | 无 | HTTP 接口的认证请求头。Token 不进场景 JSON，由集成方提供 |

## 双向联动

**场景 → 大屏**：点击对象时，Viewer 选中它，并发出带设备数据的 `target-click`。默认同时聚焦；关闭点击聚焦仍会选中并回传数据。

```ts
interface ViewerTargetClick {
  target: TwinBindingTarget          // 点到的对象
  bindingTarget?: TwinBindingTarget  // 设备绑在哪个对象上（可能是外层分组）
  device?: TwinDevice
  bindingId?: string
  data: {
    nodeId: string
    name: string
    kind: 'model' | 'group' | 'panel-group' | 'panel'
    device: TwinDevice | null
    bindingId: string | null
    values: Array<{ key: string; name: string; unit?: string; value: number | boolean | string | null; updatedAt: string | null }>
  }
}
```

**大屏 → 场景**（`ref` 上的方法）：

```ts
viewer.value?.focusTarget({ type: 'asset-instance', instanceId: nodeId }) // 相机聚焦到对象
viewer.value?.focusDevice('ESS-001')                                      // 相机聚焦到绑定这台设备的对象
viewer.value?.getObjectData(target)                                       // 取对象的数据，内容同 event.data
viewer.value?.getRuntimeState()                                           // 所有设备的实时数据和接口状态
viewer.value?.getBookmarks()                                              // 编辑器里保存的镜头
viewer.value?.flyToBookmark(id)                                           // 切到镜头
viewer.value?.resetView()                                                 // 回到打开场景时的视角
```

### 外部大屏接入示例

下面是一个外部 Vue 3 页面。它接收后端返回的场景 document，使用 Viewer 对应的设备绑定生成列表。点击列表中的设备会使 Viewer 选中并聚焦到对应箱子；在三维画面点击箱子会选中列表项，并更新右侧变量。示例从 Viewer 的实时状态读取数值，数据源后续更新时也会刷新。

```vue
<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import {
  TwinSceneViewer,
  type TwinSceneViewerPublicApi,
  type ViewerRuntimeState,
  type ViewerSelection,
  type ViewerTargetClick,
} from '@twin-studio/viewer'
import '@twin-studio/viewer/style.css'

defineProps<{ scene: object }>()
const viewer = ref<TwinSceneViewerPublicApi | null>(null)
const state = shallowRef<ViewerRuntimeState | null>(null)
const selection = shallowRef<ViewerSelection>(null)
const devices = computed(() => [...new Map(state.value?.bindings.map(b => [b.device.id, b.device] as const)).values()])
const binding = computed(() => state.value?.bindings.find(b => b.id === selection.value?.bindingId))

// 实际项目可从大屏配置中读取设备编号。这里让点击 ESS-001 时聚焦，其他箱子只选中并回传数据。
const clickFocus = (hit: ViewerTargetClick) => hit.data.device?.id === 'ESS-001'
async function openBox(id: string) {
  const api = viewer.value
  if (api?.selectDevice(id)) await api.focusDevice(id)
}
</script>

<template>
  <section style="height: 65vh">
    <TwinSceneViewer ref="viewer" :scene="scene"
      :resolve-asset="id => `/api/v1/assets/${encodeURIComponent(id)}/content`"
      :focus-on-click="clickFocus"
      @loaded="state = viewer?.getRuntimeState() ?? null"
      @selection-change="selection = $event" />
  </section>
  <button v-for="device in devices" :key="device.id"
    :aria-pressed="selection?.deviceId === device.id" @click="openBox(device.id)">
    {{ device.name }}
  </button>
  <dl v-if="binding">
    <template v-for="v in binding.variables" :key="v.id">
      <dt>{{ v.name }}</dt>
      <dd>{{ state?.getRuntimeValue(binding.id, v.key)?.value ?? '—' }} {{ v.unit }}</dd>
    </template>
  </dl>
</template>
```

- **一次点击的数据**可在 `@target-click` 中直接读取 `event.data`。其中包含实例名称、绑定设备、变量值、单位与更新时间；未绑定时 `device` 为 null，`values` 为空数组。点击箱子内部网格时可读到该网格、箱子或上层分组绑定的设备。
- **选择同步**使用 `selection-change`。用户点场景和宿主调用 `selectTarget(target)` / `selectDevice(id)` 都会更新选中项；重复选择同一项不会重复通知。点空白或调用 `clearSelection()` 会取消选择，`getSelection()` 可读取当前状态。宿主主动选择不会再触发 `target-click`。
- **区分实例**时使用场景节点 ID，例如先调用 `selectTarget({ type: 'asset-instance', instanceId: 'node_01' })`，再用同一目标调用 `focusTarget`。模型库的 assetId 可以被多个箱子共用。多个实例绑定同一设备时，`selectDevice` 和 `focusDevice` 使用首个已解析的绑定。
- 在 `loaded` 后操作 Viewer。选中方法返回是否找到目标；聚焦方法异步返回结果。`error` 会报告场景加载失败。

## 大屏镜头选择器

组件的 `loaded` 事件返回当前场景的 `bookmarks: { id, name }[]`，顺序与编辑器一致。也可在加载完成后主动调用 `getBookmarks()`。使用 ID 切换镜头，同名或重命名的镜头都能准确定位。以下片段沿用上例的 `viewer`、`scene` 和资源地址。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { TwinSceneViewer, type ViewerBookmark, type TwinSceneViewerPublicApi } from '@twin-studio/viewer'
import '@twin-studio/viewer/style.css'

defineProps<{ scene: object }>()
const viewer = ref<TwinSceneViewerPublicApi | null>(null)
const cameras = ref<ViewerBookmark[]>([])
</script>
<template>
  <section style="height: 65vh">
    <TwinSceneViewer ref="viewer" :scene="scene" :resolve-asset="id => `/api/v1/assets/${encodeURIComponent(id)}/content`"
      @loaded="cameras = $event.bookmarks" @error="cameras = []" />
  </section>
  <button v-for="camera in cameras" :key="camera.id" @click="viewer?.flyToBookmark(camera.id)">
    {{ camera.name }}
  </button>
</template>
```

`flyToBookmark(id, durationSeconds?)` 返回 `Promise<boolean>`，默认过渡 1.2 秒，传 0 可立即切换。没有保存的镜头时列表为空，找不到 ID 或飞行被中断时返回 false。切换场景后用新一次 `loaded` 的列表覆盖旧列表。

## 物品交互事件

在编辑器选中物体，打开右侧「交互」标签添加规则。「通知大屏」通过 Viewer 的 `@interaction-event` 返回 `eventName`、`interactionId`、`trigger`、`sourceTarget`、`triggerTarget`、`actionTarget`、`deviceId` 和 `metadata`。例如配置「双击 → 通知大屏」，事件名填 `open-cabinet`，外部页面可在事件回调里按以下方式打开设备详情：

```ts
function onInteraction(event: ViewerInteractionEvent) {
  if (event.eventName === 'open-cabinet') openDetails(viewer.value?.getObjectData(event.triggerTarget))
}
```

单击命中配置了「镜头聚焦」或「飞到视角」的规则时，镜头按规则的目标移动。其他单击继续使用宿主的 `focus-on-click` 策略。启用双击规则的物体会区分单击和双击，每个手势只触发对应规则。

## 数据

数值只来自场景配置的数据接口：WebSocket 推送、HTTP（只请求一次或定时请求）或编辑器里手填的静态数据。接口没有连上时没有任何实时值，`value` 是 `null`。SDK 内不包含任何模拟数据。

配置在场景 JSON 里，所以里面不能有账号、密码或 Token：需要认证的 HTTP 接口用 `data-request-headers` 由宿主提供。

## 信息面板

编辑器里放的信息面板是场景的一部分：大小以米为单位，镜头拉远时和物体一样变小，并且始终面向镜头。模板设成「点击显示」的面板，点击关联的对象时才出现，点空白处隐藏。

## 场景的兼容

只有 JSON + 资源 ID 这一种格式，不再支持 `.twin.zip`。功能更全的编辑器存的场景也能打开：当前版本不支持的节点类型和字段会被忽略（`loaded` 事件的 `warnings` 里有说明），比当前版本新的场景格式会提示升级。

## 打包

```bash
pnpm --filter @twin-studio/viewer build
```

```bash
pnpm --filter @twin-studio/viewer pack
```
