# @twin-studio/core 导读

core 是编辑器和 Viewer SDK 共用的内核：场景文档的格式与校验、编辑事务、把文档渲染成三维场景、实时数据、数据面板。它不依赖编辑器界面，编辑器（`apps/editor`）和 SDK（`packages/viewer`）都只是「组装」这些部件。

## 目录

```
src/
  domain/          数据长什么样：类型 + zod 校验 + 纯函数。
    scene/           场景文档（节点、变换、设置、镜头）
    twin/            设备绑定：节点 ↔ 设备 ↔ 变量
    dataSources/     数据接口：WebSocket、HTTP、静态数据
    panels/          数据面板：模板和实例
  document/        编辑事务：DocumentStore（撤销重做）、sceneOps（删除、复制、编组）
  engine/          three.js 渲染引擎：TwinEngine、相机、后期、天空光照
  infrastructure/  和外部打交道：数据接口的连接、.twin.zip 项目包、仓库接口
  runtime/         把文档和数据变成画面
    scene/           SceneSync：文档 → 三维对象
    twin/            运行时数据状态、TwinSceneRuntime（Viewer 的总装）、点击事件
    panels/          面板内容计算（resolvePanel）、跟随对象（PanelTracker）
  contract/        Viewer SDK 对外的类型
```

## 三条主线

- **文档是唯一的真相：** 修改只能走 `DocumentStore.transaction`，自动得到撤销重做。`SceneSync.update` 对比引用，只更新变了的节点。三维对象从不被直接修改。
- **数值只来自数据接口：** `TwinDataRuntime` 按配置启动接口，收到的值写进运行时状态（只在内存里，不进文档）。接口断开就清空它提供的值，core 不生成任何数据。
- **面板是预制体：** 模板定义字段，实例挂在节点上并只记录覆盖，`resolvePanel` 把模板、实例和当前数值合成要显示的内容。

## 测试

```bash
pnpm --filter @twin-studio/core test
```
