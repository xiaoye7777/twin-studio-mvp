# 3D 编辑器后端接口

> **状态：讨论稿。** 项目、场景、资源接口的路径和字段是给后端的提案，定稿前都可以改。前端只在 [adapter.ts](../apps/editor/src/api/adapter.ts) 里写死这些名字，真实接口不一样时改那里就行（见[第 6 章](#6-接口和文档不一样时)）。

开发时不用等后端：`pnpm dev` 自带一个按这份文档实现的[模拟后端](../apps/editor/mock/mockApi.ts)。

## 1. 接口总览

基础路径 `/api/v1`。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/projects` | 场景列表 |
| POST | `/projects` | 新建场景 |
| GET | `/projects/{projectId}` | 取一个场景的信息 |
| PATCH | `/projects/{projectId}` | 重命名 |
| DELETE | `/projects/{projectId}` | 删除 |
| PUT | `/projects/{projectId}/cover` | 上传封面 |
| GET | `/projects/{projectId}/cover` | 读取封面 |
| GET | `/projects/{projectId}/scene` | 读取场景 |
| PUT | `/projects/{projectId}/scene` | 保存场景 |
| GET | `/assets` | 资源列表 |
| POST | `/assets` | 上传资源 |
| GET | `/assets/{assetId}` | 资源信息 |
| GET | `/assets/{assetId}/content` | 下载文件 |
| GET | `/assets/{assetId}/usages` | 查询被哪些场景引用 |
| DELETE | `/assets/{assetId}` | 删除资源 |

这一阶段没有登录。

## 2. 通用约定

JSON 接口都用下面的包装，`code` 为 `0` 表示成功。HTTP 状态码同样要反映结果，不要失败时也返回 200。文件下载接口直接返回文件内容。

```json
{ "code": 0, "msg": "ok", "data": { "id": "p_01" } }
```

前端会把 `msg` 直接显示给用户，所以要写成用户能看懂的中文。

| HTTP | code | 含义 | 前端行为 |
| --- | --- | --- | --- |
| 400 | 40000 | 参数错误 | 显示 `msg` |
| 404 | 40400 | 不存在 | 显示 `msg` |
| 409 | 40901 | 场景版本冲突 | 让用户选择，见[第 4.3 节](#43-版本冲突) |
| 409 | 40902 | 资源正在被使用 | 列出使用方，让用户确认 |
| 413 | 41300 | 超过大小限制 | 显示 `msg` |
| 422 | 42201 | 文件不是有效的 GLB | 显示 `msg` |
| 500 | 50000 | 服务器错误 | 显示 `msg` |

- **ID 一律是字符串。** 数据库用 64 位整数的话，JSON 里也要转成字符串，否则 JavaScript 会丢精度。只用字母、数字、`_`、`-`，因为 ID 要放进 URL。
- **时间用 ISO 8601 的 UTC 格式**，如 `2026-11-04T08:30:00.000Z`。
- **列表第一版不分页。**
- **大小限制：** 场景 JSON 8 MiB，单个模型文件 128 MiB，封面 1 MiB。网关的上传上限要放到比这些略大。

## 3. 场景信息（项目）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 后端生成 |
| `name` | string | 2～40 个字符 |
| `coverUrl` | string \| null | 封面地址，没有时为 `null` |
| `createdAt` | string | 创建时间 |
| `updatedAt` | string | 保存场景和重命名时更新，上传封面时**不**更新 |

- `GET /projects`：返回数组，按 `createdAt` 升序。
- `POST /projects`：请求 `{ "name": "新场景" }`，返回场景信息。后端不用创建默认场景。
- `PATCH /projects/{projectId}`：请求 `{ "name": "新名字" }`，返回场景信息。
- `DELETE /projects/{projectId}`：删除场景数据和封面，**不删除模型文件**，模型可能被别的场景使用。
- `PUT /projects/{projectId}/cover`：请求体是图片本身（`Content-Type: image/jpeg`），返回 `{ "coverUrl": "..." }`。前端每次保存后上传一次。

## 4. 场景

**核心思路：** 模型文件先单独上传拿到 `assetId`，场景 JSON 里只记 `assetId`。保存场景只传 JSON，读取时再按 `assetId` 下载文件。

后端把 JSON 原样存、原样返回，不需要读懂节点结构。

### 4.1 `GET /projects/{projectId}/scene`

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "revision": 12,
    "updatedAt": "2026-11-04T08:30:00.000Z",
    "document": { "version": 2, "projectId": "p_01", "说明": "完整结构见附录" }
  }
}
```

还没保存过时返回 200，`revision` 为 `0`，`document` 为 `null`。只有项目不存在才返回 404。

### 4.2 `PUT /projects/{projectId}/scene`

用户点保存时调用，每次都传整份 JSON。

```json
{
  "baseRevision": 12,
  "saveId": "3f1c9a52-6c0e-4a7b-9d1e-0a5b8f2c7e11",
  "document": { "version": 2, "projectId": "p_01", "说明": "完整结构见附录" }
}
```

| 字段 | 说明 |
| --- | --- |
| `baseRevision` | 这份修改基于哪个版本，第一次保存传 `0` |
| `saveId` | 前端为每次保存生成的 ID，重试时不变。和最近一次成功保存的相同时，直接返回那次的结果，避免网络重试被当成冲突 |
| `document` | 整份场景 JSON |

成功返回新版本号，同时更新项目的 `updatedAt`：

```json
{ "code": 0, "msg": "ok", "data": { "revision": 13, "updatedAt": "2026-11-04T08:31:00.000Z" } }
```

**后端要检查的：**

| 规则 | 不满足时 |
| --- | --- |
| `document.projectId` 等于路径里的 `projectId` | 400 |
| `document.version` 是正整数（当前是 2） | 400 |
| 序列化后不超过 8 MiB | 413 |
| `baseRevision` 等于当前版本 | 409 |

**后端不要做的：**

- **不要改写 `document`。** 保存什么就返回什么，`nodes` 等数组的顺序有含义。
- **不要因为模型不存在而拒绝保存。** 前端能打开缺模型的场景并给出提示。
- **不要严格校验未知字段。** 前端加字段时后端不用跟着升级。
- **不要往 `document` 里写账号、密码或 Token。** 场景文件会随项目包分发。

### 4.3 版本冲突

后保存的一方收到 409：

```json
{
  "code": 40901,
  "msg": "场景已被其他人修改",
  "data": {
    "currentRevision": 14,
    "updatedAt": "2026-11-04T08:32:00.000Z",
    "updatedBy": { "id": "u_02", "displayName": "示例用户 2" }
  }
}
```

前端让用户选择“加载最新”或“覆盖”。覆盖就是把 `baseRevision` 改成 `currentRevision` 再保存一次，后端不需要专门的强制参数。

## 5. 模型资源

资源库跨场景共享。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 后端生成 |
| `name` | string | 原始文件名，如 `cabinet.glb` |
| `assetType` | string | 当前只有 `model` |
| `mimeType` | string | `model/gltf-binary` |
| `size` | number | 字节数 |
| `sha256` | string | 后端计算 |
| `lastModified` | number | 文件修改时间（毫秒时间戳），导出项目包时要用 |
| `createdAt` | string | 上传时间 |

### 5.1 `POST /assets`

`multipart/form-data`，字段 `file`（文件）、`assetType`（`model`）、`lastModified`（可选，默认 `0`）。

```json
{
  "code": 0,
  "msg": "ok",
  "data": { "isNew": true, "asset": { "id": "asset_01", "name": "cabinet.glb", "说明": "其余字段见上表" } }
}
```

**去重：** `assetType` 和 `sha256` 都相同时不新建，返回已有资源和 `"isNew": false`（HTTP 200）；新建时 HTTP 201。必须去重：内置模型每次拖进场景都会上传一次。

**校验：** 文件头是 `glTF`，版本为 2，头部声明的长度等于文件长度。不通过返回 422。

### 5.2 读取

- `GET /assets`：返回资源数组，按 `createdAt` 降序。
- `GET /assets/{assetId}`：返回资源信息。
- `GET /assets/{assetId}/content`：返回文件内容，带 `Content-Type`、`Content-Length`，并且建议 `Cache-Control: private, max-age=31536000, immutable`（同一个 `assetId` 的内容永远不变）。打开场景时会同时请求所有用到的模型，要支持并发。

### 5.3 查询引用和删除

`GET /assets/{assetId}/usages` 返回 `{ "projects": [{ "id": "p_01", "name": "储能站" }] }`。

引用关系在保存场景时从 JSON 里取，这是后端唯一需要读懂场景内容的地方：`nodes` 中 `kind` 为 `model` 的节点的 `model.assetId`。

`DELETE /assets/{assetId}`：被场景引用时返回 409（`code` 为 40902），`data` 和查询引用相同。前端请用户确认后带 `?force=true` 再次请求。

## 6. 接口和文档不一样时

前端只有 [adapter.ts](../apps/editor/src/api/adapter.ts) 知道路径和字段名。不一样时不用改它：把 [adapter.local.example.ts](../apps/editor/src/api/adapter.local.example.ts) 复制成同目录的 `adapter.local.ts`，只写不一样的部分，放在公司分支上提交。GitHub 上没有这个文件，以后合并不会冲突。

后端地址写在 `apps/editor/.env.local`，配了它就不再启用模拟后端：

```text
VITE_API_BASE=https://后端地址/api/v1
```

## 7. 设备数据

设备数据不走上面的业务接口。场景在 `dataSources` 字段里配置数据地址，**浏览器直接连接**，这部分前端已经实现。

| 方式 | 说明 |
| --- | --- |
| WebSocket | 连接后前端发一条订阅消息，列出设备和变量；后端推送 JSON 文本帧。断开后按 1、2、4、8、10 秒退避重连 |
| HTTP 定时请求 | 按配置的间隔请求（默认 5 秒），`结果位置`填设备数据在返回值里的路径，如 `data` |
| 静态数据 | 在编辑器里手填，不需要后端 |

默认的数据格式是每条一台设备，字段名就是变量名：

```json
[{ "deviceId": "ESS-001", "soc": 72, "power": 128, "status": "运行中" }]
```

- `deviceId` 必须和场景绑定的设备编号完全一致，否则这条数据被忽略；多余的字段也被忽略。
- 数字变量接受数字和文本形式的数字，开关变量接受 `true`、`false`、`1`、`0`。
- 接口断开或请求失败时，前端清空这个接口提供的值，不留过期数据。
- **数值只能来自真实数据。** 前端不会生成或补全数据，后端也不要用默认值填充没有采集到的变量。
- **跨域：** 浏览器直连，所以跨域部署时后端要配 CORS。HTTPS 页面只能连 `wss://` 和 `https://`。
- **不能带密钥：** 地址和参数不能带 Token，因为配置会随项目包分发。需要认证的 HTTP 接口由使用 Viewer SDK 的一方通过 `data-request-headers` 提供。

## 附录：场景文档示例

```json
{
  "version": 2,
  "projectId": "p_01",
  "metadata": { "name": "储能站", "updatedAt": "2026-11-05T08:30:00.000Z" },
  "dataSources": [
    {
      "id": "source_01",
      "name": "静态数据",
      "type": "static",
      "enabled": true,
      "values": { "ESS-001": { "soc": 72, "status": "运行中" } }
    }
  ],
  "settings": { "说明": "天空、光照、地面等外观设置，后端不用关心" },
  "nodes": [
    {
      "id": "instance_01",
      "parentId": null,
      "name": "1 号储能柜",
      "kind": "model",
      "visible": true,
      "locked": false,
      "transform": { "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "model": { "assetId": "asset_01" }
    }
  ],
  "bindings": [
    {
      "id": "binding_01",
      "target": { "type": "asset-instance", "instanceId": "instance_01" },
      "device": { "id": "ESS-001", "name": "1 号储能柜" },
      "variables": [{ "id": "variable_01", "key": "soc", "name": "电量", "dataType": "number", "unit": "%" }]
    }
  ],
  "bookmarks": [
    {
      "id": "bookmark_01",
      "name": "全景",
      "view": { "position": [60, 45, 60], "target": [0, 0, 0] },
      "thumbnail": "data:image/jpeg;base64,..."
    }
  ],
  "panelTemplates": [
    {
      "id": "template_01",
      "name": "储能柜",
      "title": "",
      "fields": [{ "id": "field_01", "label": "电量", "variableKey": "soc", "unit": "%" }]
    }
  ],
  "panels": [{ "id": "panel_01", "templateId": "template_01", "nodeId": "instance_01" }]
}
```
