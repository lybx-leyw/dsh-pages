# dsh-pages

[English](<README.md>) | 中文

![dsh-pages 与原生 DSH 工作台](<docs/screenshot.png>)

## 用途

为 DeepSeek Harness 增加常驻页面导航栏，内置 **DSH 工作台**（`home`）和 **页面管理**（`pages`）。产品页面与原生工作台并存，不替换、不重挂载原生 root。

## 安装

```sh
npm i dsh-pages
```

加入 profile 的 bundle：

```yaml
- id: dsh-pages
  name: dsh-pages
```

## 快速使用

产品 bundle 也可以通过代码安装同一套页面壳：

```js
import { apply } from 'dsh-pages/client';

await apply(ctx);
```

`apply` 与 `applyWithConfig` 均安装正式页面壳，没有另一套遗留入口。等待安装完成，并声明客户端入口要求的宿主依赖。消费 `ctx.pages` 的插件应等待服务可用，不要让创建该服务的插件反过来注入它。

页面导航元数据与内容分开注册，使用同一 id，并分别管理清理：

```jsx
ctx.effect(() => ctx.pages.registerPage({
  id: 'notes', label: '笔记', glyph: 'N', region: 'top', order: 10,
}));

ctx.effect(() => ctx.slots.inject('page.content', () =>
  ctx.slots.register({ name: 'page.content', key: 'notes' }, NotesPage)
));
```

`NotesPage` 是你自己的 React 组件。存活页面的 id 必须唯一。移除活动页面后返回工作台；保存的偏好不会凭空创建已卸载插件的页面。

## 页面管理操作

打开 **页面管理**，调整页面排列：

- `top`：导航栏顶部的普通入口。
- `overflow`：回收组；非空时显示 **…**，可从中打开页面。
- `bottom`：导航栏底部的入口。
- 可调整分组、排序、打开或回收页面。管理页自身也能回收，并从 **…** 重新打开。
- 固定回收页面后，在顶部组的 **…** 后追加快捷入口。页面仍留在回收组，取消固定只移除快捷入口。
- 导航宽度可设为 **40–96px**，默认 **64px**，实时生效并本地保存。

明确修改的排列、固定状态与宽度会在同一浏览器、同一 origin 刷新后恢复，不跨设备或标签页同步。

## 限制

- 原生 root 与设置 UI 仍由 DSH 拥有。本包不导出原生槽、不重建设置、不自动把浮窗转为页面。
- 被覆盖的原生 UI 保持挂载。切页不会停止原生插件、后台任务或全局快捷键。
- 不是 iframe，也不是安全沙箱；插件共享文档与服务。
- 宿主槽契约、overlay 层级、root 几何与浏览器 CSS 支持仍影响兼容性。不宣称任意第三方插件已兼容，也不宣称最新实机验证通过。
- 存储失败时操作仍可在内存中使用，但偏好可能无法跨刷新保留。

实现原理、生命周期边界及废弃方案见[设计说明](<DESIGN-ZH.md>)。

## 许可证

MIT
