/**
 * 说明：`useModelManagerProviderDialog` 组件模块。
 *
 * 职责：
 * - 承载 `useModelManagerProviderDialog` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useModelManagerProviderDialog` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import type { TFunction } from "i18next";
import { toast } from "@/hooks/useToast";
import { parseApiKeyInput } from "@/lib/ai/api-keys";
import { fetchLobeIcons, type LobeIconEntry } from "@/lib/ai/lobe-icon-list";
import { encodeLobeIconRef } from "@/lib/ai/provider-icons";
import { formatUserError } from "@/lib/i18n/user-message";
import {
  createEmptyProviderForm,
  SYSTEM_PROVIDER_IDS,
  type Provider,
  type ProviderFormState,
} from "@/components/chat/settings/model-manager/shared";
import {
  mergeProviderFormPatchByType,
  sanitizeProviderAdvancedConfigByType,
  sanitizeProviderPersistedAdvancedConfigByType,
} from "@/components/chat/settings/model-manager/provider-form";

type Confirm = (options: {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
}) => Promise<boolean>;

/**
 * 导出 Hook：`useModelManagerProviderDialog`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useModelManagerProviderDialog(params: {
  commitProviders: (next: Provider[] | ((current: Provider[]) => Provider[]), options?: { hydrated?: boolean }) => void;
  confirm: Confirm;
  getProviderDisplayName: (provider: Pick<Provider, "id" | "name">) => string;
  providers: Provider[];
  selectedId: string;
  setSelectedId: Dispatch<SetStateAction<string>>;
  t: TFunction;
  updateProvider: (id: string, patch: Partial<Provider>) => void;
}) {
  const { commitProviders, confirm, getProviderDisplayName, providers, selectedId, setSelectedId, t, updateProvider } = params;
  const [addProviderOpen, setAddProviderOpen] = useState(false);
  const [providerAdvancedOpen, setProviderAdvancedOpen] = useState(false);
  const [addProviderForm, setAddProviderForm] = useState<ProviderFormState>(createEmptyProviderForm);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [builtinPickerOpen, setBuiltinPickerOpen] = useState(false);
  const [builtinSearch, setBuiltinSearch] = useState("");
  const [builtinIcons, setBuiltinIcons] = useState<LobeIconEntry[]>([]);
  const [builtinLoading, setBuiltinLoading] = useState(false);

  const handleAvatarUpload = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(image, 0, 0, 128, 128);
        setAddProviderForm((current) => ({ ...current, logo: canvas.toDataURL("image/png") }));
      };
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }, []);

  const openAddProvider = useCallback(() => {
    setEditingProviderId(null);
    setProviderAdvancedOpen(false);
    setAddProviderForm(createEmptyProviderForm());
    setAddProviderOpen(true);
  }, []);

  const openEditProvider = useCallback((provider: Provider) => {
    setEditingProviderId(provider.id);
    setProviderAdvancedOpen(false);
    setAddProviderForm(sanitizeProviderAdvancedConfigByType({
      name: provider.name,
      type: provider.type,
      authType: provider.authType,
      apiHost: provider.apiHost || "",
      anthropicApiHost: provider.anthropicApiHost || "",
      apiVersion: provider.apiVersion || "",
      logo: provider.logo || "",
      apiOptions: provider.apiOptions,
      apiKeyAuth: provider.apiKeyAuth,
      serviceTier: provider.serviceTier,
      verbosity: provider.verbosity,
      anthropicCacheControl: provider.anthropicCacheControl,
      bedrock: provider.bedrock,
      vertex: provider.vertex,
      rateLimit: provider.rateLimit != null ? String(provider.rateLimit) : "",
      notes: provider.notes ?? "",
    }));
    setAddProviderOpen(true);
  }, []);

  const patchAddProviderForm = useCallback((patch: Partial<ProviderFormState>) => {
    setAddProviderForm((current) => mergeProviderFormPatchByType(current, patch));
  }, []);

  const saveProvider = useCallback(() => {
    const normalizedForm = sanitizeProviderPersistedAdvancedConfigByType(addProviderForm);
    const name = normalizedForm.name.trim();
    if (!name) return;

    const apiHost = normalizedForm.apiHost.trim();
    const anthropicApiHost = normalizedForm.anthropicApiHost.trim();
    const apiVersion = normalizedForm.apiVersion.trim();
    const notes = normalizedForm.notes.trim();
    const rateLimitRaw = normalizedForm.rateLimit.trim();
    const rateLimitNum = rateLimitRaw ? Number(rateLimitRaw) : undefined;
    const rateLimit = rateLimitNum !== undefined && Number.isFinite(rateLimitNum) ? rateLimitNum : undefined;
    const bedrockApiKeyInput = normalizedForm.type === "aws-bedrock" && normalizedForm.bedrock?.authType === "apiKey"
      ? parseApiKeyInput(normalizedForm.bedrock.apiKey || "")
      : undefined;
    if (bedrockApiKeyInput && bedrockApiKeyInput.rejected.length > 0) {
      toast.error(t("modelManagerPanel.apiKey.errorUrlLike"));
      return;
    }
    const vertexApiKeyInput = normalizedForm.type === "vertexai" && normalizedForm.vertex?.authType === "apiKey"
      ? parseApiKeyInput(normalizedForm.vertex.apiKey || "")
      : undefined;
    if (vertexApiKeyInput && vertexApiKeyInput.rejected.length > 0) {
      toast.error(t("modelManagerPanel.apiKey.errorUrlLike"));
      return;
    }
    const bedrock = bedrockApiKeyInput
      ? (() => {
          const { apiKey: _apiKey, ...rest } = normalizedForm.bedrock!;
          return {
            ...rest,
            ...(bedrockApiKeyInput.keys[0] ? { apiKey: bedrockApiKeyInput.keys[0] } : {}),
          };
        })()
      : normalizedForm.bedrock;
    const vertex = vertexApiKeyInput
      ? (() => {
          const { apiKey: _apiKey, ...rest } = normalizedForm.vertex!;
          return {
            ...rest,
            ...(vertexApiKeyInput.keys[0] ? { apiKey: vertexApiKeyInput.keys[0] } : {}),
          };
        })()
      : normalizedForm.vertex;

    if (editingProviderId) {
      updateProvider(editingProviderId, {
        name,
        type: normalizedForm.type,
        apiHost,
        anthropicApiHost: anthropicApiHost || undefined,
        apiVersion: apiVersion || undefined,
        logo: normalizedForm.logo || undefined,
        apiOptions: normalizedForm.apiOptions,
        apiKeyAuth: normalizedForm.apiKeyAuth,
        serviceTier: normalizedForm.serviceTier,
        verbosity: normalizedForm.verbosity,
        anthropicCacheControl: normalizedForm.anthropicCacheControl,
        bedrock,
        vertex,
        rateLimit,
        notes: notes || undefined,
      });
      setAddProviderOpen(false);
      return;
    }

    const baseId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const id = `${baseId}-${Date.now().toString(36)}`;
    commitProviders((currentProviders) => [...currentProviders, {
      id,
      name,
      type: normalizedForm.type,
      enabled: true,
      apiKey: "",
      apiHost,
      models: [],
      ...(anthropicApiHost ? { anthropicApiHost } : {}),
      ...(apiVersion ? { apiVersion } : {}),
      ...(normalizedForm.logo ? { logo: normalizedForm.logo } : {}),
      ...(normalizedForm.apiOptions ? { apiOptions: normalizedForm.apiOptions } : {}),
      ...(normalizedForm.apiKeyAuth ? { apiKeyAuth: normalizedForm.apiKeyAuth } : {}),
      ...(normalizedForm.serviceTier !== undefined ? { serviceTier: normalizedForm.serviceTier } : {}),
      ...(normalizedForm.verbosity !== undefined ? { verbosity: normalizedForm.verbosity } : {}),
      ...(normalizedForm.anthropicCacheControl ? { anthropicCacheControl: normalizedForm.anthropicCacheControl } : {}),
      ...(bedrock ? { bedrock } : {}),
      ...(vertex ? { vertex } : {}),
      ...(rateLimit !== undefined ? { rateLimit } : {}),
      ...(notes ? { notes } : {}),
    }]);
    setSelectedId(id);
    setAddProviderOpen(false);
  }, [addProviderForm, commitProviders, editingProviderId, setSelectedId, t, updateProvider]);

  const handleRemoveProvider = useCallback(async (provider: Provider) => {
    if (SYSTEM_PROVIDER_IDS.has(provider.id)) return;
    const providerName = getProviderDisplayName(provider);
    const ok = await confirm({
      title: t("modelManagerPanel.deleteProvider.confirm", { name: providerName }),
      description: t("modelManagerPanel.deleteProvider.desc", { name: providerName }),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      variant: "destructive",
    });
    if (!ok) return;
    const nextProviders = providers.filter((item) => item.id !== provider.id);
    commitProviders(nextProviders);
    if (selectedId === provider.id) {
      setSelectedId(nextProviders.find((item) => item.id !== provider.id)?.id ?? nextProviders[0]?.id ?? "openai");
    }
  }, [commitProviders, confirm, getProviderDisplayName, providers, selectedId, setSelectedId, t]);

  const requestBuiltinIcons = useCallback(() => {
    setBuiltinPickerOpen(true);
    if (builtinIcons.length > 0) return;
    setBuiltinLoading(true);
    fetchLobeIcons()
      .then((icons) => setBuiltinIcons(icons))
      .catch((error) => toast.error(formatUserError(t, error)))
      .finally(() => setBuiltinLoading(false));
  }, [builtinIcons.length, t]);

  const filteredBuiltinIcons = useMemoBuiltinIcons(builtinIcons, builtinSearch);

  return {
    addProviderForm,
    addProviderOpen,
    avatarInputRef,
    builtinIcons: filteredBuiltinIcons,
    builtinLoading,
    builtinPickerOpen,
    builtinSearch,
    editingProviderId,
    handleAvatarUpload,
    handleRemoveProvider,
    openAddProvider,
    openEditProvider,
    patchAddProviderForm,
    providerAdvancedOpen,
    requestBuiltinIcons,
    saveProvider,
    setAddProviderForm,
    setAddProviderOpen,
    setBuiltinPickerOpen,
    setBuiltinSearch,
    setEditingProviderId,
    setProviderAdvancedOpen,
    onResetLogo: () => setAddProviderForm((current) => ({ ...current, logo: "" })),
    onSelectBuiltinIcon: (icon: LobeIconEntry) => {
      setAddProviderForm((current) => ({ ...current, logo: encodeLobeIconRef(icon.id, icon.c) }));
      setBuiltinPickerOpen(false);
      setBuiltinSearch("");
    },
  };
}

/**
 * 内部 Hook：`useMemoBuiltinIcons`。
 *
 * @remarks
 * 用于封装当前文件中的局部状态、副作用或派生值逻辑，调用方仍需遵守 Hook 调用顺序约束。
 */
function useMemoBuiltinIcons(icons: LobeIconEntry[], search: string) {
  const query = search.trim().toLowerCase();
  return query ? icons.filter((icon) => icon.id.toLowerCase().includes(query)) : icons;
}
