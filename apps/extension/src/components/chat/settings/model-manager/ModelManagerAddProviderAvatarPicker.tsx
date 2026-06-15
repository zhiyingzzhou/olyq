/**
 * 说明：`ModelManagerAddProviderAvatarPicker` 组件模块。
 *
 * 职责：
 * - 承载 `ModelManagerAddProviderAvatarPicker` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelManagerAddProviderAvatarPickerProps`、`ModelManagerAddProviderAvatarPicker` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ProviderIcon } from '@/components/ui/ProviderIcon';
import { Input } from '@/components/ui/input';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { ImageIcon, Loader2, RotateCcw, Search, Upload } from 'lucide-react';
import { encodeLobeIconRef } from '@/lib/ai/provider-icons';
import { pickProviderUiMeta } from '@/lib/ai/provider-ui-meta';
import type { LobeIconEntry } from '@/lib/ai/lobe-icon-list';
import { formatIconName } from './icon-name';

const BUILTIN_ICON_COLUMN_COUNT = 8;
const BUILTIN_ICON_ROW_HEIGHT_PX = 48;

/**
 * 把线性图标数组按固定列数压成虚拟滚动所需的行结构。
 *
 * 说明：
 * - 这个 picker 的视觉布局固定 8 列，不需要再根据宽度动态折列；
 * - 只把当前行窗口内的按钮挂进 DOM，避免大图标库把 dialog 内层 overlay 一次性撑满。
 */
function packBuiltinIconRows<T>(items: ReadonlyArray<T>, columnCount: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += columnCount) {
    rows.push(items.slice(index, index + columnCount));
  }
  return rows;
}

/** Add Provider 头像选择器属性。 */
export interface ModelManagerAddProviderAvatarPickerProps {
  /** 当前 provider 名称。 */
  readonly providerName: string;
  /** 可选：当前预览所对应的已存在 provider ID。 */
  readonly previewProviderId?: string;
  /** 当前 logo。 */
  readonly logo: string;
  /** 内置图标弹层状态。 */
  readonly builtinPicker: {
    /** 是否打开。 */
    readonly open: boolean;
    /** 是否正在加载。 */
    readonly loading: boolean;
    /** 当前搜索词。 */
    readonly search: string;
  };
  /** 当前内置图标列表。 */
  readonly builtinIcons: ReadonlyArray<LobeIconEntry>;
  /** 头像文件 input ref。 */
  readonly avatarInputRef: React.RefObject<HTMLInputElement | null>;
  /** 打开/关闭内置图标弹层。 */
  readonly onToggleBuiltinPicker: (open: boolean) => void;
  /** 请求加载内置图标。 */
  readonly onRequestBuiltinIcons: () => void;
  /** 搜索内置图标。 */
  readonly onBuiltinSearch: (text: string) => void;
  /** 选择内置图标。 */
  readonly onSelectBuiltinIcon: (icon: LobeIconEntry) => void;
  /** 上传头像。 */
  readonly onAvatarUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** 重置 logo。 */
  readonly onResetLogo: () => void;
}

/** Add Provider 头像选择器。 */
export function ModelManagerAddProviderAvatarPicker(props: ModelManagerAddProviderAvatarPickerProps) {
  const {
    providerName,
    previewProviderId,
    logo,
    builtinPicker,
    builtinIcons,
    avatarInputRef,
    onToggleBuiltinPicker,
    onRequestBuiltinIcons,
    onBuiltinSearch,
    onSelectBuiltinIcon,
    onAvatarUpload,
    onResetLogo,
  } = props;
  const { t } = useTranslation();
  const providerUi = pickProviderUiMeta(previewProviderId || providerName || '');
  const fallbackIcon = providerName ? providerName.slice(0, 1).toUpperCase() : undefined;
  const hasPreviewIdentity = Boolean(logo || previewProviderId || providerName);
  const builtinIconViewportRef = useRef<HTMLDivElement | null>(null);
  const builtinIconRows = packBuiltinIconRows(builtinIcons, BUILTIN_ICON_COLUMN_COUNT);
  const builtinIconRowVirtualizer = useVirtualizer({
    count: builtinIconRows.length,
    getScrollElement: () => builtinIconViewportRef.current,
    estimateSize: () => BUILTIN_ICON_ROW_HEIGHT_PX,
    overscan: 6,
    getItemKey: (index) => builtinIconRows[index]?.map((icon) => icon.id).join('|') ?? index,
    initialRect: {
      width: 0,
      height: 240,
    },
  });

  useEffect(() => {
    if (!builtinPicker.open || builtinPicker.loading) return;
    builtinIconRowVirtualizer.measure();
  }, [builtinPicker.loading, builtinPicker.open, builtinIconRowVirtualizer, builtinIconRows.length]);

  useEffect(() => {
    if (!builtinPicker.open || builtinPicker.loading) return;

    // 弹层从关闭态切到可见时，虚拟窗口还没拿到真实 viewport；
    // 下一帧补一次 measure，避免首次展开时出现空白。
    const frameId = window.requestAnimationFrame(() => {
      builtinIconRowVirtualizer.measure();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [builtinPicker.loading, builtinPicker.open, builtinIconRowVirtualizer, builtinIconRows.length]);

  return (
    <>
      <div className="flex justify-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="relative group h-16 w-16 overflow-hidden rounded-full border-2 border-dashed border-border transition-colors hover:border-foreground/40 flex items-center justify-center"
            >
              {hasPreviewIdentity ? (
                <ProviderIcon
                  providerId={previewProviderId || ''}
                  customLogo={logo || undefined}
                  fallbackIcon={fallbackIcon}
                  fallbackColor={providerUi.color}
                  size="xl"
                  className="rounded-full"
                />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              )}
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Upload className="h-4 w-4 text-white" />
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem onClick={() => avatarInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> {t('modelManagerPanel.addProviderDialog.avatar.upload')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                onToggleBuiltinPicker(true);
                onRequestBuiltinIcons();
              }}
            >
              <ImageIcon className="h-4 w-4 mr-2" /> {t('modelManagerPanel.addProviderDialog.avatar.builtin')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onResetLogo} disabled={!logo}>
              <RotateCcw className="h-4 w-4 mr-2" /> {t('modelManagerPanel.addProviderDialog.avatar.reset')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif"
          className="hidden"
          onChange={onAvatarUpload}
        />
      </div>

      {builtinPicker.open ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{t('modelManagerPanel.addProviderDialog.avatar.builtinTitle')}</span>
            <button
              type="button"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => onToggleBuiltinPicker(false)}
            >
              &times;
            </button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={builtinPicker.search}
              onChange={(event) => onBuiltinSearch(event.target.value)}
              placeholder={t('modelManagerPanel.addProviderDialog.avatar.searchPlaceholder')}
              className="h-8 text-xs pl-7"
            />
          </div>
          {builtinPicker.loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">{t('modelManagerPanel.addProviderDialog.avatar.loading')}</span>
            </div>
          ) : (
            <div ref={builtinIconViewportRef} className="max-h-[240px] overflow-y-auto">
              {builtinIcons.length > 0 ? (
                <div className="relative" style={{ height: builtinIconRowVirtualizer.getTotalSize() }}>
                  {builtinIconRowVirtualizer.getVirtualItems().map((virtualItem) => {
                    const rowIcons = builtinIconRows[virtualItem.index] ?? [];
                    return (
                      <div
                        key={virtualItem.key}
                        data-index={virtualItem.index}
                        className="box-border pb-2"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${BUILTIN_ICON_ROW_HEIGHT_PX}px`,
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                      >
                        <div
                          className="grid h-full gap-2"
                          style={{ gridTemplateColumns: `repeat(${BUILTIN_ICON_COLUMN_COUNT}, minmax(0, 1fr))` }}
                        >
                          {rowIcons.map((icon) => (
                            <TooltipAction key={icon.id} tooltip={formatIconName(icon.id)}>
                              <button
                                type="button"
                                className="flex h-10 w-10 items-center justify-center rounded-lg border border-border transition-colors hover:border-foreground"
                                onClick={() => onSelectBuiltinIcon(icon)}
                              >
                                <ProviderIcon
                                  providerId=""
                                  customLogo={encodeLobeIconRef(icon.id, icon.c)}
                                  fallbackIcon={icon.id.slice(0, 1).toUpperCase()}
                                  size="lg"
                                  className="rounded"
                                />
                              </button>
                            </TooltipAction>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  {t('modelManagerPanel.addProviderDialog.avatar.noResults')}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
