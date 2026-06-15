/**
 * 说明：`useMultiSelect.spec` 组件模块。
 *
 * 职责：
 * - 承载 `useMultiSelect.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { MouseEvent as ReactMouseEvent, MutableRefObject, RefObject } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMultiSelect } from './useMultiSelect';
import type { Message, ResolvedConversationContext } from '@/types/chat';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock('@/hooks/useToast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/lib/export/download', () => ({
  downloadText: vi.fn(async () => undefined),
}));

vi.mock('@/lib/export/document-builder', () => ({
  buildMarkdownExportDocument: vi.fn(async () => '# mock'),
}));

vi.mock('@/lib/attachments', () => ({
  deleteAttachments: vi.fn(async () => undefined),
}));

/**
 * 测试辅助函数：`createTopicConversation`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createTopicConversation(messages: Message[]): ResolvedConversationContext {
  return {
    id: 'topic-1',
    title: '测试话题',
    messages,
    folderId: null,
    pinned: false,
    createdAt: 1_730_000_000_000,
    updatedAt: 1_730_000_000_000,
    assistantId: 'assistant-1',
    topicPrompt: '',
    isNameManuallyEdited: false,
    order: 1_730_000_000_000,
    systemPrompt: '',
    model: 'provider/model',
    temperature: 0.7,
    topP: 1,
    maxTokens: 4096,
    contextLength: 20,
    modelParams: {},
    mcpSelection: { mode: 'auto', manualServerIds: [] },
    enableGenerateImage: false,
    enableWebSearch: false,
  };
}

/**
 * 测试辅助函数：为滚动容器安装右侧经典 scrollbar gutter 几何。
 */
function installClassicVerticalScrollbarGeometry(element: HTMLElement) {
  Object.defineProperty(element, 'offsetWidth', { configurable: true, value: 200 });
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: 185 });
  Object.defineProperty(element, 'clientLeft', { configurable: true, value: 0 });
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 1200 });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: 400 });
  element.getBoundingClientRect = vi.fn(() => ({
    bottom: 400,
    height: 400,
    left: 0,
    right: 200,
    top: 0,
    width: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));
}

describe('useMultiSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('全选会覆盖多模型分组里未显示在当前卡片中的 assistant，并支持再次切换为取消全选', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        askId: 'ask-1',
        role: 'user',
        content: '你好',
        createdAt: 1_730_000_000_001,
        groupPrefs: {
          style: 'fold',
          foldDisplayMode: 'compact',
          foldSelectedModelId: 'assistant-1',
          gridColumns: 2,
          gridPopoverTrigger: 'hover',
        },
      },
      { id: 'assistant-1', askId: 'ask-1', role: 'assistant', content: '你好，我在。', createdAt: 1_730_000_000_002 },
      { id: 'assistant-2', askId: 'ask-1', role: 'assistant', content: '另一位模型也在。', createdAt: 1_730_000_000_002 },
      { id: 'system-1', role: 'system', content: 'divider', createdAt: 1_730_000_000_003, subtype: 'context-divider' },
    ];
    const topic = createTopicConversation(messages);
    const latestMessagesRef = { current: messages } as MutableRefObject<Message[]>;
    const scrollRef = { current: document.createElement('div') } as RefObject<HTMLDivElement | null>;
    const inputWrap = document.createElement('div');
    inputWrap.appendChild(document.createElement('textarea'));
    const inputWrapRef = { current: inputWrap } as RefObject<HTMLDivElement | null>;

    const { result } = renderHook(() =>
      useMultiSelect({
        topic,
        latestMessagesRef,
        onUpdateMessages: vi.fn(),
        scrollRef,
        inputWrapRef,
      }),
    );

    expect(result.current.selectableCount).toBe(3);
    expect(result.current.allSelected).toBe(false);

    act(() => {
      result.current.toggleSelectAll();
    });

    expect(Array.from(result.current.selectedIds).sort()).toEqual(['assistant-1', 'assistant-2', 'user-1']);
    expect(result.current.allSelected).toBe(true);

    act(() => {
      result.current.toggleSelectAll();
    });

    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.allSelected).toBe(false);
  });

  it('删除选中消息时会传入完整 destructive 确认文案', async () => {
    const messages: Message[] = [
      { id: 'user-1', askId: 'ask-1', role: 'user', content: '你好', createdAt: 1_730_000_000_001 },
      { id: 'assistant-1', askId: 'ask-1', role: 'assistant', content: '你好，我在。', createdAt: 1_730_000_000_002 },
    ];
    const confirm = vi.fn(async () => false);
    const topic = createTopicConversation(messages);
    const latestMessagesRef = { current: messages } as MutableRefObject<Message[]>;
    const scrollRef = { current: document.createElement('div') } as RefObject<HTMLDivElement | null>;
    const inputWrapRef = { current: document.createElement('div') } as RefObject<HTMLDivElement | null>;

    const { result } = renderHook(() =>
      useMultiSelect({
        topic,
        latestMessagesRef,
        onUpdateMessages: vi.fn(),
        scrollRef,
        inputWrapRef,
        confirm,
      }),
    );

    act(() => {
      result.current.toggleSelect('user-1');
    });
    await act(async () => {
      await result.current.handleMultiSelectDelete();
    });

    expect(confirm).toHaveBeenCalledWith({
      title: 'multiSelect.confirmDelete',
      description: 'multiSelect.confirmDeleteDesc',
      confirmLabel: 'common.delete',
      cancelLabel: 'common.cancel',
      variant: 'destructive',
    });
  });

  it('多选模式下拖拽原生滚动条不会启动框选', () => {
    const messages: Message[] = [
      { id: 'user-1', askId: 'ask-1', role: 'user', content: '你好', createdAt: 1_730_000_000_001 },
      { id: 'assistant-1', askId: 'ask-1', role: 'assistant', content: '你好，我在。', createdAt: 1_730_000_000_002 },
    ];
    const topic = createTopicConversation(messages);
    const latestMessagesRef = { current: messages } as MutableRefObject<Message[]>;
    const scrollRoot = document.createElement('div');
    installClassicVerticalScrollbarGeometry(scrollRoot);
    const scrollRef = { current: scrollRoot } as RefObject<HTMLDivElement | null>;
    const inputWrapRef = { current: document.createElement('div') } as RefObject<HTMLDivElement | null>;
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    const { result } = renderHook(() =>
      useMultiSelect({
        topic,
        latestMessagesRef,
        onUpdateMessages: vi.fn(),
        scrollRef,
        inputWrapRef,
      }),
    );

    act(() => {
      result.current.setMultiSelectMode(true);
      result.current.onMultiSelectMouseDown({
        button: 0,
        clientX: 196,
        clientY: 200,
        ctrlKey: false,
        metaKey: false,
        nativeEvent: {
          button: 0,
          clientX: 196,
          clientY: 200,
          target: scrollRoot,
        },
        preventDefault,
        stopPropagation,
        target: scrollRoot,
      } as unknown as ReactMouseEvent);
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(result.current.selectDragRef.current).toBeNull();
  });
});
