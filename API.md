# Twin Studio MVP 前后端接口文档

资源库和场景编辑器共用模型。一个项目对应一份场景文档，场景节点通过 `assetId` 引用模型。正式环境由**业务后端和对象存储**组成。业务后端保存项目、场景版本、资源元数据与文件引用，对象存储保存 GLB、模型缩略图和项目封面。

| 联调范围 | 当前状态 |
| --- | --- |
| 项目、场景、模型列表与管理 | 前端和开发模拟服务已有实现，默认前缀为 `/api/v1` |
| 文件上传 | 当前代码用 multipart 上传模型，用二进制 PUT 写封面和缩略图 |
| 对象存储直传 | 正式环境已确定采用“获取预签名上传地址 → 浏览器上传 → 调用创建文件接口”。下文给出可对接的路径、字段和错误码提案，尚未接入当前前端或模拟服务 |
| 实时设备数据 | 浏览器按场景配置连接设备数据源，独立于项目管理 API |

## 1. 联调约定

开发时运行 `pnpm dev`，默认请求同源的 `/api/v1`，模拟数据保存在 `apps/editor/.mock-data/`。联调真实服务时，在 `apps/editor/.env.local` 设置 `VITE_API_BASE=https://api.example.com/api/v1` 并重启开发服务。此时 Vite 会关闭模拟接口。以下业务路径均省略此前缀。

业务接口接收 JSON 时使用 `Content-Type: application/json`，成功、失败均返回 `{code, msg, data}`。下文表格中的“返回”指 `data`。创建成功通常返回 HTTP 201，列表、更新或删除成功通常返回 200，删除的 `data` 为 `null`。文件读取及对象存储直传使用二进制协议。

```json
{ "code": 0, "msg": "ok", "data": { "revision": 1, "updatedAt": "2026-11-20T02:00:00.000Z" } }
```

ID 使用字符串，路径参数按 URL 编码。业务时间使用 UTC ISO 8601，文件的 `lastModified` 使用 Unix 毫秒时间戳，`size` 为字节数。列表直接返回数组，当前无分页参数。开发模拟服务无登录；生产鉴权沿用业务后端的部署约定。业务接口和文件读取地址若跨域，需允许编辑器及使用 Viewer 的站点访问。返回给图片标签的 URL 应可直接使用，跨域部署时返回完整地址。

## 2. 正式环境的文件上传协议（待接入）

一次文件上传调用**两个业务接口**。中间的 PUT 请求直接发给对象存储。一个模型及其可选缩略图是两个文件，分别走一次流程。文件创建成功后，用业务接口把文件关联到资源或项目。

| 顺序 | 浏览器请求 | 成功结果 |
| --- | --- | --- |
| 1 | 业务后端 `POST /files/presign` | 获取本次上传的 `uploadId`、临时写入 URL、方法、请求头和有效期 |
| 2 | 对象存储 `PUT {uploadUrl}` | PUT 原始字节，收到存储服务的 2xx |
| 3 | 业务后端 `POST /files` | 业务后端校验已上传对象并登记，返回可引用的稳定 `fileId` |

### 2.1 获取预签名上传地址

`POST /files/presign`。每次为一个文件申请。以下示例上传储能柜模型。

```json
{ "purpose": "model", "name": "cabinet.glb", "mimeType": "model/gltf-binary", "size": 446464 }
```

| purpose | mimeType | 单文件上限 | 文件来源 |
| --- | --- | --- | --- |
| `model` | `model/gltf-binary` | 128 MiB | 用户选择的 GLB 2.0 原文件 |
| `model-thumbnail` | `image/png` | 512 KiB | 浏览器 Three.js 离屏渲染的 320 × 200 透明 PNG，可缺省。初始化导入的 WebP 沿用原图 |
| `project-cover` | `image/jpeg` | 1 MiB | 自动截图、镜头快照或用户上传后转换的 JPEG；卡片上传入口支持 JPG、PNG、WebP，转换为 960 × 540 |

成功示例（HTTP 200）。示例域名和签名仅作占位。后端生成对象键，绑定本次上传的用途、大小、类型及有效期，浏览器按原样使用返回的 URL 和请求头。

```json
{
  "code": 0, "msg": "ok",
  "data": {
    "uploadId": "up_01",
    "uploadUrl": "https://objects.example.com/staging/up_01?signature=EXAMPLE",
    "method": "PUT",
    "headers": { "Content-Type": "model/gltf-binary" },
    "expiresAt": "2026-11-20T02:10:00.000Z"
  }
}
```

### 2.2 浏览器直传文件

下面的 `ticket` 是上一步响应的 `data`，`file` 是原始 File 或 Blob。不要包装成 FormData，也不要向对象存储转发业务接口的登录头。存储端可能返回空响应体。

```js
const uploaded = await fetch(ticket.uploadUrl, {
  method: ticket.method,
  headers: ticket.headers,
  body: file,
  credentials: 'omit',
})
if (!uploaded.ok) throw new Error(`文件上传失败（HTTP ${uploaded.status}）`)
```

对象存储的 CORS 要允许前端来源、PUT 和签名中要求的请求头，浏览器能通过预检。前端以 HTTP 成功状态判断是否继续。签名过期或签名头不匹配时，先核对请求头，再申请新地址上传。对象存储的错误响应遵循存储服务自身格式。

### 2.3 创建文件记录

`POST /files`。提交签发时的上传凭据标识。服务端通过 `uploadId` 找到预期的对象，核对归属、用途、实际字节数和文件内容。模型需验证 GLB 标识、版本与声明长度，并据实际内容计算摘要。登记后的 fileId 必须对应不可变的字节，可固定对象版本或将暂存对象转存到不可写的最终键。

```json
{ "uploadId": "up_01" }
```

成功示例（首次 HTTP 201）。相同 `uploadId` 重试返回相同 `fileId`（HTTP 200）。示例中的摘要表示服务端计算的 64 位十六进制 SHA-256。

```json
{
  "code": 0, "msg": "ok",
  "data": {
    "fileId": "file_glb_01", "purpose": "model", "name": "cabinet.glb",
    "mimeType": "model/gltf-binary", "size": 446464,
    "sha256": "38bda159d459906b21bf725dbea32db81128ea1ccd146c386511e529eb2ca102"
  }
}
```

如果 PUT 成功但创建文件超时，前端以原 `uploadId` 重试创建。业务后端应先检查已登记的结果，再判断凭据是否过期。没有传完的对象不能登记；上传成功但中途取消、或创建后未被业务引用的文件，可按引用和保留期限回收。

### 2.4 把文件关联到业务对象

以下是正式接入后需要支持的 JSON 写入方式，与第 5 节的当前二进制写入方式对应。后端须验证 `fileId` 已登记且用途匹配。

| 操作 | JSON 请求示例 | 返回 |
| --- | --- | --- |
| `POST /assets` 创建模型资源 | `{"fileId":"file_glb_01","thumbnailFileId":"file_png_01","assetType":"model","title":"储能柜","lastModified":1795136400000}` | `{isNew, asset}`，含可被场景引用的 `asset.id`。没有缩略图时省略 `thumbnailFileId` |
| `PUT /assets/{assetId}/thumbnail` 补图 | `{"fileId":"file_png_02"}` | 完整资源信息，只补空缺 |
| `PUT /projects/{projectId}/cover?source=upload` 更换封面 | `{"fileId":"file_jpeg_01"}` | `{"coverUrl":"https://api.example.com/api/v1/projects/p_01/cover?v=2"}`。镜头和自动封面使用第 3 节的查询参数规则 |

例如，先用 `model` 和 `model-thumbnail` 分别签发、上传、创建，取得上表两个文件 ID，再创建资源。后续场景保存 `node.model.assetId = asset.id`。文件 ID 标识字节，资源 ID 标识模型库条目；改标题、改封面和签名过期都不改变场景里的模型 ID。重复创建同内容模型时按第 5 节的去重规则返回已有条目。

下载可保留业务后端的稳定读取路径（第 3、5 节），由后端响应文件或重定向到短期签名的 GET 地址。场景文档和资源记录持久化 ID 或对象键；每次读取可刷新临时地址。图像地址要支持浏览器直接加载，模型下载要支持编辑器的 fetch 和 Viewer 跨域读取。

前端接入位置为 `HttpAssetRepository.uploadFile/saveThumbnail` 和 `projectApi.setCover`。它们需要编排签发、直传、登记和业务绑定四步；路径或字段映射可放在 adapter 中。开发模拟服务也需补对应协议，或继续保留现有上传方式供本地开发。

## 3. 项目与卡片封面

| 方法与路径 | 请求 | 返回 |
| --- | --- | --- |
| `GET /projects` | 无 | `Project[]`，模拟服务按创建顺序 |
| `POST /projects` | `{"name":"储能站","description":"一期设备"}` | 201，完整 Project |
| `GET /projects/{id}` | 无 | Project；项目不存在为 404 |
| `PATCH /projects/{id}` | `{"name":"储能站二期","description":""}` | 更新后的 Project；支持只传要改的字段 |
| `DELETE /projects/{id}` | 无 | `null`。删除项目及其场景、封面关联，共享模型继续可用 |
| `PUT /projects/{id}/cover` | 当前请求体为 JPEG 原始字节，正式直传后见 2.4 | `{"coverUrl":"/api/v1/projects/p_01/cover?v=2"}` |
| `GET /projects/{id}/cover` | 可带缓存版本参数 `v` | JPEG 二进制；未设置时 404 |

Project 示例。标题输入范围为 2–40 个字符，描述最多 200 个字符，可为空。新项目尚未设置封面时 `coverUrl` 为 null，旧数据可能缺少来源字段。

```json
{
  "id": "p_01", "name": "储能站", "description": "一期设备",
  "coverUrl": "/api/v1/projects/p_01/cover?v=2",
  "coverSource": "bookmark", "coverBookmarkId": "view_01",
  "createdAt": "2026-11-20T01:00:00.000Z", "updatedAt": "2026-11-20T02:00:00.000Z"
}
```

封面 PUT 有三种语义。写封面只更新封面及其来源，保留项目的 `updatedAt`。

- 无查询参数为自动截图（`auto`）。已有手动封面时返回其现有 URL，保留原图。
- `?bookmarkId=view_01` 将当时的画面作为独立封面，来源为 `bookmark`。之后改名或删除镜头仍可读取这张封面。
- `?source=upload` 采用用户上传图片，来源为 `upload`，清空 `coverBookmarkId`。两个手动来源不能同时指定。替换成功后返回新版本 URL，使卡片立即刷新。

## 4. 场景文档的加载和保存

`GET /projects/{id}/scene` 返回 `{revision, updatedAt, document}`。项目存在但从未保存时返回 HTTP 200，内容如下。

```json
{ "code": 0, "msg": "ok", "data": { "revision": 0, "updatedAt": null, "document": null } }
```

`PUT /projects/{id}/scene` 用 JSON 保存整份文档，请求体上限 8 MiB。下例是给项目 `p_01` 首次保存一个储能柜实例的请求。GLB 已作为 `asset_01` 入库。

```json
{
  "baseRevision": 0,
  "saveId": "60d045ce-788b-4b2a-ba31-b181ac6624dd",
  "document": {
    "version": 2,
    "projectId": "p_01",
    "metadata": { "name": "储能站", "updatedAt": "2026-11-20T02:00:00.000Z" },
    "settings": {
      "helpers": { "grid": true, "axes": false },
      "ground": { "enabled": true, "size": 600, "color": "#3a3f44" },
      "sky": { "mode": "physical", "color": "#20242a", "hdrAssetId": null, "environmentIntensity": 0.7 },
      "time": { "hour": 15, "azimuth": 30 },
      "lighting": { "ambientIntensity": 0.6, "sunIntensity": 2.4, "shadows": true },
      "fog": { "enabled": true, "density": 0.3 },
      "post": { "exposure": 1, "bloom": { "enabled": true, "intensity": 0.7, "threshold": 1 }, "vignette": true, "contrast": 0.06, "saturation": 0.05 }
    },
    "nodes": [{
      "id": "node_01", "kind": "model", "name": "1 号柜", "parentId": null,
      "transform": { "position": [0,0,0], "rotation": [0,0,0], "scale": [1,1,1] },
      "visible": true, "locked": false, "model": { "assetId": "asset_01" }
    }],
    "bindings": [], "bookmarks": []
  }
}
```

`version` 是文档格式版本（当前为 2）；`revision` 是本项目成功保存的次数。路径 ID 必须与 `document.projectId` 一致。后端原样保存字段及数组顺序，提取模型引用供删除检查。旧资源缺失仍允许保存。相机、镜头、信息面板、数据源、设备绑定和自定义设备类型都随场景保存。`deviceTemplates` 缺省表示使用内置类型，显式空数组表示已全部删除。镜头的小预览图可内嵌在 `bookmarks[].thumbnail`，它与项目卡片封面各自保存。

同一项目内原子校验版本并写入。最新一次成功保存的 `saveId` 遇到相同内容重试时，返回前次结果。否则比较 `baseRevision`，成功时递增版本并更新项目时间（响应示例见第 1 节）；不相同时返回 HTTP 409：

```json
{
  "code": 40901, "msg": "场景已被其他人修改",
  "data": { "currentRevision": 2, "updatedAt": "2026-11-20T02:05:00.000Z", "updatedBy": { "id": "u_02", "displayName": "张工" } }
}
```

前端可加载最新文档，或由用户确认覆盖后以 `currentRevision` 为基准重新保存。网络超时重试同一份内容时沿用原 `saveId`。

## 5. 模型资源库

| 方法与路径 | 请求 | 成功返回 |
| --- | --- | --- |
| `GET /assets` | 无 | 共享资源数组。所有模型共用一份列表，无分类参数 |
| `POST /assets` | 当前 multipart 表单，正式环境的 JSON 方案见 2.4 | `{isNew, asset}`，新建 201，重复 200 |
| `GET /assets/{id}` | 无 | 完整资源信息 |
| `GET /assets/{id}/content` | 无 | 原文件二进制。模拟服务返回 `application/octet-stream` 和 `Content-Length` |
| `PATCH /assets/{id}` | `{"title":"二期储能柜"}` | 更新后的资源信息 |
| `GET /assets/{id}/thumbnail` | 无 | PNG 或 WebP 二进制，缺图 404 |
| `PUT /assets/{id}/thumbnail` | 当前为 PNG 原始字节，正式环境传 fileId | 只补缺图，返回完整资源信息 |
| `GET /assets/{id}/usages` | 无 | `{"projects":[{"id":"p_01","name":"储能站"}],"components":[],"versionCount":0}`，编辑器使用项目名 |
| `DELETE /assets/{id}` | 可选 `?force=true` | `null`。有已保存场景引用时先返回 40902，经用户确认才强制删除 |

创建模型的返回示例。缺省 `title` 时前端显示去掉 .glb 的文件名；缺省 `scale` 为 1。`thumbnailUrl` 可为空。后端按原始文件字节计算大小与摘要，展示标题（去空白后 1–100 个字符）独立于文件名。

```json
{
  "code": 0, "msg": "ok",
  "data": {
    "isNew": true,
    "asset": {
      "id": "asset_01", "name": "cabinet.glb", "title": "储能柜", "assetType": "model",
      "mimeType": "model/gltf-binary", "size": 446464,
      "sha256": "38bda159d459906b21bf725dbea32db81128ea1ccd146c386511e529eb2ca102",
      "thumbnailUrl": "/api/v1/assets/asset_01/thumbnail", "scale": 1,
      "lastModified": 1795136400000, "createdAt": "2026-11-20T02:00:00.000Z"
    }
  }
}
```

当前模拟服务的上传示例（需先启动 `pnpm dev`，替换本地文件路径）。`thumbnail` 和 `lastModified` 可省略，后者默认 0。

```sh
curl http://localhost:5173/api/v1/assets \
  -F 'assetType=model' -F 'title=储能柜' \
  -F 'file=@cabinet.glb;type=model/gltf-binary' \
  -F 'thumbnail=@cabinet.png;type=image/png'
```

- GLB 检查文件头、版本 2 和声明长度。`assetType + sha256` 相同则复用现有 ID 和标题；仅在已有条目缺图时补图。多选上传逐个返回结果。
- 初始模型按 `apps/editor/public/models/catalog.json` 一次性导入，保留默认缩放和 WebP 预览；升级按内容复用旧 ID。记录初始化状态，避免用户删除的模型在重启时重新出现。WebGL 不可用时仍可上传模型，后续显示卡片时可补 PNG。
- 引用来自已保存文档的 `nodes[].model.assetId`（`kind === "model"`）。强制删除成功后旧文档中可能仍有该 ID。删除资源记录及其文件关联前检查引用，物理文件若仍有其他引用应保留。

## 6. 设备数据

外部 Vue 大屏可在 `TwinSceneViewer` 上按设备配置点击聚焦，订阅 `target-click` 取得箱子的数据，也可从设备列表调用 `selectDevice`、`focusDevice` 驱动场景。持续显示变量值时，读取同一个 Viewer 的运行时状态即可复用已有数据连接。[外部大屏接入示例](packages/viewer/README.md#外部大屏接入示例)

设备接口由场景 `dataSources` 配置，浏览器可以直连 HTTP 或 WebSocket。静态值、设备模板及绑定保存在场景 JSON 中。业务后端无需为新增设备类型提供单独接口。

以设备 `ESS-001` 的数值变量 `soc` 为例。HTTP 默认打开时读取一次，可配置定时读取。若数据位置配置为 `data`，下面的 HTTP 响应会把电量更新为 72：

```json
{ "data": [{ "deviceId": "ESS-001", "soc": 72 }] }
```

默认 WebSocket 订阅报文如下。服务端可推送 `{"deviceId":"ESS-001","soc":73}`。配置了自定义订阅消息或字段映射时，按该场景的配置解释数据。设备编号和变量键与绑定匹配后才会更新。

```json
{ "type": "subscribe", "devices": [{ "deviceId": "ESS-001", "variables": [{ "key": "soc", "dataType": "number" }] }] }
```

## 7. 错误与联调验收

| HTTP / 业务码 | 触发情形 | 调用方处理 |
| --- | --- | --- |
| 400 / 40000 | 参数不合法、封面格式错误或来源冲突 | 展示 `msg` 后修正；当前模拟服务的缩略图不合规格也返回此码 |
| 404 / 40400 | 项目、资源或指定图片不存在 | 显示缺失状态；区分尚未保存的空场景（200） |
| 409 / 40901 | 场景版本变化 | 按第 4 节处理 |
| 409 / 40902 | 模型正在被项目使用 | 读取 `data.projects` 展示项目名称，确认后再发强制删除 |
| 413 / 41300 | 文件或场景超过上限 | 提示实际限制 |
| 422 / 42201 | GLB 校验失败 | 更换有效文件 |
| 500 / 50000 | 服务端异常 | 显示错误，保留本次操作以便重试 |
| 409 / 40903（提案） | 创建文件时对象尚未上传完成 | 确认 PUT 已成功，再以相同 uploadId 创建 |
| 410 / 41000（提案） | 未完成登记的上传任务已过期 | 重新申请、上传、登记 |

联调时用同一个模型从头走一遍：上传文件和可选缩略图，创建资源，拖入场景，保存后刷新，再读回同一个 `assetId` 并加载 GLB。随后验证重复上传沿用 ID、重复创建文件返回相同结果、两端同时保存出现 40901、删除被引用模型出现 40902，以及删除来源镜头后封面仍然可读。对预签名流程另测上传失败和签名过期，两种情况都应让用户可以重试且资源列表不会出现空条目。

实现对照见 [业务请求与响应转换](apps/editor/src/api/adapter.ts)、[业务调用顺序](apps/editor/src/api/repositories.ts)、[开发模拟后端](apps/editor/mock/mockApi.ts) 和 [场景文档结构](packages/core/src/domain/scene/sceneSchemaV2.ts)。
