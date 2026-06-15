/**
 * 说明：`AssistantStoreDialog.parts` 组件模块。
 *
 * 职责：
 * - 承载助手商店卡片、空态和预览元信息等局部视图；
 * - 收口商店虚拟网格使用的轻量工具函数；
 * - 避免主对话框文件继续膨胀成超长运行时热点。
 *
 * 边界：
 * - 这里只处理局部渲染和轻量纯函数；
 * - 不拥有搜索、CRUD、导入导出或对话框开关真源。
 */
import { Download, Eye, Pencil, Trash2 } from 'lucide-react';

import { AssistantIcon } from '@/components/chat/AssistantIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { AssistantPreset, StoredAssistantPreset } from '@/types/assistant';

type AssistantStoreSectionKeyLike = 'mine' | 'browser' | 'general';

type StoreCatalogItemLike = {
  id: string;
  kind: 'builtin' | 'user';
  sectionKey: AssistantStoreSectionKeyLike;
  preset: AssistantPreset | StoredAssistantPreset;
};

interface StoreCatalogCardProps {
  item: StoreCatalogItemLike;
  isSelected: boolean;
  isManageSelectable: boolean;
  sectionLabel: string;
  noDescriptionLabel: string;
  enableWebSearchLabel: string;
  enableGenerateImageLabel: string;
  enableMemoryLabel: string;
  selectPresetLabel: string;
  previewPresetLabel: string;
  editPresetLabel: string;
  exportPresetLabel: string;
  deletePresetLabel: string;
  onCardClick: (item: StoreCatalogItemLike) => void;
  onToggleManagedPreset: (presetId: string) => void;
  onEditUserPreset: (preset: StoredAssistantPreset) => void;
  onExportUserPreset: (presetId: string) => void;
  onDeleteUserPreset: (preset: StoredAssistantPreset) => void;
}

/**
 * 商店网格里的单张预设卡片。
 *
 * 说明：
 * - 用户预设卡片采用“主体预览按钮 + 独立动作按钮”的非嵌套结构；
 * - 管理态只暴露勾选语义，避免单条动作与批量动作互相竞争。
 */
export function StoreCatalogCard({
  item,
  isSelected,
  isManageSelectable,
  sectionLabel,
  noDescriptionLabel,
  enableWebSearchLabel,
  enableGenerateImageLabel,
  enableMemoryLabel,
  selectPresetLabel,
  previewPresetLabel,
  editPresetLabel,
  exportPresetLabel,
  deletePresetLabel,
  onCardClick,
  onToggleManagedPreset,
  onEditUserPreset,
  onExportUserPreset,
  onDeleteUserPreset,
}: StoreCatalogCardProps) {
  const isUserPreset = item.kind === 'user';
  const userPreset = isUserPreset ? item.preset as StoredAssistantPreset : null;

  return (
    <div
      data-testid={isUserPreset ? `assistant-store-user-preset-${item.id}` : undefined}
      className={cn(
        'flex min-h-[168px] flex-col rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-border/80',
        isSelected ? 'border-primary bg-primary/5' : '',
      )}
    >
      <div className="flex items-start gap-3">
        {isManageSelectable ? (
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleManagedPreset(item.id)}
            aria-label={selectPresetLabel}
            onClick={(event) => event.stopPropagation()}
          />
        ) : null}
        <button
          type="button"
          aria-label={previewPresetLabel}
          aria-pressed={isManageSelectable ? isSelected : undefined}
          onClick={() => {
            if (isManageSelectable) {
              onToggleManagedPreset(item.id);
              return;
            }
            onCardClick(item);
          }}
          className="group min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <div className="flex items-start gap-3">
            <AssistantIcon
              iconId={item.preset.iconId}
              size={22}
              className="h-10 w-10 flex-shrink-0 rounded-lg border border-border/60 bg-muted/20"
              iconClassName="h-5 w-5"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{item.preset.name}</div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {item.preset.description || noDescriptionLabel}
                  </div>
                </div>
                {!isManageSelectable ? (
                  <Eye className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                ) : null}
              </div>
            </div>
          </div>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant={item.kind === 'user' ? 'default' : 'secondary'} className="rounded-full px-2 text-[10px]">
          {sectionLabel}
        </Badge>
        {(item.preset.tags ?? []).slice(0, 3).map((tag) => (
          <Badge key={`${item.id}-${tag}`} variant="secondary" className="rounded-full px-2 text-[10px]">
            {tag}
          </Badge>
        ))}
      </div>

      <div className="mt-auto flex flex-wrap gap-1.5 pt-3 text-[11px] text-muted-foreground">
        {item.preset.enableWebSearch ? <span>{enableWebSearchLabel}</span> : null}
        {item.preset.enableGenerateImage ? <span>{enableGenerateImageLabel}</span> : null}
        {item.preset.enableMemory ? <span>{enableMemoryLabel}</span> : null}
        {item.preset.mcpSelection && item.preset.mcpSelection.mode !== 'disabled' ? <span>MCP</span> : null}
      </div>

      {userPreset && !isManageSelectable ? (
        <div className="mt-3 flex flex-wrap justify-end gap-1.5 border-t border-border/60 pt-3">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={() => onEditUserPreset(userPreset)}>
            <Pencil className="h-3.5 w-3.5" />
            {editPresetLabel}
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={() => onExportUserPreset(userPreset.id)}>
            <Download className="h-3.5 w-3.5" />
            {exportPresetLabel}
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs text-destructive hover:text-destructive" onClick={() => onDeleteUserPreset(userPreset)}>
            <Trash2 className="h-3.5 w-3.5" />
            {deletePresetLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 左侧分组按钮。
 *
 * @remarks
 * 统一保持“标题 + 数量”结构，避免主组件散落重复样式。
 */
export function StoreSectionButton({
  active,
  title,
  count,
  onClick,
}: {
  active: boolean;
  title: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors',
        active ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <span>{title}</span>
      <Badge variant={active ? 'default' : 'secondary'} className="rounded-full px-2 text-[10px]">
        {count}
      </Badge>
    </button>
  );
}

/**
 * 商店空态卡片。
 *
 * @remarks
 * 同时承载搜索空态和普通空态，避免主组件出现重复模板。
 */
export function StoreEmptyState({
  title,
  description,
  primaryLabel,
  onPrimaryAction,
  secondaryLabel,
  onSecondaryAction,
}: {
  title: string;
  description: string;
  primaryLabel: string;
  onPrimaryAction: () => void;
  secondaryLabel: string;
  onSecondaryAction: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
      <div className="text-base font-semibold">{title}</div>
      <div className="mt-2 max-w-md text-sm text-muted-foreground">{description}</div>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={onPrimaryAction}>{primaryLabel}</Button>
        <Button variant="outline" onClick={onSecondaryAction}>{secondaryLabel}</Button>
      </div>
    </div>
  );
}

/**
 * 预设预览里的基础信息块。
 *
 * @remarks
 * 用固定壳体展示简短元信息，减少重复样式拼接。
 */
export function PresetMetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

/**
 * 预设能力状态徽章。
 *
 * @remarks
 * 统一把启用/关闭状态读成清晰的视觉反馈。
 */
export function CapabilityBadge({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 text-sm',
        enabled ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border/60 bg-muted/10 text-muted-foreground',
      )}
    >
      {label}
    </div>
  );
}
