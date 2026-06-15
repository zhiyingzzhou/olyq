/**
 * 说明：`ChatInputToolbar.spec` 组件模块。
 *
 * 职责：
 * - 承载 `ChatInputToolbar.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createRef, useState, type ComponentProps, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatInputToolbar } from './ChatInputToolbar';

const GENERIC_REASONING_OPTIONS = [
  { value: 'off', labelKey: 'chat.reasoningOff' },
  { value: 'low', labelKey: 'chat.reasoningLow' },
  { value: 'medium', labelKey: 'chat.reasoningMedium' },
  { value: 'high', labelKey: 'chat.reasoningHigh' },
] as const;

const OPENROUTER_REASONING_OPTIONS = [
  { value: 'off', labelKey: 'chat.reasoningOff' },
  { value: 'low', labelKey: 'chat.reasoningLow' },
  { value: 'medium', labelKey: 'chat.reasoningMedium' },
  { value: 'high', labelKey: 'chat.reasoningHigh' },
  { value: 'xhigh', labelKey: 'chat.reasoningXHigh' },
  { value: 'minimal', labelKey: 'chat.reasoningMinimal' },
  { value: 'none', labelKey: 'chat.reasoningNone' },
] as const;

vi.mock('@/components/chat/MemoryButton', () => ({
  MemoryButton: () => null,
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

/**
 * 测试辅助函数：`createProps`。
 *
 * @remarks
 * 用于搭建 `ChatInputToolbar` 的最小受控入参，不作为运行时代码复用。
 */
function createProps(overrides: Partial<ComponentProps<typeof ChatInputToolbar>> = {}): ComponentProps<typeof ChatInputToolbar> {
  return {
    t: (key: string) => key,
    assistantId: 'assistant-1',
    onOpenPrompts: vi.fn(),
    fileRef: createRef<HTMLInputElement>(),
    onAddFiles: vi.fn(),
    webSearchActive: false,
    quickPanelOpen: false,
    quickPanelKind: null,
    anchoredQuickPanel: undefined,
    onQuickPanelOpenChange: vi.fn(),
    webSearchButtonTooltip: 'web-search',
    selectedWebSearchProviderId: undefined,
    onOpenMemorySettings: vi.fn(),
    mentionModels: [],
    mcpButtonActive: false,
    reasoningState: {
      kind: 'levels',
      configured: true,
      value: 'medium',
      options: GENERIC_REASONING_OPTIONS,
    },
    onChangeReasoningState: vi.fn(),
    onInsertContextDivider: vi.fn(),
    isLoading: false,
    canGenerateImage: false,
    enableGenerateImage: false,
    onToggleGenerateImage: vi.fn(),
    hasMessages: false,
    onClearMessages: vi.fn(),
    attachmentCount: 0,
    resolvedTranslateTargetLanguage: 'English',
    onRequestTranslate: vi.fn(),
    isTranslating: false,
    translateDisabled: true,
    onStop: vi.fn(),
    onSend: vi.fn(),
    sendDisabled: true,
    ...overrides,
  };
}

describe('ChatInputToolbar', () => {
  it('不再渲染展开按钮，满足能力条件的高级工具默认可见', () => {
    render(
      <TooltipProvider>
        <ChatInputToolbar
          {...createProps({
            canGenerateImage: true,
            hasMessages: true,
          })}
        />
      </TooltipProvider>,
    );

    expect(screen.queryByTestId('chat-toolbar-expand-toggle')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('chat.expandToolbar')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-reasoning-effort-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('chat-context-divider')).toBeInTheDocument();
    expect(screen.getByTestId('chat-generate-image-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('chat-clear-messages')).toBeInTheDocument();
  });

  it('推理强度菜单使用 RadioItem，并为选中项提供 checked 背景态', async () => {
    const onChangeReasoningEffort = vi.fn();

    /**
     * 测试辅助组件：`Harness`。
     *
     * @remarks
     * 用于模拟受控的推理强度切换状态，验证菜单选中态与回调同步，不作为运行时代码复用。
     */
    function Harness() {
      const [reasoningValue, setReasoningValue] = useState<'off' | 'low' | 'medium' | 'high'>('medium');
      return (
        <TooltipProvider>
          <ChatInputToolbar
            {...createProps({
              reasoningState: {
                kind: 'levels',
                configured: true,
                value: reasoningValue,
                options: GENERIC_REASONING_OPTIONS,
              },
              onChangeReasoningState: (value) => {
                onChangeReasoningEffort(value);
                setReasoningValue(value as 'off' | 'low' | 'medium' | 'high');
              },
            })}
          />
        </TooltipProvider>
      );
    }

    render(<Harness />);

    fireEvent.keyDown(screen.getByTestId('chat-reasoning-effort-trigger'), {
      key: 'ArrowDown',
    });

    const mediumItem = await screen.findByTestId('chat-reasoning-effort-medium');
    expect(mediumItem).toHaveAttribute('data-state', 'checked');
    expect(mediumItem.className).toContain('data-[state=checked]:bg-accent');
    expect(mediumItem.className).toContain('data-[state=checked]:text-accent-foreground');

    fireEvent.click(screen.getByTestId('chat-reasoning-effort-high'));

    await waitFor(() => {
      expect(onChangeReasoningEffort).toHaveBeenCalledWith('high');
    });

    fireEvent.keyDown(screen.getByTestId('chat-reasoning-effort-trigger'), {
      key: 'ArrowDown',
    });
    expect(await screen.findByTestId('chat-reasoning-effort-high')).toHaveAttribute('data-state', 'checked');
  });

  it('OpenRouter 模型下渲染专属推理菜单，并去掉额外的圆点指示器', async () => {
    const onChangeReasoningState = vi.fn();

    render(
      <TooltipProvider>
        <ChatInputToolbar
          {...createProps({
            t: (key: string) => ({
              'chat.reasoningEffort': '推理强度',
              'chat.reasoningOff': '关闭',
              'chat.reasoningLow': '低',
              'chat.reasoningMedium': '中',
              'chat.reasoningHigh': '高',
              'chat.reasoningXHigh': '超高',
              'chat.reasoningMinimal': '最小',
              'chat.reasoningNone': '显式禁用',
            }[key] ?? key),
            reasoningState: {
              kind: 'hybrid',
              configured: true,
              value: 'xhigh',
              options: OPENROUTER_REASONING_OPTIONS,
              exclude: false,
            },
            onChangeReasoningState,
          })}
        />
      </TooltipProvider>,
    );

    fireEvent.keyDown(screen.getByTestId('chat-reasoning-effort-trigger'), {
      key: 'ArrowDown',
    });

    expect(await screen.findByTestId('chat-reasoning-effort-xhigh')).toBeInTheDocument();
    expect(screen.getByTestId('chat-reasoning-effort-minimal')).toBeInTheDocument();
    expect(screen.getByTestId('chat-reasoning-effort-none')).toBeInTheDocument();
    expect(screen.getByTestId('chat-reasoning-effort-xhigh')).toHaveAttribute('data-state', 'checked');
    expect(screen.queryByTestId('chat-reasoning-effort-xhigh-indicator')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('chat-reasoning-effort-none'));

    await waitFor(() => {
      expect(onChangeReasoningState).toHaveBeenCalledWith('none');
    });
  });

  it('当 provider-aware descriptor 缺失时，不显示推理菜单入口', () => {
    render(
      <TooltipProvider>
        <ChatInputToolbar
          {...createProps({
            reasoningState: undefined,
          })}
        />
      </TooltipProvider>,
    );

    expect(screen.queryByTestId('chat-reasoning-effort-trigger')).not.toBeInTheDocument();
  });

  it('当 provider-aware descriptor options 为空时，不显示推理菜单入口', () => {
    render(
      <TooltipProvider>
        <ChatInputToolbar
          {...createProps({
            reasoningState: {
              kind: 'levels',
              configured: true,
              value: 'off',
              options: [],
            },
          })}
        />
      </TooltipProvider>,
    );

    expect(screen.queryByTestId('chat-reasoning-effort-trigger')).not.toBeInTheDocument();
  });

  it('窄宽更多菜单复用次要工具回调，并保留禁用态', async () => {
    const onInsertContextDivider = vi.fn();
    const onToggleGenerateImage = vi.fn();
    const onClearMessages = vi.fn();

    render(
      <TooltipProvider>
        <ChatInputToolbar
          {...createProps({
            canGenerateImage: true,
            enableGenerateImage: true,
            hasMessages: true,
            isLoading: true,
            onInsertContextDivider,
            onToggleGenerateImage,
            onClearMessages,
          })}
        />
      </TooltipProvider>,
    );

    expect(screen.getByTestId('chat-input-more-tools-trigger')).toHaveAttribute('aria-label', 'chat.moreInputTools');

    fireEvent.keyDown(screen.getByTestId('chat-input-more-tools-trigger'), {
      key: 'ArrowDown',
    });

    expect(await screen.findByTestId('chat-overflow-context-divider')).toHaveAttribute('data-disabled');
    expect(screen.getByTestId('chat-overflow-clear-messages')).toHaveAttribute('data-disabled');
    expect(screen.getByTestId('chat-overflow-generate-image-toggle')).toHaveAttribute('data-state', 'checked');

    fireEvent.click(screen.getByTestId('chat-overflow-generate-image-toggle'));
    await waitFor(() => {
      expect(onToggleGenerateImage).toHaveBeenCalledTimes(1);
    });

    expect(onInsertContextDivider).not.toHaveBeenCalled();
    expect(onClearMessages).not.toHaveBeenCalled();
  });

  it('更多菜单中的推理强度复用主菜单 radio 回调', async () => {
    const onChangeReasoningState = vi.fn();

    render(
      <TooltipProvider>
        <ChatInputToolbar
          {...createProps({
            reasoningState: {
              kind: 'levels',
              configured: true,
              value: 'medium',
              options: GENERIC_REASONING_OPTIONS,
            },
            onChangeReasoningState,
          })}
        />
      </TooltipProvider>,
    );

    fireEvent.keyDown(screen.getByTestId('chat-input-more-tools-trigger'), {
      key: 'ArrowDown',
    });
    const reasoningTrigger = await screen.findByTestId('chat-overflow-reasoning-trigger');
    reasoningTrigger.focus();
    fireEvent.keyDown(reasoningTrigger, { key: 'ArrowRight' });

    expect(await screen.findByTestId('chat-overflow-reasoning-effort-medium')).toHaveAttribute('data-state', 'checked');
    fireEvent.click(screen.getByTestId('chat-overflow-reasoning-effort-high'));

    await waitFor(() => {
      expect(onChangeReasoningState).toHaveBeenCalledWith('high');
    });
  });
});
