/**
 * 说明：`ChatAreaContent.user-regenerate.spec` 组件模块。
 *
 * 职责：
 * - 承载 `ChatAreaContent.user-regenerate.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useMemo, useRef, useState, type MutableRefObject } from "react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatAreaContent } from "./ChatAreaContent";
import { useChatAreaReplayActions } from "./useChatAreaReplayActions";
import { buildRows } from "@/lib/chat/chat-utils";
import type { Message, ResolvedConversationContext } from "@/types/chat";

const {
  buildChatSystemContentMock,
  runStreamChatMock,
  toastMock,
} = vi.hoisted(() => ({
  buildChatSystemContentMock: vi.fn(),
  runStreamChatMock: vi.fn(),
  toastMock: vi.fn(),
}));

/**
 * 测试辅助函数：`tMock`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function tMock(key: string, params?: Record<string, unknown>) {
  if (key === "common.error") return "错误";
  if (key === "common.cancelled") return "已取消";
  if (key === "common.close") return "关闭";
  if (key === "navigation.top") return "顶部";
  if (key === "navigation.bottom") return "底部";
  if (key === "navigation.prev") return "上一问";
  if (key === "navigation.next") return "下一问";
  if (key === "navigation.flow") return "对话流程";
  if (key === "navigation.panel") return "消息导航";
  if (key === "navigation.closePanel") return "收起消息导航";
  if (key === "chat.generationCancelled") return "本次生成已取消";
  if (key === "chat.newContext") return "清除上下文";
  if (key === "chat.thinking") return "思考中…";
  if (key === "chat.collectingPageScreenshots") return "正在采集页面截图…";
  if (key === "chat.preparingReply") return "准备回复中…";
  if (key === "chat.replacementPendingTitle") return "正在重新生成，将替换当前回复";
  if (key === "chat.replacementPendingDesc") return "以下内容是上一版回复快照，不是正在生成的新回复。";
  if (key === "chat.resend") return "重新发送";
  if (key === "chat.resendDisabledWhileLoading") return "当前有生成任务进行中，暂时不能重新发送";
  if (key === "chat.regenerateDisabledWhileLoading") return "当前有生成任务进行中，暂时不能重新生成";
  if (key === "group.empty") return "无内容";
  if (key === "errors.unknownWithDetail") return String(params?.detail || key);
  if (typeof params?.count === "number") return `${key}:${params.count}`;
  return key;
}

/**
 * 测试辅助函数：为聊天滚动根节点安装可测量的经典纵向 scrollbar 几何。
 */
function installClassicVerticalScrollbarGeometry(element: HTMLElement) {
  Object.defineProperty(element, "offsetWidth", { configurable: true, value: 200 });
  Object.defineProperty(element, "clientWidth", { configurable: true, value: 185 });
  Object.defineProperty(element, "clientLeft", { configurable: true, value: 0 });
  Object.defineProperty(element, "scrollHeight", { configurable: true, value: 1200 });
  Object.defineProperty(element, "clientHeight", { configurable: true, value: 400 });
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

vi.mock("react-i18next", async () => {
  const actual = await vi.importActual<typeof import("react-i18next")>("react-i18next");
  return {
    ...actual,
    useTranslation: () => ({
      t: tMock,
      i18n: { language: "zh-CN" },
    }),
  };
});

vi.mock("@/lib/chat/context-pipeline", () => ({
  buildChatSystemContent: buildChatSystemContentMock,
}));

vi.mock("@/lib/chat/chat-utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/chat/chat-utils")>("@/lib/chat/chat-utils");
  return {
    ...actual,
  };
});

vi.mock("@/lib/chat/run-stream-chat", () => ({
  runStreamChat: runStreamChatMock,
}));

vi.mock("@/hooks/useConfirmDialog", () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(async () => true),
    ConfirmDialogPortal: () => null,
  }),
}));

vi.mock("@/hooks/useToast", () => ({
  toast: toastMock,
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/chat/ContentSearch", () => ({
  ContentSearch: () => null,
}));

vi.mock("@/components/chat/ChatInput", () => ({
  ChatInput: () => <div data-testid="chat-input" />,
}));

vi.mock("@/components/chat/MessageGroupView", () => ({
  MessageGroupView: () => <div data-testid="message-group-view" />,
}));

vi.mock("@/components/chat/MultiSelectToolbar", () => ({
  MultiSelectToolbar: () => <div data-testid="multi-select-toolbar" />,
}));

vi.mock("@/components/chat/PageContextBar", () => ({
  PageContextBar: () => null,
}));

vi.mock("@/components/chat/WelcomeEmptyState", () => ({
  WelcomeEmptyState: () => <div data-testid="welcome-empty-state" />,
}));

vi.mock("../MarkdownRenderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock("../ThinkingBlock", () => ({
  ThinkingBlock: () => <div>thinking</div>,
}));

vi.mock("../WebSearchResultsBlock", () => ({
  WebSearchResultsBlock: () => <div>search-results</div>,
}));

vi.mock("../ToolCallBlock", () => ({
  ToolCallBlock: () => <div>tool-call</div>,
}));

vi.mock("../MessageOutline", () => ({
  MessageOutline: () => null,
}));

vi.mock("../MessageTranslationsBlock", () => ({
  MessageTranslationsBlock: () => null,
}));

vi.mock("@/components/chat/ModelPickerDialog", () => ({
  ModelPickerDialog: () => null,
}));

vi.mock("@/components/ui/ProviderIcon", () => ({
  ProviderIcon: () => <div>provider-icon</div>,
}));

vi.mock("../PreviewableImage", () => ({
  PreviewableImage: () => <div>preview-image</div>,
}));

vi.mock("../ImageMessageCard", () => ({
  ImageMessageCard: () => <div>image-card</div>,
}));

vi.mock("../FileAttachmentCard", () => ({
  FileAttachmentCard: () => <div>file-card</div>,
}));

/**
 * 测试辅助函数：`noop`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
const noop = () => undefined;
/**
 * 测试辅助函数：`noopAsync`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
const noopAsync = async () => undefined;

/**
 * 测试辅助函数：`createMessages`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createMessages(): Message[] {
  return [
    {
      id: "user-1",
      askId: "ask-1",
      role: "user",
      content: "上海天气",
      createdAt: 1,
    },
    {
      id: "assistant-1",
      askId: "ask-1",
      role: "assistant",
      modelId: "provider/model",
      content: "旧回复",
      status: "success",
      createdAt: 2,
    },
  ];
}

/**
 * 测试辅助函数：`createUserOnlyMessages`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createUserOnlyMessages(): Message[] {
  return [
    {
      id: "user-1",
      askId: "ask-1",
      role: "user",
      content: "上海天气",
      createdAt: 1,
    },
  ];
}

/**
 * 测试辅助函数：`createMessagesWithContextDivider`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createMessagesWithContextDivider(): Message[] {
  return [
    ...createMessages(),
    {
      id: "divider-1",
      role: "system",
      content: "",
      subtype: "context-divider",
      createdAt: 3,
    },
  ];
}

/**
 * 测试辅助函数：`createTopic`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createTopic(messages: Message[]): ResolvedConversationContext {
  return {
    id: "topic-1",
    title: "Topic",
    messages,
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
  };
}

/**
 * 测试辅助函数：`ChatAreaHarness`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function ChatAreaHarness({
  initialMessages = createMessages(),
  buildApiMessages = async ({ contextMessages }: { contextMessages: Message[] }) => (
    contextMessages.map((message) => ({ role: message.role, content: message.content }))
  ),
  layoutOverrides,
  settingsOverrides,
  browserContextPreflightPhase = null,
}: {
  initialMessages?: Message[];
  buildApiMessages?: (options: { contextMessages: Message[] }) => Promise<Array<{ role: Message["role"]; content: string }>>;
  layoutOverrides?: Partial<Record<string, unknown>>;
  settingsOverrides?: Partial<Record<string, unknown>>;
  browserContextPreflightPhase?: "style-capture" | null;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const scrollToBottom = vi.fn();
  const latestMessagesRef = useRef(messages);
  latestMessagesRef.current = messages;
  const abortControllersRef = useRef(new Map()) as MutableRefObject<Map<string, { controller: AbortController; topicId: string; kind: "chat" | "aux" }>>;
  const topic = useMemo(() => createTopic(messages), [messages]);
  const modelMap = useMemo(() => new Map<string, unknown>(), []);
  const rows = useMemo(() => buildRows(messages, 0, isLoading), [messages, isLoading]);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);

    /**
   * 测试辅助函数：`onUpdateMessages`。
   *
   * @remarks
   * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
   */
  const onUpdateMessages = (topicId: string, nextMessages: Message[]) => {
    if (topicId !== topic.id) return;
    latestMessagesRef.current = nextMessages;
    setMessages(nextMessages);
  };

  const replayActions = useChatAreaReplayActions({
    abortControllersRef,
    buildApiMessages: buildApiMessages as never,
    isLoading,
    latestMessagesRef,
    modelMap,
    onUpdateMessages,
    scrollToBottom,
    scrollToBottomAfterNextCommitIfFollowing: vi.fn(() => false),
    setBrowserContextPreflightPhase: noop,
    setIsLoading,
    t: tMock as never,
    topic,
  });

  const controller = {
    ConfirmDialogPortal: () => null,
    askIdHasImage: new Map<string, boolean>(),
    browserContextPreflightPhase,
    getModelLabel: (id: string) => id,
    getModelShortLabel: (id: string) => id,
    getProviderLogo: () => undefined,
    isLoading,
    layout: {
      allSelected: false,
      clearTranslations: noop,
      closeSearch: noop,
      effectiveSearchCaseSensitive: false,
      effectiveSearchWholeWord: false,
      enterMultiSelect: noop,
      expandedThinkingIds: new Set<string>(),
      exitMultiSelect: noop,
      flowOpen: false,
      handleKeyScrollIntent: noop,
      handleMultiSelectCopy: noopAsync,
      handleMultiSelectDelete: noopAsync,
      handleMultiSelectSave: noopAsync,
      handleScroll: noop,
      handleScrollbarDragStart: noop,
      handleTouchMove: noop,
      handleTouchStart: noop,
      handleTranscriptInteraction: noop,
      handleWheelIntent: noop,
      inputWrapRef,
      multiSelectMode: false,
      navActiveAskId: null,
      navActiveIndex: -1,
      navAnchors: [],
      navPanelOpen: false,
      newCount: 0,
      onMultiSelectMouseDown: noop,
      openSearch: noop,
      removeTranslation: noop,
      jumpToMessageAnchor: noop,
      rootRef,
      rows,
      scrollRef,
      scrollToBottom: noop,
      searchActiveIndex: 0,
      searchCanCaseSensitive: false,
      searchCanWholeWord: false,
      searchIncludeUser: true,
      searchMatches: [],
      searchNext: noop,
      searchOpen: false,
      searchPrev: noop,
      searchQuery: "",
      selectRect: null,
      selectedIds: new Set<string>(),
      setFlowOpen: noop,
      setNavPanelOpen: noop,
      setSearchCaseSensitive: noop,
      setSearchIncludeUser: noop,
      setSearchQuery: noop,
      setSearchWholeWord: noop,
      showNewBanner: false,
      toggleSelect: noop,
      toggleSelectAll: noop,
      translateAssistantMessage: noopAsync,
      updateGroupPrefs: noop,
      measureElement: noop,
      messageViewportHeight: null,
      scrollRangeIntoView: () => true,
      virtualItems: rows.map((_, index) => ({ index, key: `row-${index}`, start: index * 120 })),
      virtualTotalSize: rows.length * 120,
      visibleTopRowIndex: 0,
      ...layoutOverrides,
    },
    messageActions: {
      createBranchFromMessage: noop,
      deleteGroupAssistants: noop,
      deleteMessage: noop,
      editMessage: noop,
      handleToolAbort: noop,
      setThinkingExpanded: noop,
      stopGeneration: noop,
      toggleNewContext: noop,
      toggleUseful: noop,
    },
    messagesAll: messages,
    messagesLoading: false,
    modelMap,
    modelName: "provider/model",
    models: [],
    onModelSwitch: noop,
    onOpenMcpSettings: noop,
    onOpenMemorySettings: noop,
    onOpenModelManager: noop,
    onOpenPrompts: noop,
    onOpenWebSearchSettings: noop,
    replayActions,
    sendActions: {
      sendMessage: noopAsync,
    },
    settings: {
      confirmDeleteMessage: false,
      confirmRegenerateMessage: false,
      enableDeveloperMode: false,
      exportMenuOptions: {},
      messageNavigation: "off",
      showMessageOutline: false,
      translateLanguages: [],
      ...settingsOverrides,
    },
    slashCommands: [],
    t: tMock,
    tokenEstimate: 0,
    topic,
    updateAssistantConfig: noop,
  };

  return <ChatAreaContent controller={controller as never} />;
}

describe("ChatAreaContent 用户消息重新生成", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildChatSystemContentMock.mockResolvedValue({ systemContent: "sys" });
    runStreamChatMock.mockResolvedValue(undefined);
  });

  it("点击用户消息下的重新生成会真正发起流式请求", async () => {
    render(<ChatAreaHarness />);

    fireEvent.click(
      within(screen.getByTestId("message-actions-user-1")).getByLabelText("重新发送"),
    );

    await waitFor(() => {
      expect(runStreamChatMock).toHaveBeenCalledTimes(1);
    });
    expect(runStreamChatMock).toHaveBeenCalledWith(expect.objectContaining({
      askId: "ask-1",
      modelId: "provider/model",
      mode: "replace",
      targetIndex: 1,
      topicId: "topic-1",
    }));
  });

  it("问答导航当前激活的用户消息不再额外渲染聚焦边框效果", () => {
    render(
      <ChatAreaHarness
        initialMessages={[
          {
            id: "user-1",
            askId: "ask-1",
            role: "user",
            content: "第一问",
            createdAt: 1,
          },
          {
            id: "assistant-1",
            askId: "ask-1",
            role: "assistant",
            modelId: "provider/model",
            content: "第一答",
            status: "success",
            createdAt: 2,
          },
          {
            id: "user-2",
            askId: "ask-2",
            role: "user",
            content: "第二问",
            createdAt: 3,
          },
        ]}
        layoutOverrides={{ navActiveAskId: "user-2" }}
      />,
    );

    expect(screen.getByTestId("message-frame-user-2").className).not.toContain("shadow-[0_0_0_1px_hsl(var(--primary)/0.22)]");
    expect(screen.getByTestId("message-frame-user-2").className).not.toContain("bg-primary/[0.05]");
    expect(screen.getByTestId("message-frame-user-2").className).not.toContain("px-2.5");
    expect(screen.getByTestId("message-frame-user-2").className).not.toContain("py-2");
    expect(screen.getByTestId("message-surface-user-2").className).not.toContain("ring-2");
    expect(document.querySelector('[data-msg-id="user-2"]')).toHaveAttribute("data-nav-active", "true");
    expect(document.querySelector('[data-msg-id="user-1"]')).toHaveAttribute("data-nav-active", "false");
  });

  it("页面风格截图 preflight 期间会在 loading row 显示采集提示", () => {
    const loadingMessages: Message[] = [{
      id: "user-only",
      role: "user",
      askId: "ask-only",
      content: "分析页面风格",
      createdAt: 1,
    }];

    const { unmount } = render(
      <ChatAreaHarness
        initialMessages={loadingMessages}
        layoutOverrides={{
          rows: buildRows(loadingMessages, 0, true),
          virtualItems: [
            { index: 0, key: "row-0", start: 0 },
            { index: 1, key: "row-1", start: 120 },
          ],
          virtualTotalSize: 240,
        }}
      />,
    );

    expect(screen.getByText("思考中…")).toBeInTheDocument();
    unmount();

    render(
      <ChatAreaHarness
        initialMessages={loadingMessages}
        browserContextPreflightPhase="style-capture"
        layoutOverrides={{
          rows: buildRows(loadingMessages, 0, true),
          virtualItems: [
            { index: 0, key: "row-0", start: 0 },
            { index: 1, key: "row-1", start: 120 },
          ],
          virtualTotalSize: 240,
        }}
      />,
    );

    expect(screen.getByText("正在采集页面截图…")).toBeInTheDocument();
    expect(screen.queryByText("思考中…")).not.toBeInTheDocument();
  });

  it("页面风格截图 preflight 期间会在 assistant 占位显示采集提示", () => {
    render(
      <ChatAreaHarness
        initialMessages={[
          {
            id: "user-1",
            askId: "ask-1",
            role: "user",
            content: "分析页面风格",
            createdAt: 1,
          },
          {
            id: "assistant-1",
            askId: "ask-1",
            role: "assistant",
            modelId: "provider/model",
            content: "",
            status: "preparing",
            createdAt: 2,
          },
        ]}
        browserContextPreflightPhase="style-capture"
      />,
    );

    expect(screen.getByText("正在采集页面截图…")).toBeInTheDocument();
    expect(screen.queryByText("准备回复中…")).not.toBeInTheDocument();
  });

  it("消息导航按钮模式下有用户锚点时始终显示可聚焦把手", () => {
    render(
      <ChatAreaHarness
        layoutOverrides={{
          navAnchors: [{ createdAt: 1, messageId: "user-1", preview: "上海天气" }],
        }}
        settingsOverrides={{ messageNavigation: "buttons" }}
      />,
    );

    const handle = screen.getByTestId("chat-nav-handle");
    expect(handle).toHaveAccessibleName("消息导航");
    expect(handle).toHaveAttribute("aria-expanded", "false");
    expect(handle).toHaveAttribute("aria-controls");
    expect(screen.queryByTestId("chat-nav-panel")).not.toBeInTheDocument();
  });

  it("消息导航非按钮模式下不显示把手", () => {
    const navAnchors = [{ createdAt: 1, messageId: "user-1", preview: "上海天气" }];
    const { rerender } = render(
      <ChatAreaHarness
        layoutOverrides={{ navAnchors }}
        settingsOverrides={{ messageNavigation: "off" }}
      />,
    );

    expect(screen.queryByTestId("chat-nav-handle")).not.toBeInTheDocument();

    rerender(
      <ChatAreaHarness
        layoutOverrides={{ navAnchors }}
        settingsOverrides={{ messageNavigation: "anchor" }}
      />,
    );

    expect(screen.queryByTestId("chat-nav-handle")).not.toBeInTheDocument();
  });

  it("消息导航面板里的纯图标按钮都有可访问名称", () => {
    render(
      <ChatAreaHarness
        layoutOverrides={{
          navActiveIndex: 0,
          navAnchors: [
            { createdAt: 1, messageId: "user-1", preview: "第一问" },
            { createdAt: 3, messageId: "user-2", preview: "第二问" },
          ],
          navPanelOpen: true,
        }}
        settingsOverrides={{ messageNavigation: "buttons" }}
      />,
    );

    expect(screen.getByTestId("chat-nav-handle")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("chat-nav-panel")).toHaveAccessibleName("消息导航");
    expect(screen.getByRole("button", { name: "顶部" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一问" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一问" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "底部" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "对话流程" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起消息导航" })).toBeInTheDocument();
  });

  it("消息导航把手只通过 focus 或 click 展开，不再响应 hover", () => {
    const setNavPanelOpen = vi.fn();

    render(
      <ChatAreaHarness
        layoutOverrides={{
          navAnchors: [{ createdAt: 1, messageId: "user-1", preview: "上海天气" }],
          setNavPanelOpen,
        }}
        settingsOverrides={{ messageNavigation: "buttons" }}
      />,
    );

    const handle = screen.getByTestId("chat-nav-handle");

    fireEvent.mouseEnter(handle);
    expect(setNavPanelOpen).not.toHaveBeenCalled();

    fireEvent.focus(handle);
    expect(setNavPanelOpen).toHaveBeenLastCalledWith(true);

    setNavPanelOpen.mockClear();
    fireEvent.click(handle);
    expect(setNavPanelOpen).toHaveBeenLastCalledWith(true);
  });

  it("消息导航面板关闭按钮只收起面板，把手仍保留为恢复入口", () => {
    const setNavPanelOpen = vi.fn();

    render(
      <ChatAreaHarness
        layoutOverrides={{
          navAnchors: [{ createdAt: 1, messageId: "user-1", preview: "上海天气" }],
          navPanelOpen: true,
          setNavPanelOpen,
        }}
        settingsOverrides={{ messageNavigation: "buttons" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "收起消息导航" }));
    fireEvent.mouseEnter(screen.getByTestId("chat-nav-handle"));

    expect(setNavPanelOpen).toHaveBeenCalledTimes(1);
    expect(setNavPanelOpen).toHaveBeenCalledWith(false);
    expect(screen.getByTestId("chat-nav-handle")).toBeInTheDocument();
  });

  it("已有旧 assistant 时显示替换状态条和旧答快照，不再把准备提示叠在旧正文上", async () => {
    buildChatSystemContentMock.mockImplementation(() => new Promise(() => undefined));

    render(<ChatAreaHarness />);

    fireEvent.click(
      within(screen.getByTestId("message-actions-user-1")).getByLabelText("重新发送"),
    );

    await waitFor(() => {
      expect(screen.getByText("正在重新生成，将替换当前回复")).toBeInTheDocument();
      expect(screen.getByText("以下内容是上一版回复快照，不是正在生成的新回复。")).toBeInTheDocument();
      expect(screen.getByText("旧回复")).toBeInTheDocument();
    });
    expect(screen.queryByText("准备回复中…")).not.toBeInTheDocument();
    expect(screen.queryByText("无内容")).not.toBeInTheDocument();
    expect(runStreamChatMock).not.toHaveBeenCalled();
  });

  it("预处理失败时显示错误，不再留下空白 assistant", async () => {
    buildChatSystemContentMock.mockRejectedValue(new Error("boom"));

    render(<ChatAreaHarness />);

    fireEvent.click(
      within(screen.getByTestId("message-actions-user-1")).getByLabelText("重新发送"),
    );

    await waitFor(() => {
      expect(screen.getByText("boom")).toBeInTheDocument();
    });
    expect(runStreamChatMock).not.toHaveBeenCalled();
    expect(screen.queryByText("无内容")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭" })).not.toBeInTheDocument();
  });

  it("预处理 pending 时显示准备中，不再回退成无内容空壳", async () => {
    buildChatSystemContentMock.mockImplementation(() => new Promise(() => undefined));

    render(<ChatAreaHarness initialMessages={createUserOnlyMessages()} />);

    fireEvent.click(
      within(screen.getByTestId("message-actions-user-1")).getByLabelText("重新发送"),
    );

    await waitFor(() => {
      expect(screen.getByText("准备回复中…")).toBeInTheDocument();
    });
    expect(runStreamChatMock).not.toHaveBeenCalled();
    expect(screen.queryByText("无内容")).not.toBeInTheDocument();
  });

  it("清除上下文分隔线按独立分隔行渲染，不再冒出空白 AI 气泡", () => {
    render(<ChatAreaHarness initialMessages={createMessagesWithContextDivider()} />);

    expect(screen.getByTestId("context-divider-row")).toBeInTheDocument();
    expect(screen.getByText("清除上下文")).toBeInTheDocument();
    expect(screen.queryByText("无内容")).not.toBeInTheDocument();
    expect(screen.queryByTestId("message-actions-divider-1")).not.toBeInTheDocument();
  });

  it("chat-scroll-root 只把滚动意图交给 layout 门面", () => {
    const handleKeyScrollIntent = vi.fn();
    const handleScroll = vi.fn();
    const handleTouchMove = vi.fn();
    const handleTouchStart = vi.fn();
    const handleTranscriptInteraction = vi.fn();
    const handleWheelIntent = vi.fn();

    render(
      <ChatAreaHarness
        layoutOverrides={{
          handleKeyScrollIntent,
          handleScroll,
          handleTouchMove,
          handleTouchStart,
          handleTranscriptInteraction,
          handleWheelIntent,
        }}
      />,
    );

    const scrollRoot = screen.getByTestId("chat-scroll-root");

    fireEvent.wheel(scrollRoot, { deltaY: -24 });
    fireEvent.pointerDown(scrollRoot);
    fireEvent.touchStart(scrollRoot, { touches: [{ clientY: 180 }] });
    fireEvent.touchMove(scrollRoot, { touches: [{ clientY: 236 }] });
    fireEvent.focusIn(scrollRoot);
    fireEvent.keyDown(scrollRoot, { key: "ArrowUp" });
    fireEvent.scroll(scrollRoot);

    expect(handleWheelIntent).toHaveBeenCalledWith(-24);
    expect(handleTranscriptInteraction).toHaveBeenCalledTimes(2);
    expect(handleTouchStart).toHaveBeenCalledWith(180);
    expect(handleTouchMove).toHaveBeenCalledWith(236);
    expect(handleKeyScrollIntent).toHaveBeenCalledWith("ArrowUp");
    expect(handleScroll).toHaveBeenCalledTimes(1);
  });

  it("chat-scroll-root 命中原生纵向滚动条时先交给 scrollbar drag owner", () => {
    const handleScrollbarDragStart = vi.fn();
    const handleTranscriptInteraction = vi.fn();

    render(
      <ChatAreaHarness
        layoutOverrides={{
          handleScrollbarDragStart,
          handleTranscriptInteraction,
        }}
      />,
    );

    const scrollRoot = screen.getByTestId("chat-scroll-root");
    installClassicVerticalScrollbarGeometry(scrollRoot);

    fireEvent.pointerDown(scrollRoot, {
      button: 0,
      clientX: 196,
      clientY: 200,
      isPrimary: true,
    });
    fireEvent.pointerDown(scrollRoot, {
      button: 0,
      clientX: 120,
      clientY: 200,
      isPrimary: true,
    });

    expect(handleScrollbarDragStart).toHaveBeenCalledTimes(1);
    expect(handleTranscriptInteraction).toHaveBeenCalledTimes(1);
  });

  it("引用卡展开类稳定变更会先强制切到阅读态", () => {
    const handleKeyScrollIntent = vi.fn();
    const handleTranscriptInteraction = vi.fn();

    render(
      <ChatAreaHarness
        layoutOverrides={{
          handleKeyScrollIntent,
          handleTranscriptInteraction,
        }}
      />,
    );

    const scrollRoot = screen.getByTestId("chat-scroll-root");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.dataset.chatScrollStableMutation = "true";
    toggle.textContent = "页面元素引用";
    scrollRoot.appendChild(toggle);

    fireEvent.pointerDown(toggle);
    fireEvent.focusIn(toggle);
    fireEvent.keyDown(toggle, { key: "Enter" });
    fireEvent.keyDown(toggle, { key: " " });
    fireEvent.click(toggle);
    fireEvent.keyDown(toggle, { key: "ArrowUp" });

    const forceDetachedCalls = handleTranscriptInteraction.mock.calls.filter(([options]) => (
      (options as { forceDetached?: boolean } | undefined)?.forceDetached === true
    ));
    expect(forceDetachedCalls).toHaveLength(5);
    expect(handleKeyScrollIntent).toHaveBeenCalledWith("Enter");
    expect(handleKeyScrollIntent).toHaveBeenCalledWith(" ");
    expect(handleKeyScrollIntent).toHaveBeenCalledWith("ArrowUp");
  });
});
