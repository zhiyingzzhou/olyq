/**
 * 说明：`useModelManagerHeadersDialog` 组件模块。
 *
 * 职责：
 * - 承载 `useModelManagerHeadersDialog` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useModelManagerHeadersDialog` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useState } from "react";
import type { TFunction } from "i18next";
import { toast } from "@/hooks/useToast";
import { isRecord, type Provider } from "@/components/chat/settings/model-manager/shared";
import { sanitizeProviderExtraHeaders, resolveProviderApiKeyAuth } from "@/lib/ai/provider-auth";

/**
 * 导出 Hook：`useModelManagerHeadersDialog`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useModelManagerHeadersDialog(params: {
  selected: Provider;
  t: TFunction;
  updateProvider: (id: string, patch: Partial<Provider>) => void;
}) {
  const { selected, t, updateProvider } = params;
  const [headersOpen, setHeadersOpen] = useState(false);
  const [customHeaders, setCustomHeaders] = useState("{}");

  const openHeadersDialog = useCallback(() => {
    try {
      setCustomHeaders(JSON.stringify(selected.headers ?? {}, null, 2));
    } catch {
      setCustomHeaders("{}");
    }
    setHeadersOpen(true);
  }, [selected.headers]);

  const saveCustomHeaders = useCallback(() => {
    const text = customHeaders.trim() || "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      toast.error(t("modelManagerPanel.headersDialog.errors.invalidJson"));
      return;
    }
    if (!isRecord(parsed) || Array.isArray(parsed)) {
      toast.error(t("modelManagerPanel.headersDialog.errors.mustBeObject"));
      return;
    }

    const rawHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const normalizedKey = String(key || "").trim();
      if (!normalizedKey) continue;
      if (typeof value === "string") rawHeaders[normalizedKey] = value;
      else if (typeof value === "number" || typeof value === "boolean") rawHeaders[normalizedKey] = String(value);
    }
    const next = sanitizeProviderExtraHeaders(rawHeaders, resolveProviderApiKeyAuth(selected).headerName);

    updateProvider(selected.id, { headers: next });
    setHeadersOpen(false);
    toast.success(t("modelManagerPanel.headersDialog.toastSaved"));
  }, [customHeaders, selected, t, updateProvider]);

  return {
    customHeaders,
    headersOpen,
    openHeadersDialog,
    saveCustomHeaders,
    setCustomHeaders,
    setHeadersOpen,
  };
}
