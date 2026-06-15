/**
 * 说明：`SearchPopup` 组件模块。
 *
 * 职责：
 * - 承载 `SearchPopup` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SearchPopup` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useSearchPopupView, type SearchPopupProps } from './useSearchPopupView';

/** SearchPopup 薄入口组件。 */
export function SearchPopup(props: SearchPopupProps) {
  return useSearchPopupView(props);
}
