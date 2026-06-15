/**
 * 说明：`ModelManagerProviderSidebar` 组件模块。
 *
 * 职责：
 * - 承载 `ModelManagerProviderSidebar` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelManagerProviderSidebar` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useMemo, useState } from "react";
import { pointerIntersection } from "@dnd-kit/collision";
import {
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { GripVertical, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProviderIcon } from "@/components/ui/ProviderIcon";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { TooltipAction } from "@/components/ui/tooltip-action";
import { ASSISTANT_BROWSER_SORTABLE_SENSORS } from "@/components/chat/AssistantBrowserContent.sortable-plugin";
import { DndKitDragDropProvider, type DndKitDragOverlaySource } from "@/components/chat/dnd-kit-react";
import { pickProviderUiMeta } from "@/lib/ai/provider-ui-meta";
import type { ModelManagerPanelController } from "./useModelManagerPanelController";
import type { Provider } from "../shared";

type Props = {
  controller: ModelManagerPanelController;
};

const PROVIDER_SORTABLE_GROUP_ID = "model-manager-provider-list";
const PROVIDER_SORTABLE_TYPE = "model-manager-provider-sortable";
const PROVIDER_SORTABLE_MOVE_TRANSITION = {
  duration: 0,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};

/**
 * 为模型平台行生成 dnd-kit 内部 sortable id。
 *
 * @param providerId - provider 配置 ID。
 * @returns 当前侧栏内稳定的 sortable id。
 */
function createProviderSortableId(providerId: string) {
  return `${PROVIDER_SORTABLE_GROUP_ID}::${encodeURIComponent(String(providerId || ""))}`;
}

/**
 * 从 provider sortable id 还原 provider 配置 ID。
 *
 * @param sortableId - dnd-kit source/target id。
 * @returns provider id；解析失败时返回空串。
 */
function parseProviderSortableId(sortableId: string) {
  const raw = String(sortableId || "");
  const prefix = `${PROVIDER_SORTABLE_GROUP_ID}::`;
  if (!raw.startsWith(prefix)) return "";
  try {
    return decodeURIComponent(raw.slice(prefix.length));
  } catch {
    return "";
  }
}

type ProviderRowCardProps = {
  readonly provider: Provider;
  readonly selected: boolean;
  readonly canDrag: boolean;
  readonly displayName: string;
  readonly onSelect?: (id: string) => void;
  readonly handleRef?: (element: HTMLElement | null) => void;
  readonly dragVisualState?: "idle" | "dragSource" | "overlay";
  readonly dragTooltip: string;
  readonly onLabel: string;
  readonly offLabel: string;
};

type ProviderStatusBadgeProps = {
  readonly enabled: boolean;
  readonly onLabel: string;
  readonly offLabel: string;
};

/** 模型平台启用状态徽标。 */
function ProviderStatusBadge({ enabled, onLabel, offLabel }: ProviderStatusBadgeProps) {
  return (
    <span
      className={`inline-flex h-5 max-w-full min-w-0 shrink-0 items-center rounded-full border border-transparent px-1.5 py-0 text-[10px] font-semibold transition-colors ${
        enabled
          ? "bg-emerald-500/90 text-white"
          : "bg-secondary text-secondary-foreground"
      }`}
    >
      {enabled ? onLabel : offLabel}
    </span>
  );
}

/** 模型平台侧栏单行视图。 */
function ProviderRowCard({
  provider,
  selected,
  canDrag,
  displayName,
  onSelect,
  handleRef,
  dragVisualState = "idle",
  dragTooltip,
  onLabel,
  offLabel,
}: ProviderRowCardProps) {
  const overlay = dragVisualState === "overlay";
  const dragSource = dragVisualState === "dragSource";
  const ui = pickProviderUiMeta(provider.id);
  const rowClassName = selected
    ? "bg-accent text-accent-foreground font-medium"
    : "text-foreground hover:bg-accent/50";
  const handleBaseClassName = "flex h-7 w-2 -ml-0.5 mr-0 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-muted-foreground/60 transition-[opacity,color,background-color] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
  const handleClassName = overlay
    ? `${handleBaseClassName} opacity-100`
    : `${handleBaseClassName} opacity-0 hover:bg-accent hover:text-foreground hover:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100`;

  return (
    <div
      data-testid={`model-manager-provider-card-${provider.id}`}
      data-drag-visual-state={dragVisualState}
      className={dragSource ? "opacity-0" : ""}
    >
      <button
        type="button"
        data-testid={`model-manager-provider-${provider.id}`}
        onClick={overlay ? undefined : () => onSelect?.(provider.id)}
        className={`group relative flex w-full items-center gap-1.5 rounded-lg pl-1 pr-1 py-2 text-left text-sm transition-colors ${rowClassName}`}
      >
        {overlay ? (
          <span aria-hidden="true" data-testid={`model-manager-provider-overlay-handle-${provider.id}`} className={`pointer-events-none ${handleClassName}`}>
            <GripVertical className="h-3.5 w-3.5 flex-shrink-0" />
          </span>
        ) : canDrag ? (
          <TooltipAction tooltip={dragTooltip}>
            <span
              ref={handleRef}
              role="button"
              tabIndex={0}
              aria-label={dragTooltip}
              data-testid={`model-manager-provider-drag-handle-${provider.id}`}
              className={handleClassName}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              <GripVertical className="h-3.5 w-3.5 flex-shrink-0" />
            </span>
          </TooltipAction>
        ) : null}
        <span className="flex h-8 w-6 shrink-0 items-center justify-center">
          <ProviderIcon providerId={provider.id} customLogo={provider.logo} fallbackIcon={ui.icon} fallbackColor={ui.color} size="sm" />
        </span>
        <span className="min-w-0 flex-1 truncate">{displayName}</span>
        <ProviderStatusBadge enabled={provider.enabled} onLabel={onLabel} offLabel={offLabel} />
      </button>
    </div>
  );
}

type SortableProviderRowProps = Omit<ProviderRowCardProps, "handleRef" | "dragVisualState"> & {
  readonly dragActive: boolean;
  readonly index: number;
};

/** 绑定 `useSortable` 的模型平台行。 */
function SortableProviderRow(props: SortableProviderRowProps) {
  const { provider, index, canDrag, dragActive } = props;
  const {
    handleRef,
    ref,
    sourceRef,
    isDragging,
    isDragSource,
  } = useSortable({
    id: createProviderSortableId(provider.id),
    index,
    group: PROVIDER_SORTABLE_GROUP_ID,
    type: PROVIDER_SORTABLE_TYPE,
    accept: PROVIDER_SORTABLE_TYPE,
    disabled: !canDrag,
    sensors: ASSISTANT_BROWSER_SORTABLE_SENSORS,
    collisionDetector: pointerIntersection,
    transition: PROVIDER_SORTABLE_MOVE_TRANSITION,
  });
  const setRowRef = useCallback((element: HTMLDivElement | null) => {
    ref(element);
    sourceRef(element);
  }, [ref, sourceRef]);

  const isActiveDragSource = dragActive && (isDragSource || isDragging);

  return (
    <div ref={setRowRef} data-index={index} data-provider-id={provider.id}>
      <ProviderRowCard
        {...props}
        handleRef={handleRef as (element: HTMLElement | null) => void}
        dragVisualState={isActiveDragSource ? "dragSource" : "idle"}
      />
    </div>
  );
}

/**
 * 导出组件：`ModelManagerProviderSidebar`。
 *
 * @remarks
 * 负责承载当前文件对应的界面渲染、交互编排和视图层边界。
 */
export function ModelManagerProviderSidebar({ controller }: Props) {
  const { providerDialog, providersState, t } = controller;
  const { filteredProviders, getProviderDisplayName, providerSearch, providers, reorderProviders, selectedId, setProviderSearch, setSelectedId } = providersState;
  const [dragActive, setDragActive] = useState(false);
  const canDrag = providerSearch.trim().length === 0 && filteredProviders.length > 1;
  const selectedProvider = providers.find((provider) => provider.id === selectedId) ?? providers[0];
  const onLabel = t("modelManagerPanel.provider.on");
  const offLabel = t("modelManagerPanel.provider.off");
  const providerBySortableId = useMemo(() => {
    const map = new Map<string, Provider>();
    for (const provider of filteredProviders) map.set(createProviderSortableId(provider.id), provider);
    return map;
  }, [filteredProviders]);

  const handleDragStart = useCallback(({ operation }: DragStartEvent) => {
    if (!operation.source || !isSortable(operation.source)) return;
    setDragActive(true);
  }, []);

  const handleDragEnd = useCallback(({ canceled, operation }: DragEndEvent) => {
    setDragActive(false);
    if (canceled || providerSearch.trim().length > 0 || !operation.source || !isSortable(operation.source)) return;
    const target = operation.target && isSortable(operation.target) ? operation.target : null;
    if (!target) return;
    const sourceSortable = operation.source.sortable;
    const targetSortable = target.sortable;
    const currentGroupId = String(sourceSortable.group ?? "");
    const initialGroupId = String(sourceSortable.initialGroup ?? currentGroupId);
    const targetGroupId = String(targetSortable.group ?? currentGroupId);
    if (
      currentGroupId !== PROVIDER_SORTABLE_GROUP_ID
      || currentGroupId !== initialGroupId
      || currentGroupId !== targetGroupId
    ) {
      return;
    }
    const sourceId = parseProviderSortableId(String(operation.source.id || ""));
    const targetId = parseProviderSortableId(String(target.id || ""));
    if (!sourceId || !targetId) return;
    reorderProviders(sourceId, targetId);
  }, [providerSearch, reorderProviders]);

  const dragTooltip = providerSearch.trim().length > 0
    ? t("modelManagerPanel.provider.dragDisabledInSearch")
    : t("modelManagerPanel.provider.dragHandle");
  const providerRows = (
    <div className="model-manager-provider-rows min-h-full min-w-0 space-y-0.5 px-1.5 py-2">
      {filteredProviders.map((provider, index) => (
        <SortableProviderRow
          key={provider.id}
          provider={provider}
          index={index}
          dragActive={dragActive}
          selected={selectedId === provider.id}
          canDrag={canDrag}
          displayName={getProviderDisplayName(provider)}
          onSelect={setSelectedId}
          dragTooltip={dragTooltip}
          onLabel={onLabel}
          offLabel={offLabel}
        />
      ))}
    </div>
  );

  return (
    <div
      data-testid="model-manager-provider-nav"
      className="model-manager-provider-nav flex min-h-0 min-w-0 shrink-0 flex-col border-r border-border bg-muted/20 w-48 min-[960px]:w-56"
    >
      <div className="model-manager-provider-toolbar border-b border-border px-3 py-3">
        <div className="model-manager-provider-toolbar-inner flex flex-col gap-2">
          <div className="model-manager-provider-search relative min-w-0 flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={t("modelManagerPanel.providerSearchPlaceholder")}
              value={providerSearch}
              onChange={(event) => setProviderSearch(event.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="model-manager-provider-compact-select min-w-0 flex-1">
            <Select value={selectedProvider?.id ?? selectedId} onValueChange={setSelectedId}>
              <SelectTrigger
                aria-label={t("settings.modelManager")}
                data-testid="model-manager-provider-compact-select"
                className="h-9 w-full bg-background text-sm"
              >
                <div
                  data-testid="model-manager-provider-compact-select-value"
                  className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden"
                >
                  {selectedProvider ? (
                    <>
                      {(() => {
                        const ui = pickProviderUiMeta(selectedProvider.id);
                        return (
                          <ProviderIcon
                            providerId={selectedProvider.id}
                            customLogo={selectedProvider.logo}
                            fallbackIcon={ui.icon}
                            fallbackColor={ui.color}
                            size="sm"
                          />
                        );
                      })()}
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {getProviderDisplayName(selectedProvider)}
                      </span>
                      <ProviderStatusBadge enabled={selectedProvider.enabled} onLabel={onLabel} offLabel={offLabel} />
                    </>
                  ) : null}
                </div>
              </SelectTrigger>
              <SelectContent align="start" className="max-h-[min(24rem,calc(100dvh-8rem))]">
                {providers.map((provider) => {
                  const displayName = getProviderDisplayName(provider);
                  const ui = pickProviderUiMeta(provider.id);
                  return (
                    <SelectItem
                      key={provider.id}
                      value={provider.id}
                      textValue={displayName}
                      data-testid={`model-manager-provider-compact-option-${provider.id}`}
                      className="text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <ProviderIcon providerId={provider.id} customLogo={provider.logo} fallbackIcon={ui.icon} fallbackColor={ui.color} size="sm" />
                        <span className="min-w-0 flex-1 truncate">{displayName}</span>
                        <ProviderStatusBadge enabled={provider.enabled} onLabel={onLabel} offLabel={offLabel} />
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="model-manager-provider-add-compact h-8 w-full justify-center text-xs min-[960px]:hidden"
            onClick={providerDialog.openAddProvider}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> {t("modelManagerPanel.actions.add")}
          </Button>
        </div>
      </div>
      <div className="model-manager-provider-scroll-shell min-h-0 min-w-0 flex-1 overflow-hidden">
        <ScrollArea
          data-testid="model-manager-provider-scroll"
          scrollbars="vertical"
          scrollbarVisibility="hover"
          className="h-full"
          viewportClassName="h-full"
        >
          <DndKitDragDropProvider onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {providerRows}
            {dragActive ? (
              <DragOverlay className="pointer-events-none z-50" dropAnimation={null} tag="div">
                {(source: DndKitDragOverlaySource) => {
                  if (!source || !isSortable(source)) return null;
                  const provider = providerBySortableId.get(String(source.id));
                  if (!provider) return null;
                  return (
                    <ProviderRowCard
                      provider={provider}
                      selected={selectedId === provider.id}
                      canDrag={false}
                      displayName={getProviderDisplayName(provider)}
                      dragVisualState="overlay"
                      dragTooltip={dragTooltip}
                      onLabel={onLabel}
                      offLabel={offLabel}
                    />
                  );
                }}
              </DragOverlay>
            ) : null}
          </DndKitDragDropProvider>
        </ScrollArea>
      </div>
      <div className="model-manager-provider-add-footer hidden border-t border-border p-2 min-[960px]:block">
        <Button variant="outline" size="sm" className="h-8 w-full text-xs" onClick={providerDialog.openAddProvider}>
          <Plus className="mr-1 h-3.5 w-3.5" /> {t("modelManagerPanel.actions.add")}
        </Button>
      </div>
    </div>
  );
}
