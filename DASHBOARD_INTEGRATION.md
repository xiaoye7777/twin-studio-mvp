# 数据大屏接入 Twin Studio 3D 场景

给在**数据大屏仓库**工作的 GLM 5.4。本文对应 `@twin-studio/viewer@0.13.0`、Vue 3 和 v2 场景文档。交付目标是让用户能在大屏看到已保存的场景、点击箱子查看数据、从设备列表聚焦箱子，以及选择镜头切换视角。

**最小接入只有一行：** `<TwinSceneViewer :scene="sceneDocument" />`。大屏负责选择项目、读取场景和展示业务界面。Viewer 负责模型 ID 去重、批量取下载地址、从对象存储下载文件、渲染场景，以及运行场景里保存的数据源与交互规则。

## 1. 拿到安装包和一个可验收的项目

- 向 3D 同事拿到 **Viewer 安装包**和**同一环境中已保存的 projectId**。为了验收双向联动，请对方准备一个绑定了设备的箱子、一个有值的变量、至少一个命名镜头。如果需要验证自定义弹窗，请在箱子上配置「双击 → 通知大屏」，约定事件名，例如 `open-cabinet`，再保存。
- 有 SDK 源码时，可以自行生成安装包。在 **twin-studio-mvp 根目录**使用 Node 20.16+、pnpm 10.20.0 执行以下命令。打包命令会将产物写入指定目录；Git 仓库忽略 `.tgz`。

```sh
pnpm install --frozen-lockfile
pnpm build:viewer
mkdir -p release
(cd packages/viewer && npm pack --pack-destination ../../release)
```

- 将 `release/twin-studio-viewer-0.13.0.tgz` 交给大屏同事。以下命令在**大屏前端项目**执行，假设收到的包已放入项目的 `vendor/`。使用项目现有的 Vue 3.5（兼容范围 `^3.5.0`），Three.js 版本为 `0.184.0`。团队或 CI 通过同一份包或内网制品库安装。

```sh
pnpm add ./vendor/twin-studio-viewer-0.13.0.tgz three@0.184.0
pnpm list @twin-studio/viewer vue three --depth=0
```

## 2. 从大屏选项目，到 Viewer 显示场景

1. 大屏已有项目选择器时，取当前选中的 `projectId`。MVP 的项目列表为 `GET /api/v1/projects`，列表项的 `id` 是项目 ID。内网已有项目服务时沿用该服务。
2. 用大屏现有的鉴权请求客户端调用 `GET /api/v1/projects/{projectId}/scene`。原始响应格式为 `{ code, msg, data: { revision, updatedAt, document } }`。把 **`data.document`** 交给 Viewer。如果请求客户端已经返回了内层 `data`，直接取 `result.document`。当 `document === null` 时显示“场景尚未保存”。
3. 如果拿到的是一个直接返回**场景文档本身**的 JSON 文件地址，可以把该地址作为 `scene`。需要业务请求头才能下载的场景文件，由大屏鉴权读取、解析 JSON 后传对象。浏览器本地选择的文件同理，可用 `JSON.parse(await file.text())`。
4. 挂载 Viewer，导入 `@twin-studio/viewer/style.css`，给父容器明确的高度。Viewer 完成加载后触发 `loaded`。从此时开始调用组件 ref 上的设备、对象和镜头方法。切项目时，用新的项目 ID 作为组件 `key`，一起清除旧的选中项、详情和镜头列表。

**本地联调。** 在 MVP 根目录运行 `pnpm dev` 启动编辑器和模拟后端，用编辑器创建并保存场景。若大屏开发服务器使用另一个端口，将大屏的 `/api/v1` 和 `/mock-storage` 都代理到编辑器开发服务器（使用终端实际显示的地址）。这样场景、模型元数据和模型字节来自同一份本地数据。生产环境由对象存储提供文件 URL。

## 3. 接好三类请求的鉴权

先在内网浏览器 Network 里找一条**成功**的业务请求，确认租户头、Token 头的实际名称和取值格式。复用大屏现有登录模块。下面三处请求有独立入口。

| 请求 | 谁发起 | 在哪里传凭据 |
| --- | --- | --- |
| 获取项目、场景文档 | 大屏业务客户端 | 沿用现有拦截器或登录请求头，再将解析出的文档交给 Viewer |
| 批量查询资产、获取文件下载地址 | Viewer | 用 `asset-api` 配置 `assetsUrl`、`fileUrlsUrl` 和 `headers`。随后 Viewer 用签名 URL 下载 GLB/HDR，业务鉴权头仅发给这两个查询接口 |
| 场景中配置的 HTTP 设备数据源 | Viewer 数据运行时 | 用 `data-request-headers(source)` 在**每次发送**时读取当前登录态，只给受信任的内网数据接口附加凭据。可结合 `source.authRef` 区分凭据。此回调只作用于 HTTP 数据源 |

SDK 默认先请求 `GET /api/v1/assets/by-ids?ids=A&ids=B`，根据返回的 `{id, fileId}` 再请求 `GET /api/v1/files/download-urls?ids=143&ids=201`，按 `fileId` 匹配 `downloadUrl`。若资产记录已含 `{id, downloadUrl}`，该资源跳过第二步。每批最多 64 个不同 ID。地址直接取自业务后端，模型字节由浏览器从对象存储读取。

内网只改了路径和请求头时，在一个地方配置 `asset-api` 即可。SDK 0.13.0 的批量协议使用 GET、重复的 `ids` 参数和 `{code: 0, data: [...]}` 响应。如果实际方法或响应结构不同，让接入层或网关统一转换成该协议。业务页面只传场景。旧页面显式传入 `resolve-asset` 会覆盖自动加载；迁到批量模式时移除这个属性。凭据留在登录会话中，场景 JSON 只保存资源引用及数据源配置。[批量请求和响应示例](API.md#正式环境的模型下载)

## 4. 可直接运行的 Vue 接入组件

在大屏项目创建 `DashboardScene.vue`。下面的示例使用 MVP 同源接口。父页面只需要传入项目 ID，例如 `<DashboardScene :key="projectId" :project-id="projectId" />`。接内网时，把场景读取替换成项目已有的业务客户端，或传入 `readHeaders` 函数；将受信任的 HTTP 设备接口来源通过 `dataOrigins` 传入，按需配置两个批量接口 URL。来源是包含协议和端口的完整 origin。只放入由公司控制、允许接收该凭据的来源。

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import {
  TwinSceneViewer,
  type ProjectDataSource, type TwinSceneViewerPublicApi, type ViewerAssetApi,
  type ViewerBookmark, type ViewerInteractionEvent, type ViewerLoadedEvent,
  type ViewerRuntimeState, type ViewerSelection, type ViewerTargetClick,
} from '@twin-studio/viewer'
import '@twin-studio/viewer/style.css'

const props = defineProps<{
  projectId: string
  readHeaders?: () => Record<string, string>
  dataOrigins?: string[]
  assetsUrl?: string
  fileUrlsUrl?: string
}>()
const viewer = ref<TwinSceneViewerPublicApi | null>(null)
const scene = shallowRef<object | null>(null)
const runtime = shallowRef<ViewerRuntimeState | null>(null)
const selection = shallowRef<ViewerSelection>(null)
const cameras = ref<ViewerBookmark[]>([])
const status = ref('正在读取场景…')
const warnings = ref<string[]>([])
const clickedName = ref('')
const detail = ref('')
const request = new AbortController()

const assetApi = computed<ViewerAssetApi>(() => ({
  assetsUrl: props.assetsUrl, fileUrlsUrl: props.fileUrlsUrl, headers: props.readHeaders?.(),
}))
function dataHeaders(source: Extract<ProjectDataSource, { type: 'http' }>) {
  const origin = new URL(source.url, window.location.href).origin
  if (props.dataOrigins?.includes(origin)) return props.readHeaders?.()
}

onMounted(async () => {
  try {
    const id = encodeURIComponent(props.projectId)
    const res = await fetch(`/api/v1/projects/${id}/scene`, {
      headers: props.readHeaders?.(), signal: request.signal,
    })
    if (!res.ok) throw new Error(`场景请求失败（HTTP ${res.status}）`)
    const body = await res.json()
    if (body.code !== 0) throw new Error(body.msg || '场景读取失败')
    if (body.data.document === null) { status.value = '场景尚未保存'; return }
    scene.value = body.data.document
    status.value = '正在加载模型…'
  } catch (error) {
    if (!request.signal.aborted) status.value = error instanceof Error ? error.message : '场景读取失败'
  }
})
onBeforeUnmount(() => request.abort())

function loaded(info: ViewerLoadedEvent) {
  cameras.value = info.bookmarks
  warnings.value = info.warnings
  runtime.value = viewer.value?.getRuntimeState() ?? null
  status.value = ''
}
const devices = computed(() =>
  [...new Map(runtime.value?.bindings.map(b => [b.device.id, b.device] as const)).values()],
)
const binding = computed(() => runtime.value?.bindings.find(b => b.id === selection.value?.bindingId))
async function chooseDevice(id: string) {
  const api = viewer.value
  if (api?.selectDevice(id)) await api.focusDevice(id)
}
function clicked(event: ViewerTargetClick) {
  clickedName.value = event.data.name
}
function changed(value: ViewerSelection) {
  selection.value = value
  clickedName.value = ''
  detail.value = ''
}
function interaction(event: ViewerInteractionEvent) {
  if (event.eventName === 'open-cabinet' && event.deviceId) detail.value = event.deviceId
}
</script>

<template>
  <p v-if="status" role="status">{{ status }}</p>
  <section v-if="scene" style="height: 65vh">
    <TwinSceneViewer ref="viewer" :scene="scene" :asset-api="assetApi"
      :data-request-headers="dataHeaders" :panels="false"
      @loaded="loaded" @error="status = $event" @target-click="clicked"
      @selection-change="changed" @interaction-event="interaction" />
  </section>
  <p v-for="warning in warnings" :key="warning">{{ warning }}</p>
  <nav v-if="runtime" aria-label="场景镜头">
    <button v-for="cam in cameras" :key="cam.id" @click="viewer?.flyToBookmark(cam.id)">{{ cam.name }}</button>
    <button @click="viewer?.resetView()">回到初始视角</button>
  </nav>
  <button v-for="device in devices" :key="device.id"
    :aria-pressed="selection?.deviceId === device.id" @click="chooseDevice(device.id)">{{ device.name }}</button>
  <p v-if="clickedName">点击的物体：{{ clickedName }}</p>
  <dl v-if="binding">
    <template v-for="v in binding.variables" :key="v.id">
      <dt>{{ v.name }}</dt><dd>{{ runtime?.getRuntimeValue(binding.id, v.key)?.value ?? '—' }} {{ v.unit }}</dd>
    </template>
  </dl>
  <aside v-if="detail">设备详情：{{ detail }} <button @click="detail = ''">关闭</button></aside>
</template>
```

## 5. 按大屏需求选事件和方法

| 大屏需求 | 使用方式 |
| --- | --- |
| 点击箱子聚焦并显示本次数据 | 默认点击只选中并回传数据。`@target-click` 的 `event.data` 有实例名称、设备、绑定 ID、变量值和更新时间。未绑定时 `device` 为 null。若只想让部分设备聚焦，可传 `:focus-on-click="hit => hit.data.device?.id === 'ESS-001'"` |
| 在列表点击设备，让 3D 跟过去 | `selectDevice(deviceId)` 同步选中，`await focusDevice(deviceId)` 移动镜头。大屏监听 `selection-change` 同步高亮，点空白收到 null。多物体绑定同一设备时，设备方法命中首个可解析绑定；要定位指定箱子，用 `selectTarget` 和 `focusTarget({type: 'asset-instance', instanceId: nodeId})`，两者传相同 target |
| 持续刷新侧栏或图表 | 保存 `getRuntimeState()` 的返回值，在 Vue 模板或 computed 中读 `getRuntimeValue(bindingId, variableKey)`。点击事件提供当时的快照；实时状态会随后更新。无值显示“—”，数值 0 和布尔 false 应正常显示 |
| 展示或切换命名镜头 | 用 `loaded.bookmarks` 或 `getBookmarks()` 获取 `{id, name}[]`，显示 name，用 id 调 `await flyToBookmark(id)`。第二个参数是过渡秒数，传 0 立即切换。调用结果 false 表示未完成 |
| 双击箱子打开业务弹窗 | 在编辑器配置“通知大屏”的事件名。大屏订阅 `interaction-event`，按约定的 `eventName` 和 `deviceId` 打开对应详情。仅需要普通点选时使用 `target-click` |
| 展示 3D 信息面板 | `panels` 默认 true。示例选择 false，由大屏展示详情。嵌入全屏页面时给 3D 容器实际尺寸，只让覆盖在画面上的可交互控件接收指针事件 |

**ID 用途。** 项目 ID 用来读场景，节点 ID 定位场景中的一个物体，设备 ID 用于业务联动，绑定 ID 加变量 key 用于查实时值，镜头 ID 用于切视角。`assetId` 和 `fileId` 用于资源下载；十个箱子可以共用一个 `assetId`。

**数据由 3D 编辑器配置。** 支持 HTTP 单次或轮询、WebSocket 推送、静态值。大屏复用 Viewer 的运行时即可。当前 MVP 通过「场景 → 数据 → 接口 → 涉及设备」配置接口提供哪些设备和变量。物体「数据」页显示来源；同变量有多个来源时按接口优先级取值。

## 6. 联调验收与故障定位

| 验收动作 | 预期结果与优先检查点 |
| --- | --- |
| 打开一个已保存项目，再打开一个未保存项目 | 前者出现画面并触发 `loaded`，后者提示“场景尚未保存”。白屏先查返回值是否取到 `data.document`、父容器高度及 SDK 样式 |
| 场景放 10 个相同柜子和 1 栋厂房 | 两种模型、无 HDR、后端先返回 fileId 时，Network 应看到一次资产批查、一次文件地址批查、两份 GLB。批查 401/403 查 `asset-api.headers`；文件下载 403 查签名有效期和存储访问权限，跨域错误查对象存储 CORS。缺模型同时看 `loaded.warnings` 和返回的资源 ID |
| 点击箱子，再从列表选择另一设备 | 详情、选中项和相机随操作更新。若选中但没有变量，查设备绑定、变量 key 和数据源返回映射。设备 HTTP 返回 401/403 时查 `data-request-headers`、可信来源和实际请求头 |
| 让一个实时变量变化，再选另一个镜头 | 无需再点箱子，侧栏数值随运行时更新。可在 `getRuntimeState()?.dataSourceStates` 看每个数据源的状态与错误。点击镜头应切到相应位置，多个同名镜头按 ID 区分 |
| 连续切换两个项目，再离开页面 | 新项目使用自己的设备、选中项和镜头，旧场景的轮询和连接随 Viewer 卸载释放 |

交付前在大屏仓库执行现有的类型检查和生产构建，并记录用到的 SDK 版本、测试项目、已通过的联动项及待内网核实的接口差异。完整接口签名以[随包类型声明](packages/viewer/index.d.ts)为准；运行示例和后端协议分别见 [Viewer 说明](packages/viewer/README.md) 和[前后端接口文档](API.md)。
