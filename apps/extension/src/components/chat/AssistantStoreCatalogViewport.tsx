/**
 * 说明：`AssistantStoreCatalogViewport` 组件模块。
 *
 * 职责：
 * - 承载助手商店主列表区域的卡片编排与虚拟滚动；
 * - 统一浏览器场景、通用助手与用户预设在商店里的展示入口；
 * - 让 `AssistantStoreDialog` 只保留弹窗状态、预览和 CRUD 流程。
 *
 * 边界：
 * - 本组件不拥有预设真源，也不负责预览弹窗或导入导出状态；
 * - 这里只处理列表视口、卡片选择和空态动作的渲染编排。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';

import { AssistantBrowserPresetCard } from '@/components/chat/AssistantBrowserPresetCard';
import { AssistantGeneralPresetCard } from '@/components/chat/AssistantGeneralPresetCard';
import { BUILTIN_DEFAULT_ROLE_TEMPLATE_ID, type AssistantPreset, type StoredAssistantPreset } from '@/types/assistant';

import { StoreCatalogCard, StoreEmptyState } from './AssistantStoreDialog.parts';
import { ASSISTANT_GENERAL_STATIC_GRID_CLASS } from './assistant-preset-grid';
import {
  packStoreGridRows,
  resolveStoreGridColumnCount,
} from './AssistantStoreDialog.utils';

type AssistantStoreSectionKeyLike = 'mine' | 'browser' | 'general';

type AssistantStoreCatalogItemLike = {
  id: string;
  kind: 'builtin' | 'user';
  sectionKey: AssistantStoreSectionKeyLike;
  preset: AssistantPreset | StoredAssistantPreset;
};

const STORE_GENERAL_STATIC_GRID_THRESHOLD = 80;

/** 助手商店主列表视口入参。 */
export interface AssistantStoreCatalogViewportProps {
  /** 当前激活分区。 */
  activeSection: AssistantStoreSectionKeyLike;
  /** 当前搜索词。 */
  search: string;
  /** 当前应展示的预设集合。 */
  filteredItems: AssistantStoreCatalogItemLike[];
  /** 当前是否处于我的预设管理态。 */
  manageMode: boolean;
  /** 当前被勾选的用户预设 id 列表。 */
  selectedPresetIds: string[];
  /** 点击卡片后的上层回调。 */
  onCardClick: (item: AssistantStoreCatalogItemLike) => void;
  /** 管理态切换勾选。 */
  onToggleManagedPreset: (presetId: string) => void;
  /** 打开用户预设编辑器。 */
  onEditUserPreset: (preset: StoredAssistantPreset) => void;
  /** 导出单个用户预设。 */
  onExportUserPreset: (presetId: string) => void;
  /** 删除单个用户预设。 */
  onDeleteUserPreset: (preset: StoredAssistantPreset) => void;
  /** 空态主动作。 */
  onPrimaryEmptyAction: () => void;
  /** 空态次动作。 */
  onSecondaryEmptyAction: () => void;
}

/**
 * 助手商店主列表视口。
 *
 * @remarks
 * 浏览器分区固定使用静态轻量卡片网格；
 * 通用助手在常规规模下把默认助手作为第一张紧凑 tile，
 * 只有超大列表或搜索结果才进入虚拟滚动。
 */
export function AssistantStoreCatalogViewport({
  activeSection,
  search,
  filteredItems,
  manageMode,
  selectedPresetIds,
  onCardClick,
  onToggleManagedPreset,
  onEditUserPreset,
  onExportUserPreset,
  onDeleteUserPreset,
  onPrimaryEmptyAction,
  onSecondaryEmptyAction,
}: AssistantStoreCatalogViewportProps) {
  const { t } = useTranslation();
  const gridViewportRef = useRef<HTMLDivElement | null>(null);
  const [gridWidth, setGridWidth] = useState(0);

  const selectedPresetIdSet = useMemo(() => new Set(selectedPresetIds), [selectedPresetIds]);
  const gridColumnCount = useMemo(() => resolveStoreGridColumnCount(gridWidth), [gridWidth]);
  const packedGridRows = useMemo(
    () => packStoreGridRows(filteredItems, gridColumnCount),
    [filteredItems, gridColumnCount],
  );
  const rowVirtualizer = useVirtualizer({
    count: packedGridRows.length,
    getScrollElement: () => gridViewportRef.current,
    estimateSize: () => 220,
    overscan: 6,
    getItemKey: (index) => packedGridRows[index]?.map((item) => item.id).join('|') ?? index,
    initialRect: {
      width: 0,
      height: 720,
    },
  });

  const rendersStaticBrowserGrid = activeSection === 'browser' && !search.trim();
  const rendersStaticGeneralGrid = activeSection === 'general'
    && !search.trim()
    && filteredItems.length <= STORE_GENERAL_STATIC_GRID_THRESHOLD;

  useEffect(() => {
    const element = gridViewportRef.current;
    if (!element) return;

    /** 同步记录商店虚拟网格当前可用宽度。 */
    const updateWidth = () => {
      setGridWidth(element.clientWidth);
    };

    updateWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => updateWidth());
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  useEffect(() => {
    if (rendersStaticBrowserGrid || rendersStaticGeneralGrid) return;
    rowVirtualizer.measure();
  }, [filteredItems.length, gridColumnCount, rendersStaticBrowserGrid, rendersStaticGeneralGrid, rowVirtualizer]);

  /**
   * 渲染商店里的单张卡片。
   *
   * 说明：
   * - 用户预设继续走完整商店卡片与管理态勾选；
   * - 内置浏览器/通用助手卡片统一复用和 role picker 相同的共享真源。
   */
  const renderGridCard = (
    item: AssistantStoreCatalogItemLike,
    options?: { featured?: boolean; stretchToRow?: boolean },
  ) => {
    if (item.kind === 'builtin' && item.preset.scenario === 'browser') {
      return (
        <AssistantBrowserPresetCard
          key={`${item.kind}-${item.id}`}
          preset={item.preset}
          actionLabel={t('assistant.createFromRole')}
          stretchToRow={options?.stretchToRow}
          onClick={() => onCardClick(item)}
        />
      );
    }

    if (item.kind === 'builtin' && item.preset.scenario === 'general') {
      return (
        <AssistantGeneralPresetCard
          key={`${item.kind}-${item.id}`}
          preset={item.preset}
          actionLabel={t('assistant.createFromRole')}
          featured={options?.featured}
          stretchToRow={options?.stretchToRow}
          onClick={() => onCardClick(item)}
        />
      );
    }

    const isSelected = selectedPresetIdSet.has(item.id);
    const isManageSelectable = manageMode && item.kind === 'user' && activeSection === 'mine' && !search.trim();
    const sectionLabel = item.kind === 'user' ? t('assistant.store.mine') : t(`assistant.store.${item.sectionKey}`);

    return (
      <StoreCatalogCard
        key={`${item.kind}-${item.id}`}
        item={item}
        isSelected={isSelected}
        isManageSelectable={isManageSelectable}
        sectionLabel={sectionLabel}
        noDescriptionLabel={t('assistant.store.noDescription')}
        enableWebSearchLabel={t('assistant.store.enableWebSearch')}
        enableGenerateImageLabel={t('assistant.store.enableGenerateImage')}
        enableMemoryLabel={t('assistant.enableMemory')}
        selectPresetLabel={t('assistant.store.selectPreset', { name: item.preset.name })}
        previewPresetLabel={t('assistant.store.previewPreset', { name: item.preset.name })}
        editPresetLabel={t('assistant.store.editPreset')}
        exportPresetLabel={t('assistant.store.exportPreset')}
        deletePresetLabel={t('assistant.store.deletePreset')}
        onCardClick={onCardClick}
        onToggleManagedPreset={onToggleManagedPreset}
        onEditUserPreset={onEditUserPreset}
        onExportUserPreset={onExportUserPreset}
        onDeleteUserPreset={onDeleteUserPreset}
      />
    );
  };

  return (
    <div ref={gridViewportRef} className="min-h-0 flex-1 overflow-y-auto">
      {filteredItems.length > 0 ? (
        rendersStaticBrowserGrid ? (
          <div
            data-testid="assistant-store-browser-grid"
            className="grid grid-cols-1 gap-2 pb-2 sm:grid-cols-2"
          >
            {filteredItems.map((item) => renderGridCard(item))}
          </div>
        ) : rendersStaticGeneralGrid ? (
          <div
            data-testid="assistant-store-general-grid"
            className={ASSISTANT_GENERAL_STATIC_GRID_CLASS}
          >
            {filteredItems.map((item) => renderGridCard(item, {
              featured: item.id === BUILTIN_DEFAULT_ROLE_TEMPLATE_ID,
            }))}
          </div>
        ) : (
          <div className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const rowItems = packedGridRows[virtualItem.index] ?? [];
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={rowVirtualizer.measureElement}
                  className="pb-3"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <div
                    className="grid gap-3"
                    style={{ gridTemplateColumns: `repeat(${gridColumnCount}, minmax(0, 1fr))` }}
                  >
                    {rowItems.map((item) => renderGridCard(item, {
                      stretchToRow: item.kind === 'builtin' && item.preset.scenario === 'general',
                    }))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <StoreEmptyState
          title={search.trim() ? t('assistant.store.searchEmptyTitle') : t('assistant.store.emptyTitle')}
          description={search.trim() ? t('assistant.store.searchEmptyDesc') : t('assistant.store.emptyDesc')}
          primaryLabel={t('assistant.store.createPreset')}
          onPrimaryAction={onPrimaryEmptyAction}
          secondaryLabel={t('assistant.store.import')}
          onSecondaryAction={onSecondaryEmptyAction}
        />
      )}
    </div>
  );
}
