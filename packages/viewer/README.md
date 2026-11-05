# @twin-studio/viewer 0.7.0

Vue 3 项目运行组件。支持 Node 20.16+ 和 pnpm 10.20.0；加载编辑器导出的 `.twin.zip`，恢复模型、设备绑定、实时数据、镜头和数据面板。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { TwinSceneViewer, type TwinSceneViewerPublicApi, type ViewerTargetClick } from '@twin-studio/viewer'
import '@twin-studio/viewer/style.css'

const viewer = ref<TwinSceneViewerPublicApi | null>(null)

function onClick(event: ViewerTargetClick) {
  console.log(event.data.name, event.data.device, event.data.values)
}
</script>
<template>
  <TwinSceneViewer ref="viewer" source="/project.twin.zip" @target-click="onClick" />
</template>
```

## 属性

| 属性 | 默认 | 说明 |
| --- | --- | --- |
| `source` | 必填 | 项目包：URL、`Blob`、`ArrayBuffer` 或 `Uint8Array` |
| `quality` | `auto` | 画质：`auto`、`low`、`medium`、`high` |
| `panels` | `true` | 点击对象时显示项目里配的数据面板；宿主有自己的界面时设为 `false` |
| `data-request-headers` | 无 | 定时请求接口的认证请求头。Token 不进项目包，由集成方提供 |

## 双向联动

**场景 → 大屏**：点击对象时，相机聚焦到它，并发出 `target-click`，内容里带着这个对象的数据。

```ts
interface ViewerTargetClick {
  target: TwinBindingTarget          // 点到的对象
  bindingTarget?: TwinBindingTarget  // 设备绑在哪个对象上（可能是外层分组）
  device?: TwinDevice
  bindingId?: string
  data: {
    nodeId: string
    name: string
    kind: 'model' | 'group'
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

其他事件只有 `loaded`（加载完成）和 `error`（加载失败）。

## 数据

数值只来自项目配置的数据接口：WebSocket 推送、HTTP 定时请求或编辑器里手填的静态数据。接口没有连上时没有任何实时值，`value` 是 `null`。SDK 内不包含任何模拟数据。

配置随项目包分发，所以里面不能有账号、密码或 Token：需要认证的 HTTP 接口用 `data-request-headers` 由宿主提供。

## 项目包的兼容

由功能更全的编辑器导出的项目包也能打开：当前版本不支持的节点类型和字段会被忽略，比当前版本新的场景格式会提示升级。

## 打包

```bash
pnpm --filter @twin-studio/viewer build
```

```bash
pnpm --filter @twin-studio/viewer pack
```
