/**
 * 说明：`ThinkingBlock` 组件模块。
 *
 * 职责：
 * - 承载 `ThinkingBlock` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ThinkingBlock` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useState } from 'react';
import { Brain } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { TraceDisclosure } from './TraceDisclosure';

/** ThinkingBlock 组件入参：展示可折叠的推理/思考过程 */
interface Props {
  /** 推理文本内容 */
  content: string;
  /** 推理内容是否仍在流式输出中 */
  isStreaming?: boolean;
  /** 可选：受控展开状态 */
  expanded?: boolean;
  /** 可选：受控展开状态变更回调 */
  onExpandedChange?: (next: boolean) => void;
}

/**
 * 可折叠的推理过程区块（用于支持 reasoning/thinking 的模型）。
 * 展示模型在生成时回传的推理文本（例如 o3、DeepSeek-R1、Claude thinking 等）。
 */
export function ThinkingBlock({ content, isStreaming, expanded: controlledExpanded, onExpandedChange }: Props) {
  const { t } = useTranslation();
  const [innerExpanded, setInnerExpanded] = useState(false);
  const expanded = typeof controlledExpanded === 'boolean' ? controlledExpanded : innerExpanded;

  /**
   * 更新推理区块的展开状态。
   *
   * 说明：
   * - 支持受控与非受控两种模式；
   * - 当外部传入 `onExpandedChange` 时，内部不再自行维护状态，避免双写不同步。
   */
  const setExpanded = (next: boolean) => {
    if (onExpandedChange) {
      onExpandedChange(next);
      return;
    }
    setInnerExpanded(next);
  };

  if (!content) return null;

  return (
    <TraceDisclosure
      open={expanded}
      onOpenChange={setExpanded}
      leading={<Brain className={`h-3.5 w-3.5 ${isStreaming ? 'animate-pulse text-amber-500' : ''}`} />}
      title={isStreaming ? t('chat.thinking') : t('chat.thinkingProcess')}
      subtitle={content.length > 100 ? t('chat.approxChars', { count: Math.ceil(content.length / 4) }) : undefined}
      className="bg-muted/30"
      contentClassName="pt-1"
    >
      <pre className="min-w-0 max-h-80 overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs leading-relaxed text-muted-foreground">
        {content}
      </pre>
    </TraceDisclosure>
  );
}
