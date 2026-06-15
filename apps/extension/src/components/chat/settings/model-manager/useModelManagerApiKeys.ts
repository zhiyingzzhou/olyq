/**
 * 说明：`useModelManagerApiKeys` 组件模块。
 *
 * 职责：
 * - 承载 `useModelManagerApiKeys` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useModelManagerApiKeys` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { TFunction } from 'i18next';

import { toast } from '@/hooks/useToast';
import { parseApiKeyInput } from '@/lib/ai/api-keys';
import {
  formatApiKeysString,
  splitApiKeysString,
  type ApiKeyEditingState,
  type ApiKeyModelCandidate,
  type Provider,
} from '@/components/chat/settings/model-manager/shared';

interface UseModelManagerApiKeysOptions {
  readonly apiKeyCheckModelId: string;
  readonly apiKeysForUi: ReadonlyArray<string>;
  readonly isAnyApiKeyChecking: boolean;
  readonly resetApiKeyHealthState: () => void;
  readonly retainApiKeyConnectivity: (keys: ReadonlyArray<string>) => void;
  readonly selected: Provider;
  readonly setApiKeyCheckModelId: (value: string) => void;
  readonly t: TFunction;
  readonly updateProvider: (id: string, patch: Partial<Provider>) => void;
}

interface UseModelManagerApiKeysResult {
  readonly apiKeyCheckModelCandidates: ReadonlyArray<ApiKeyModelCandidate>;
  readonly apiKeyDraft: string;
  readonly apiKeyEditing: ApiKeyEditingState | null;
  readonly apiKeyEditingInputRef: RefObject<HTMLTextAreaElement | null>;
  readonly apiKeyEditingVisible: boolean;
  readonly apiKeyListOpen: boolean;
  readonly beginAddApiKey: () => void;
  readonly beginEditApiKey: (index: number) => void;
  readonly cancelApiKeyEdit: () => void;
  readonly commitInlineApiKeyDraft: () => void;
  readonly copyApiKeyToClipboard: (key: string) => Promise<void>;
  readonly openApiKeyListDialog: () => void;
  readonly persistApiKeys: (keys: string[]) => void;
  readonly removeApiKeyAt: (index: number) => void;
  readonly saveApiKeyEdit: () => void;
  readonly setApiKeyDraft: Dispatch<SetStateAction<string>>;
  readonly setApiKeyListOpen: Dispatch<SetStateAction<boolean>>;
  readonly setEditingValue: (value: string) => void;
  readonly toggleEditingVisibility: () => void;
}

/**
 * 导出 Hook：`useModelManagerApiKeys`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useModelManagerApiKeys({
  apiKeyCheckModelId,
  apiKeysForUi,
  isAnyApiKeyChecking,
  resetApiKeyHealthState,
  retainApiKeyConnectivity,
  selected,
  setApiKeyCheckModelId,
  t,
  updateProvider,
}: UseModelManagerApiKeysOptions): UseModelManagerApiKeysResult {
  const [apiKeyListOpen, setApiKeyListOpen] = useState(false);
  const [apiKeyEditing, setApiKeyEditing] = useState<ApiKeyEditingState | null>(null);
  const [apiKeyEditingVisible, setApiKeyEditingVisible] = useState(false);
  const apiKeyEditingInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState('');

  const parseEditableApiKeys = useCallback((raw: string): string[] | null => {
    const parsed = parseApiKeyInput(raw);
    if (parsed.rejected.length > 0) {
      toast.error(t('modelManagerPanel.apiKey.errorUrlLike'));
      return null;
    }
    return parsed.keys;
  }, [t]);

  const apiKeyCheckModelCandidates = useMemo<ApiKeyModelCandidate[]>(() => (
    Array.isArray(selected.models)
      ? selected.models.map((model) => ({ id: model.id, name: model.name }))
      : []
  ), [selected.models]);

  useEffect(() => {
    if (!apiKeyListOpen || !apiKeyEditing) return;
    queueMicrotask(() => {
      apiKeyEditingInputRef.current?.focus();
    });
  }, [apiKeyEditing, apiKeyListOpen]);

  useEffect(() => {
    setApiKeyDraft(apiKeysForUi[0] || '');
  }, [apiKeysForUi, selected.id]);

  useEffect(() => {
    setApiKeyListOpen(false);
    setApiKeyEditing(null);
    setApiKeyEditingVisible(false);
    resetApiKeyHealthState();
  }, [resetApiKeyHealthState, selected.id]);

  useEffect(() => {
    if (!apiKeyListOpen) return;
    const firstModelId = apiKeyCheckModelCandidates[0]?.id ?? '';
    if (!firstModelId) return;
    if (!apiKeyCheckModelId || !apiKeyCheckModelCandidates.some((model) => model.id === apiKeyCheckModelId)) {
      setApiKeyCheckModelId(firstModelId);
    }
  }, [apiKeyCheckModelCandidates, apiKeyCheckModelId, apiKeyListOpen, setApiKeyCheckModelId]);

  const persistApiKeys = useCallback((keys: string[]) => {
    const normalized = formatApiKeysString(keys);
    updateProvider(selected.id, { apiKey: normalized });
    retainApiKeyConnectivity(keys);
  }, [retainApiKeyConnectivity, selected.id, updateProvider]);

  const openApiKeyListDialog = useCallback(() => {
    const normalized = formatApiKeysString(splitApiKeysString(selected.apiKey || ''));
    if (normalized !== String(selected.apiKey || '').trim()) {
      updateProvider(selected.id, { apiKey: normalized });
    }
    setApiKeyEditing(null);
    setApiKeyEditingVisible(false);
    setApiKeyListOpen(true);
  }, [selected.apiKey, selected.id, updateProvider]);

  const commitInlineApiKeyDraft = useCallback(() => {
    const draft = apiKeyDraft.trim();
    const currentFirst = apiKeysForUi[0] ?? '';
    if (apiKeysForUi.length > 1) {
      setApiKeyDraft(currentFirst);
      if (draft !== currentFirst) {
        toast.error(t('modelManagerPanel.apiKey.inlineEditBlocked'));
      }
      openApiKeyListDialog();
      return;
    }
    const parsed = parseEditableApiKeys(draft);
    if (!parsed) return;
    persistApiKeys(parsed);
  }, [apiKeyDraft, apiKeysForUi, openApiKeyListDialog, parseEditableApiKeys, persistApiKeys, t]);

  const beginAddApiKey = useCallback(() => {
    if (isAnyApiKeyChecking) return;
    setApiKeyEditingVisible(true);
    setApiKeyEditing({ mode: 'add', value: '' });
  }, [isAnyApiKeyChecking]);

  const beginEditApiKey = useCallback((index: number) => {
    if (isAnyApiKeyChecking) return;
    const current = apiKeysForUi[index] ?? '';
    setApiKeyEditingVisible(true);
    setApiKeyEditing({ mode: 'edit', index, value: current });
  }, [apiKeysForUi, isAnyApiKeyChecking]);

  const cancelApiKeyEdit = useCallback(() => {
    setApiKeyEditing(null);
    setApiKeyEditingVisible(false);
  }, []);

  const saveApiKeyEdit = useCallback(() => {
    if (!apiKeyEditing) return;

    if (apiKeyEditing.mode === 'add') {
      const parsed = parseEditableApiKeys(apiKeyEditing.value || '');
      if (!parsed) return;
      if (parsed.length === 0) {
        toast.error(t('modelManagerPanel.apiKey.errorEmpty'));
        return;
      }

      const existing = new Set(apiKeysForUi);
      const toAdd = parsed.filter((key) => !existing.has(key));
      if (toAdd.length === 0) {
        toast.error(t('modelManagerPanel.apiKey.errorDuplicate'));
        return;
      }

      persistApiKeys([...apiKeysForUi, ...toAdd]);
      setApiKeyEditing(null);
      setApiKeyEditingVisible(false);
      toast.success(t('modelManagerPanel.apiKey.toastAdded', { count: toAdd.length }));
      return;
    }

    const parsed = parseEditableApiKeys(apiKeyEditing.value || '');
    if (!parsed) return;
    if (parsed.length === 0) {
      toast.error(t('modelManagerPanel.apiKey.errorEmpty'));
      return;
    }

    const base = apiKeysForUi.filter((_, index) => index !== apiKeyEditing.index);
    const existing = new Set(base);
    const toInsert = parsed.filter((key) => !existing.has(key));
    if (toInsert.length === 0) {
      toast.error(t('modelManagerPanel.apiKey.errorDuplicate'));
      return;
    }

    const next = [...apiKeysForUi];
    next.splice(apiKeyEditing.index, 1, ...toInsert);
    persistApiKeys(next);
    setApiKeyEditing(null);
    setApiKeyEditingVisible(false);
  }, [apiKeyEditing, apiKeysForUi, parseEditableApiKeys, persistApiKeys, t]);

  const removeApiKeyAt = useCallback((index: number) => {
    if (isAnyApiKeyChecking) return;
    persistApiKeys(apiKeysForUi.filter((_, currentIndex) => currentIndex !== index));
  }, [apiKeysForUi, isAnyApiKeyChecking, persistApiKeys]);

  const copyApiKeyToClipboard = useCallback(async (key: string) => {
    try {
      const writeText = navigator.clipboard?.writeText;
      if (!writeText) {
        toast.error(t('common.copyFailed'));
        return;
      }
      await writeText.call(navigator.clipboard, key);
      toast.success(t('common.copied'));
    } catch {
      toast.error(t('common.copyFailed'));
    }
  }, [t]);

  const setEditingValue = useCallback((value: string) => {
    setApiKeyEditing((current) => (current ? { ...current, value } : current));
  }, []);

  const toggleEditingVisibility = useCallback(() => {
    setApiKeyEditingVisible((current) => !current);
  }, []);

  const result: UseModelManagerApiKeysResult = {
    apiKeyCheckModelCandidates,
    apiKeyDraft,
    apiKeyEditing,
    apiKeyEditingInputRef,
    apiKeyEditingVisible,
    apiKeyListOpen,
    beginAddApiKey,
    beginEditApiKey,
    cancelApiKeyEdit,
    commitInlineApiKeyDraft,
    copyApiKeyToClipboard,
    openApiKeyListDialog,
    persistApiKeys,
    removeApiKeyAt,
    saveApiKeyEdit,
    setApiKeyDraft,
    setApiKeyListOpen,
    setEditingValue,
    toggleEditingVisibility,
  };
  return result;
}
