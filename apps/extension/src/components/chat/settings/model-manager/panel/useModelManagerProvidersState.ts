/**
 * 说明：`useModelManagerProvidersState` 组件模块。
 *
 * 职责：
 * - 承载 `useModelManagerProvidersState` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useModelManagerProvidersState` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { toast } from "@/hooks/useToast";
import type { TransportProtocol } from "@/lib/ai/types";
import { reconcileModelReferences } from "@/lib/ai/model-reference-reconciler";
import { deriveVersionSortKey } from "@/lib/ai/model-version-sort";
import { applyResolvedModelMetaToProviderConfig, loadProviders, registerProviderRegistrySaveSideEffect, saveProviders } from "@/lib/ai/provider-registry";
import { refreshModelRegistryInBackground } from "@/lib/ai/model-registry/background-refresh";
import { loadModelRegistryFast } from "@/lib/ai/model-registry/storage-lite";
import {
  createEmptyModelRegistry,
  hasModelRegistryEntries,
  MODEL_REGISTRY_UPDATED_EVENT,
} from "@/lib/ai/model-registry/state";
import { resolveModelMetaFromRegistry, type ModelModality, type ModelRegistryState, type ResolveConfidence, type ResolvedModelMeta } from "@/lib/ai/model-registry";
import { applyUserModelTypes } from "@/lib/ai/model-type-system";
import { getProviderNetworkHostMatchPatterns } from "@/lib/ai/provider-network-targets";
import { formatUserError } from "@/lib/i18n/user-message";
import { logger } from "@/lib/logger";
import {
  buildPrimaryKindBadgeKeys,
  buildPrimaryKindKey,
  buildRowBadgeKeys,
  buildSystemSemanticKeys,
  buildUserModelTypes,
  createInitialProviderState,
  EMPTY_MODEL_REGISTRY,
  EMPTY_PROVIDER,
  serializeProvidersSnapshot,
  splitApiKeysString,
  TRANSPORT_PROTOCOL_OPTIONS,
  type ModelItem,
  type Provider,
  type ResolvedRegistryView,
  uniqStringsKeepOrder,
} from "@/components/chat/settings/model-manager/shared";

/**
 * 导出 Hook：`useModelManagerProvidersState`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useModelManagerProvidersState(t: TFunction) {
  const [providers, setProviders] = useState<Provider[]>(createInitialProviderState);
  const [selectedId, setSelectedId] = useState("openai");
  const [providerSearch, setProviderSearch] = useState("");
  const [registry, setRegistry] = useState<ModelRegistryState>(EMPTY_MODEL_REGISTRY);
  const [isHydrated, setIsHydrated] = useState(false);
  const [providerLoadError, setProviderLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveRevision, setSaveRevision] = useState(0);
  const [savedRevision, setSavedRevision] = useState(0);

  const saveRevisionRef = useRef(0);
  const lastObservedProvidersSnapshotRef = useRef(serializeProvidersSnapshot(createInitialProviderState()));
  const savedProvidersSnapshotRef = useRef(serializeProvidersSnapshot(createInitialProviderState()));

  const selected = providers.find((provider) => provider.id === selectedId) ?? providers[0] ?? EMPTY_PROVIDER;
  const providersSnapshot = useMemo(() => serializeProvidersSnapshot(providers), [providers]);
  const hasDirtyChange = isHydrated && saveRevision !== savedRevision && providersSnapshot !== savedProvidersSnapshotRef.current;
  const isProviderInteractionBlocked = !isHydrated;

  const isModelCatalogSupported = useMemo(() => {
    return selected.type !== "aws-bedrock" && selected.type !== "vertexai" && selected.type !== "vertex-anthropic";
  }, [selected.type]);

  const resolveSystemModelMeta = useCallback((
    provider: Pick<Provider, "id" | "type" | "apiHost">,
    model: Pick<ModelItem, "id" | "name" | "transportProtocol" | "kindHint" | "inputModalities" | "outputModalities" | "features" | "supportedParameters">
      & { providerCatalogTypeHint?: import("@/lib/ai/types").ProviderCatalogTypeHint },
  ): ResolvedModelMeta => {
    return resolveModelMetaFromRegistry(registry, {
      providerType: provider.type,
      providerId: provider.id,
      apiHost: provider.apiHost,
      rawModelId: model.id,
      rawModelName: model.name || model.id,
      transportProtocol: model.transportProtocol,
      kindHint: model.kindHint,
      providerCatalogTypeHint: model.providerCatalogTypeHint,
      inputModalities: model.inputModalities,
      outputModalities: model.outputModalities,
      features: model.features,
      supportedParameters: model.supportedParameters,
    });
  }, [registry]);

  const buildResolvedRegistryView = useCallback((resolved: ResolvedModelMeta, configuredTransportProtocol?: TransportProtocol): ResolvedRegistryView => {
    return {
      ...resolved,
      configuredTransportProtocol,
      versionSortKey: deriveVersionSortKey({
        modelId: resolved.baseModelKey,
        baseModelKey: resolved.baseModelKey,
      }),
      primaryKindKey: buildPrimaryKindKey(resolved),
      primaryKindBadgeKeys: buildPrimaryKindBadgeKeys(resolved),
      userModelTypes: buildUserModelTypes(resolved),
      systemSemanticKeys: buildSystemSemanticKeys(resolved),
      rowBadgeKeys: buildRowBadgeKeys(resolved),
    };
  }, []);

  const resolveModelView = useCallback((
    provider: Pick<Provider, "id" | "type" | "apiHost">,
    model: Pick<ModelItem, "id" | "name" | "transportProtocol" | "kindHint" | "inputModalities" | "outputModalities" | "features" | "manualModelTypes" | "supportedParameters">
      & { providerCatalogTypeHint?: import("@/lib/ai/types").ProviderCatalogTypeHint },
  ): ResolvedRegistryView => {
    const systemResolved = resolveSystemModelMeta(provider, model);
    return buildResolvedRegistryView(applyUserModelTypes(systemResolved, model.manualModelTypes), model.transportProtocol);
  }, [buildResolvedRegistryView, resolveSystemModelMeta]);

  const selectedModelViews = useMemo(() => {
    const map = new Map<string, ResolvedRegistryView>();
    for (const model of selected.models) map.set(model.id, resolveModelView(selected, model));
    return map;
  }, [resolveModelView, selected]);

  const getResolvedProviderHostPatterns = useCallback((provider: Provider, modelId?: string): string[] => {
    const normalizedModelId = String(modelId || "").trim();
    if (!normalizedModelId) return getProviderNetworkHostMatchPatterns(provider);

    const model = provider.models.find((item) => String(item?.id || "").trim() === normalizedModelId);
    const resolved = selectedModelViews.get(normalizedModelId) ?? resolveModelView(provider, {
      id: normalizedModelId,
      name: model?.name || normalizedModelId,
      transportProtocol: model?.transportProtocol,
      manualModelTypes: model?.manualModelTypes,
    });
    return getProviderNetworkHostMatchPatterns(
      applyResolvedModelMetaToProviderConfig(provider, normalizedModelId, resolved),
      normalizedModelId,
    );
  }, [resolveModelView, selectedModelViews]);

  const apiKeysForUi = useMemo(() => uniqStringsKeepOrder(splitApiKeysString(selected.apiKey || "")), [selected.apiKey]);

  const loadBestEffortRegistry = useCallback(async (nextProviders: ReadonlyArray<Provider>) => {
    void refreshModelRegistryInBackground("modelManager").catch((error) => {
      logger.provider.error("model manager background registry refresh failed", error);
    });

    try {
      const storedRegistry = await loadModelRegistryFast();
      if (hasModelRegistryEntries(storedRegistry)) return storedRegistry;
    } catch (error) {
      logger.provider.error("model manager load stored registry failed", error);
    }

    if (nextProviders.length > 0) {
      try {
        const { buildModelRegistryPreviewWithProviders } = await import("@/lib/ai/model-registry/sync-preview");
        const previewRegistry = await buildModelRegistryPreviewWithProviders(nextProviders);
        if (hasModelRegistryEntries(previewRegistry)) return previewRegistry;
      } catch (error) {
        logger.provider.error("model manager build preview registry failed", error);
      }
    }

    return createEmptyModelRegistry();
  }, []);

  useEffect(() => {
    return registerProviderRegistrySaveSideEffect(({ providers: nextProviders, registry: nextRegistry }) => {
      reconcileModelReferences({ providers: nextProviders, registry: nextRegistry });
    });
  }, []);

  const persistProvidersNow = useCallback(async (
    nextProviders: Provider[],
    options?: { notify?: boolean; source?: "auto-save" | "health-check" | "api-key-check" | "manual-retry" },
  ) => {
    try {
      await saveProviders(nextProviders);
      const nextRegistry = await loadBestEffortRegistry(nextProviders);
      setRegistry(nextRegistry);
      setSaveError(null);
      return { ok: true as const, registry: nextRegistry };
    } catch (error) {
      const message = formatUserError(t, error);
      logger.provider.error("model manager save providers failed", error, { source: options?.source ?? "auto-save" });
      setSaveError(message);
      if (options?.notify) toast.error(message);
      return { ok: false as const, message };
    }
  }, [loadBestEffortRegistry, t]);

  const commitProviders = useCallback((nextProviders: Provider[] | ((current: Provider[]) => Provider[]), options?: { hydrated?: boolean }) => {
    setProviders((current) => (typeof nextProviders === "function" ? nextProviders(current) : nextProviders));
    if (options?.hydrated === false) return;
  }, []);

  const updateProvider = useCallback((id: string, patch: Partial<Provider>) => {
    commitProviders((currentProviders) => currentProviders.map((provider) => {
      if (provider.id !== id) return provider;
      const nextProvider = { ...provider, ...patch } as Provider;
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete ((nextProvider as unknown) as Record<string, unknown>)[key];
      }
      return nextProvider;
    }));
  }, [commitProviders]);

  const reorderProviders = useCallback((sourceId: string, targetId: string) => {
    const normalizedSourceId = String(sourceId || "").trim();
    const normalizedTargetId = String(targetId || "").trim();
    if (!normalizedSourceId || !normalizedTargetId || normalizedSourceId === normalizedTargetId) return;

    commitProviders((currentProviders) => {
      const fromIndex = currentProviders.findIndex((provider) => provider.id === normalizedSourceId);
      const toIndex = currentProviders.findIndex((provider) => provider.id === normalizedTargetId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return currentProviders;
      const nextProviders = [...currentProviders];
      const [moved] = nextProviders.splice(fromIndex, 1);
      if (!moved) return currentProviders;
      nextProviders.splice(toIndex, 0, moved);
      return nextProviders;
    });
  }, [commitProviders]);

  const reloadProviders = useCallback(async () => {
    try {
      setIsHydrated(false);
      setProviderLoadError(null);
      const loaded = await loadProviders();
      if (!Array.isArray(loaded) || loaded.length === 0) throw new Error("providers-empty");
      const snapshot = serializeProvidersSnapshot(loaded);
      savedProvidersSnapshotRef.current = snapshot;
      lastObservedProvidersSnapshotRef.current = snapshot;
      commitProviders(loaded, { hydrated: false });
      setSelectedId((current) => (loaded.some((provider) => provider.id === current) ? current : loaded[0]!.id));
      setRegistry(await loadBestEffortRegistry(loaded));
      setSaveError(null);
      saveRevisionRef.current = 0;
      setSaveRevision(0);
      setSavedRevision(0);
      setIsHydrated(true);
    } catch (error) {
      logger.provider.error("model manager load providers failed", error);
      setProviderLoadError(formatUserError(t, error));
    }
  }, [commitProviders, loadBestEffortRegistry, t]);

  useEffect(() => {
    void reloadProviders();
  }, [reloadProviders]);

  useEffect(() => {
        /**
     * 内部函数变量：`syncRegistry`。
     *
     * @remarks
     * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
     */
    const syncRegistry = () => {
      void (async () => {
        try {
          setRegistry(await loadBestEffortRegistry(await loadProviders()));
        } catch (error) {
          logger.provider.error("model manager sync registry failed", error);
        }
      })();
    };

    syncRegistry();
    if (typeof window === "undefined") return;
    window.addEventListener(MODEL_REGISTRY_UPDATED_EVENT, syncRegistry);
    return () => window.removeEventListener(MODEL_REGISTRY_UPDATED_EVENT, syncRegistry);
  }, [loadBestEffortRegistry]);

  useEffect(() => {
    if (!isHydrated || !hasDirtyChange) return;
    const revision = saveRevision;
    const timer = window.setTimeout(() => {
      void (async () => {
        const persistResult = await persistProvidersNow(providers, { source: "auto-save" });
        if (!persistResult.ok) return;
        if (revision === saveRevisionRef.current) {
          savedProvidersSnapshotRef.current = providersSnapshot;
          setSavedRevision(revision);
        }
      })();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [hasDirtyChange, isHydrated, persistProvidersNow, providers, providersSnapshot, saveRevision]);

  useEffect(() => {
    if (!isHydrated || providersSnapshot === lastObservedProvidersSnapshotRef.current) return;
    lastObservedProvidersSnapshotRef.current = providersSnapshot;
    setSaveRevision((current) => {
      const next = current + 1;
      saveRevisionRef.current = next;
      return next;
    });
  }, [isHydrated, providersSnapshot]);

  const retrySaveProviders = useCallback(async () => {
    const persistResult = await persistProvidersNow(providers, { notify: true, source: "manual-retry" });
    if (!persistResult.ok) return;
    const snapshot = serializeProvidersSnapshot(providers);
    savedProvidersSnapshotRef.current = snapshot;
    lastObservedProvidersSnapshotRef.current = snapshot;
    setSavedRevision(saveRevisionRef.current);
  }, [persistProvidersNow, providers]);

  const getProviderDisplayName = useCallback((provider: Pick<Provider, "id" | "name">) => {
    const key = `modelManagerPanel.providers.${provider.id}`;
    const translated = t(key);
    return translated === key ? provider.name : translated;
  }, [t]);

  const filteredProviders = useMemo(() => {
    const query = providerSearch.toLowerCase();
    return providers.filter((provider) => getProviderDisplayName(provider).toLowerCase().includes(query));
  }, [getProviderDisplayName, providerSearch, providers]);

  const modalityLabel = useCallback((value: ModelModality) => {
    const key = `modelRegistry.modalities.${value}`;
    const translated = t(key);
    return translated === key ? value : translated;
  }, [t]);

  const scopeLabel = useCallback((value: ResolvedModelMeta["scope"]) => {
    const key = `modelRegistry.scopes.${value}`;
    const translated = t(key);
    return translated === key ? value : translated;
  }, [t]);

  const confidenceLabel = useCallback((value: ResolveConfidence) => {
    const key = `modelRegistry.confidence.${value}`;
    const translated = t(key);
    return translated === key ? value : translated;
  }, [t]);

  const transportProtocolLabel = useCallback((value: TransportProtocol) => {
    const key = `modelRegistry.transportProtocols.${value}`;
    const translated = t(key);
    return translated === key
      ? (TRANSPORT_PROTOCOL_OPTIONS.find((option) => option.value === value)?.label ?? value)
      : translated;
  }, [t]);

  return {
    apiKeysForUi,
    buildResolvedRegistryView,
    confidenceLabel,
    commitProviders,
    filteredProviders,
    getProviderDisplayName,
    getResolvedProviderHostPatterns,
    hasDirtyChange,
    isHydrated,
    isModelCatalogSupported,
    isProviderInteractionBlocked,
    modalityLabel,
    persistProvidersNow,
    providerLoadError,
    providerSearch,
    providers,
    reorderProviders,
    reloadProviders,
    resolveModelView,
    resolveSystemModelMeta,
    retrySaveProviders,
    saveError,
    scopeLabel,
    selected,
    selectedId,
    selectedModelViews,
    setProviderSearch,
    setSelectedId,
    transportProtocolLabel,
    updateProvider,
  };
}
