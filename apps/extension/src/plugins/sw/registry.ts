/**
 * 说明：`registry` 源码模块。
 *
 * 职责：
 * - 承载 `registry` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SW_PLUGINS` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { SwPlugin } from './host';
import { elementPickerSwPlugin } from './plugins/element-picker';
import { pageToolSessionSwPlugin } from './plugins/page-tool-session';
import { screenshotEditorSwPlugin } from '../page-tools/screenshot-capture/sw-plugin';

/**
 * 说明：Service Worker 插件注册表（激活事件 + 动态导入）
 *
 * 备注：
 * - SW 也支持懒加载，以降低 SW 首次拉起时的解析/执行成本
 * - 但你关心的"侧边栏首屏包体"主要在 UI 侧；这里更多是架构一致性与可抽离性
 */
export const SW_PLUGINS: SwPlugin[] = [elementPickerSwPlugin, screenshotEditorSwPlugin, pageToolSessionSwPlugin];
