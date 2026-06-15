/**
 * 说明：`ModelManagerPanelDialogs` 组件模块。
 *
 * 职责：
 * - 承载 `ModelManagerPanelDialogs` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelManagerPanelDialogs` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { AlertTriangle, ChevronDown, ChevronRight, HelpCircle, Loader2, Minus, Plus, RotateCcw, RotateCw, Search } from "lucide-react";
import { ModelManagerAddProviderDialog } from "@/components/chat/settings/model-manager/ModelManagerAddProviderDialog";
import { ModelManagerApiKeyDialog } from "@/components/chat/settings/model-manager/ModelManagerApiKeyDialog";
import { ModelManagerHealthDialog } from "@/components/chat/settings/model-manager/ModelManagerHealthDialog";
import { CapabilityPill } from "@/components/chat/CapabilityPill";
import { ProviderIcon } from "@/components/ui/ProviderIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TooltipAction } from "@/components/ui/tooltip-action";
import { capabilityLabel } from "@/lib/ai/capability-label";
import { pickProviderUiMeta } from "@/lib/ai/provider-ui-meta";
import {
  HelpTip,
  PrimaryKindBadges,
  RowBadgeKeysBadges,
  SystemSemanticBadges,
  UserModelTypeBadges,
  joinModelModalities,
} from "@/components/chat/settings/model-manager/shared";
import type { ModelManagerPanelController } from "./useModelManagerPanelController";

type Props = {
  controller: ModelManagerPanelController;
};

/**
 * 导出组件：`ModelManagerPanelDialogs`。
 *
 * @remarks
 * 负责承载当前文件对应的界面渲染、交互编排和视图层边界。
 */
export function ModelManagerPanelDialogs({ controller }: Props) {
  const { apiKeys, catalog, collapsedGroups, headersDialog, health, modelDialog, providerDialog, providersState, t, toggleGroup } = controller;
  const { selected } = providersState;

  return (
    <>
      <Dialog open={catalog.manageOpen} onOpenChange={catalog.setManageOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] p-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <DialogTitle className="text-lg font-semibold">{t("modelManagerPanel.manageDialog.title", { provider: providersState.getProviderDisplayName(selected) })}</DialogTitle>
          </div>
          <DialogDescription className="sr-only">{t("modelManagerPanel.manageDialog.description")}</DialogDescription>
          <div className="px-6 pt-4 pb-4 flex items-center gap-3 border-b border-border">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("modelManagerPanel.manageDialog.searchPlaceholder")}
                value={catalog.manageSearch}
                onChange={(event) => catalog.setManageSearch(event.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Select value={catalog.manageModelType} onValueChange={catalog.setManageModelType}>
              <SelectTrigger className="h-9 w-36 text-sm">
                <SelectValue placeholder={t("modelManagerPanel.manageDialog.typePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("modelManagerPanel.manageDialog.typeAll")}</SelectItem>
                {catalog.catalogAvailableTags.map((key) => (
                  <SelectItem key={key} value={key}>{capabilityLabel(key, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <TooltipAction
              tooltip={
                !providersState.isModelCatalogSupported
                  ? t("modelManagerPanel.manageDialog.notSupported")
                  : catalog.catalogLoading
                    ? t("modelManagerPanel.manageDialog.loading")
                    : t("modelManagerPanel.manageDialog.retry")
              }
            >
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => void catalog.fetchCatalogInteractive(true)}
                disabled={catalog.catalogLoading || !providersState.isModelCatalogSupported}
              >
                <RotateCw className={`h-4 w-4 ${catalog.catalogLoading ? "animate-spin" : ""}`} />
              </Button>
            </TooltipAction>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
            {!providersState.isModelCatalogSupported && (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <HelpCircle className="h-6 w-6" />
                <p className="text-sm text-center max-w-md">{t("modelManagerPanel.manageDialog.notSupported")}</p>
              </div>
            )}
            {providersState.isModelCatalogSupported && catalog.catalogLoading && (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">{t("modelManagerPanel.manageDialog.loading")}</span>
              </div>
            )}
            {providersState.isModelCatalogSupported && catalog.catalogError && !catalog.catalogLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
                <p className="text-sm text-muted-foreground text-center max-w-md">{catalog.catalogError}</p>
                <Button variant="outline" size="sm" onClick={() => void catalog.fetchCatalogInteractive(true)}>
                  <RotateCw className="h-3.5 w-3.5 mr-1.5" />
                  {t("modelManagerPanel.manageDialog.retry")}
                </Button>
              </div>
            )}
            {providersState.isModelCatalogSupported && !catalog.catalogLoading && !catalog.catalogError && catalog.catalogModels.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <p className="text-sm">{t("modelManagerPanel.manageDialog.empty")}</p>
              </div>
            )}
            {providersState.isModelCatalogSupported && !catalog.catalogLoading && !catalog.catalogError && Object.entries(catalog.catalogGrouped).map(([group, models]) => (
              <div key={group} className="space-y-1">
                <button onClick={() => toggleGroup(`manage-${group}`)} className="w-full flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    {collapsedGroups.has(`manage-${group}`) ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    <span className="font-medium text-sm">{group}</span>
                    <Badge variant="secondary" className="text-[10px] h-5">{models.length}</Badge>
                  </div>
                </button>
                {!collapsedGroups.has(`manage-${group}`) && models.map((model) => {
                  const isAdded = catalog.addedModelIds.has(model.id);
                  const modelView = catalog.getCatalogModelView(model);
                  const importBlockedReason = catalog.getCatalogImportBlockReason(model);
                  return (
                    <div key={model.id} className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isAdded ? "bg-emerald-500/5 hover:bg-emerald-500/10" : "hover:bg-accent/30"}`}>
                      {(() => {
                        const ui = pickProviderUiMeta(selected.id);
                        return <ProviderIcon providerId={selected.id} customLogo={selected.logo} fallbackIcon={ui.icon} fallbackColor={ui.color} size="md" />;
                      })()}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium truncate block">{model.name}</span>
                          {model.isDeprecated && (
                            <Badge variant="outline" className="h-5 shrink-0 border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-300">
                              {t("modelManagerPanel.manageDialog.deprecated")}
                            </Badge>
                          )}
                        </div>
                        {model.name !== model.id && <span className="text-xs text-muted-foreground truncate block">{model.id}</span>}
                        {importBlockedReason && !isAdded && <span className="mt-1 block text-[11px] text-amber-600 dark:text-amber-400">{importBlockedReason}</span>}
                      </div>
                      <RowBadgeKeysBadges badgeKeys={modelView?.rowBadgeKeys ?? []} />
                      {isAdded ? (
                        <TooltipAction tooltip={t("modelManagerPanel.manageDialog.remove")}>
                          <button onClick={() => catalog.removeModelFromCatalog(model.id)} className="h-7 w-7 rounded-full flex items-center justify-center bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors">
                            <Minus className="h-4 w-4" />
                          </button>
                        </TooltipAction>
                      ) : (
                        <TooltipAction tooltip={importBlockedReason ?? t("modelManagerPanel.manageDialog.add")}>
                          <button onClick={() => catalog.addModelFromCatalog(model)} disabled={Boolean(importBlockedReason)} className="h-7 w-7 rounded-full flex items-center justify-center bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors">
                            <Plus className="h-4 w-4" />
                          </button>
                        </TooltipAction>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 px-6 py-3 border-t border-border">
            <Button
              variant="default"
              size="sm"
              onClick={catalog.addAllFiltered}
              disabled={!providersState.isModelCatalogSupported || catalog.catalogLoading || catalog.catalogFiltered.every((model) => catalog.addedModelIds.has(model.id) || Boolean(catalog.getCatalogImportBlockReason(model)))}
            >
              <Plus className="h-4 w-4 mr-1.5" /> {t("modelManagerPanel.manageDialog.addAll")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={catalog.removeAllFiltered}
              disabled={!providersState.isModelCatalogSupported || catalog.catalogLoading || catalog.catalogFiltered.every((model) => !catalog.addedModelIds.has(model.id))}
            >
              <Minus className="h-4 w-4 mr-1.5" /> {t("modelManagerPanel.manageDialog.removeAll")}
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              {providersState.isModelCatalogSupported ? `${selected.models.length} / ${catalog.catalogModels.length}` : `${selected.models.length}`}
            </span>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={modelDialog.modelDialogOpen} onOpenChange={modelDialog.setModelDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden flex flex-col">
          <div className="px-6 pt-6 pb-3 border-b border-border">
            <DialogTitle className="text-lg font-semibold">
              {modelDialog.modelForm.id && modelDialog.modelForm.id === modelDialog.modelForm.id && modelDialog.modelDialogOpen && modelDialog.modelForm.id && modelDialog.modelForm.id ? (modelDialog.modelForm.id && modelDialog.modelDialogOpen && modelDialog.modelForm.id ? null : null) : null}
              {modelDialog.modelDialogOpen && (modelDialog.modelForm.id && modelDialog.modelForm.id ? null : null)}
              {modelDialog.modelDialogOpen && (modelDialog.modelForm.id || modelDialog.modelForm.name) ? t("modelManagerPanel.modelDialog.editTitle") : t("modelManagerPanel.modelDialog.addTitle")}
            </DialogTitle>
            <DialogDescription className="sr-only">{t("modelManagerPanel.modelDialog.description")}</DialogDescription>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <div className="space-y-4">
                <section className="rounded-xl border border-border bg-muted/10 p-4 space-y-4">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{t("modelManagerPanel.modelDialog.sections.basic")}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{t("modelManagerPanel.modelDialog.sectionDescriptions.basic")}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-1">
                      <span className="text-destructive">*</span> {t("modelManagerPanel.modelDialog.fields.id")} <HelpTip content={t("modelManagerPanel.modelDialog.help.id")} />
                    </Label>
                    <Input value={modelDialog.modelForm.id} onChange={(event) => modelDialog.setModelForm((current) => ({ ...current, id: event.target.value }))} placeholder={t("modelManagerPanel.modelDialog.fields.idPlaceholder")} className="text-sm h-10" />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-sm flex items-center gap-1">{t("modelManagerPanel.modelDialog.fields.name")} <HelpTip content={t("modelManagerPanel.modelDialog.help.name")} /></Label>
                      <Input value={modelDialog.modelForm.name} onChange={(event) => modelDialog.setModelForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("modelManagerPanel.modelDialog.fields.namePlaceholder")} className="text-sm h-10" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm flex items-center gap-1">{t("modelManagerPanel.modelDialog.fields.group")} <HelpTip content={t("modelManagerPanel.modelDialog.help.group")} /></Label>
                      <Input value={modelDialog.modelForm.group} onChange={(event) => modelDialog.setModelForm((current) => ({ ...current, group: event.target.value }))} placeholder={t("modelManagerPanel.modelDialog.fields.groupPlaceholder")} className="text-sm h-10" />
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-muted/10 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{t("modelManagerPanel.modelDialog.sections.advanced")}</div>
                      <p className="mt-1 text-xs text-muted-foreground">{t("modelManagerPanel.modelDialog.sectionDescriptions.advanced")}</p>
                    </div>
                    {modelDialog.modelForm.manualModelTypes !== undefined && (
                      <Button variant="outline" size="sm" className="h-8" onClick={modelDialog.resetModelDialogManualTypes}>
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        {t("modelManagerPanel.modelDialog.actions.resetModelTypes")}
                      </Button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {t("modelManagerPanel.modelDialog.fields.userModelTypes")}
                      <HelpTip content={t("modelManagerPanel.modelDialog.help.userModelTypes")} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {modelDialog.userModelTypeOrder.map((type) => {
                        const selectedType = modelDialog.modelDialogSelectedManualTypes.includes(type);
                        const disabled = modelDialog.isUserModelTypeDisabled(type, modelDialog.modelDialogSelectedManualTypes);
                        const label = capabilityLabel(type, t);
                        return (
                          <CapabilityPill
                            key={type}
                            capability={type}
                            label={label}
                            tooltip={label}
                            active={selectedType}
                            disabled={disabled}
                            size="md"
                            iconOnly
                            dataTestId={`model-manager-user-model-type-${type}`}
                            onClick={() => modelDialog.toggleModelDialogManualType(type)}
                          />
                        );
                      })}
                    </div>
                    <div className="rounded-lg border border-border/80 bg-background/70 px-3 py-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{t("modelManagerPanel.modelDialog.fields.modelTypesMode")}</span>
                        <Badge variant="secondary">
                          {modelDialog.modelForm.manualModelTypes === undefined
                            ? t("modelManagerPanel.modelDialog.modelTypeModes.followSystem")
                            : t("modelManagerPanel.modelDialog.modelTypeModes.manualOverride")}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {modelDialog.modelForm.manualModelTypes === undefined
                          ? t("modelManagerPanel.modelDialog.modelTypesFollowHint")
                          : t("modelManagerPanel.modelDialog.modelTypesOverrideHint")}
                      </p>
                      <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">{t("modelManagerPanel.modelDialog.fields.effectivePrimaryKind")}</div>
                          <div>{modelDialog.modelDialogEffectivePreview ? <PrimaryKindBadges primaryKindKeys={modelDialog.modelDialogEffectivePreview.primaryKindBadgeKeys} /> : t("modelRegistry.empty")}</div>
                        </div>
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">{t("modelManagerPanel.modelDialog.fields.effectiveUserModelTypes")}</div>
                          <div className="flex flex-wrap gap-2">
                            {(modelDialog.modelDialogEffectivePreview?.userModelTypes ?? []).length > 0 ? (
                              <UserModelTypeBadges modelTypes={modelDialog.modelDialogEffectivePreview?.userModelTypes ?? []} />
                            ) : (
                              <span className="text-muted-foreground">{t("modelManagerPanel.modelDialog.fields.effectiveUserModelTypesEmpty")}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <section className="rounded-xl border border-border bg-muted/10 p-4 space-y-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">{t("modelManagerPanel.modelDialog.fields.registryMetadata")}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{t("modelManagerPanel.modelDialog.sectionDescriptions.registryMetadata")}</p>
                </div>
                {modelDialog.modelDialogSystemPreview ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 text-xs text-muted-foreground sm:grid-cols-2">
                      <div className="space-y-1"><div className="font-medium text-foreground">{t("modelRegistry.fields.baseModelKey")}</div><div className="font-mono break-all">{modelDialog.modelDialogSystemPreview.baseModelKey}</div></div>
                      <div className="space-y-1"><div className="font-medium text-foreground">{t("modelRegistry.fields.scope")}</div><div>{providersState.scopeLabel(modelDialog.modelDialogSystemPreview.scope)}</div></div>
                      <div className="space-y-1"><div className="font-medium text-foreground">{t("modelManagerPanel.modelDialog.fields.systemPrimaryKind")}</div><div><PrimaryKindBadges primaryKindKeys={modelDialog.modelDialogSystemPreview.primaryKindBadgeKeys} /></div></div>
                      <div className="space-y-1"><div className="font-medium text-foreground">{t("modelRegistry.fields.confidence")}</div><div>{providersState.confidenceLabel(modelDialog.modelDialogSystemPreview.confidence)}</div></div>
                      <div className="space-y-1"><div className="font-medium text-foreground">{t("modelRegistry.fields.transportProtocol")}</div><div>{providersState.transportProtocolLabel(modelDialog.modelDialogSystemPreview.transportProtocol)}</div></div>
                      <div className="space-y-1"><div className="font-medium text-foreground">{t("modelRegistry.fields.displayName")}</div><div>{modelDialog.modelDialogSystemPreview.displayName}</div></div>
                      <div className="space-y-1">
                        <div className="font-medium text-foreground">{t("modelManagerPanel.modelDialog.fields.inputModalities")}</div>
                        <div>
                          {modelDialog.modelDialogCatalogMetadata
                            ? joinModelModalities(
                              modelDialog.modelDialogCatalogMetadata.inputModalities ?? [],
                              providersState.modalityLabel,
                              t("modelRegistry.empty"),
                            )
                            : t("modelRegistry.empty")}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="font-medium text-foreground">{t("modelManagerPanel.modelDialog.fields.outputModalities")}</div>
                        <div>
                          {modelDialog.modelDialogCatalogMetadata
                            ? joinModelModalities(
                              modelDialog.modelDialogCatalogMetadata.outputModalities ?? [],
                              providersState.modalityLabel,
                              t("modelRegistry.empty"),
                            )
                            : t("modelRegistry.empty")}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="font-medium text-foreground">{t("modelManagerPanel.modelDialog.fields.contextLength")}</div>
                        <div>
                          {modelDialog.modelDialogCatalogMetadata
                            ? (typeof modelDialog.modelDialogCatalogMetadata.contextLength === "number"
                              ? modelDialog.modelDialogCatalogMetadata.contextLength.toLocaleString()
                              : t("modelManagerPanel.modelDialog.fields.unknownContextLength"))
                            : t("modelRegistry.empty")}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="font-medium text-foreground">{t("modelManagerPanel.modelDialog.fields.deprecated")}</div>
                        <div>
                          {modelDialog.modelDialogCatalogMetadata
                            ? (modelDialog.modelDialogCatalogMetadata.isDeprecated ? t("common.yes") : t("common.no"))
                            : t("modelRegistry.empty")}
                        </div>
                      </div>
                    </div>
                    {modelDialog.modelDialogCatalogMetadata?.isDeprecated && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                        <Badge variant="outline" className="mr-2 h-5 border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-300">
                          {t("modelManagerPanel.manageDialog.deprecated")}
                        </Badge>
                        {t("modelManagerPanel.modelDialog.fields.deprecated")}
                      </div>
                    )}
                    <div className="space-y-2"><div className="text-xs font-medium text-foreground">{t("modelRegistry.fields.systemCapabilities")}</div><div className="flex flex-wrap gap-2"><SystemSemanticBadges semanticKeys={modelDialog.modelDialogSystemSummary?.systemCapabilities ?? []} /></div></div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("modelManagerPanel.modelDialog.registryPlaceholder")}</p>
                )}
              </section>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-border flex justify-end">
            <Button onClick={modelDialog.saveModel} disabled={!modelDialog.modelForm.id} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {t("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={headersDialog.headersOpen} onOpenChange={headersDialog.setHeadersOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] p-0 flex flex-col overflow-hidden">
          <div className="px-6 pt-6 pb-4 shrink-0 border-b border-border/60">
            <DialogTitle className="text-lg font-semibold">{t("modelManagerPanel.headersDialog.title")}</DialogTitle>
          </div>
          <DialogDescription className="sr-only">{t("modelManagerPanel.headersDialog.description")}</DialogDescription>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t("modelManagerPanel.headersDialog.hint")}</p>
            <Textarea value={headersDialog.customHeaders} onChange={(event) => headersDialog.setCustomHeaders(event.target.value)} rows={12} className="font-mono text-sm" placeholder="{}" />
          </div>
          <div className="px-6 py-4 border-t border-border/60 shrink-0 flex justify-end gap-3">
            <Button variant="outline" onClick={() => headersDialog.setHeadersOpen(false)}>{t("common.cancel")}</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={headersDialog.saveCustomHeaders}>{t("common.confirm")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ModelManagerApiKeyDialog
        open={apiKeys.apiKeyListOpen}
        providerName={providersState.getProviderDisplayName(selected)}
        apiKeyListOpen={apiKeys.apiKeyListOpen}
        apiKeyEditing={apiKeys.apiKeyEditing}
        apiKeyEditingVisible={apiKeys.apiKeyEditingVisible}
        apiKeys={providersState.apiKeysForUi}
        apiKeyConnectivity={health.apiKeyConnectivity}
        apiKeyCheckModelId={health.apiKeyCheckModelId}
        apiKeyCheckModelCandidates={apiKeys.apiKeyCheckModelCandidates}
        isAnyApiKeyChecking={health.isAnyApiKeyChecking}
        invalidApiKeyCount={health.invalidApiKeyCount}
        onClose={() => undefined}
        onSetOpen={apiKeys.setApiKeyListOpen}
        onBeginAddApiKey={apiKeys.beginAddApiKey}
        onBeginEditApiKey={apiKeys.beginEditApiKey}
        onCancelEdit={apiKeys.cancelApiKeyEdit}
        onSaveEdit={apiKeys.saveApiKeyEdit}
        onSetEditingValue={apiKeys.setEditingValue}
        onToggleEditingVisibility={apiKeys.toggleEditingVisibility}
        onRunAllChecks={() => { void health.runAllApiKeyConnectivityChecks(); }}
        onRunCheck={(index) => { void health.runApiKeyConnectivityCheck(index); }}
        onRemoveInvalid={() => health.removeInvalidApiKeys(providersState.apiKeysForUi, apiKeys.persistApiKeys)}
        onRemoveAt={apiKeys.removeApiKeyAt}
        onCopyKey={(key) => { void apiKeys.copyApiKeyToClipboard(key); }}
        onSetCheckModelId={health.setApiKeyCheckModelId}
        onSetApiKeyListOpen={apiKeys.setApiKeyListOpen}
        apiKeyInputRef={apiKeys.apiKeyEditingInputRef}
      />

      <ModelManagerHealthDialog
        open={health.healthOpen}
        running={health.healthRunning}
        keyMode={health.healthKeyMode}
        keyIndex={health.healthKeyIndex}
        keys={health.healthKeysForUi}
        concurrent={health.healthConcurrent}
        timeout={health.healthTimeout}
        results={health.healthResults}
        onSetOpen={(open) => {
          if (!open) {
            if (health.healthRunning) health.abortHealthCheck();
            health.clearHealthResults();
          }
          health.setHealthOpen(open);
        }}
        onSetKeyMode={health.setHealthKeyMode}
        onSetKeyIndex={health.setHealthKeyIndex}
        onSetConcurrent={health.setHealthConcurrent}
        onSetTimeout={health.setHealthTimeout}
        onRunHealthCheck={health.runHealthCheck}
        onAbortHealthCheck={health.abortHealthCheck}
      />

      <ModelManagerAddProviderDialog
        open={providerDialog.addProviderOpen}
        editingProviderId={providerDialog.editingProviderId}
        advancedOpen={providerDialog.providerAdvancedOpen}
        builtinPicker={{ open: providerDialog.builtinPickerOpen, loading: providerDialog.builtinLoading, search: providerDialog.builtinSearch }}
        builtinIcons={providerDialog.builtinIcons}
        addProviderForm={providerDialog.addProviderForm}
        onOpenChange={(open) => {
          providerDialog.setAddProviderOpen(open);
          if (!open) {
            providerDialog.setBuiltinPickerOpen(false);
            providerDialog.setBuiltinSearch("");
            providerDialog.setEditingProviderId(null);
            providerDialog.setProviderAdvancedOpen(false);
          }
        }}
        onAdvancedToggle={providerDialog.setProviderAdvancedOpen}
        onFormPatch={providerDialog.patchAddProviderForm}
        onSave={providerDialog.saveProvider}
        onCancel={() => providerDialog.setAddProviderOpen(false)}
        isSaveDisabled={!providerDialog.addProviderForm.name.trim()}
        onRequestBuiltinIcons={providerDialog.requestBuiltinIcons}
        onBuiltinSearch={providerDialog.setBuiltinSearch}
        onSelectBuiltinIcon={providerDialog.onSelectBuiltinIcon}
        onResetLogo={providerDialog.onResetLogo}
        avatarInputRef={providerDialog.avatarInputRef}
        onAvatarUpload={providerDialog.handleAvatarUpload}
        onToggleBuiltinPicker={(open) => {
          providerDialog.setBuiltinPickerOpen(open);
          if (!open) providerDialog.setBuiltinSearch("");
        }}
      />
    </>
  );
}
