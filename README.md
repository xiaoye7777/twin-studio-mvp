# Twin Studio

数字孪生三维场景编辑器和 Viewer SDK。

## 运行

需要 Node 20.16+ 和 pnpm 10.20。

```bash
pnpm install
```

```bash
pnpm dev
```

自带模拟后端，数据存在 `apps/editor/.mock-data/`。要连真实后端，见[接口文档第 6 章](docs/editor-api.md#6-接口和文档不一样时)。

## 目录

| 路径 | 内容 |
| --- | --- |
| `apps/editor` | 编辑器：3D 场景列表、资源库、场景编辑器 |
| `packages/core` | 场景格式、渲染引擎、数据运行时，编辑器和 Viewer 共用 |
| `packages/viewer` | 给数据大屏用的 Viewer SDK，用法见[它的说明](packages/viewer/README.md) |
| `docs/editor-api.md` | 和后端约定的接口 |

## 编辑器怎么用

1. **摆场景：** 从底部资源栏把模型拖进视口，左栏是场景树，右栏改属性。视口左侧切换选择、移动、旋转、缩放，右上角切换透视、顶、前、右视图。
2. **存镜头：** 左栏「镜头」里点「添加当前镜头」，点缩略图卡片切换过去。
3. **配数据：** 不选中对象时，右栏是数据接口，一条条添加：HTTP（默认只请求一次，可以打开定时请求）、WebSocket 推送、手填的静态数据。选中对象后在「数据」页签绑定设备。
4. **加信息面板：** 场景树上方点「标签」新建标签组，选中它，右栏配置模板（标题、宽度、字段），再点「添加子元素」，在场景里左键点击放置面板。面板放在标签组下面，改模板时一起变，也可以单独覆盖标题和隐藏字段。面板和物体一样近大远小，并且始终面向镜头。
5. **看效果：** 点「预览」，点击对象时相机聚焦。
6. **给大屏用：** 保存后场景就是后端的一份 JSON，大屏取到 JSON，交给 Viewer SDK，SDK 按资源 ID 要模型文件。

快捷键：Q / W / E / R 选择、移动、旋转、缩放；F 聚焦；H 显隐；End 放到地面；0 / 7 / 1 / 3 透视、顶、前、右视图；Ctrl+S 保存；Ctrl+Z / Y 撤销重做；Ctrl+C / V 复制粘贴；Ctrl+D 创建副本；Ctrl+G 组合；Delete 删除；P 预览；Esc 退出预览或结束放置。

## 检查

```bash
pnpm lint
```

```bash
pnpm format:check
```

```bash
pnpm type-check
```

```bash
pnpm test:unit
```

```bash
pnpm build
```
