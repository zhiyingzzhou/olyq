/**
 * 说明：`MarkdownRenderer` 组件模块。
 *
 * 职责：
 * - 承载 `MarkdownRenderer` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MarkdownRendererProps`、`MarkdownRenderer` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { memo } from 'react';
import MarkdownRendererImpl from './MarkdownRendererImpl';

/** 导出类型：`MarkdownRendererProps`。 */
export interface MarkdownRendererProps {
  content: string;
  idPrefix?: string;
  isStreaming?: boolean;
}

/**
 * 导出组件：`MarkdownRenderer`。
 *
 * @remarks
 * 负责承载当前文件对应的界面渲染、交互编排和视图层边界。
 */
export const MarkdownRenderer = memo(function MarkdownRenderer({ content, idPrefix, isStreaming = false }: MarkdownRendererProps) {
  return <MarkdownRendererImpl content={content} idPrefix={idPrefix} isStreaming={isStreaming} />;
});

export default MarkdownRenderer;
