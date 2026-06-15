/**
 * 说明：`ModelManagerProviderDetail` 组件模块。
 *
 * 职责：
 * - 承载 `ModelManagerProviderDetail` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelManagerProviderDetail`、`ModelManagerLoadOverlay` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { AlertTriangle, ChevronDown, ChevronRight, Layers, Loader2, Plus, RotateCw, Search, Settings, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TooltipAction } from "@/components/ui/tooltip-action";
import { ProviderIcon } from "@/components/ui/ProviderIcon";
import { pickProviderUiMeta } from "@/lib/ai/provider-ui-meta";
import { NO_API_KEY_PROVIDERS } from "@/lib/ai/config/provider-defaults";
import type { TransportProtocol } from "@/lib/ai/types";
import { resolveProviderApiEndpoints } from "@/lib/ai/api-host";
import { sortModelsByVersionSemantics } from "@/lib/ai/model-version-sort";
import { HelpTip, RowBadgeKeysBadges, SYSTEM_PROVIDER_IDS, isImeComposingLikeEvent } from "@/components/chat/settings/model-manager/shared";
import type { ModelManagerPanelController } from "./useModelManagerPanelController";
import {
  ModelManagerProviderCloudDetailSection,
} from "./ModelManagerProviderCloudDetailSection";
import {
  ModelManagerProviderConnectionDetailSection,
} from "./ModelManagerProviderConnectionDetailSection";
import { isProviderConnectionDetailProvider } from "./model-manager-provider-connection-detail-utils";
import {
  isDedicatedCloudAuthProvider,
  resolveCloudApiHostInputValue,
  resolveCloudApiHostPreviewBase,
} from "./model-manager-cloud-detail-utils";

type Props = {
  controller: ModelManagerPanelController;
};

/**
 * 导出组件：`ModelManagerProviderDetail`。
 *
 * @remarks
 * 负责承载当前文件对应的界面渲染、交互编排和视图层边界。
 */
export function ModelManagerProviderDetail({ controller }: Props) {
  const { apiKeys, collapsedGroups, health, modelDialog, providerDialog, providersState, t, toggleGroup } = controller;
  const { hasDirtyChange, retrySaveProviders, saveError, selected, selectedModelViews, updateProvider } = providersState;
  const { apiKeyDraft, commitInlineApiKeyDraft, openApiKeyListDialog, setApiKeyDraft } = apiKeys;
  const hasDedicatedCloudAuth = isDedicatedCloudAuthProvider(selected);
  const hasProviderConnectionDetail = isProviderConnectionDetailProvider(selected);
  const apiHostInputValue = hasDedicatedCloudAuth ? resolveCloudApiHostInputValue(selected) : selected.apiHost;
  const apiHostPreviewBase = hasDedicatedCloudAuth ? resolveCloudApiHostPreviewBase(selected) : selected.apiHost;
  const previewTransportProtocol = (() => {
    const candidates = Array.from(new Set(
      selected.models
        .map((model) => model.transportProtocol)
        .filter((value): value is TransportProtocol => Boolean(value) && value !== 'unknown'),
    ));
    return candidates.length === 1 ? candidates[0] : undefined;
  })();
  const apiEndpoints = resolveProviderApiEndpoints({
    providerId: selected.id,
    providerType: selected.type,
    apiBase: apiHostPreviewBase,
    apiVersion: selected.apiVersion,
    skipApiVersion: selected.apiOptions?.isNotSupportAPIVersion,
    transportProtocol: previewTransportProtocol,
    anthropicApiHost: selected.anthropicApiHost,
  });
  const {
    clearHealthResults,
    canRunHealthCheck,
    setHealthOpen,
  } = health;
  const apiPreviewText = apiHostPreviewBase
    ? apiEndpoints.previewMode === 'transport-dependent'
      ? t("modelManagerPanel.apiBase.previewTransportDependent", { url: apiEndpoints.previewUrl })
      : apiEndpoints.previewMode === 'base'
        ? t("modelManagerPanel.apiBase.previewBase", { url: apiEndpoints.previewUrl })
        : t("modelManagerPanel.apiBase.preview", { url: apiEndpoints.previewUrl })
    : t("modelManagerPanel.apiBase.emptyHint");

  return (
    <div data-testid="model-manager-provider-detail" className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="model-manager-provider-summary shrink-0 px-4 pt-4 min-[960px]:px-6 min-[960px]:pt-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <h3 className="min-w-0 truncate text-lg font-semibold">{providersState.getProviderDisplayName(selected)}</h3>
            <TooltipAction tooltip={t("modelManagerPanel.actions.editProvider")}>
              <button onClick={() => providerDialog.openEditProvider(selected)} className="p-1 rounded hover:bg-accent text-muted-foreground">
                <Settings className="h-4 w-4" />
              </button>
            </TooltipAction>
            {!SYSTEM_PROVIDER_IDS.has(selected.id) && (
              <TooltipAction tooltip={t("common.delete")}>
                <button
                  onClick={() => void providerDialog.handleRemoveProvider(selected)}
                  className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </TooltipAction>
            )}
          </div>
          <div data-testid="model-manager-provider-summary-actions" className="model-manager-provider-summary-actions flex shrink-0 items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 whitespace-nowrap px-4 text-sm"
              onClick={() => { clearHealthResults(); setHealthOpen(true); }}
              disabled={!canRunHealthCheck}
            >
              {t("modelManagerPanel.actions.healthCheck")}
            </Button>
            <Switch checked={selected.enabled} onCheckedChange={(value) => updateProvider(selected.id, { enabled: value })} />
          </div>
        </div>
      </div>

      <div
        data-testid="model-manager-provider-detail-body"
        className="model-manager-provider-detail-body min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-3 [scrollbar-gutter:stable] min-[960px]:px-6 min-[960px]:pt-4"
      >
        <div className="model-manager-provider-detail-grid min-h-full min-w-0">
          {saveError && (
            <InlineNotice
              icon={AlertTriangle}
              tone="destructive"
              align="start"
              className="shrink-0 rounded-lg !border-destructive/20 px-4 py-3"
              bodyClassName="space-y-2"
            >
              <div className="text-sm font-medium text-foreground">{t("modelManagerPanel.saveState.errorTitle")}</div>
              <p className="text-xs text-muted-foreground break-words">{saveError}</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => void retrySaveProviders()}>
                  <RotateCw className="mr-1.5 h-3.5 w-3.5" />
                  {t("modelManagerPanel.saveState.retry")}
                </Button>
                {hasDirtyChange && (
                  <span className="text-xs text-muted-foreground">{t("modelManagerPanel.saveState.unsaved")}</span>
                )}
              </div>
            </InlineNotice>
          )}

          {!NO_API_KEY_PROVIDERS.has(selected.id) && !hasDedicatedCloudAuth && (
            <div className="shrink-0 space-y-2">
              <div className="settings-action-row flex items-center justify-between gap-3">
                <Label className="text-sm font-medium">{t("modelManagerPanel.apiKey.title")}</Label>
                <TooltipAction tooltip={t("modelManagerPanel.apiKey.settings")}>
                  <button onClick={openApiKeyListDialog} className="p-1 rounded hover:bg-accent text-muted-foreground">
                    <Settings className="h-3.5 w-3.5" />
                  </button>
                </TooltipAction>
              </div>
              <Input
                type="password"
                value={apiKeyDraft}
                onChange={(event) => setApiKeyDraft(event.target.value)}
                onBlur={commitInlineApiKeyDraft}
                onKeyDown={(event) => {
                  if (isImeComposingLikeEvent(event)) return;
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitInlineApiKeyDraft();
                  }
                }}
                placeholder={t("modelManagerPanel.apiKey.placeholder")}
                className="text-sm h-9 font-mono"
              />
              {providersState.apiKeysForUi.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  {t("modelManagerPanel.apiKey.moreKeys", { count: providersState.apiKeysForUi.length - 1 })}
                  <button type="button" onClick={openApiKeyListDialog} className="underline hover:text-foreground">
                    {t("modelManagerPanel.apiKey.manageAll")}
                  </button>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {providersState.apiKeysForUi.length > 1
                  ? t("modelManagerPanel.apiKey.inlineHintMulti")
                  : t("modelManagerPanel.apiKey.hintMain")}
              </p>
            </div>
          )}

          {hasDedicatedCloudAuth ? (
            <ModelManagerProviderCloudDetailSection
              provider={selected}
              t={t}
              updateProvider={updateProvider}
            />
          ) : null}

          {hasProviderConnectionDetail ? (
            <ModelManagerProviderConnectionDetailSection
              provider={selected}
              t={t}
              updateProvider={updateProvider}
            />
          ) : null}

          <div className="shrink-0 space-y-2">
              <div className="settings-action-row flex flex-wrap items-center gap-2">
                <Label className="text-sm font-medium flex items-center gap-1">
                  {hasDedicatedCloudAuth
                    ? t("modelManagerPanel.apiBase.overrideTitle")
                    : t("modelManagerPanel.apiBase.title")}
                  <HelpTip content={hasDedicatedCloudAuth
                    ? t("modelManagerPanel.apiBase.overrideHint")
                    : t("modelManagerPanel.apiBase.emptyHint")} />
              </Label>
              <TooltipAction tooltip={t("modelManagerPanel.actions.customHeaders")}>
                <button
                  onClick={controller.headersDialog.openHeadersDialog}
                  className="p-1 rounded hover:bg-accent text-muted-foreground ml-auto"
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
              </TooltipAction>
            </div>
            <Input
              value={apiHostInputValue}
              onChange={(event) => updateProvider(selected.id, { apiHost: event.target.value })}
              placeholder={hasDedicatedCloudAuth ? t("modelManagerPanel.apiBase.overridePlaceholder") : undefined}
              className="text-sm h-9 font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {apiPreviewText}
            </p>
          </div>

          <div data-testid="model-manager-model-section" className="model-manager-model-section min-w-0">
            <div className="shrink-0 flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <Label className="text-sm font-medium">{t("modelManagerPanel.models.title")}</Label>
                <Badge variant="secondary" className="text-xs">{modelDialog.inlineFilteredModels.length}</Badge>
                {modelDialog.inlineModelSearchOpen ? (
                  <div className="relative w-full min-[960px]:w-auto">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      ref={modelDialog.inlineModelSearchInputRef}
                      value={modelDialog.inlineModelSearch}
                      onChange={(event) => modelDialog.setInlineModelSearch(event.target.value)}
                      placeholder={t("modelManagerPanel.manageDialog.searchPlaceholder")}
                      className="h-8 w-full pl-8 pr-8 text-sm min-[960px]:w-56"
                      onKeyDown={(event) => {
                        if (isImeComposingLikeEvent(event)) return;
                        if (event.key === "Escape") {
                          event.stopPropagation();
                          modelDialog.setInlineModelSearch("");
                          modelDialog.setInlineModelSearchOpen(false);
                          return;
                        }
                        if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur();
                      }}
                      onBlur={() => {
                        if (!String(modelDialog.inlineModelSearch || "").trim()) modelDialog.setInlineModelSearchOpen(false);
                      }}
                    />
                    {String(modelDialog.inlineModelSearch || "").trim() && (
                      <TooltipAction tooltip={t("common.clear")}>
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            modelDialog.setInlineModelSearch("");
                            queueMicrotask(() => modelDialog.inlineModelSearchInputRef.current?.focus());
                          }}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </TooltipAction>
                    )}
                  </div>
                ) : (
                  <TooltipAction tooltip={t("common.search")}>
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-accent text-muted-foreground"
                      onClick={() => modelDialog.setInlineModelSearchOpen(true)}
                    >
                      <Search className="h-3.5 w-3.5" />
                    </button>
                  </TooltipAction>
                )}
              </div>
              <div data-testid="model-manager-model-actions" className="settings-responsive-actions flex min-w-0 flex-wrap items-center justify-end gap-2">
                <Button variant="outline" size="sm" className="min-w-0 text-sm" onClick={() => controller.catalog.setManageOpen(true)}>
                  <Layers className="mr-1.5 h-4 w-4" /> {t("modelManagerPanel.actions.manage")}
                </Button>
                <Button variant="outline" size="sm" className="min-w-0 text-sm" onClick={modelDialog.openAddModel}>
                  <Plus className="mr-1.5 h-4 w-4" /> {t("modelManagerPanel.actions.add")}
                </Button>
              </div>
            </div>

            <div
              data-testid="model-manager-model-list"
              className="min-h-0 min-w-0 overflow-hidden rounded-lg border border-border"
            >
              <div
                data-testid="model-manager-model-list-scroll"
                className="h-full overflow-y-auto"
              >
                <div
                  data-testid="model-manager-model-list-content"
                  className="divide-y divide-border"
                >
                  {Object.entries(modelDialog.inlineGroups).map(([group, models]) => {
                    const sortedModels = sortModelsByVersionSemantics(models, (model) => ({
                      modelId: selectedModelViews.get(model.id)?.versionSortKey || '',
                      displayName: model.name,
                    }));
                    return (
                      <div key={group}>
                        <button onClick={() => toggleGroup(group)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent/30 transition-colors">
                          <div className="flex items-center gap-2">
                            {collapsedGroups.has(group) ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                            <span className="text-sm font-medium">{group}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">—</span>
                        </button>
                        {!collapsedGroups.has(group) && sortedModels.map((model) => (
                          <div
                            key={model.id}
                            data-testid={`model-manager-model-row-${model.id}`}
                            className="model-manager-model-row min-w-0 px-4 py-3 pl-10 transition-colors hover:bg-accent/20"
                          >
                            <div className="model-manager-model-row-grid gap-x-3 gap-y-2">
                              <div className="model-manager-model-row-icon mt-0.5">
                                {(() => {
                                  const ui = pickProviderUiMeta(selected.id);
                                  return (
                                    <ProviderIcon
                                      providerId={selected.id}
                                      customLogo={selected.logo}
                                      fallbackIcon={ui.icon}
                                      fallbackColor={ui.color}
                                      size="sm"
                                    />
                                  );
                                })()}
                              </div>
                              <div className="model-manager-model-row-title min-w-0 pt-0.5">
                                <div className="text-sm font-medium truncate">{model.name}</div>
                                <div className="text-xs text-muted-foreground truncate">{model.id}</div>
                              </div>
                              <div className="model-manager-model-row-badges min-w-0">
                                <RowBadgeKeysBadges badgeKeys={selectedModelViews.get(model.id)?.rowBadgeKeys ?? []} />
                              </div>
                              <div className="model-manager-model-row-actions mt-0.5 flex shrink-0 items-center justify-end gap-2">
                                <TooltipAction tooltip={t("common.edit")}>
                                  <button onClick={() => modelDialog.openEditModel(model)} className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent text-muted-foreground">
                                    <Settings className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipAction>
                                <TooltipAction tooltip={t("common.delete")}>
                                  <button onClick={() => modelDialog.removeModel(model.id)} className="flex h-7 w-7 items-center justify-center rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipAction>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {selected.models.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">{t("modelManagerPanel.models.empty")}</div>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
        <div
          aria-hidden="true"
          data-testid="model-manager-provider-detail-tail-spacer"
          className="model-manager-provider-detail-tail-spacer"
        />
      </div>
      <div
        aria-hidden="true"
        data-testid="model-manager-provider-detail-bottom-safe-area"
        className="model-manager-provider-detail-bottom-safe-area pointer-events-none absolute inset-x-0 bottom-0"
      />
    </div>
  );
}

/**
 * 导出组件：`ModelManagerLoadOverlay`。
 *
 * @remarks
 * 负责承载当前文件对应的界面渲染、交互编排和视图层边界。
 */
export function ModelManagerLoadOverlay({ controller }: Props) {
  const { providersState, t } = controller;
  const { isProviderInteractionBlocked, providerLoadError, reloadProviders } = providersState;
  if (!isProviderInteractionBlocked) return null;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-background px-6 py-5 shadow-lg">
        <InlineNotice
          icon={providerLoadError ? AlertTriangle : Loader2}
          iconSize="md"
          tone={providerLoadError ? "destructive" : "info"}
          align="start"
          surface="plain"
          iconClassName={providerLoadError ? undefined : "animate-spin text-primary"}
          bodyClassName="space-y-2"
        >
            <div className="text-sm font-semibold">
              {providerLoadError ? t("modelManagerPanel.loadState.errorTitle") : t("modelManagerPanel.loadState.loadingTitle")}
            </div>
            <p className="text-sm text-muted-foreground">
              {providerLoadError ? t("modelManagerPanel.loadState.errorDescription") : t("modelManagerPanel.loadState.loadingDescription")}
            </p>
            {providerLoadError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground break-words">
                {providerLoadError}
              </div>
            )}
            <div className="flex items-center gap-2">
              {providerLoadError ? (
                <Button variant="default" size="sm" onClick={() => void reloadProviders()}>
                  <RotateCw className="mr-1.5 h-3.5 w-3.5" />
                  {t("modelManagerPanel.loadState.retry")}
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">{t("common.loading")}</span>
              )}
            </div>
        </InlineNotice>
      </div>
    </div>
  );
}
