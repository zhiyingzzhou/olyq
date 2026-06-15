/**
 * 说明：`useChatAreaController.spec` 组件模块。
 *
 * 职责：
 * - 承载 `useChatAreaController.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { renderHook } from "@testing-library/react";
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatAreaHandle, ChatAreaProps } from "./types";
import type { ChatInputExternalDraft } from "../chat-input/types";
import { useChatAreaController } from "./useChatAreaController";

const {
  useChatAreaLayoutStateMock,
  useChatAreaReplayActionsMock,
  capturedAbortControllersRef,
  discardTranslationTaskByReqIdMock,
} = vi.hoisted(() => ({
  useChatAreaLayoutStateMock: vi.fn(),
  useChatAreaReplayActionsMock: vi.fn(() => ({
    resendUserAsk: vi.fn(async () => undefined),
  })),
  capturedAbortControllersRef: { current: null as null | { current: Map<string, { controller: AbortController; topicId: string; kind: "chat" | "aux" }> } },
  discardTranslationTaskByReqIdMock: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: ((key: string) => key) as never,
    i18n: { language: "zh-CN" },
  }),
}));

vi.mock("zustand/shallow", () => ({
  shallow: (left: unknown, right: unknown) => Object.is(left, right),
}));

vi.mock("@/hooks/useConfirmDialog", () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(async () => true),
    ConfirmDialogPortal: () => null,
  }),
}));

vi.mock("@/hooks/useModelOptions", () => ({
  useModelOptions: () => ({
    providers: [],
    models: [],
    modelMap: new Map(),
    getModelLabel: (modelId: string) => modelId,
    getModelShortLabel: (modelId: string) => modelId,
  }),
}));

vi.mock("@/hooks/useChatSettingsStore", () => ({
  useChatSettingsStore: (selector: (state: { settings: Record<string, unknown> }) => unknown) => selector({
    settings: {
      confirmDeleteMessage: true,
      confirmRegenerateMessage: true,
      translateLanguages: [],
      exportMenuOptions: {},
      showMessageOutline: false,
      messageNavigation: "buttons",
      enableDeveloperMode: false,
    },
  }),
}));

vi.mock("@/hooks/useAssistantStore", () => ({
  useAssistantStore: (selector: (state: {
    updateAssistantConfig: (...args: unknown[]) => void;
    updateTopicMeta: (...args: unknown[]) => void;
  }) => unknown) => selector({
    updateAssistantConfig: vi.fn(),
    updateTopicMeta: vi.fn(),
  }),
}));

vi.mock("@/lib/ai/model-filters", () => ({
  isInlineImageModelLike: () => false,
  isReasoningModelLike: () => false,
}));

vi.mock("@/types/chat", async () => {
  const actual = await vi.importActual<typeof import("@/types/chat")>("@/types/chat");
  return {
    ...actual,
    getActiveMessages: (topic: { messages?: unknown[] }) => (Array.isArray(topic.messages) ? topic.messages : []),
  };
});

vi.mock("./useChatAreaLayoutState", () => ({
  useChatAreaLayoutState: (params: { abortControllersRef: typeof capturedAbortControllersRef.current }) => {
    capturedAbortControllersRef.current = params.abortControllersRef;
    return useChatAreaLayoutStateMock();
  },
}));

vi.mock("./useChatAreaMessageActions", () => ({
  useChatAreaMessageActions: () => ({
    stopGeneration: vi.fn(),
    toggleNewContext: vi.fn(),
  }),
}));

vi.mock("./useChatAreaSendActions", () => ({
  useChatAreaSendActions: () => ({
    sendMessage: vi.fn(async () => undefined),
    sendCompare: vi.fn(async () => undefined),
    buildApiMessages: vi.fn(async () => []),
  }),
}));

vi.mock("./useChatAreaReplayActions", () => ({
  useChatAreaReplayActions: useChatAreaReplayActionsMock,
}));

/**
 * 测试辅助函数：`createLayoutResult`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createLayoutResult() {
  return {
    cleanupUnusedAttachments: vi.fn(),
    discardTranslationTaskByReqId: discardTranslationTaskByReqIdMock,
    inputWrapRef: { current: null },
    setExpandedThinkingIds: vi.fn(),
    jumpToMessageAnchor: vi.fn(),
    openSearch: vi.fn(),
    enterMultiSelect: vi.fn(),
    setFlowOpen: vi.fn(),
    scrollToBottom: vi.fn(),
    scrollToBottomAfterNextCommitIfFollowing: vi.fn(() => false),
    isAtBottom: true,
  };
}

/**
 * 测试辅助函数：`createProps`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createProps(options?: { topicId?: string; messages?: ChatAreaProps["topic"] extends infer T ? T extends { messages: infer M } ? M : never : never }): ChatAreaProps {
  return {
    topic: {
      id: options?.topicId ?? "topic-1",
      title: "Topic",
      messages: options?.messages ?? [],
      folderId: null,
      pinned: false,
      createdAt: 1,
      updatedAt: 1,
      assistantId: "assistant-1",
      topicPrompt: "",
      isNameManuallyEdited: false,
      order: 1,
      systemPrompt: "",
      model: "provider/model",
      temperature: 0.7,
      topP: 1,
      maxTokens: 256,
      contextLength: 20,
      modelParams: {},
      mcpSelection: { mode: "auto", manualServerIds: [] },
      enableGenerateImage: false,
      enableWebSearch: false,
    },
    messagesLoading: false,
    onUpdateMessages: vi.fn(),
    onOpenPrompts: vi.fn(),
    onModelSwitch: vi.fn(),
    onOpenModelManager: vi.fn(),
    onOpenWebSearchSettings: vi.fn(),
    onOpenMcpSettings: vi.fn(),
    onOpenMemorySettings: vi.fn(),
  };
}

/**
 * 构造页面工具外部草稿。
 *
 * @param id - 草稿 ID。
 * @returns 可交给 ChatArea handle 的元素草稿。
 */
function createExternalDraft(id = "external-draft-1"): ChatInputExternalDraft {
  return {
    id,
    kind: "element",
    element: {
      kind: "text",
      tagName: "SPAN",
      text: "重点词",
      charCount: 3,
      summary: "文本 · span · 约 3 字",
    },
    source: { title: "Example", url: "https://example.com" },
  };
}

/** 等待一帧，让 `requestAnimationFrame` 驱动的 ready 门闩完成。 */
async function waitForAnimationFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

describe("useChatAreaController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedAbortControllersRef.current = null;
    useChatAreaLayoutStateMock.mockImplementation(() => createLayoutResult());
  });

  it("rerender 时不会因为 layout 对象新建而误 abort 正在进行的请求", () => {
    const props = createProps();
    const { rerender, unmount } = renderHook(({ nextProps }) => useChatAreaController(nextProps, null), {
      initialProps: { nextProps: props },
    });

    const controller = { abort: vi.fn() } as unknown as AbortController;
    capturedAbortControllersRef.current?.current.set("req-1", {
      controller,
      topicId: "topic-1",
      kind: "chat",
    });

    rerender({ nextProps: { ...props } });
    expect(controller.abort).not.toHaveBeenCalled();

    unmount();
    expect(controller.abort).toHaveBeenCalledTimes(1);
  });

  it("支持打开指定 askId 的 compare fullscreen，并能解析目标分组", () => {
    const props = createProps({
      messages: [
        { id: "user-1", askId: "ask-1", role: "user", content: "问题", createdAt: 1 },
        { id: "assistant-1", askId: "ask-1", role: "assistant", modelId: "provider/model-a", content: "回答 A", createdAt: 2 },
        { id: "assistant-2", askId: "ask-1", role: "assistant", modelId: "provider/model-b", content: "回答 B", createdAt: 3 },
      ],
    });
    const ref = { current: null as null | { openCompareFullscreen?: (askId: string) => void } };
    const { result } = renderHook(({ nextProps }) => useChatAreaController(nextProps, ref as never), {
      initialProps: { nextProps: props },
    });

    act(() => {
      ref.current?.openCompareFullscreen?.("ask-1");
    });

    expect(result.current.fullscreenCompareAskId).toBe("ask-1");
    expect(result.current.fullscreenCompareGroup?.askId).toBe("ask-1");
    expect(result.current.fullscreenCompareGroup?.assistants).toHaveLength(2);
  });

  it("切换话题后会自动清空 compare fullscreen 临时状态", () => {
    const ref = { current: null as null | { openCompareFullscreen?: (askId: string) => void } };
    const { result, rerender } = renderHook(({ nextProps }) => useChatAreaController(nextProps, ref as never), {
      initialProps: {
        nextProps: createProps({
          topicId: "topic-1",
          messages: [
            { id: "user-1", askId: "ask-1", role: "user", content: "问题", createdAt: 1 },
            { id: "assistant-1", askId: "ask-1", role: "assistant", modelId: "provider/model-a", content: "回答 A", createdAt: 2 },
            { id: "assistant-2", askId: "ask-1", role: "assistant", modelId: "provider/model-b", content: "回答 B", createdAt: 3 },
          ],
        }),
      },
    });

    act(() => {
      ref.current?.openCompareFullscreen?.("ask-1");
    });
    expect(result.current.fullscreenCompareAskId).toBe("ask-1");

    rerender({
      nextProps: createProps({
        topicId: "topic-2",
        messages: [
          { id: "user-2", askId: "ask-2", role: "user", content: "另一个问题", createdAt: 1 },
        ],
      }),
    });

    expect(result.current.fullscreenCompareAskId).toBeNull();
    expect(result.current.fullscreenCompareGroup).toBeNull();
  });

  it("把历史重发 if-following 滚动门面透传给 replay actions", () => {
    const scrollToBottomAfterNextCommitIfFollowing = vi.fn(() => false);
    useChatAreaLayoutStateMock.mockImplementation(() => ({
      ...createLayoutResult(),
      scrollToBottomAfterNextCommitIfFollowing,
    }));

    renderHook(({ nextProps }) => useChatAreaController(nextProps, null), {
      initialProps: { nextProps: createProps() },
    });

    expect(useChatAreaReplayActionsMock).toHaveBeenCalledWith(expect.objectContaining({
      scrollToBottomAfterNextCommitIfFollowing,
    }));
  });

  it("页面工具外部草稿必须等话题 ready 后才交给 ChatInput，并在接受后保持输入区承载", async () => {
    const ref = { current: null as ChatAreaHandle | null };
    const draft = createExternalDraft();
    const { result, rerender } = renderHook(({ nextProps }: { nextProps: ChatAreaProps }) => useChatAreaController(nextProps, ref as never), {
      initialProps: {
        nextProps: {
          ...createProps({ topicId: "topic-1" }),
          conversationState: "loading",
        },
      },
    });

    let resolved = false;
    const accepted = ref.current!.acceptExternalDraft(draft).then(() => {
      resolved = true;
    });
    await act(async () => {
      await waitForAnimationFrame();
    });
    expect(result.current.pendingInputDraft).toBeNull();
    expect(resolved).toBe(false);

    rerender({
      nextProps: {
        ...createProps({ topicId: "topic-1" }),
        conversationState: "ready",
      },
    });
    await act(async () => {
      await waitForAnimationFrame();
    });
    expect(result.current.pendingInputDraft?.id).toBe(draft.id);

    act(() => {
      result.current.completeExternalDraft(draft.id, { ok: true });
    });
    await expect(accepted).resolves.toBeUndefined();
    expect(result.current.keepInputVisibleForExternalDraft).toBe(true);
    expect(result.current.pendingInputDraft).toBeNull();

    rerender({
      nextProps: {
        ...createProps({ topicId: "topic-2" }),
        conversationState: "ready",
      },
    });
    expect(result.current.keepInputVisibleForExternalDraft).toBe(false);
  });
});
