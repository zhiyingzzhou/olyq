/**
 * 说明：`ModelPickerHeader` 组件模块。
 *
 * 职责：
 * - 承载 `ModelPickerHeader` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelPickerHeaderProps`、`ModelPickerHeader` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CapabilityPill } from '@/components/chat/CapabilityPill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProviderIcon } from '@/components/ui/ProviderIcon';
import type { ProviderConfig } from '@/lib/ai/types';
import { capabilityLabel } from '@/lib/ai/capability-label';
import { pickProviderUiMeta } from '@/lib/ai/provider-ui-meta';
import { cn } from '@/lib/utils';

import { isComposingLikeKeyboardEvent, type ModelPickerDialogMultiProps } from './shared';

const providerFilterButtonClassName =
  'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-[background-color,border-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background';

const providerFilterActiveClassName =
  'border-primary/45 bg-transparent text-foreground font-semibold shadow-none dark:border-primary/45';

const providerFilterInactiveClassName =
  'border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/35 hover:text-foreground';

const providerFilterIconTileClassName =
  'inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center overflow-visible text-foreground/90';

/** 模型选择器头部属性。 */
export interface ModelPickerHeaderProps {
  /** 搜索框 listbox id。 */
  readonly listboxId: string;
  /** 搜索文本。 */
  readonly searchText: string;
  /** 聚焦 key。 */
  readonly focusedKey: string;
  /** 当前 provider 过滤值。 */
  readonly activeProvider: string;
  /** 当前模型类型过滤值。 */
  readonly activeModelType: string;
  /** 是否显示模型类型筛选。 */
  readonly showModelTypeFilter: boolean;
  /** 多选模式。 */
  readonly multiple: boolean;
  /** 是否隐藏多选状态栏。 */
  readonly hideMultiStatusBar: boolean;
  /** 已选数量。 */
  readonly selectedSize: number;
  /** 可用 provider 列表。 */
  readonly availableProviders: ReadonlyArray<ProviderConfig>;
  /** 可用模型类型列表。 */
  readonly availableModelTypes: ReadonlyArray<string>;
  /** getProviderLogo。 */
  readonly getProviderLogo: (providerId: string) => string | undefined;
  /** 导航键处理。 */
  readonly onHandleNavigationKey: (key: string) => boolean;
  /** 更新搜索。 */
  readonly onSetSearchText: (value: string) => void;
  /** 更新 provider 过滤。 */
  readonly onSetActiveProvider: (value: string) => void;
  /** 更新模型类型过滤。 */
  readonly onSetActiveModelType: (value: string) => void;
  /** 清空多选。 */
  readonly onClearSelection: () => void;
  /** 关闭弹窗。 */
  readonly onClose: () => void;
  /** 多选 props。 */
  readonly multiProps?: ModelPickerDialogMultiProps;
}

/**
 * 模型选择器头部。
 *
 * 负责展示搜索框、Provider 筛选、模型类型筛选，以及多选模式下的状态栏。
 * 搜索输入上的方向键和回车会透传给外层控制器统一处理键盘导航。
 */
export function ModelPickerHeader({
  listboxId,
  searchText,
  focusedKey,
  activeProvider,
  activeModelType,
  showModelTypeFilter,
  multiple,
  hideMultiStatusBar,
  selectedSize,
  availableProviders,
  availableModelTypes,
  getProviderLogo,
  onHandleNavigationKey,
  onSetSearchText,
  onSetActiveProvider,
  onSetActiveModelType,
  onClearSelection,
  onClose,
}: ModelPickerHeaderProps) {
  const { t } = useTranslation();

  return (
    <>
      <div className="px-4 pb-2">
        <div
          className={cn(
            'flex items-center gap-2 rounded-2xl border border-border/60 bg-muted/10 px-3 py-2 transition-[box-shadow,border-color]',
            'focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/30 focus-within:ring-offset-2 focus-within:ring-offset-background',
          )}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
            <Search className="h-4 w-4" />
          </span>
          <Input
            value={searchText}
            onChange={(event) => onSetSearchText(event.target.value)}
            placeholder={t('modelSelect.searchPlaceholder')}
            className="h-8 border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            autoFocus
            spellCheck={false}
            aria-controls={listboxId}
            aria-activedescendant={focusedKey ? `${listboxId}-option-${focusedKey}` : undefined}
            onKeyDown={(event) => {
              // 搜索框本身仍允许输入，但方向键/回车交给列表导航逻辑处理。
              if (isComposingLikeKeyboardEvent(event)) return;
              if (onHandleNavigationKey(event.key)) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            data-testid="model-picker-search"
          />
        </div>
      </div>

      {availableProviders.length > 1 ? (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={activeProvider === 'all'}
              data-testid="model-picker-provider-filter-all"
              onClick={() => onSetActiveProvider('all')}
              className={cn(
                providerFilterButtonClassName,
                activeProvider === 'all'
                  ? providerFilterActiveClassName
                  : providerFilterInactiveClassName,
              )}
            >
              {t('modelRegistry.filters.all')}
            </button>
            {availableProviders.map((provider) => {
              const ui = pickProviderUiMeta(provider.id);
              const logo = getProviderLogo(provider.id);
              const active = activeProvider === provider.id;
              return (
                <button
                  key={provider.id}
                  type="button"
                  aria-pressed={active}
                  data-testid={`model-picker-provider-filter-${provider.id}`}
                  onClick={() => onSetActiveProvider(active ? 'all' : provider.id)}
                  className={cn(
                    providerFilterButtonClassName,
                    active
                      ? providerFilterActiveClassName
                      : providerFilterInactiveClassName,
                  )}
                >
                  {/* Provider logo 统一从用户自定义 logo 与兜底 UI 元数据中解析。 */}
                  <span
                    aria-hidden="true"
                    className={providerFilterIconTileClassName}
                    data-testid="model-picker-provider-icon-tile"
                  >
                    <ProviderIcon
                      providerId={provider.id}
                      customLogo={logo}
                      fallbackIcon={ui.icon}
                      fallbackColor={ui.color}
                      size="xs"
                      className="opacity-95 drop-shadow-[0_0_1px_rgba(15,23,42,0.45)]"
                    />
                  </span>
                  {provider.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {showModelTypeFilter && availableModelTypes.length > 0 ? (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-2">
            <CapabilityPill
              capability="all"
              label={t('modelRegistry.filters.all')}
              active={String(activeModelType || 'all').trim().toLowerCase() === 'all'}
              size="sm"
              iconOnly
              dataTestId="model-picker-type-all"
              onClick={() => onSetActiveModelType('all')}
            />
            {availableModelTypes.map((modelTypeKey) => {
              const normalizedModelTypeKey = String(modelTypeKey || '').trim().toLowerCase();
              if (!normalizedModelTypeKey) return null;
              const active = String(activeModelType || 'all').trim().toLowerCase() === normalizedModelTypeKey;
              const text = capabilityLabel(normalizedModelTypeKey, t);
              return (
                <CapabilityPill
                  key={normalizedModelTypeKey}
                  capability={normalizedModelTypeKey}
                  label={text}
                  active={active}
                  size="sm"
                  iconOnly
                  tooltip={text}
                  dataTestId={`model-picker-type-${normalizedModelTypeKey}`}
                  onClick={() => onSetActiveModelType(active ? 'all' : normalizedModelTypeKey)}
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {multiple && !hideMultiStatusBar ? (
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2">
          <div className="text-xs text-muted-foreground">
            {t('modelSelect.selectedCount', { count: selectedSize })}
          </div>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={selectedSize === 0}
            onClick={onClearSelection}
          >
            {t('modelSelect.clear')}
          </Button>
          <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={onClose}>
            {t('modelSelect.done')}
          </Button>
        </div>
      ) : null}
    </>
  );
}
