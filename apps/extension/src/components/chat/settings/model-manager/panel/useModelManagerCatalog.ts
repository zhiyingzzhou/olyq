/**
 * 说明：`useModelManagerCatalog` 组件模块。
 *
 * 职责：
 * - 承载 `useModelManagerCatalog` 相关的当前文件实现与模块边界；
 * - 对外暴露 `getFetchedModelImportBlockReason`、`pickImportableCatalogModels`、`buildCatalogModelViewMap` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { toast } from "@/hooks/useToast";
import { capabilityLabel } from "@/lib/ai/capability-label";
import { fetchModelsFromApi, type FetchedModel } from "@/lib/ai/fetch-models";
import { formatI18nText } from "@/lib/i18n/format";
import { formatUserError } from "@/lib/i18n/user-message";
import {
  supportsModerationProvider,
  supportsSpeechProvider,
  supportsTranscriptionProvider,
} from "@/lib/ai/provider-capabilities";
import {
  type ModelItem,
  type Provider,
  type ResolvedRegistryView,
} from "@/components/chat/settings/model-manager/shared";
import { USER_MODEL_TYPE_ORDER } from "@/lib/ai/model-type-system";

/**
 * 内部函数：`getProviderCatalogTypeDisplayLabel`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function getProviderCatalogTypeDisplayLabel(type: string | undefined, t: TFunction): string {
  const normalizedType = String(type || "").trim().toLowerCase();
  switch (normalizedType) {
    case "audio":
      return t("modelRegistry.capabilities.audio-model");
    case "transcribe":
      return t("modelRegistry.capabilities.transcription");
    case "moderation":
      return t("modelRegistry.capabilities.moderation");
    case "video":
      return t("modelRegistry.capabilities.video-generation");
    default:
      return normalizedType || t("modelRegistry.capabilities.unknown");
  }
}

/**
 * 导出函数：`getFetchedModelImportBlockReason`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function getFetchedModelImportBlockReason(params: {
  catalogModelView?: Pick<ResolvedRegistryView, "transportProtocol"> | null;
  model: Pick<FetchedModel, "id" | "kindHint" | "transportProtocol" | "importBlockedReasonKey" | "importBlockedReasonParams">;
  provider: Pick<Provider, "id" | "type">;
  t: TFunction;
}): string | null {
  const { catalogModelView, model, provider, t } = params;
  if (model.importBlockedReasonKey) {
    const normalizedParams = model.importBlockedReasonKey === "modelManagerPanel.manageDialog.importBlockedProviderCatalogTypeUnsupported"
      ? {
          ...model.importBlockedReasonParams,
          typeLabel: getProviderCatalogTypeDisplayLabel(model.importBlockedReasonParams?.type, t),
        }
      : model.importBlockedReasonParams;
    return formatI18nText(t, {
      key: model.importBlockedReasonKey,
      params: normalizedParams,
    });
  }
  const effectiveTransportProtocol = catalogModelView?.transportProtocol ?? model.transportProtocol ?? "unknown";
  if (effectiveTransportProtocol === "transcription-api" && !supportsTranscriptionProvider(provider)) {
    return t("modelManagerPanel.manageDialog.importBlockedTranscriptionRuntimeUnavailable");
  }
  if (effectiveTransportProtocol === "speech-api" && !supportsSpeechProvider(provider)) {
    return t("modelManagerPanel.manageDialog.importBlockedSpeechRuntimeUnavailable");
  }
  if (effectiveTransportProtocol === "moderation-api" && !supportsModerationProvider(provider)) {
    return t("modelManagerPanel.manageDialog.importBlockedModerationRuntimeUnavailable");
  }
  const isVideoCatalogModel = effectiveTransportProtocol === "video-api" || model.kindHint === "video-generation";
  if (isVideoCatalogModel) {
    return t("modelManagerPanel.manageDialog.importBlockedVideoRuntimeUnavailable");
  }
  if (effectiveTransportProtocol === "unknown") {
    return t("modelManagerPanel.manageDialog.importBlockedUnknownProtocol");
  }
  return null;
}

/**
 * 导出函数：`pickImportableCatalogModels`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function pickImportableCatalogModels(params: {
  addedModelIds: ReadonlySet<string>;
  catalogFiltered: ReadonlyArray<FetchedModel>;
  getCatalogImportBlockReason: (model: FetchedModel) => string | null;
}): FetchedModel[] {
  const { addedModelIds, catalogFiltered, getCatalogImportBlockReason } = params;
  return catalogFiltered
    .filter((model) => !addedModelIds.has(model.id))
    .filter((model) => !getCatalogImportBlockReason(model));
}

/**
 * 导出函数：`buildCatalogModelViewMap`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function buildCatalogModelViewMap(params: {
  catalogModels: ReadonlyArray<FetchedModel>;
  provider: Pick<Provider, "id" | "type" | "apiHost">;
  resolveModelView: (
    provider: Pick<Provider, "id" | "type" | "apiHost">,
    model: Pick<ModelItem, "id" | "name" | "transportProtocol" | "kindHint" | "inputModalities" | "outputModalities" | "features" | "manualModelTypes" | "supportedParameters">
      & { providerCatalogTypeHint?: import("@/lib/ai/types").ProviderCatalogTypeHint },
  ) => ResolvedRegistryView;
}): Map<string, ResolvedRegistryView> {
  const { catalogModels, provider, resolveModelView } = params;
  const map = new Map<string, ResolvedRegistryView>();
  for (const model of catalogModels) {
    map.set(model.id, resolveModelView(provider, model));
  }
  return map;
}

/**
 * 导出 Hook：`useModelManagerCatalog`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useModelManagerCatalog(params: {
  getProviderDisplayName: (provider: Pick<Provider, "id" | "name">) => string;
  isModelCatalogSupported: boolean;
  resolveModelView: (
    provider: Pick<Provider, "id" | "type" | "apiHost">,
    model: Pick<ModelItem, "id" | "name" | "transportProtocol" | "kindHint" | "inputModalities" | "outputModalities" | "features" | "manualModelTypes" | "supportedParameters">
      & { providerCatalogTypeHint?: import("@/lib/ai/types").ProviderCatalogTypeHint },
  ) => ResolvedRegistryView;
  selected: Provider;
  t: TFunction;
  updateProvider: (id: string, patch: Partial<Provider>) => void;
}) {
  const { getProviderDisplayName, isModelCatalogSupported, resolveModelView, selected, t, updateProvider } = params;
  const [manageOpen, setManageOpen] = useState(false);
  const [manageSearch, setManageSearch] = useState("");
  const [manageModelType, setManageModelType] = useState<string>("all");
  const [catalogModels, setCatalogModels] = useState<FetchedModel[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const lastManageAutoFetchProviderIdRef = useRef<string | null>(null);
  const catalogAbortRef = useRef<AbortController | null>(null);

  const catalogModelViews = useMemo(() => {
    return buildCatalogModelViewMap({
      catalogModels,
      provider: selected,
      resolveModelView,
    });
  }, [catalogModels, resolveModelView, selected]);

  const fetchCatalog = useCallback(async (force = false) => {
    if (!isModelCatalogSupported) {
      catalogAbortRef.current?.abort();
      setCatalogLoading(false);
      setCatalogError(null);
      setCatalogModels([]);
      return;
    }

    catalogAbortRef.current?.abort();
    const controller = new AbortController();
    catalogAbortRef.current = controller;
    setCatalogLoading(true);
    setCatalogError(null);
    setCatalogModels([]);
    try {
      const models = await fetchModelsFromApi(
        { ...selected, name: getProviderDisplayName(selected) },
        controller.signal,
        { force },
      );
      if (!controller.signal.aborted) setCatalogModels(models);
    } catch (error) {
      if (!controller.signal.aborted) setCatalogError(formatUserError(t, error));
    } finally {
      if (!controller.signal.aborted) setCatalogLoading(false);
    }
  }, [getProviderDisplayName, isModelCatalogSupported, selected, t]);

  const fetchCatalogInteractive = useCallback(async (force = false) => {
    if (!isModelCatalogSupported) return;
    await fetchCatalog(force);
  }, [fetchCatalog, isModelCatalogSupported]);

  useEffect(() => {
    if (!manageOpen) {
      lastManageAutoFetchProviderIdRef.current = null;
      catalogAbortRef.current?.abort();
      setCatalogModels([]);
      setCatalogError(null);
      setManageSearch("");
      setManageModelType("all");
      return;
    }
    if (lastManageAutoFetchProviderIdRef.current === selected.id) return;
    lastManageAutoFetchProviderIdRef.current = selected.id;

    if (!isModelCatalogSupported) {
      catalogAbortRef.current?.abort();
      setCatalogModels([]);
      setCatalogError(null);
      setCatalogLoading(false);
      return;
    }
    void fetchCatalog(false);
  }, [fetchCatalog, isModelCatalogSupported, manageOpen, selected.id]);

  const addedModelIds = useMemo(() => new Set(selected.models.map((model) => model.id)), [selected.models]);

  const catalogAvailableTags = useMemo(() => {
    const set = new Set<ResolvedRegistryView["userModelTypes"][number]>();
    for (const model of catalogModels) {
      const view = catalogModelViews.get(model.id);
      for (const item of view?.userModelTypes ?? []) set.add(item);
    }
    return USER_MODEL_TYPE_ORDER.filter((type) => set.has(type));
  }, [catalogModelViews, catalogModels]);

  const catalogGrouped = useMemo(() => {
    let models = catalogModels;
    if (manageModelType !== "all") {
      const key = String(manageModelType || "").trim().toLowerCase();
      models = models.filter((model) => (catalogModelViews.get(model.id)?.userModelTypes ?? []).includes(key as ResolvedRegistryView["userModelTypes"][number]));
    }
    if (manageSearch) {
      const query = manageSearch.toLowerCase();
      models = models.filter((model) => model.id.toLowerCase().includes(query) || model.name.toLowerCase().includes(query));
    }
    const groups: Record<string, FetchedModel[]> = {};
    models.forEach((model) => {
      (groups[model.group] ??= []).push(model);
    });
    return groups;
  }, [catalogModelViews, catalogModels, manageModelType, manageSearch]);

  const catalogFiltered = useMemo(() => Object.values(catalogGrouped).flat(), [catalogGrouped]);

  const getCatalogImportBlockReason = useCallback((model: FetchedModel) => {
    return getFetchedModelImportBlockReason({
      catalogModelView: catalogModelViews.get(model.id),
      model,
      provider: selected,
      t,
    });
  }, [catalogModelViews, selected, t]);

  const getCatalogModelView = useCallback((model: FetchedModel) => {
    return catalogModelViews.get(model.id) ?? resolveModelView(selected, model);
  }, [catalogModelViews, resolveModelView, selected]);

  const buildImportedCatalogModel = useCallback((model: FetchedModel): ModelItem => {
    const view = catalogModelViews.get(model.id);
    const transportProtocol = view?.transportProtocol ?? model.transportProtocol;
    return {
      id: model.id,
      name: model.name,
      group: model.group,
      ...(transportProtocol && transportProtocol !== "unknown" ? { transportProtocol } : {}),
      ...(model.kindHint ? { kindHint: model.kindHint } : {}),
      ...(model.inputModalities?.length ? { inputModalities: [...model.inputModalities] } : {}),
      ...(model.outputModalities?.length ? { outputModalities: [...model.outputModalities] } : {}),
      ...(model.features?.length ? { features: [...model.features] } : {}),
      ...(typeof model.contextLength === "number" ? { contextLength: model.contextLength } : {}),
      ...(model.supportedParameters !== undefined ? { supportedParameters: [...model.supportedParameters] } : {}),
      ...(typeof model.isDeprecated === "boolean" ? { isDeprecated: model.isDeprecated } : {}),
    };
  }, [catalogModelViews]);

  const addModelFromCatalog = useCallback((model: FetchedModel) => {
    if (addedModelIds.has(model.id)) return;
    const blockedReason = getCatalogImportBlockReason(model);
    if (blockedReason) {
      toast.error(blockedReason);
      return;
    }
    updateProvider(selected.id, { models: [...selected.models, buildImportedCatalogModel(model)] });
  }, [addedModelIds, buildImportedCatalogModel, getCatalogImportBlockReason, selected.id, selected.models, updateProvider]);

  const removeModelFromCatalog = useCallback((modelId: string) => {
    updateProvider(selected.id, { models: selected.models.filter((model) => model.id !== modelId) });
  }, [selected.id, selected.models, updateProvider]);

  const addAllFiltered = useCallback(() => {
    const toAdd = pickImportableCatalogModels({
      addedModelIds,
      catalogFiltered,
      getCatalogImportBlockReason,
    })
      .map((model) => buildImportedCatalogModel(model));
    if (toAdd.length > 0) updateProvider(selected.id, { models: [...selected.models, ...toAdd] });
  }, [addedModelIds, buildImportedCatalogModel, catalogFiltered, getCatalogImportBlockReason, selected.id, selected.models, updateProvider]);

  const removeAllFiltered = useCallback(() => {
    const toRemoveIds = new Set(catalogFiltered.filter((model) => addedModelIds.has(model.id)).map((model) => model.id));
    if (toRemoveIds.size > 0) {
      updateProvider(selected.id, { models: selected.models.filter((model) => !toRemoveIds.has(model.id)) });
    }
  }, [addedModelIds, catalogFiltered, selected.id, selected.models, updateProvider]);

  return {
    addAllFiltered,
    addedModelIds,
    addModelFromCatalog,
    capabilityLabel,
    catalogAvailableTags,
    catalogError,
    catalogFiltered,
    catalogGrouped,
    catalogLoading,
    catalogModels,
    fetchCatalogInteractive,
    getCatalogModelView,
    getCatalogImportBlockReason,
    manageModelType,
    manageOpen,
    manageSearch,
    removeAllFiltered,
    removeModelFromCatalog,
    setManageModelType,
    setManageOpen,
    setManageSearch,
  };
}
