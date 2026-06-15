/**
 * 说明：`useQuickPanelControllerImpl` 组件模块。
 *
 * 职责：
 * - 承载 `useQuickPanelControllerImpl` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useQuickPanelController` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';

import { getQuickPhrases, subscribeQuickPhrases } from '@/lib/quick-phrases/phrase-store';

import { focusQuickPanelInputCursorSafely, focusQuickPanelInputRangeSafely } from './focusInput';
import { useQuickPanelMenus } from './useQuickPanelMenus';
import type {
  QuickPanelItem,
  QuickPanelMenu,
  UseQuickPanelControllerOptions,
  UseQuickPanelControllerResult,
} from './types';
import { getQuickPanelDefaultHints, removeAtSymbolAndText } from './utils';

/**
 * 生成 quick panel 菜单的稳定签名。
 *
 * @remarks
 * `QuickPanelMenu` 在 render 期间会频繁重建对象；这里只抽取会影响展示和导航的稳定字段，
 * 用来判断“已打开子菜单”是否真的发生语义变化，避免仅因引用变化就反复 setState。
 */
function buildQuickPanelMenuSignature(menu: QuickPanelMenu): string {
  const itemSignature = menu.items.map((item) => {
    const base = [
      item.id,
      item.kind,
      item.name,
      item.description ?? '',
      item.selected ? '1' : '0',
      item.disabled ? '1' : '0',
      item.presentation ?? '',
      item.alwaysVisible ? '1' : '0',
    ].join(':');

    if (item.kind !== 'menu') return base;
    const childIds = item.children.map((child) => child.id).join(',');
    return `${base}:${item.menu?.id ?? ''}:${childIds}`;
  }).join('|');

  return [
    menu.id,
    menu.title,
    menu.subtitle ?? '',
    menu.placeholderLabel ?? '',
    menu.emptyTitle ?? '',
    menu.emptyDesc ?? '',
    itemSignature,
  ].join('||');
}

/**
 * 导出 Hook：`useQuickPanelController`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useQuickPanelController({
  t,
  text,
  setText,
  inputRef,
  slashCommands,
  attachmentsHaveImage,
  models,
  providers,
  onOpenModelManager,
  canBindAssistant,
  canBuiltinWebSearch,
  builtinWebSearchEnabled,
  selectedWebSearchProviderId,
  webSearchSettings,
  onToggleBuiltinWebSearch,
  onSelectExternalWebSearchProvider,
  onOpenWebSearchSettings,
  onOpenNativeWebSearchSettings,
  enabledMcpServers,
  mcpSettingsConfig,
  activeMcpSelection,
  setActiveMcpSelection,
  onOpenMcpSettings,
  assistantRegularPhrases,
  onOpenQuickPhraseCreator,
  mentionModels,
  onChangeMentionModels,
}: UseQuickPanelControllerOptions): UseQuickPanelControllerResult {
  const [quickPanelOpen, setQuickPanelOpen] = useState(false);
  const [quickPanelKind, setQuickPanelKind] = useState<UseQuickPanelControllerResult['quickPanelKind']>(null);
  const [quickPanelFilter, setQuickPanelFilter] = useState('');
  const [quickPanelIndex, setQuickPanelIndex] = useState(0);
  const [quickPanelStart, setQuickPanelStart] = useState(-1);
  const [quickPanelStack, setQuickPanelStack] = useState<QuickPanelMenu[]>([]);
  const [phrases, setPhrases] = useState(getQuickPhrases());
  const quickPanelRef = useRef<HTMLDivElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mentionTriggerRef = useRef<UseQuickPanelControllerOptions['mcpSettingsConfig'] extends never ? never : { type: 'input' | 'button'; position?: number } | null>(null);
  const mentionActionRef = useRef(false);

  const manualMcpServerIds = useMemo(
    () => (activeMcpSelection.mode === 'manual' ? activeMcpSelection.manualServerIds : []),
    [activeMcpSelection.manualServerIds, activeMcpSelection.mode],
  );

  const toggleMentionModel = useCallback((modelId: string) => {
    if (modelId === '__clear__') {
      mentionActionRef.current = true;
      onChangeMentionModels([]);
      return;
    }

    const normalizedId = String(modelId || '').trim();
    if (!normalizedId) return;
    mentionActionRef.current = true;
    onChangeMentionModels(
      mentionModels.includes(normalizedId)
        ? mentionModels.filter((item) => item !== normalizedId)
        : [...mentionModels, normalizedId],
    );
  }, [mentionModels, onChangeMentionModels]);

  const menus = useQuickPanelMenus({
    t,
    slashCommands,
    phrases,
    attachmentsHaveImage,
    models,
    providers,
    onOpenModelManager,
    canBindAssistant,
    canBuiltinWebSearch,
    builtinWebSearchEnabled,
    selectedWebSearchProviderId,
    webSearchSettings,
    onToggleBuiltinWebSearch,
    onSelectExternalWebSearchProvider,
    onOpenWebSearchSettings,
    onOpenNativeWebSearchSettings,
    enabledMcpServers,
    mcpSettingsConfig,
    activeMcpSelection,
    setActiveMcpSelection,
    onOpenMcpSettings,
    assistantRegularPhrases,
    onOpenQuickPhraseCreator,
    mentionModels,
    manualMcpServerIds,
    toggleMentionModel,
  });

  const focusInputSafely = useCallback(
    (cursorPos?: number) => focusQuickPanelInputCursorSafely(inputRef, cursorPos),
    [inputRef],
  );
  const focusInputRangeSafely = useCallback(
    (selectionStart: number, selectionEnd: number) => focusQuickPanelInputRangeSafely(inputRef, selectionStart, selectionEnd),
    [inputRef],
  );

  useEffect(() => {
    return subscribeQuickPhrases(() => setPhrases(getQuickPhrases()));
  }, []);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const activeQuickRootMenu = useMemo<QuickPanelMenu>(() => {
    if (quickPanelKind === 'mention') return menus.mentionQuickMenu;
    if (quickPanelKind === 'web-search') return menus.webSearchQuickMenu;
    if (quickPanelKind === 'mcp') return menus.mcpQuickMenu;
    if (quickPanelKind === 'phrases') return menus.phrasesQuickMenu;
    return menus.quickRootMenu;
  }, [menus.mcpQuickMenu, menus.mentionQuickMenu, menus.phrasesQuickMenu, menus.quickRootMenu, menus.webSearchQuickMenu, quickPanelKind]);

  const quickActiveMenu = useMemo<QuickPanelMenu>(() => {
    if (quickPanelStack.length > 0) return quickPanelStack[quickPanelStack.length - 1]!;
    return activeQuickRootMenu;
  }, [activeQuickRootMenu, quickPanelStack]);

  useEffect(() => {
    setQuickPanelStack((current) => {
      if (current.length < 1) return current;

      let parentMenu = activeQuickRootMenu;
      let changed = false;
      const nextStack = current.map((menu) => {
        const nextMenu = parentMenu.items.find(
          (item): item is Extract<QuickPanelItem, { kind: 'menu' }> => item.kind === 'menu' && item.menu?.id === menu.id,
        )?.menu;
        if (!nextMenu) {
          parentMenu = menu;
          return menu;
        }
        if (buildQuickPanelMenuSignature(nextMenu) !== buildQuickPanelMenuSignature(menu)) changed = true;
        parentMenu = nextMenu;
        return nextMenu;
      });

      return changed ? nextStack : current;
    });
  }, [activeQuickRootMenu]);

  const filteredQuickItems = useMemo(() => {
    const query = quickPanelFilter.trim().toLowerCase();
    const pinnedItems = quickActiveMenu.items.filter((item) => item.alwaysVisible);
    const normalItems = quickActiveMenu.items.filter((item) => !item.alwaysVisible);
    if (!query) return [...pinnedItems, ...normalItems];
    return [
      ...pinnedItems,
      ...normalItems.filter((item) => {
        const name = item.name.toLowerCase();
        const description = (item.description ?? '').toLowerCase();
        return name.includes(query) || description.includes(query);
      }),
    ];
  }, [quickActiveMenu.items, quickPanelFilter]);

  const quickPanelHints = useMemo(
    () => quickActiveMenu.hints ?? getQuickPanelDefaultHints(t, quickPanelStack.length > 0),
    [quickActiveMenu.hints, quickPanelStack.length, t],
  );

  const quickPanelFooterLabel = useMemo(() => {
    if (quickPanelStart >= 0) {
      const symbol = quickPanelKind === 'mention' ? '@' : '/';
      return `${symbol} ${quickPanelFilter.trim()}`.trim();
    }
    return quickActiveMenu.placeholderLabel ?? quickActiveMenu.title;
  }, [quickActiveMenu.placeholderLabel, quickActiveMenu.title, quickPanelFilter, quickPanelKind, quickPanelStart]);

  const quickPanelInlineSymbol = useMemo(() => {
    if (quickPanelKind === 'mention') return '@';
    if (quickPanelKind === 'slash') return '/';
    return null;
  }, [quickPanelKind]);

  const closeQuickPanel = useCallback((options?: { restoreFocus?: boolean }) => {
    const restoreFocus = options?.restoreFocus ?? true;
    const activeKind = quickPanelKind;
    const trigger = mentionTriggerRef.current;

    setQuickPanelOpen(false);
    setQuickPanelFilter('');
    setQuickPanelIndex(0);
    setQuickPanelStart(-1);
    setQuickPanelStack([]);
    setQuickPanelKind(null);
    mentionTriggerRef.current = null;

    if (
      activeKind === 'mention'
      && trigger?.type === 'input'
      && typeof trigger.position === 'number'
      && mentionActionRef.current
    ) {
      const fallbackPosition = trigger.position;
      setText((current) => removeAtSymbolAndText(current, fallbackPosition));
      mentionActionRef.current = false;
      if (restoreFocus) focusInputSafely(fallbackPosition);
      return;
    }

    mentionActionRef.current = false;
    if (restoreFocus) focusInputSafely();
  }, [focusInputSafely, quickPanelKind, setText]);

  const openQuickPanel = useCallback((options: Parameters<UseQuickPanelControllerResult['openQuickPanel']>[0]) => {
    const { kind, start = -1, filter = '', mentionTrigger = null } = options;
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }

    if (quickPanelOpen && quickPanelKind && quickPanelKind !== kind) {
      closeQuickPanel({ restoreFocus: false });
    }

    if (kind === 'slash' || kind === 'phrases') setPhrases(getQuickPhrases());
    mentionActionRef.current = false;
    mentionTriggerRef.current = kind === 'mention' ? mentionTrigger : null;
    setQuickPanelKind(kind);
    setQuickPanelOpen(true);
    setQuickPanelStart(start);
    setQuickPanelFilter(filter);
    setQuickPanelIndex(0);
    setQuickPanelStack([]);

    // 只有输入内联触发的 quick panel 才需要把焦点维持在 textarea；
    // 按钮锚点面板若立刻抢回焦点，会被 Radix 判定为 outside focus 并自动关闭。
    if (start >= 0) {
      focusInputSafely();
    }
  }, [closeQuickPanel, focusInputSafely, quickPanelKind, quickPanelOpen]);

  const toggleQuickPanel = useCallback((options: Parameters<UseQuickPanelControllerResult['toggleQuickPanel']>[0]) => {
    if (quickPanelOpen && quickPanelKind === options.kind) {
      closeQuickPanel();
      return;
    }
    openQuickPanel(options);
  }, [closeQuickPanel, openQuickPanel, quickPanelKind, quickPanelOpen]);

  const resetQuickPanelQueryInInput = useCallback(() => {
    if (quickPanelStart < 0) return;
    const element = inputRef.current;
    const cursorPos = element?.selectionStart ?? text.length;
    const before = text.slice(0, quickPanelStart + 1);
    const after = text.slice(cursorPos);
    setText(before + after);
    setQuickPanelFilter('');
    setQuickPanelIndex(0);
    queueMicrotask(() => {
      const nextPos = Math.min(quickPanelStart + 1, (before + after).length);
      try {
        element?.setSelectionRange(nextPos, nextPos);
      } catch {
        // Ignore selection failures when textarea detaches.
      }
    });
  }, [inputRef, quickPanelStart, setText, text]);

  const enterQuickMenu = useCallback((menuItem: Extract<QuickPanelItem, { kind: 'menu' }>) => {
    if (!menuItem.children) return;
    setQuickPanelStack((prev) => [
      ...prev,
      menuItem.menu ?? {
        id: menuItem.id,
        title: menuItem.name,
        placeholderLabel: menuItem.name,
        emptyTitle: t('search.noResults'),
        items: menuItem.children,
      },
    ]);
    resetQuickPanelQueryInInput();
  }, [resetQuickPanelQueryInInput, t]);

  const goBackQuickMenu = useCallback(() => {
    setQuickPanelStack((prev) => (prev.length === 0 ? prev : prev.slice(0, -1)));
    resetQuickPanelQueryInInput();
  }, [resetQuickPanelQueryInInput]);

  const selectQuickItem = useCallback((item: QuickPanelItem) => {
    if (item.disabled) return;

    if (item.kind === 'menu') {
      try {
        item.action?.();
      } catch {
        // Ignore menu side-effect failures to preserve navigation.
      }
      enterQuickMenu(item);
      return;
    }

    const shouldReplaceTrigger = quickPanelStart >= 0 && (item.insertText !== undefined || quickPanelKind === 'slash');
    if (item.insertText !== undefined) {
      const element = inputRef.current;
      const selectionStart = element?.selectionStart ?? text.length;
      const selectionEnd = element?.selectionEnd ?? selectionStart;
      const start = shouldReplaceTrigger ? quickPanelStart : selectionStart;
      const end = shouldReplaceTrigger ? selectionStart : selectionEnd;
      const before = text.slice(0, start);
      const after = text.slice(end);
      const nextText = before + item.insertText + after;
      setText(nextText);
      focusInputRangeSafely(start, start + item.insertText.length);
    } else if (shouldReplaceTrigger) {
      const element = inputRef.current;
      const cursorPos = element?.selectionStart ?? text.length;
      const before = text.slice(0, quickPanelStart);
      const after = text.slice(cursorPos);
      setText(before + after);
    }

    try {
      item.action?.();
    } catch {
      // Ignore action failures to keep panel state recoverable.
    }

    if (item.keepOpen) {
      setQuickPanelIndex(0);
      if (quickPanelStart >= 0) {
        focusInputSafely();
      }
      return;
    }

    closeQuickPanel({
      restoreFocus: item.insertText !== undefined || quickPanelKind === 'slash',
    });
  }, [closeQuickPanel, enterQuickMenu, focusInputRangeSafely, focusInputSafely, inputRef, quickPanelKind, quickPanelStart, setText, text]);

  const handleQuickPanelKeyDown = useCallback((event: Parameters<UseQuickPanelControllerResult['handleQuickPanelKeyDown']>[0]) => {
    if (!quickPanelOpen) return false;

    if (filteredQuickItems.length > 0) {
      const activeItem = filteredQuickItems[Math.min(filteredQuickItems.length - 1, Math.max(0, quickPanelIndex))]!;
      const pageStep = Math.max(1, Math.min(filteredQuickItems.length, 8));

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setQuickPanelIndex((index) => (index + 1) % filteredQuickItems.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setQuickPanelIndex((index) => (index - 1 + filteredQuickItems.length) % filteredQuickItems.length);
        return true;
      }
      if (event.key === 'PageDown') {
        event.preventDefault();
        setQuickPanelIndex((index) => Math.min(filteredQuickItems.length - 1, index + pageStep));
        return true;
      }
      if (event.key === 'PageUp') {
        event.preventDefault();
        setQuickPanelIndex((index) => Math.max(0, index - pageStep));
        return true;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'ArrowRight' && activeItem.kind === 'menu') {
        event.preventDefault();
        enterQuickMenu(activeItem);
        return true;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'ArrowLeft' && quickPanelStack.length > 0) {
        event.preventDefault();
        goBackQuickMenu();
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        selectQuickItem(activeItem);
        return true;
      }
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeQuickPanel();
      return true;
    }

    return false;
  }, [closeQuickPanel, enterQuickMenu, filteredQuickItems, goBackQuickMenu, quickPanelIndex, quickPanelOpen, quickPanelStack.length, selectQuickItem]);

  const handleInputChange = useCallback((value: string, cursorPos: number) => {
    setText(value);

    if (quickPanelOpen) {
      if (quickPanelStart >= 0) {
        const filterText = value.slice(quickPanelStart + 1, cursorPos);
        if (filterText.includes(' ') || cursorPos <= quickPanelStart) {
          closeQuickPanel({ restoreFocus: false });
        } else {
          setQuickPanelFilter(filterText);
          setQuickPanelIndex(0);
        }
        return;
      }

      closeQuickPanel({ restoreFocus: false });
    }

    const charBefore = cursorPos > 0 ? value[cursorPos - 1] : '';
    const charBeforeThat = cursorPos > 1 ? value[cursorPos - 2] : '';
    const atBoundary = charBeforeThat === '' || charBeforeThat === ' ' || charBeforeThat === '\n';

    if (charBefore === '@' && atBoundary) {
      openQuickPanel({
        kind: 'mention',
        start: cursorPos - 1,
        mentionTrigger: { type: 'input', position: cursorPos - 1 },
      });
    } else if (charBefore === '/' && atBoundary) {
      openQuickPanel({ kind: 'slash', start: cursorPos - 1 });
    }
  }, [closeQuickPanel, openQuickPanel, quickPanelOpen, quickPanelStart, setText]);

  const handleInputBlur = useCallback(() => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => {
      blurTimerRef.current = null;
      closeQuickPanel({ restoreFocus: false });
    }, 150);
  }, [closeQuickPanel]);

  const resolveTextForSend = useCallback((currentText: string) => {
    const trigger = mentionTriggerRef.current;
    if (
      quickPanelKind === 'mention'
      && trigger?.type === 'input'
      && typeof trigger.position === 'number'
      && mentionActionRef.current
    ) {
      return removeAtSymbolAndText(currentText, trigger.position);
    }
    return currentText;
  }, [quickPanelKind]);

  useEffect(() => {
    if (filteredQuickItems.length === 0) {
      if (quickPanelIndex !== 0) setQuickPanelIndex(0);
      return;
    }
    if (quickPanelIndex > filteredQuickItems.length - 1) {
      setQuickPanelIndex(filteredQuickItems.length - 1);
    }
  }, [filteredQuickItems.length, quickPanelIndex]);

  useEffect(() => {
    if (!quickPanelOpen) return;
    const activeElement = quickPanelRef.current?.querySelector('[data-quick-panel-item][data-active="true"]');
    if (activeElement instanceof HTMLElement && typeof activeElement.scrollIntoView === 'function') {
      activeElement.scrollIntoView({ block: 'nearest' });
    }
  }, [quickPanelIndex, quickPanelOpen]);

  return {
    quickPanelRef: quickPanelRef as RefObject<HTMLDivElement | null>,
    quickPanelOpen,
    quickPanelKind,
    quickActiveMenu,
    filteredQuickItems,
    quickPanelHints,
    quickPanelFooterLabel,
    quickPanelInlineSymbol,
    hasInlineQuery: quickPanelStart >= 0 && quickPanelFilter.trim().length > 0,
    quickPanelIndex,
    canGoBack: quickPanelStack.length > 0,
    mentionModels,
    setQuickPanelIndex,
    toggleMentionModel,
    openQuickPanel,
    toggleQuickPanel,
    closeQuickPanel,
    goBackQuickMenu,
    selectQuickItem,
    handleQuickPanelKeyDown,
    handleInputChange,
    handleInputBlur,
    resolveTextForSend,
  };
}
