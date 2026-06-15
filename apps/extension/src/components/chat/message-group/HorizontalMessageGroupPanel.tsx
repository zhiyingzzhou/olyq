/**
 * 说明：`HorizontalMessageGroupPanel` 组件模块。
 *
 * 职责：
 * - 承载横向固定比较面板的当前文件实现与模块边界；
 * - 对外暴露多模型 `horizontal` 模式下的卡片壳、内部滚动区和联动滚动同步；
 *
 * 边界：
 * - 本文件只处理横向固定比较面板；
 * - 不接管其它布局模式和主聊天区滚动。
 */
import type { Message } from '@/types/chat';
import { ScrollArea } from '@/components/ui/scroll-area';

import { resolveHorizontalMessageGroupColumnClassName } from './layout-helpers';
import { ModelCard } from './ModelCard';
import { useSynchronizedScrollGroup } from './useSynchronizedScrollGroup';
import type { MessageGroupPresentation } from './types';

/** 横向固定比较面板入参。 */
interface HorizontalMessageGroupPanelProps {
  /** 当前聊天区可用高度推导出的固定面板高度。 */
  readonly panelHeight: number;
  /** 当前横向 compare 所处的承载壳体模式。 */
  readonly presentation: MessageGroupPresentation;
  /** 当前分组内参与横向比较的 assistant 列。 */
  readonly sortedAssistants: Message[];
  /** 本组是否仍存在流式生成中的 assistant。 */
  readonly isLoading: boolean;
  /** 当前发送前 browser-context 临时阶段；仅用于解释尚未进入模型流的等待来源，不持久化。 */
  readonly browserContextPreflightPhase?: 'style-capture' | null;
  /** 模型标签解析器。 */
  readonly getModelLabel: (id: string) => string;
  /** providerId 对应的 logo。 */
  readonly getProviderLogo?: (providerId: string) => string | undefined;
  /** useful 切换。 */
  readonly onToggleUseful: (assistantMsgId: string) => void;
  /** 重试前是否二次确认。 */
  readonly confirmRegenerate?: boolean;
  /** 翻译目标语言列表。 */
  readonly translateLanguages?: string[];
  /** 触发单条翻译。 */
  readonly onTranslate?: (assistantMsgId: string, language: string) => void;
  /** 清空翻译。 */
  readonly onClearTranslations?: (assistantMsgId: string) => void;
  /** 删除单个翻译。 */
  readonly onRemoveTranslation?: (assistantMsgId: string, language: string) => void;
  /** 重试单条 assistant。 */
  readonly onRegenerateAssistant?: (assistantMsgId: string) => void;
  /** 朗读单条 assistant。 */
  readonly onSpeakAssistant?: (assistantMsgId: string) => void;
  /** 思考展开态集合。 */
  readonly thinkingExpandedIds?: Set<string>;
  /** 思考展开态变化回调。 */
  readonly onThinkingExpandedChange?: (assistantMsgId: string, next: boolean) => void;
  /** 是否显示大纲。 */
  readonly showOutline: boolean;
  /** 当前是否多选模式。 */
  readonly multiSelectMode: boolean;
  /** 当前已选中的消息 ID。 */
  readonly selectedIds: ReadonlySet<string>;
  /** 切换 assistant 选中态。 */
  readonly onToggleSelect: (assistantMsgId: string) => void;
  /** MCP/工具 Abort。 */
  readonly onToolAbort?: (toolCallId: string) => void;
}

/**
 * 导出组件：`HorizontalMessageGroupPanel`。
 *
 * @remarks
 * 这是 `horizontal` 固定比较面板的专用承载面；
 * 正文滚动会在这里按各列对应的阅读进度映射同步到其它列。
 */
export function HorizontalMessageGroupPanel({
  panelHeight,
  presentation,
  sortedAssistants,
  isLoading,
  browserContextPreflightPhase,
  getModelLabel,
  getProviderLogo,
  onToggleUseful,
  confirmRegenerate,
  translateLanguages,
  onTranslate,
  onClearTranslations,
  onRemoveTranslation,
  onRegenerateAssistant,
  onSpeakAssistant,
  thinkingExpandedIds,
  onThinkingExpandedChange,
  showOutline,
  multiSelectMode,
  selectedIds,
  onToggleSelect,
  onToolAbort,
}: HorizontalMessageGroupPanelProps) {
  const synchronizedScrollGroup = useSynchronizedScrollGroup(
    sortedAssistants.map((message) => message.id),
    true,
  );
  const columnClassName = resolveHorizontalMessageGroupColumnClassName(presentation);

  return (
    <div
      data-testid="message-group-horizontal-panel"
      data-panel-height={String(panelHeight)}
      className="relative min-h-0 w-full overflow-hidden"
      style={{ height: panelHeight }}
    >
      <ScrollArea
        scrollbars="horizontal"
        scrollbarVisibility="hover"
        wheelBehavior="horizontal"
        className="h-full w-full"
        viewportClassName="h-full touch-pan-x overscroll-x-contain"
      >
        {/* rail 只保留顶部呼吸感和右侧滚动安全空间；高度同步扣掉顶部间距，避免再次把列底部挤出视口。 */}
        <div
          data-testid="message-group-horizontal-rail"
          className="flex h-[calc(100%-0.5rem)] min-h-0 w-max min-w-full items-stretch gap-2 box-border pt-2 pr-2"
        >
          {sortedAssistants.map((message) => {
            const scrollBinding = synchronizedScrollGroup.getBinding(message.id);
            return (
              <div
                key={message.id}
                data-testid="message-group-horizontal-column"
                className={columnClassName}
              >
                <ModelCard
                  cardClassName="h-full min-h-0 flex flex-1 flex-col"
                  contentClassName="min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y [scrollbar-gutter:stable] [overflow-anchor:none]"
                  contentContainerRef={scrollBinding.ref}
                  message={message}
                  isLoading={isLoading}
                  browserContextPreflightPhase={browserContextPreflightPhase}
                  getModelLabel={getModelLabel}
                  getProviderLogo={getProviderLogo}
                  onToggleUseful={onToggleUseful}
                  confirmRegenerate={confirmRegenerate}
                  translateLanguages={translateLanguages}
                  onTranslate={onTranslate}
                  onClearTranslations={onClearTranslations}
                  onRemoveTranslation={onRemoveTranslation}
                  onRegenerateAssistant={onRegenerateAssistant}
                  onSpeakAssistant={onSpeakAssistant}
                  thinkingExpanded={thinkingExpandedIds?.has(message.id)}
                  onThinkingExpandedChange={(next) => onThinkingExpandedChange?.(message.id, next)}
                  showOutline={showOutline}
                  multiSelectMode={multiSelectMode}
                  isSelected={selectedIds.has(message.id)}
                  onToggleSelect={() => onToggleSelect(message.id)}
                  onToolAbort={onToolAbort}
                />
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
