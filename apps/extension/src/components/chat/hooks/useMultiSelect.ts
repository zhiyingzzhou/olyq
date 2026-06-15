/**
 * 说明：`useMultiSelect` 组件模块。
 *
 * 职责：
 * - 承载 `useMultiSelect` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MultiSelectConfirmOptions`、`UseMultiSelectParams`、`UseMultiSelectResult` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useState, useCallback, useMemo, useRef } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type {
  Message,
  ResolvedConversationContext,
  UpdateTopicMessages,
} from '@/types/chat';
import { useTranslation } from 'react-i18next';
import { toast } from '@/hooks/useToast';
import { downloadText } from '@/lib/export/download';
import { buildMarkdownExportDocument } from '@/lib/export/document-builder';
import { deleteAttachments } from '@/lib/attachments';
import { collectAttachmentIdsFromMessages } from '@/lib/chat/chat-utils';
import { isChatVerticalScrollbarGutterPointerDown } from '@/components/chat/chat-scrollbar-intent';

/**
 * 多选模式确认函数入参。
 */
export interface MultiSelectConfirmOptions {
  /**
   * 确认框标题文案。
   */
  title: string;
  /**
   * 确认框正文说明。
   */
  description?: string;
  /**
   * 确认按钮文案。
   */
  confirmLabel?: string;
  /**
   * 取消按钮文案。
   */
  cancelLabel?: string;
  /**
   * 确认框视觉风格。
   */
  variant?: 'destructive';
}

/**
 * 多选模式 hook 入参。
 */
export interface UseMultiSelectParams {
  /**
   * 当前话题。
   */
  topic: ResolvedConversationContext | null;
  /**
   * 最新消息数组 ref，保证回调里读取到的是最新消息。
   */
  latestMessagesRef: MutableRefObject<Message[]>;
  /**
   * 写回消息数组的回调。
   */
  onUpdateMessages: UpdateTopicMessages;
  /**
   * 消息滚动容器引用，用于拖拽框选时计算矩形与命中项。
   */
  scrollRef: RefObject<HTMLDivElement | null>;
  /**
   * 输入框容器引用，用于退出多选后恢复焦点。
   */
  inputWrapRef: RefObject<HTMLDivElement | null>;
  /** 确认函数，返回 Promise\<boolean\>；不传时静默删除（由调用方自行确认） */
  confirm?: (opts: MultiSelectConfirmOptions) => Promise<boolean>;
}

/**
 * 多选拖拽状态。
 */
type MultiSelectDragState = {
  /**
   * 拖拽起点 X 坐标。
   */
  startX: number;
  /**
   * 拖拽起点 Y 坐标。
   */
  startY: number;
  /**
   * 当前是否为追加选择模式。
   */
  additive: boolean;
  /**
   * 开始拖拽前的基础选择集。
   */
  base: Set<string>;
};

/**
 * 选择矩形。
 */
type MultiSelectRect = {
  /**
   * 左上角 X 偏移。
   */
  left: number;
  /**
   * 左上角 Y 偏移。
   */
  top: number;
  /**
   * 矩形宽度。
   */
  width: number;
  /**
   * 矩形高度。
   */
  height: number;
};

const EMPTY_SELECTABLE_IDS: string[] = [];

/**
 * 多选模式 hook 返回值。
 */
export interface UseMultiSelectResult {
  /**
   * 当前是否处于多选模式。
   */
  multiSelectMode: boolean;
  /**
   * 直接更新多选模式开关。
   */
  setMultiSelectMode: (value: boolean) => void;
  /**
   * 当前选中的消息 ID 集合。
   */
  selectedIds: Set<string>;
  /**
   * 直接覆盖当前选中集合。
   */
  setSelectedIds: (value: Set<string>) => void;
  /**
   * 当前话题内可被多选的消息数量。
   */
  selectableCount: number;
  /**
   * 当前话题内可选消息是否已全部选中。
   */
  allSelected: boolean;
  /**
   * 当前拖拽框选状态。
   */
  selectDragRef: MutableRefObject<MultiSelectDragState | null>;
  /**
   * 当前框选矩形。
   */
  selectRect: MultiSelectRect | null;
  /**
   * 手动更新框选矩形。
   */
  setSelectRect: (value: MultiSelectRect | null) => void;
  /**
   * 进入多选模式，可选携带初始选中消息。
   */
  enterMultiSelect: (seedId?: string) => void;
  /**
   * 退出多选模式并清空临时状态。
   */
  exitMultiSelect: () => void;
  /**
   * 切换单条消息的选中状态。
   */
  toggleSelect: (id: string) => void;
  /**
   * 切换当前话题内所有可选消息的选中状态。
   */
  toggleSelectAll: () => void;
  /**
   * 删除不再被引用的附件实体。
   */
  cleanupUnusedAttachments: (removed: Message[], remaining: Message[]) => void;
  /**
   * 将选中消息导出为 Markdown 并复制到剪贴板。
   */
  handleMultiSelectCopy: () => Promise<void>;
  /**
   * 将选中消息导出为 Markdown 文件。
   */
  handleMultiSelectSave: () => Promise<void>;
  /**
   * 删除选中的消息。
   */
  handleMultiSelectDelete: () => Promise<void>;
  /**
   * 处理拖拽框选起点事件。
   */
  onMultiSelectMouseDown: (e: React.MouseEvent) => void;
}

/**
 * 多选模式控制器。
 *
 * 负责维护消息多选状态、拖拽框选、批量复制/导出/删除，以及删除后附件清理逻辑。
 *
 * @param params - 当前话题、消息引用、滚动容器和确认函数。
 * @returns 多选状态与批量操作函数。
 */
export function useMultiSelect({ topic, latestMessagesRef, onUpdateMessages, scrollRef, inputWrapRef, confirm }: UseMultiSelectParams) {
  const { t } = useTranslation();
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectDragRef = useRef<MultiSelectDragState | null>(null);
  const [selectRect, setSelectRect] = useState<MultiSelectRect | null>(null);
  const latestMessages = latestMessagesRef.current;
  const selectableIds = useMemo(
    () => (topic
      ? latestMessages
          .filter((message) => message.role !== 'system')
          .map((message) => message.id)
      : EMPTY_SELECTABLE_IDS),
    [latestMessages, topic],
  );
  const selectableCount = selectableIds.length;
  const allSelected = selectableCount > 0 && selectableIds.every((id) => selectedIds.has(id));

  /**
   * 退出多选模式，并把焦点还回输入框。
   */
  const exitMultiSelect = useCallback(() => {
    setMultiSelectMode(false);
    setSelectedIds(new Set());
    setSelectRect(null);
    selectDragRef.current = null;
    queueMicrotask(() => {
      const el = inputWrapRef.current?.querySelector('textarea') as HTMLTextAreaElement | null;
      el?.focus();
    });
  }, [inputWrapRef]);

  /**
   * 进入多选模式，可选设置一个初始选中消息。
   */
  const enterMultiSelect = useCallback((seedId?: string) => {
    setMultiSelectMode(true);
    setSelectedIds(seedId ? new Set([seedId]) : new Set());
    setSelectRect(null);
    selectDragRef.current = null;
  }, []);

  /**
   * 切换单条消息的选中状态。
   */
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /**
   * 切换当前话题全部可选消息的选中状态。
   */
  const toggleSelectAll = useCallback(() => {
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
  }, [allSelected, selectableIds]);

  /**
   * 根据删除前后的消息集合清理不再被引用的附件。
   */
  const cleanupUnusedAttachments = useCallback((removed: Message[], remaining: Message[]) => {
    const removedIds = collectAttachmentIdsFromMessages(removed);
    if (removedIds.length === 0) return;
    const remainIds = new Set(collectAttachmentIdsFromMessages(remaining));
    const toDelete = removedIds.filter((id) => !remainIds.has(id));
    if (toDelete.length > 0) void deleteAttachments(toDelete);
  }, []);

  /**
   * 复制当前选中消息为 Markdown。
   */
  const handleMultiSelectCopy = useCallback(async () => {
    if (!topic || selectedIds.size === 0) return;
    const picked = latestMessagesRef.current.filter((m) => selectedIds.has(m.id));
    try {
      const md = await buildMarkdownExportDocument({
        title: topic.title || '聊天记录',
        messages: picked,
        includeReasoning: true,
        fallbackAssistantModelLabel: topic.model,
      });
      await navigator.clipboard.writeText(md);
      toast({ title: t('chat.copied'), description: t('message.copiedMarkdown') });
      exitMultiSelect();
    } catch {
      toast({ title: t('common.error'), description: t('sidebar.clipboardFailed'), variant: 'destructive' });
    }
  }, [exitMultiSelect, latestMessagesRef, selectedIds, topic, t]);

  /**
   * 保存当前选中消息为 Markdown 文件。
   */
  const handleMultiSelectSave = useCallback(async () => {
    if (!topic || selectedIds.size === 0) return;
    const picked = latestMessagesRef.current.filter((m) => selectedIds.has(m.id));
    /** 将日期时间片段补齐为两位数字，保证导出文件名稳定可读。 */
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    const filename = `chat_export_${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}.md`;
    try {
      const md = await buildMarkdownExportDocument({
        title: topic.title || '聊天记录',
        messages: picked,
        includeReasoning: true,
        fallbackAssistantModelLabel: topic.model,
      });
      await downloadText(md, filename, 'text/markdown;charset=utf-8');
      toast({ title: t('common.success'), description: t('message.exportedMarkdown') });
      exitMultiSelect();
    } catch (e: unknown) {
      toast({ title: t('common.error'), description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  }, [exitMultiSelect, latestMessagesRef, selectedIds, topic, t]);

  /**
   * 删除当前选中消息，并清理不再使用的附件。
   */
  const handleMultiSelectDelete = useCallback(async () => {
    if (!topic || selectedIds.size === 0) return;
    if (confirm) {
      const ok = await confirm({
        title: t('multiSelect.confirmDelete', { count: selectedIds.size }),
        description: t('multiSelect.confirmDeleteDesc'),
        confirmLabel: t('common.delete'),
        cancelLabel: t('common.cancel'),
        variant: 'destructive',
      });
      if (!ok) return;
    }
    const cur = latestMessagesRef.current;
    const removed = cur.filter((m) => selectedIds.has(m.id));
    const remaining = cur.filter((m) => !selectedIds.has(m.id));
    cleanupUnusedAttachments(removed, remaining);
    onUpdateMessages(topic.id, remaining);
    exitMultiSelect();
  }, [cleanupUnusedAttachments, confirm, exitMultiSelect, latestMessagesRef, onUpdateMessages, selectedIds, topic, t]);

  /**
   * 处理拖拽框选起点事件。
   *
   * 在空白区域按下鼠标左键时开始框选；按住 `Meta/Ctrl` 可基于当前选择集追加框选。
   */
  const onMultiSelectMouseDown = useCallback((e: React.MouseEvent) => {
    if (!multiSelectMode || e.button !== 0) return;
    const el = e.target as HTMLElement | null;
    if (el?.closest('[data-msg-id]')) return;
    const container = scrollRef.current;
    if (!container) return;
    if (isChatVerticalScrollbarGutterPointerDown(container, e.nativeEvent)) return;

    e.preventDefault();
    e.stopPropagation();

    const additive = Boolean(e.metaKey || e.ctrlKey);
    const base = additive ? new Set(selectedIds) : new Set<string>();
    selectDragRef.current = { startX: e.clientX, startY: e.clientY, additive, base };

    const containerRect = container.getBoundingClientRect();
    /**
     * 命中检测：返回与当前框选矩形相交的消息 ID 集合。
     *
     * @param rect - 当前框选矩形的屏幕坐标。
     * @returns 被框选命中的消息 ID。
     */
    const pickHits = (rect: { left: number; right: number; top: number; bottom: number }) => {
      const hits = new Set<string>();
      const nodes = container.querySelectorAll<HTMLElement>('[data-msg-id]');
      for (const n of nodes) {
        const id = n.dataset.msgId;
        if (!id) continue;
        const r = n.getBoundingClientRect();
        if (r.right >= rect.left && r.left <= rect.right && r.bottom >= rect.top && r.top <= rect.bottom) hits.add(id);
      }
      return hits;
    };

    /**
     * 拖拽过程中更新选择矩形与命中集合。
     *
     * @param ev - 原生鼠标移动事件。
     */
    const move = (ev: MouseEvent) => {
      const state = selectDragRef.current;
      if (!state) return;
      const left = Math.min(state.startX, ev.clientX);
      const right = Math.max(state.startX, ev.clientX);
      const top = Math.min(state.startY, ev.clientY);
      const bottom = Math.max(state.startY, ev.clientY);
      setSelectRect({ left: left - containerRect.left, top: top - containerRect.top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) });
      const hits = pickHits({ left, right, top, bottom });
      setSelectedIds(() => {
        if (state.additive) { const next = new Set(state.base); for (const id of hits) next.add(id); return next; }
        return hits;
      });
    };

    /** 结束框选拖拽并清理全局事件监听。 */
    const up = () => {
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', up, true);
      selectDragRef.current = null;
      setSelectRect(null);
    };

    window.addEventListener('mousemove', move, true);
    window.addEventListener('mouseup', up, true);
  }, [multiSelectMode, scrollRef, selectedIds]);

  const result = {
    multiSelectMode,
    setMultiSelectMode,
    selectedIds,
    setSelectedIds,
    selectableCount,
    allSelected,
    selectDragRef,
    selectRect,
    setSelectRect,
    enterMultiSelect,
    exitMultiSelect,
    toggleSelect,
    toggleSelectAll,
    cleanupUnusedAttachments,
    handleMultiSelectCopy,
    handleMultiSelectSave,
    handleMultiSelectDelete,
    onMultiSelectMouseDown,
  } satisfies UseMultiSelectResult;

  return result;
}
