/**
 * 说明：`useModelPickerController` 组件模块。
 *
 * 职责：
 * - 承载 `useModelPickerController` 相关的当前文件实现与模块边界；
 * - 对外暴露 `UseModelPickerControllerOptions`、`UseModelPickerControllerResult`、`useModelPickerController` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings2 } from 'lucide-react';

import { CapabilityPill } from '@/components/chat/CapabilityPill';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { useModelOptions, type ModelOption } from '@/hooks/useModelOptions';
import { usePinnedModels } from '@/hooks/usePinnedModels';
import { capabilityLabel } from '@/lib/ai/capability-label';
import {
  deriveSystemModelTypes,
  USER_MODEL_TYPE_ORDER,
} from '@/lib/ai/model-type-system';
import type { ProviderConfig } from '@/lib/ai/types';

import {
  EMPTY_VALUES,
  PAGE_SIZE,
  buildPickerListItems,
  isComposingLikeKeyboardEvent,
  isInteractiveKeyboardTarget,
  matchesSearch,
  normalizeQuery,
  type ModelPickerDialogMultiProps,
  type ModelPickerDialogProps,
  type ModelPickerDialogSingleProps,
  type PickerModelItem,
} from './shared';

/** 模型选择器控制器入参。 */
export interface UseModelPickerControllerOptions {
  /** 当前弹窗属性。 */
  readonly props: ModelPickerDialogProps;
}

/** 焦点来源。 */
type ModelPickerFocusSource = 'mouse' | 'keyboard' | 'program';

/** 模型选择器控制器返回值。 */
export interface UseModelPickerControllerResult {
  /** listbox DOM id。 */
  readonly listboxId: string;
  /** 列表容器引用。 */
  readonly listRef: MutableRefObject<HTMLDivElement | null>;
  /** 当前搜索词。 */
  readonly searchText: string;
  /** 当前激活的模型类型筛选。 */
  readonly activeModelType: string;
  /** 当前激活的 Provider 筛选。 */
  readonly activeProvider: string;
  /** 当前聚焦项 key。 */
  readonly focusedKey: string;
  /** 当前可见 Provider 列表。 */
  readonly availableProviders: ProviderConfig[];
  /** 当前可见模型类型列表。 */
  readonly availableModelTypes: string[];
  /** 列表渲染项。 */
  readonly listItems: ReturnType<typeof buildPickerListItems>;
  /** 空状态说明文案。 */
  readonly emptyStateDescription: string;
  /** 当前已选模型数量。 */
  readonly selectedSize: number;
  /** 获取指定 Provider 的 logo。 */
  readonly getProviderLogo: (providerId: string) => string | undefined;
  /** 处理全局键盘导航。 */
  readonly handleNavigationKey: (key: string) => boolean;
  /** 更新搜索词。 */
  readonly setSearchText: (value: string) => void;
  /** 更新 Provider 筛选。 */
  readonly setActiveProvider: (value: string) => void;
  /** 更新模型类型筛选。 */
  readonly setActiveModelType: (value: string) => void;
  /** 手动设置聚焦项。 */
  readonly setFocusedItemKey: (key: string, source?: ModelPickerFocusSource) => void;
  /** 清理鼠标来源的临时聚焦项。 */
  readonly clearMouseFocusedItemKey: () => void;
  /** 选中一个模型。 */
  readonly pickModel: (modelId: string) => void;
  /** 渲染模型能力徽标。 */
  readonly renderModelCapabilityChips: (keys: ReadonlyArray<string>) => ReactNode[];
  /** 多选模式下清空选择。 */
  readonly clearSelection: () => void;
  /** 切换模型置顶状态。 */
  readonly togglePinnedModel: (modelId: string) => void;
  /** 标记用户已主动滚动列表。 */
  readonly markUserScrolled: () => void;
  /** 多选模式附加属性。 */
  readonly multiProps?: ModelPickerDialogMultiProps;
}

/**
 * 模型选择器控制器。
 *
 * 负责搜索、Provider/模型类型筛选、已选模型定位、键盘导航、置顶模型管理，
 * 以及单选/多选两种模式下的提交逻辑。
 */
export function useModelPickerController({ props }: UseModelPickerControllerOptions): UseModelPickerControllerResult {
  const { open, onClose, filter, onOpenModelManager } = props;
  const { t } = useTranslation();
  const { providers, models } = useModelOptions();
  const { pinnedSet, togglePinnedModel } = usePinnedModels();

  const multiple = props.multiple === true;
  const value = multiple ? '' : props.value;
  const values = multiple ? props.values : EMPTY_VALUES;
  const multiProps = multiple ? (props as ModelPickerDialogMultiProps) : undefined;
  const listboxId = useId();
  /** 列表滚动容器引用，用于自动滚动到当前聚焦项。 */
  const listRef = useRef<HTMLDivElement | null>(null);
  /** 多选/置顶切换后阻止下一轮 effect 抢走焦点。 */
  const preventAutoFocusRef = useRef(false);
  /** 最近一次聚焦来源，用于决定是否自动滚动。 */
  const focusSourceRef = useRef<ModelPickerFocusSource>('program');
  /** 标记用户是否已经主动滚动列表。 */
  const userScrolledRef = useRef(false);
  /** 用于比较筛选条件是否发生变化。 */
  const prevFilterKeyRef = useRef('');

  /** 当前搜索词。 */
  const [searchText, setSearchText] = useState('');
  /** 当前激活的模型类型筛选。 */
  const [activeModelType, setActiveModelType] = useState<string>('all');
  /** 当前激活的 Provider 筛选。 */
  const [activeProvider, setActiveProvider] = useState<string>('all');
  /** 当前聚焦项 key。 */
  const [focusedKey, setFocusedKey] = useState('');
  /** 延迟后的搜索词，用于降低大列表搜索时的同步抖动。 */
  const searchQ = useDeferredValue(searchText);
  /** 即时搜索词，用于键盘确认等不能接受延迟命中的交互。 */
  const normalizedLiveSearchText = useMemo(() => normalizeQuery(searchText), [searchText]);

  /** 获取 Provider logo。 */
  const getProviderLogo = useCallback(
    (providerId: string) => providers.find((provider) => provider.id === providerId)?.logo,
    [providers],
  );

  /** 当前选中模型集合。 */
  const selectedSet = useMemo(() => {
    const sourceValues = multiple ? values : [value];
    const next = new Set<string>();
    for (const raw of sourceValues) {
      const normalized = String(raw || '').trim();
      if (normalized) {
        next.add(normalized);
      }
    }
    return next;
  }, [multiple, value, values]);

  /**
   * 外部传入的模型过滤器包装层。
   *
   * 过滤器异常时默认放行，避免单个筛选器错误把整个选择器卡死。
   */
  const baseFilter = useCallback((model: ModelOption) => {
    try {
      return filter ? Boolean(filter(model)) : true;
    } catch {
      return true;
    }
  }, [filter]);

  /**
   * 用户层模型类型映射。
   *
   * 说明：
   * - 这里只保留当前扩展定义的 8 类模型类型；
   * - `text_generation` 是所有聊天主类的统一入口，负责恢复原本聊天模型在顶部筛选与列表里的可见性；
   * - `image_generation` 现在作为图片生成主类的用户层投影，正式进入 picker 顶部的“模型类型筛选”；
   * - `audio-chat` 一类系统主类仍不会直接进入用户模型类型筛选；
   * - 这样模型选择器对外就只暴露一套用户模型类型心智。
   */
  const modelTypeKeysMap = useMemo(() => {
    const next = new Map<string, string[]>();
    for (const model of models) {
      next.set(
        model.id,
        deriveSystemModelTypes(model)
          .map((item) => String(item || '').trim().toLowerCase())
          .filter(Boolean),
      );
    }
    return next;
  }, [models]);

  /** 归一化后的搜索词。 */
  const normalizedSearchQ = useMemo(() => normalizeQuery(searchQ), [searchQ]);
  /** 归一化后的模型类型筛选值。 */
  const normalizedActiveModelType = useMemo(
    () => String(activeModelType || 'all').trim().toLowerCase(),
    [activeModelType],
  );
  const normalizedActiveProvider = useMemo(
    () => String(activeProvider || 'all').trim().toLowerCase(),
    [activeProvider],
  );

  /** 搜索词与外部过滤器共同作用后的候选模型列表。 */
  const searchFilteredModels = useMemo(
    () => models.filter((model) => baseFilter(model) && matchesSearch(model, normalizedSearchQ)),
    [baseFilter, models, normalizedSearchQ],
  );

  /** 当前筛选上下文下可见的模型类型。 */
  const availableModelTypes = useMemo(() => {
    const modelTypes = new Set<string>();
    for (const model of searchFilteredModels) {
      if (normalizedActiveProvider !== 'all' && model.providerId !== normalizedActiveProvider) {
        continue;
      }
      for (const key of modelTypeKeysMap.get(model.id) ?? []) {
        modelTypes.add(key);
      }
    }
    const rank = new Map(USER_MODEL_TYPE_ORDER.map((modelType, index) => [modelType, index] as const));
    return Array.from(modelTypes).sort((left, right) => {
      const leftRank = rank.get(left as (typeof USER_MODEL_TYPE_ORDER)[number]);
      const rightRank = rank.get(right as (typeof USER_MODEL_TYPE_ORDER)[number]);
      if (typeof leftRank === 'number' && typeof rightRank === 'number') return leftRank - rightRank;
      if (typeof leftRank === 'number') return -1;
      if (typeof rightRank === 'number') return 1;
      return left.localeCompare(right);
    });
  }, [modelTypeKeysMap, normalizedActiveProvider, searchFilteredModels]);

  /** 当前筛选上下文下可见的 Provider。 */
  const availableProviders = useMemo(() => {
    const enabledProviders = providers.filter((provider) => provider.enabled);
    return enabledProviders.filter((provider) =>
      searchFilteredModels.some((model) => {
        if (model.providerId !== provider.id) return false;
        if (normalizedActiveModelType === 'all') return true;
        return (modelTypeKeysMap.get(model.id) ?? []).includes(normalizedActiveModelType);
      }),
    );
  }, [modelTypeKeysMap, normalizedActiveModelType, providers, searchFilteredModels]);

  useEffect(() => {
    if (normalizedActiveProvider !== 'all' && !availableProviders.some((provider) => provider.id === normalizedActiveProvider)) {
      setActiveProvider('all');
    }
  }, [availableProviders, normalizedActiveProvider]);

  useEffect(() => {
    if (normalizedActiveModelType !== 'all' && !availableModelTypes.includes(normalizedActiveModelType)) {
      setActiveModelType('all');
    }
  }, [availableModelTypes, normalizedActiveModelType]);

  /** 生成最终用于渲染的列表项。 */
  const listItems = useMemo(
    () =>
      buildPickerListItems({
        providers,
        models,
        selectedSet,
        pinnedSet,
        baseFilter,
        normalizedSearchQ,
        normalizedActiveProvider,
        normalizedActiveModelType,
        modelTypeKeysMap,
        currentSelectionLabel: t('modelSelect.currentSelection'),
        pinnedLabel: t('modelSelect.pinned'),
        createGroupActions: onOpenModelManager
          ? () => (
              <TooltipAction tooltip={t('modelSelect.manageModels')} side="left">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenModelManager();
                  }}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
              </TooltipAction>
            )
          : undefined,
      }),
    [
      baseFilter,
      modelTypeKeysMap,
      models,
      normalizedActiveProvider,
      normalizedActiveModelType,
      normalizedSearchQ,
      onOpenModelManager,
      pinnedSet,
      providers,
      selectedSet,
      t,
    ],
  );

  const modelItems = useMemo(
    () => listItems.filter((item): item is PickerModelItem => item.type === 'model'),
    [listItems],
  );

  /**
   * 为 Enter 提供“实时搜索词”命中的首个模型。
   *
   * 说明：
   * - 渲染层仍使用 deferred query，避免大列表输入时同步抖动；
   * - 但用户按 Enter 的那一刻不能继续命中旧列表，因此这里按即时 query 再算一次首个可选模型；
   * - 仅当 deferred query 还没追上即时 query 时才会使用该兜底。
   */
  const liveSearchEnterTargetId = useMemo(() => {
    if (!normalizedLiveSearchText) return '';
    const liveItems = buildPickerListItems({
      providers,
      models,
      selectedSet,
      pinnedSet,
      baseFilter,
      normalizedSearchQ: normalizedLiveSearchText,
      normalizedActiveProvider,
      normalizedActiveModelType,
      modelTypeKeysMap,
      currentSelectionLabel: t('modelSelect.currentSelection'),
      pinnedLabel: t('modelSelect.pinned'),
      createGroupActions: undefined,
    });
    return liveItems.find((item): item is PickerModelItem => item.type === 'model' && !item.forcedVisible)?.id
      ?? liveItems.find((item): item is PickerModelItem => item.type === 'model')?.id
      ?? '';
  }, [
    baseFilter,
    modelTypeKeysMap,
    models,
    normalizedActiveProvider,
    normalizedActiveModelType,
    normalizedLiveSearchText,
    pinnedSet,
    providers,
    selectedSet,
    t,
  ]);

  /** 设置当前聚焦项，并记录聚焦来源。 */
  const setFocusedItemKey = useCallback((key: string, source: ModelPickerFocusSource = 'program') => {
    focusSourceRef.current = source;
    setFocusedKey(String(key || ''));
  }, []);

  /** 清理鼠标 hover 写入的临时高亮，保留键盘导航和程序定位语义。 */
  const clearMouseFocusedItemKey = useCallback(() => {
    if (focusSourceRef.current !== 'mouse') return;
    focusSourceRef.current = 'program';
    setFocusedKey('');
  }, []);

  /** 选中一个模型。 */
  const pickModel = useCallback((modelId: string) => {
    const nextId = String(modelId || '').trim();
    if (!nextId) return;

    if (multiple) {
      preventAutoFocusRef.current = true;
      const previous = values.map((item) => String(item || '').trim()).filter(Boolean);
      multiProps?.onChange(previous.includes(nextId) ? previous.filter((item) => item !== nextId) : [...previous, nextId]);
      return;
    }

    (props as ModelPickerDialogSingleProps).onSelect(nextId);
    onClose();
  }, [multiple, multiProps, onClose, props, values]);

  /** 处理键盘导航。 */
  const handleNavigationKey = useCallback((key: string) => {
    if (modelItems.length === 0) return false;
    if (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Enter', 'Escape'].includes(key)) return false;

    const currentIndex = modelItems.findIndex((item) => item.key === focusedKey);
    const selectedIndex = modelItems.findIndex((item) => item.isSelected);
    const searchResultIndex = normalizedSearchQ
      ? modelItems.findIndex((item) => !item.forcedVisible)
      : -1;
    const fallbackIndex = searchResultIndex >= 0
      ? searchResultIndex
      : selectedIndex;
    const anchorIndex = currentIndex >= 0 ? currentIndex : fallbackIndex;
    let nextIndex = -1;

    switch (key) {
      case 'ArrowUp':
        nextIndex = (anchorIndex < 0 ? 0 : anchorIndex - 1 + modelItems.length) % modelItems.length;
        break;
      case 'ArrowDown':
        nextIndex = (anchorIndex < 0 ? 0 : anchorIndex + 1) % modelItems.length;
        break;
      case 'PageUp':
        nextIndex = Math.max(0, (anchorIndex < 0 ? 0 : anchorIndex) - PAGE_SIZE);
        break;
      case 'PageDown':
        nextIndex = Math.min(modelItems.length - 1, (anchorIndex < 0 ? 0 : anchorIndex) + PAGE_SIZE);
        break;
      case 'Enter':
        if (normalizedLiveSearchText && normalizedLiveSearchText !== normalizedSearchQ && liveSearchEnterTargetId) {
          pickModel(liveSearchEnterTargetId);
          return true;
        }
        if (anchorIndex >= 0) {
          pickModel(modelItems[anchorIndex].id);
        } else if (modelItems[0]) {
          pickModel(modelItems[0].id);
        }
        return true;
      case 'Escape':
        onClose();
        return true;
    }

    const next = modelItems[nextIndex];
    if (next) {
      setFocusedItemKey(next.key, 'keyboard');
    }
    return true;
  }, [
    focusedKey,
    liveSearchEnterTargetId,
    modelItems,
    normalizedLiveSearchText,
    normalizedSearchQ,
    onClose,
    pickModel,
    setFocusedItemKey,
  ]);

  useEffect(() => {
    if (!open) return;
    if (preventAutoFocusRef.current) {
      preventAutoFocusRef.current = false;
      return;
    }

    const filterKey = `${normalizeQuery(searchQ)}__${String(activeModelType || 'all').trim().toLowerCase()}__${String(activeProvider || 'all').trim().toLowerCase()}`;
    const filterChanged = prevFilterKeyRef.current !== filterKey;
    prevFilterKeyRef.current = filterKey;

    if (filterChanged) {
      userScrolledRef.current = false;
    } else {
      if (focusedKey && modelItems.some((item) => item.key === focusedKey)) return;
      if (userScrolledRef.current) return;
    }

    const targetKey = normalizedSearchQ
      ? modelItems[0]?.key
      : modelItems.find((item) => item.isSelected)?.key ?? modelItems[0]?.key;
    if (targetKey && targetKey !== focusedKey) {
      setFocusedItemKey(targetKey, 'program');
    }
  }, [activeModelType, activeProvider, focusedKey, modelItems, normalizedSearchQ, open, searchQ, setFocusedItemKey]);

  useEffect(() => {
    if (!open || !focusedKey) return;
    const root = listRef.current;
    if (!root) return;
    const shouldAutoScroll =
      focusSourceRef.current === 'keyboard'
      || (focusSourceRef.current === 'program' && !userScrolledRef.current);
    if (!shouldAutoScroll) return;
    const element = root.querySelector<HTMLElement>(`[data-model-key="${CSS.escape(focusedKey)}"]`);
    element?.scrollIntoView({ block: 'nearest' });
  }, [focusedKey, open]);

  useEffect(() => {
    if (!open) return;
    // 使用 window 级捕获监听，保证 listbox 未持有焦点时方向键依然可以驱动导航。
    /**
     * 处理模型选择器的全局方向键导航。
     *
     * 说明：
     * - 只有在弹窗打开、且当前焦点不在可交互输入元素里时才接管方向键；
     * - 使用捕获阶段监听，确保外层 listbox 未聚焦时仍然可以稳定导航。
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (modelItems.length === 0 || isComposingLikeKeyboardEvent(event)) return;
      if (isInteractiveKeyboardTarget(event.target)) return;
      if (!handleNavigationKey(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [handleNavigationKey, modelItems.length, open]);

  useEffect(() => {
    if (open) return;
    // 关闭弹窗时重置全部筛选与聚焦状态，确保下次打开从干净上下文开始。
    setSearchText('');
    setActiveModelType('all');
    setActiveProvider('all');
    setFocusedKey('');
    userScrolledRef.current = false;
    prevFilterKeyRef.current = '';
  }, [open]);

  /** 渲染模型能力徽标。 */
  const renderModelCapabilityChips = useCallback(
    (keys: ReadonlyArray<string>) =>
      keys.map((key) => (
        <CapabilityPill
          key={key}
          capability={key}
          label={capabilityLabel(key, t)}
          active
          size="xs"
          iconOnly
        />
      )),
    [t],
  );

  const emptyStateDescription = useMemo(() => {
    const parts: string[] = [];
    if (normalizedSearchQ) parts.push(`"${searchText.trim()}"`);
    if (normalizedActiveProvider !== 'all') {
      const providerName = availableProviders.find((provider) => provider.id === normalizedActiveProvider)?.name
        ?? providers.find((provider) => provider.id === normalizedActiveProvider)?.name
        ?? normalizedActiveProvider;
      parts.push(providerName);
    }
    if (normalizedActiveModelType !== 'all') {
      parts.push(capabilityLabel(normalizedActiveModelType, t));
    }
    return parts.length === 0
      ? t('modelSelect.emptyDesc')
      : t('modelSelect.emptyDescWithFilters', { filters: parts.join(' · ') });
  }, [
    availableProviders,
    normalizedActiveProvider,
    normalizedActiveModelType,
    normalizedSearchQ,
    providers,
    searchText,
    t,
  ]);

  const result: UseModelPickerControllerResult = {
    listboxId,
    listRef,
    searchText,
    activeModelType,
    activeProvider,
    focusedKey,
    availableProviders,
    availableModelTypes,
    listItems,
    emptyStateDescription,
    selectedSize: selectedSet.size,
    getProviderLogo,
    handleNavigationKey,
    setSearchText,
    setActiveProvider,
    setActiveModelType,
    setFocusedItemKey,
    clearMouseFocusedItemKey,
    pickModel,
    renderModelCapabilityChips,
    clearSelection: () => {
      preventAutoFocusRef.current = true;
      multiProps?.onChange([]);
    },
    togglePinnedModel: (modelId: string) => {
      preventAutoFocusRef.current = true;
      void togglePinnedModel(modelId);
    },
    markUserScrolled: () => {
      userScrolledRef.current = true;
    },
    multiProps,
  };
  return result;
}
