/**
 * 说明：`Index` 页面模块。
 *
 * 职责：
 * - 承载 `Index` 相关的当前文件实现与模块边界；
 * - 对外暴露 `Index` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { IndexPageView } from './index-page/IndexPageView';

/** 首页薄入口页面。 */
export default function Index() {
  return <IndexPageView />;
}
