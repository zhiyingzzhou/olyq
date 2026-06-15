/**
 * 说明：`useModelManagerModelDialog` 组件模块。
 *
 * 职责：
 * - 承载 `useModelManagerModelDialog` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useModelManagerModelDialog` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { toast } from "@/hooks/useToast";
import type { TransportProtocol, UserModelType } from "@/lib/ai/types";
import type { ResolvedModelMeta } from "@/lib/ai/model-registry";
import { applyUserModelTypes, deriveSystemModelTypes, getSystemCapabilitySummary, isUserModelTypeDisabled, toggleUserModelType } from "@/lib/ai/model-type-system";
import {
  createEmptyModelForm,
  type ModelFormState,
  type ModelItem,
  type Provider,
  type ResolvedRegistryView,
} from "@/components/chat/settings/model-manager/shared";
import { USER_MODEL_TYPE_ORDER } from "@/lib/ai/model-type-system";

type ResolveSystemModelMeta = (
  provider: Pick<Provider, "id" | "type" | "apiHost">,
  model: Pick<ModelItem, "id" | "name" | "transportProtocol" | "kindHint" | "inputModalities" | "outputModalities" | "features">,
) => ResolvedModelMeta;

type ResolveModelView = (
  provider: Pick<Provider, "id" | "type" | "apiHost">,
  model: Pick<ModelItem, "id" | "name" | "transportProtocol" | "kindHint" | "inputModalities" | "outputModalities" | "features" | "manualModelTypes">,
) => ResolvedRegistryView;

/**
 * 导出 Hook：`useModelManagerModelDialog`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useModelManagerModelDialog(params: {
  buildResolvedRegistryView: (resolved: ResolvedModelMeta, configuredTransportProtocol?: TransportProtocol) => ResolvedRegistryView;
  getProviderDisplayName: (provider: Pick<Provider, "id" | "name">) => string;
  resolveModelView: ResolveModelView;
  resolveSystemModelMeta: ResolveSystemModelMeta;
  selected: Provider;
  t: TFunction;
  updateProvider: (id: string, patch: Partial<Provider>) => void;
}) {
  const { buildResolvedRegistryView, getProviderDisplayName, resolveModelView, resolveSystemModelMeta, selected, t, updateProvider } = params;
  const [inlineModelSearchOpen, setInlineModelSearchOpen] = useState(false);
  const [inlineModelSearch, setInlineModelSearch] = useState("");
  const inlineModelSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelItem | null>(null);
  const [modelForm, setModelForm] = useState<ModelFormState>(createEmptyModelForm);

  useEffect(() => {
    if (!inlineModelSearchOpen) return;
    inlineModelSearchInputRef.current?.focus();
  }, [inlineModelSearchOpen]);

  useEffect(() => {
    setInlineModelSearchOpen(false);
    setInlineModelSearch("");
  }, [selected.id]);

  const removeModel = useCallback((modelId: string) => {
    updateProvider(selected.id, { models: selected.models.filter((model) => model.id !== modelId) });
  }, [selected.id, selected.models, updateProvider]);

  const openAddModel = useCallback(() => {
    setEditingModel(null);
    setModelForm(createEmptyModelForm());
    setModelDialogOpen(true);
  }, []);

  const openEditModel = useCallback((model: ModelItem) => {
    setEditingModel(model);
    setModelForm({
      id: model.id,
      name: model.name,
      group: (typeof model.group === "string" && model.group.trim()) ? model.group : getProviderDisplayName(selected),
      manualModelTypes: model.manualModelTypes ? [...model.manualModelTypes] : undefined,
      supportedTextDelta: model.supportedTextDelta,
    });
    setModelDialogOpen(true);
  }, [getProviderDisplayName, selected]);

  const saveModel = useCallback(async () => {
    const modelId = String(modelForm.id || "").trim();
    if (!modelId) return;

    const duplicateModel = selected.models.find((model) => {
      const currentId = String(model.id || "").trim();
      if (!currentId || currentId !== modelId) return false;
      if (!editingModel) return true;
      return String(editingModel.id || "").trim() !== currentId;
    });
    if (duplicateModel) {
      toast.error(t("modelManagerPanel.modelDialog.errors.duplicateId", { id: modelId }));
      return;
    }

    const modelName = String(modelForm.name || "").trim() || modelId;
    const modelGroup = String(modelForm.group || "").trim() || getProviderDisplayName(selected);
    const keepIdentity = Boolean(editingModel) && String(editingModel?.id || "").trim() === modelId;
    const inheritedSemanticHints = keepIdentity
      ? {
          ...(editingModel?.transportProtocol ? { transportProtocol: editingModel.transportProtocol } : {}),
          ...(editingModel?.kindHint ? { kindHint: editingModel.kindHint } : {}),
          ...(editingModel?.inputModalities?.length ? { inputModalities: editingModel.inputModalities } : {}),
          ...(editingModel?.outputModalities?.length ? { outputModalities: editingModel.outputModalities } : {}),
          ...(editingModel?.features?.length ? { features: editingModel.features } : {}),
        }
      : {};

    const resolvedPreview = resolveModelView(selected, {
      id: modelId,
      name: modelName,
      ...inheritedSemanticHints,
      manualModelTypes: modelForm.manualModelTypes,
    });

    const item: ModelItem = {
      id: modelId,
      name: modelName,
      group: modelGroup,
      ...(resolvedPreview.transportProtocol !== "unknown" ? { transportProtocol: resolvedPreview.transportProtocol } : {}),
      ...(keepIdentity && editingModel?.kindHint ? { kindHint: editingModel.kindHint } : {}),
      ...(keepIdentity && editingModel?.inputModalities?.length ? { inputModalities: editingModel.inputModalities } : {}),
      ...(keepIdentity && editingModel?.outputModalities?.length ? { outputModalities: editingModel.outputModalities } : {}),
      ...(keepIdentity && editingModel?.features?.length ? { features: editingModel.features } : {}),
      ...(keepIdentity && typeof editingModel?.contextLength === "number" ? { contextLength: editingModel.contextLength } : {}),
      ...(keepIdentity && typeof editingModel?.isDeprecated === "boolean" ? { isDeprecated: editingModel.isDeprecated } : {}),
      ...(modelForm.manualModelTypes !== undefined ? { manualModelTypes: [...modelForm.manualModelTypes] } : {}),
      ...(typeof modelForm.supportedTextDelta === "boolean" ? { supportedTextDelta: modelForm.supportedTextDelta } : {}),
    };

    updateProvider(selected.id, {
      models: editingModel
        ? selected.models.map((model) => (model.id === editingModel.id ? item : model))
        : [...selected.models, item],
    });
    setModelDialogOpen(false);
  }, [editingModel, getProviderDisplayName, modelForm, resolveModelView, selected, t, updateProvider]);

  const inlineFilteredModels = useMemo(() => {
    const query = String(inlineModelSearch || "").trim().toLowerCase();
    if (!query) return selected.models;
    return selected.models.filter((model) => {
      const id = String(model.id || "").toLowerCase();
      const name = String(model.name || "").toLowerCase();
      const group = String(model.group || "").toLowerCase();
      return id.includes(query) || name.includes(query) || group.includes(query);
    });
  }, [inlineModelSearch, selected.models]);

  const defaultInlineGroupName = useMemo(
    () => getProviderDisplayName({ id: selected.id, name: selected.name }) || selected.name || selected.id,
    [getProviderDisplayName, selected.id, selected.name],
  );

  const inlineGroups = useMemo(() => {
    const groups: Record<string, ModelItem[]> = {};
    for (const model of inlineFilteredModels) {
      const group = (typeof model.group === "string" && model.group.trim()) ? model.group.trim() : defaultInlineGroupName;
      if (!groups[group]) groups[group] = [];
      groups[group].push(model);
    }
    return groups;
  }, [defaultInlineGroupName, inlineFilteredModels]);

  const modelDialogSystemPreview = useMemo(() => {
    if (!modelForm.id.trim()) return null;
    const keepIdentity = Boolean(editingModel) && String(editingModel?.id || "").trim() === modelForm.id.trim();
    const systemResolved = resolveSystemModelMeta(selected, {
      id: modelForm.id.trim(),
      name: modelForm.name.trim() || modelForm.id.trim(),
      ...(keepIdentity && editingModel?.transportProtocol ? { transportProtocol: editingModel.transportProtocol } : {}),
      ...(keepIdentity && editingModel?.kindHint ? { kindHint: editingModel.kindHint } : {}),
      ...(keepIdentity && editingModel?.inputModalities?.length ? { inputModalities: editingModel.inputModalities } : {}),
      ...(keepIdentity && editingModel?.outputModalities?.length ? { outputModalities: editingModel.outputModalities } : {}),
      ...(keepIdentity && editingModel?.features?.length ? { features: editingModel.features } : {}),
    });
    return buildResolvedRegistryView(systemResolved, editingModel?.transportProtocol);
  }, [buildResolvedRegistryView, editingModel, modelForm.id, modelForm.name, resolveSystemModelMeta, selected]);

  const modelDialogEffectivePreview = useMemo(() => {
    if (!modelDialogSystemPreview) return null;
    return buildResolvedRegistryView(
      applyUserModelTypes(modelDialogSystemPreview, modelForm.manualModelTypes),
      modelDialogSystemPreview.configuredTransportProtocol,
    );
  }, [buildResolvedRegistryView, modelDialogSystemPreview, modelForm.manualModelTypes]);

  const modelDialogCatalogMetadata = useMemo(() => {
    if (!editingModel) return null;
    const currentModelId = String(modelForm.id || "").trim();
    if (!currentModelId) return null;
    return String(editingModel.id || "").trim() === currentModelId ? editingModel : null;
  }, [editingModel, modelForm.id]);

  const modelDialogSystemManualTypes = useMemo(
    () => (modelDialogSystemPreview ? deriveSystemModelTypes(modelDialogSystemPreview) : []),
    [modelDialogSystemPreview],
  );

  const modelDialogSystemSummary = useMemo(
    () => (modelDialogSystemPreview ? getSystemCapabilitySummary(modelDialogSystemPreview) : null),
    [modelDialogSystemPreview],
  );

  const modelDialogSelectedManualTypes = useMemo(
    () => modelForm.manualModelTypes ?? modelDialogSystemManualTypes,
    [modelDialogSystemManualTypes, modelForm.manualModelTypes],
  );

  const toggleModelDialogManualType = useCallback((type: UserModelType) => {
    setModelForm((current) => {
      const currentSelection = current.manualModelTypes ?? modelDialogSystemManualTypes;
      return { ...current, manualModelTypes: toggleUserModelType(currentSelection, type) };
    });
  }, [modelDialogSystemManualTypes]);

  const resetModelDialogManualTypes = useCallback(() => {
    setModelForm((current) => ({ ...current, manualModelTypes: undefined }));
  }, []);

  return {
    inlineFilteredModels,
    inlineGroups,
    inlineModelSearch,
    inlineModelSearchInputRef,
    inlineModelSearchOpen,
    modelDialogCatalogMetadata,
    modelDialogEffectivePreview,
    modelDialogOpen,
    modelDialogSelectedManualTypes,
    modelDialogSystemManualTypes,
    modelDialogSystemPreview,
    modelDialogSystemSummary,
    modelForm,
    openAddModel,
    openEditModel,
    removeModel,
    resetModelDialogManualTypes,
    saveModel,
    setInlineModelSearch,
    setInlineModelSearchOpen,
    setModelDialogOpen,
    setModelForm,
    toggleModelDialogManualType,
    userModelTypeOrder: USER_MODEL_TYPE_ORDER,
    isUserModelTypeDisabled,
  };
}
