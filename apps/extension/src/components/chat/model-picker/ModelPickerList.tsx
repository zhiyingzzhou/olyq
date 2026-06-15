/**
 * 说明：`ModelPickerList` 组件模块。
 *
 * 职责：
 * - 承载 `ModelPickerList` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelPickerListProps`、`ModelPickerList` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ReactNode, Ref } from 'react';
import { Check, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { SelectionPanelEmpty, SelectionPanelHintBar } from '@/components/chat/SelectionPanelShared';
import { Button } from '@/components/ui/button';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { ProviderIcon } from '@/components/ui/ProviderIcon';
import { deriveDisplayModelBadgeKeys } from '@/lib/ai/model-type-system';
import { pickProviderUiMeta } from '@/lib/ai/provider-ui-meta';
import { cn } from '@/lib/utils';

import type { PickerItem } from './shared';

/** 模型选择器列表属性。 */
export interface ModelPickerListProps {
  /** 列表容器 ref。 */
  readonly listRef: Ref<HTMLDivElement>;
  /** listbox id。 */
  readonly listboxId: string;
  /** 标题。 */
  readonly title: string;
  /** 多选模式。 */
  readonly multiple: boolean;
  /** 当前焦点 key。 */
  readonly focusedKey: string;
  /** 当前列表项。 */
  readonly listItems: ReadonlyArray<PickerItem>;
  /** 空状态说明。 */
  readonly emptyStateDescription: string;
  /** 可选 footer。 */
  readonly footer?: ReactNode;
  /** 获取 provider logo。 */
  readonly getProviderLogo: (providerId: string) => string | undefined;
  /** 渲染 capability chips。 */
  readonly renderCapabilityChips: (keys: ReadonlyArray<string>) => React.ReactNode;
  /** 设置聚焦项。 */
  readonly onSetFocusedItemKey: (key: string, source?: 'mouse' | 'keyboard' | 'program') => void;
  /** 清理鼠标来源的临时聚焦项。 */
  readonly onClearMouseFocusedItemKey: () => void;
  /** 点击选中模型。 */
  readonly onPickModel: (modelId: string) => void;
  /** 打开模型管理。 */
  readonly onOpenModelManager?: () => void;
  /** 切换 pin。 */
  readonly onTogglePinnedModel: (modelId: string) => void;
  /** 标记用户已滚动。 */
  readonly onUserScroll: () => void;
}

/**
 * 模型选择器列表区。
 *
 * 负责渲染分组头、模型项、空状态和底部快捷键提示。
 * 列表本身不管理筛选和选中逻辑，只消费外层控制器提供的扁平列表与动作。
 */
export function ModelPickerList({
  listRef,
  listboxId,
  title,
  multiple,
  focusedKey,
  listItems,
  emptyStateDescription,
  footer,
  getProviderLogo,
  renderCapabilityChips,
  onSetFocusedItemKey,
  onClearMouseFocusedItemKey,
  onPickModel,
  onOpenModelManager,
  onTogglePinnedModel,
  onUserScroll,
}: ModelPickerListProps) {
  const { t } = useTranslation();

  return (
    <>
      <div
        ref={listRef}
        className="max-h-[60vh] overflow-y-auto py-2"
        data-testid="model-picker-list"
        id={listboxId}
        role="listbox"
        aria-label={title}
        aria-activedescendant={focusedKey ? `${listboxId}-option-${focusedKey}` : undefined}
        aria-multiselectable={multiple || undefined}
        onMouseLeave={onClearMouseFocusedItemKey}
        onScroll={onUserScroll}
      >
        {listItems.length > 0 ? (
          <div className="space-y-1">
            {listItems.map((item) => {
              if (item.type === 'group') {
                const providerId = item.providerId ? String(item.providerId) : '';
                const ui = providerId ? pickProviderUiMeta(providerId) : null;
                const logo = providerId ? getProviderLogo(providerId) : undefined;
                return (
                  <div
                    key={item.key}
                    data-model-picker-row
                    className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-background/80 px-4 py-2 text-xs text-muted-foreground backdrop-blur-sm"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      {/* 分组头在 provider 分组场景下展示 provider 图标，帮助用户快速定位来源。 */}
                      {providerId && ui ? (
                        <ProviderIcon
                          providerId={providerId}
                          customLogo={logo}
                          fallbackIcon={ui.icon}
                          fallbackColor={ui.color}
                          size="xs"
                        />
                      ) : null}
                      {item.name}
                    </span>
                    {item.actions ? <span className="flex items-center gap-1">{item.actions}</span> : null}
                  </div>
                );
              }

              const focused = item.key === focusedKey;
              /**
               * 列表行上的 badge 走“展示投影层”。
               *
               * 说明：
               * - 聊天类模型会显示 8 类用户模型类型里的 `text_generation`；
               * - 图片生成模型现在会显示 `image_generation`，与筛选和详情区保持一致；
               * - 视频生成仍按规则回补系统主类 badge，避免行内完全空白。
               */
              const capKeys = deriveDisplayModelBadgeKeys({
                kind: item.primaryKindKey,
                features: item.features,
              });
              const ui = pickProviderUiMeta(item.providerId);
              const logo = getProviderLogo(item.providerId);
              return (
                <div
                  key={item.key}
                  data-model-key={item.key}
                  data-model-id={item.id}
                  onMouseEnter={() => onSetFocusedItemKey(item.key, 'mouse')}
                  className="group relative"
                >
                  <button
                    id={`${listboxId}-option-${item.key}`}
                    type="button"
                    onClick={() => onPickModel(item.id)}
                    role="option"
                    aria-selected={item.isSelected}
                    className={cn(
                      'relative flex w-full items-center gap-3 rounded-xl px-4 py-2.5 pr-32 text-left transition-colors',
                      focused ? 'bg-accent/35' : 'hover:bg-accent/25',
                      item.isSelected ? 'bg-accent/45' : '',
                    )}
                  >
                    {/* 已选模型左侧会补一条高亮竖线；单选不再额外叠右侧对钩，避免重复表达。 */}
                    {item.isSelected ? (
                      <span className="absolute bottom-2 left-2 top-2 w-1 rounded-full bg-primary/60" />
                    ) : null}

                    <ProviderIcon
                      providerId={item.providerId}
                      customLogo={logo}
                      fallbackIcon={ui.icon}
                      fallbackColor={ui.color}
                      size="sm"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{item.name}</div>
                      {item.forcedVisible ? (
                        <div className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                          {t('modelSelect.currentUnavailable')}
                        </div>
                      ) : null}
                      {item.isPinned || item.forcedVisible ? (
                        <div className="mt-0.5">
                          <span className="truncate text-[11px] text-muted-foreground">{item.providerName}</span>
                        </div>
                      ) : null}
                    </div>
                  </button>

                  <div className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    <TooltipAction tooltip={item.isPinned ? t('modelSelect.unpin') : t('modelSelect.pin')}>
                      <button
                        type="button"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onTogglePinnedModel(item.id);
                        }}
                        className={cn(
                          'pointer-events-auto flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
                          item.isPinned
                            ? 'text-amber-500 hover:bg-amber-500/10'
                            : 'text-muted-foreground/60 hover:bg-accent/30 hover:text-muted-foreground',
                          item.isPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                        )}
                        data-testid="model-picker-pin"
                      >
                        <Star className={cn('h-4 w-4', item.isPinned ? 'fill-current' : '')} />
                      </button>
                    </TooltipAction>

                    {/* 能力徽标需要恢复 pointer events，既让 tooltip 能收到 hover，也避免徽标区域变成不可选中的死区。 */}
                    {capKeys.length > 0 ? (
                      <div
                        className="pointer-events-auto flex items-center gap-1"
                        data-testid="model-picker-row-capabilities"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onPickModel(item.id);
                        }}
                      >
                        {renderCapabilityChips(capKeys)}
                      </div>
                    ) : null}

                    {multiple && item.isSelected ? (
                      <span className="ml-1 text-primary" data-testid="model-picker-selected-check">
                        <Check className="h-4 w-4" />
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <SelectionPanelEmpty
            title={t('modelSelect.emptyTitle')}
            description={emptyStateDescription}
            action={
              onOpenModelManager ? (
                <Button size="sm" variant="secondary" onClick={() => onOpenModelManager()}>
                  {t('modelSelect.manageModels')}
                </Button>
              ) : undefined
            }
          />
        )}
      </div>

      {footer ? <div className="border-t border-border/60 px-4 py-3">{footer}</div> : null}

      <SelectionPanelHintBar
        label={title}
        hints={[
          { id: 'close', keyLabel: 'ESC', text: t('common.close') },
          { id: 'select', keyLabel: '↑↓', text: t('common.select') },
          { id: 'page', keyLabel: 'PgUp/PgDn', text: t('common.page') },
          { id: 'confirm', keyLabel: '↩', text: t('common.confirm') },
        ]}
      />
    </>
  );
}
