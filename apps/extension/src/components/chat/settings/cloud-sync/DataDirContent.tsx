/**
 * 说明：`DataDirContent` 组件模块。
 *
 * 职责：
 * - 承载 `DataDirContent` 相关的当前文件实现与模块边界；
 * - 对外暴露 `DataDirContent` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useDataDirContentView } from './useDataDirContentView';

/** DataDirContent 薄入口组件。 */
export function DataDirContent() {
  return useDataDirContentView();
}
