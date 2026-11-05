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

1. **摆场景：** 从底部资源栏把模型拖进视口，左栏是场景树，右栏改属性。
2. **存镜头：** 左栏「镜头」里点「添加当前镜头」，点缩略图卡片切换过去。
3. **配数据：** 不选中对象时，右栏是接口数据。选中对象填上设备编号，再填变量，就能接收这台设备的数据；没有后端接口时用静态数据手填。
4. **配面板：** 左栏「面板」里建模板，定义要显示哪些变量。把模板批量挂到对象上就是实例，改模板时所有实例一起变，实例也可以单独覆盖标题和隐藏字段。
5. **看效果：** 点「预览」，点击对象时相机聚焦并弹出面板。
6. **给大屏用：** 场景卡片的菜单里导出 `.twin.zip`，用 Viewer SDK 加载。

快捷键：W / E / R 切换移动、旋转、缩放，F 聚焦，Ctrl+S 保存，Ctrl+Z / Y 撤销重做，Ctrl+D 复制，Delete 删除，预览时 Esc 退出。

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
