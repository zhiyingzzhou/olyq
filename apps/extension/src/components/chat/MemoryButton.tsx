/**
 * 说明：`MemoryButton` 组件模块。
 *
 * 职责：
 * - 承载 `MemoryButton` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MemoryButton` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAssistantStore } from '@/hooks/useAssistantStore';
import { getMemoryConfig, isMemoryConfigured, subscribeMemoryConfigChange, type GlobalMemoryConfig } from '@/lib/memory';
import { subscribeStoreReloadSignal } from '@/lib/storage/reload-signal';

/** 记忆按钮属性。 */
interface MemoryButtonProps {
  /** 当前绑定的助手 ID；只有助手话题才允许单独开关记忆。 */
  readonly assistantId?: string;
  /** 打开全局记忆设置面板。 */
  readonly onOpenMemorySettings?: () => void;
}

/**
 * 聊天输入区的记忆能力按钮。
 *
 * 主按钮承担“快速开关”，Popover 面板承担状态解释与设置入口。
 * 真正的记忆配置持久化和助手开关更新都委托给 store / lib 层。
 */
export function MemoryButton({
  assistantId,
  onOpenMemorySettings,
}: MemoryButtonProps) {
  const { t } = useTranslation();

  const assistant = useAssistantStore((s) => (assistantId ? s.getAssistant(assistantId) : null));
  const updateAssistantConfig = useAssistantStore((s) => s.updateAssistantConfig);

  /** Popover 是否打开。 */
  const [open, setOpen] = useState(false);
  /** 当前全局记忆配置快照，用于决定按钮是否可用。 */
  const [memoryCfg, setMemoryCfg] = useState<GlobalMemoryConfig>(() => getMemoryConfig());

  useEffect(() => {
    /**
     * 从当前全局配置源重新读取记忆配置快照。
     *
     * 说明：
     * - 记忆设置可能在其它面板、其它标签页或导入备份后被改写；
     * - 这里通过事件触发重新读取，保证按钮启用态和提示文案与真实配置一致。
     */
    const reload = () => setMemoryCfg(getMemoryConfig());
    const unsubscribe = subscribeMemoryConfigChange(reload);
    const unsubscribeReload = subscribeStoreReloadSignal(reload);
    return () => {
      unsubscribe();
      unsubscribeReload();
    };
  }, []);

  /** 全局记忆开关和必要模型配置都满足时，助手级开关才真正可用。 */
  const memoryAvailable = useMemo(() => memoryCfg.enabled && isMemoryConfigured(memoryCfg), [memoryCfg]);
  /** 只有绑定了真实助手时，当前话题才允许单独控制记忆。 */
  const canBindAssistant = Boolean(assistantId && assistant);
  /** 当前助手是否已开启记忆。 */
  const enabled = Boolean(assistant?.enableMemory);
  /** 当前记忆能力不可用时，面板内展示的说明文案。 */
  const unavailableMessage = useMemo(() => {
    if (!canBindAssistant) return t('chat.memoryNeedAssistant');
    if (!memoryAvailable) return t('assistant.enableMemoryUnavailable');
    return null;
  }, [canBindAssistant, memoryAvailable, t]);

  const tooltip = useMemo(() => {
    if (!canBindAssistant) return t('chat.memoryNeedAssistant');
    return enabled ? t('common.close') : t('chat.memory');
  }, [canBindAssistant, enabled, t]);

  const setEnabled = useCallback((next: boolean) => {
    if (!assistantId || !assistant) return;
    updateAssistantConfig(assistantId, { enableMemory: next });
  }, [assistant, assistantId, updateAssistantConfig]);

  const disable = useCallback(() => setEnabled(false), [setEnabled]);
  const popoverTrigger = (
    <Tooltip>
      <TooltipTrigger asChild>
        <PopoverTrigger asChild>
          <button
            type="button"
            onPointerDown={(e) => {
              // 已开启时再次点击主按钮 = 直接关闭，不再额外弹出说明面板。
              if (enabled) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            onClick={(e) => {
              if (!enabled) return;
              e.preventDefault();
              disable();
              setOpen(false);
            }}
            className={cn(
              'chat-input-tool-button rounded p-1.5 transition-colors flex-shrink-0',
              enabled
                ? 'bg-primary/15 text-primary hover:bg-primary/25'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            aria-label={tooltip}
            aria-pressed={enabled}
          >
            <Database className="h-4 w-4" />
          </button>
        </PopoverTrigger>
      </TooltipTrigger>
      {!open ? (
        <TooltipContent side="top">
          <p className="text-xs">{tooltip}</p>
        </TooltipContent>
      ) : null}
    </Tooltip>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {popoverTrigger}

      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-80 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-border bg-background p-0 text-popover-foreground shadow-sm"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        data-testid="memory-popover"
      >
        <div className="px-4 pt-3 pb-2">
          <div className="mb-0.5 flex items-center gap-2">
            <Database className={cn('h-4 w-4', enabled ? 'text-primary' : 'text-muted-foreground')} />
            <span className="text-sm font-medium text-foreground">{t('chat.memory')}</span>
          </div>
          <div className="text-xs text-muted-foreground">{t('chat.memoryAutoHint')}</div>
        </div>

        <div className="border-t border-border" />

        <div className="py-1">
          {unavailableMessage ? (
            <div className="px-4 py-2.5 text-xs text-muted-foreground">
              {unavailableMessage}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-muted/30 text-muted-foreground">
                <Database className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm text-foreground">{t('assistant.enableMemory')}</div>
                <div className="text-xs text-muted-foreground">{t('assistant.enableMemoryDesc')}</div>
              </div>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={!canBindAssistant || !memoryAvailable}
              className="h-6 w-11"
            />
          </div>

          {onOpenMemorySettings ? (
            <>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                onClick={() => { onOpenMemorySettings(); setOpen(false); }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
                data-testid="memory-open-settings"
              >
                {/* 设置入口始终走父层统一面板，组件内部不自行管理更多记忆配置。 */}
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-muted/30 text-muted-foreground">
                  <Settings2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm text-foreground">{t('chat.openMemorySettings')}</div>
                  <div className="text-xs text-muted-foreground">{t('settings.title')}</div>
                </div>
              </button>
            </>
          ) : null}
        </div>

        <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate">{t('chat.memory')}</span>
            <span className="truncate text-right">
              {unavailableMessage ?? (onOpenMemorySettings ? t('settings.title') : t('assistant.enableMemory'))}
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
