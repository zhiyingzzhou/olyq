/**
 * 说明：`useModelManagerHealth` 组件模块。
 *
 * 职责：
 * - 承载 `useModelManagerHealth` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useModelManagerHealth` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';

import { toast } from '@/hooks/useToast';
import { postUiPortMessage, onUiPortMessage } from '@/extension/bridge/ui-port';
import { formatI18nText } from '@/lib/i18n/format';
import { isI18nText } from '@/lib/i18n/text';
import { createId } from '@/lib/utils/id';
import type { I18nText } from '@/types/i18n';
import type { HealthCheckResult } from '@/components/chat/settings/model-manager/ModelManagerHealthDialog';
import type { ApiKeyConnectivityState, PendingApiKeyCheckRequest, Provider } from '@/components/chat/settings/model-manager/shared';
import { splitApiKeysString } from '@/components/chat/settings/model-manager/shared';

type PersistProvidersNow = (
  nextProviders: Provider[],
  options?: { notify?: boolean; source?: 'health-check' | 'api-key-check' },
) => Promise<{ ok: boolean }>;

type UseModelManagerHealthOptions = {
  readonly apiKeysForUi: ReadonlyArray<string>;
  readonly getResolvedProviderHostPatterns: (provider: Provider, modelId?: string) => string[];
  readonly persistProvidersNow: PersistProvidersNow;
  readonly providers: Provider[];
  readonly selected: Provider;
  readonly t: TFunction;
};

/**
 * 内部函数：`toRoundedLatency`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function toRoundedLatency(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.round(value));
}

/**
 * 内部函数：`getHealthError`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function getHealthError(event: { error?: unknown }): I18nText {
  return isI18nText(event.error) ? event.error : { key: 'common.error' };
}

/**
 * 内部函数：`getHealthErrorDetail`。
 *
 * @remarks
 * 从 SW 事件里收口稳定的技术详情；缺失时直接返回 undefined，不再偷换成通用错误。
 */
function getHealthErrorDetail(event: { errorDetail?: unknown }): string | undefined {
  return typeof event.errorDetail === 'string' && event.errorDetail.trim()
    ? event.errorDetail.trim()
    : undefined;
}

/**
 * 导出 Hook：`useModelManagerHealth`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useModelManagerHealth({
  apiKeysForUi,
  getResolvedProviderHostPatterns,
  persistProvidersNow,
  providers,
  selected,
  t,
}: UseModelManagerHealthOptions) {
  const [apiKeyCheckModelId, setApiKeyCheckModelId] = useState<string>('');
  const [apiKeyConnectivity, setApiKeyConnectivity] = useState<Record<string, ApiKeyConnectivityState>>({});
  const apiKeyConnectivityRef = useRef<Record<string, ApiKeyConnectivityState>>({});
  const apiKeyCheckRequestsRef = useRef(new Map<string, PendingApiKeyCheckRequest>());

  const [healthOpen, setHealthOpen] = useState(false);
  const [healthKeyMode, setHealthKeyMode] = useState<'single' | 'all'>('all');
  const [healthKeyIndex, setHealthKeyIndex] = useState(0);
  const [healthConcurrent, setHealthConcurrent] = useState(true);
  const [healthTimeout, setHealthTimeout] = useState(15);
  const [healthRunning, setHealthRunning] = useState(false);
  const [healthResults, setHealthResults] = useState<HealthCheckResult[]>([]);
  const healthRequestIdRef = useRef<string | null>(null);

  const healthKeysForUi = useMemo(() => {
    const keys = splitApiKeysString(selected.apiKey || '');
    return keys.length > 0 ? keys : [''];
  }, [selected.apiKey]);

  const canRunHealthCheck = useMemo(() => (
    Array.isArray(selected.models) && selected.models.length > 0
  ), [selected.models]);

  const isAnyApiKeyChecking = useMemo(() => (
    Object.values(apiKeyConnectivity).some((state) => state?.status === 'checking')
  ), [apiKeyConnectivity]);

  const invalidApiKeyCount = useMemo(() => {
    if (apiKeysForUi.length === 0) return 0;
    let count = 0;
    for (const key of apiKeysForUi) {
      if (apiKeyConnectivity[key]?.status === 'failed') count += 1;
    }
    return count;
  }, [apiKeyConnectivity, apiKeysForUi]);

  const maskHealthKey = useCallback((raw: string) => {
    const value = String(raw || '').trim();
    if (!value) return t('modelManagerPanel.healthDialog.emptyKey');
    if (value.length <= 10) return value;
    return `${value.slice(0, 4)}…${value.slice(-4)}`;
  }, [t]);

  const retainApiKeyConnectivity = useCallback((keys: ReadonlyArray<string>) => {
    setApiKeyConnectivity((prev) => {
      const next: Record<string, ApiKeyConnectivityState> = {};
      for (const key of keys) {
        const value = prev[key];
        if (value) next[key] = value;
      }
      return next;
    });
  }, []);

  const settleApiKeyCheckRequest = useCallback((requestId: string, nextState?: ApiKeyConnectivityState | null) => {
    const pending = apiKeyCheckRequestsRef.current.get(requestId);
    if (!pending) return false;
    apiKeyCheckRequestsRef.current.delete(requestId);
    window.clearTimeout(pending.timeoutId);
    pending.finish(nextState);
    return true;
  }, []);

  const resetApiKeyHealthState = useCallback(() => {
    for (const request of apiKeyCheckRequestsRef.current.values()) {
      request.finish({ status: 'failed', error: { key: 'common.cancelled' } });
    }
    apiKeyCheckRequestsRef.current.clear();
    setApiKeyCheckModelId('');
    setApiKeyConnectivity({});
  }, []);

  const runHealthCheck = useCallback(async () => {
    const models = Array.isArray(selected.models) ? selected.models : [];
    if (models.length === 0) {
      toast.error(t('modelManagerPanel.healthDialog.noModels'));
      return;
    }

    const requestId = createId();
    healthRequestIdRef.current = requestId;

    setHealthRunning(true);
    setHealthResults(models.map((model) => ({
      modelId: model.id,
      modelName: model.name || model.id,
      status: 'pending' as const,
    })));

    const patternSet = new Set<string>();
    for (const model of models) {
      for (const pattern of getResolvedProviderHostPatterns(selected, model.id)) {
        patternSet.add(pattern);
      }
    }

    const persistResult = await persistProvidersNow(providers, {
      notify: true,
      source: 'health-check',
    });
    if (!persistResult.ok) {
      setHealthRunning(false);
      return;
    }

    const timeoutSeconds = Number.isFinite(healthTimeout)
      ? Math.max(5, Math.min(60, Math.floor(healthTimeout)))
      : 15;
    const ok = postUiPortMessage({
      type: 'health/check',
      requestId,
      payload: {
        providerId: selected.id,
        modelIds: models.map((model) => model.id),
        keyCheckMode: healthKeyMode,
        selectedKeyIndex: healthKeyIndex,
        isConcurrent: healthConcurrent,
        timeoutMs: timeoutSeconds * 1000,
      },
    });

    if (!ok) {
      setHealthRunning(false);
      toast.error(t('modelManagerPanel.healthDialog.noPort'));
    }
  }, [
    getResolvedProviderHostPatterns,
    healthConcurrent,
    healthKeyIndex,
    healthKeyMode,
    healthTimeout,
    persistProvidersNow,
    providers,
    selected,
    t,
  ]);

  const abortHealthCheck = useCallback(() => {
    const requestId = healthRequestIdRef.current;
    if (requestId) postUiPortMessage({ type: 'health/abort', requestId });
    healthRequestIdRef.current = null;
    setHealthRunning(false);
  }, []);

  const clearHealthResults = useCallback(() => {
    setHealthResults([]);
  }, []);

  const runApiKeyConnectivityCheck = useCallback(async (index: number) => {
    const key = apiKeysForUi[index];
    if (!key) return;
    if (!apiKeyCheckModelId) {
      toast.error(t('modelManagerPanel.healthDialog.noModels'));
      return;
    }

    getResolvedProviderHostPatterns(selected, apiKeyCheckModelId);

    const persistResult = await persistProvidersNow(providers, {
      notify: true,
      source: 'api-key-check',
    });
    if (!persistResult.ok) {
      setApiKeyConnectivity((prev) => ({
        ...prev,
        [key]: { status: 'failed', error: { key: 'common.error' } },
      }));
      return;
    }

    const requestId = createId();
    setApiKeyConnectivity((prev) => ({
      ...prev,
      [key]: { status: 'checking' },
    }));

    const terminal = await new Promise<'done' | 'aborted' | 'timeout' | 'no-port'>((resolve) => {
      let settled = false;
            /**
       * 内部函数变量：`finish`。
       *
       * @remarks
       * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
       */
      const finish = (status: 'done' | 'aborted' | 'timeout' | 'no-port') => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        apiKeyCheckRequestsRef.current.delete(requestId);
        resolve(status);
      };

      const timer = window.setTimeout(() => {
        finish('timeout');
      }, Math.max(5_000, Math.floor(healthTimeout * 1_000) + 1_000));

      apiKeyCheckRequestsRef.current.set(requestId, {
        key,
        timeoutId: timer,
        finish: (nextState) => {
          if (nextState) {
            setApiKeyConnectivity((prev) => ({
              ...prev,
              [key]: nextState,
            }));
          }
          finish(nextState?.error?.key === 'common.cancelled' ? 'aborted' : 'done');
        },
      });

      const ok = postUiPortMessage({
        type: 'health/check',
        requestId,
        payload: {
          providerId: selected.id,
          modelIds: [apiKeyCheckModelId],
          keyCheckMode: 'single',
          selectedKeyIndex: index,
          isConcurrent: false,
          timeoutMs: Math.max(1_000, Math.floor(healthTimeout * 1_000)),
        },
      });
      if (!ok) finish('no-port');
    });

    if (terminal === 'done') return;

    const error =
      terminal === 'timeout'
        ? ({ key: 'errors.requestTimedOutOrDisconnected' } satisfies I18nText)
        : terminal === 'no-port'
          ? ({ key: 'modelManagerPanel.healthDialog.noPort' } satisfies I18nText)
          : ({ key: 'common.cancelled' } satisfies I18nText);

    setApiKeyConnectivity((prev) => ({
      ...prev,
      [key]: { status: 'failed', error },
    }));
  }, [
    apiKeyCheckModelId,
    apiKeysForUi,
    getResolvedProviderHostPatterns,
    healthTimeout,
    persistProvidersNow,
    providers,
    selected,
    t,
  ]);

  const runAllApiKeyConnectivityChecks = useCallback(async () => {
    if (isAnyApiKeyChecking) return;
    if (apiKeysForUi.length === 0) {
      toast.error(t('modelManagerPanel.apiKey.errorEmpty'));
      return;
    }
    if (!apiKeyCheckModelId) {
      toast.error(t('modelManagerPanel.healthDialog.noModels'));
      return;
    }

    const concurrency = 3;
    let cursor = 0;
        /**
     * 内部函数变量：`runNext`。
     *
     * @remarks
     * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
     */
    const runNext = async (): Promise<void> => {
      const index = cursor++;
      if (index >= apiKeysForUi.length) return;
      await runApiKeyConnectivityCheck(index);
      return runNext();
    };
    const runners = new Array(Math.min(concurrency, apiKeysForUi.length)).fill(0).map(() => runNext());
    await Promise.allSettled(runners);
  }, [apiKeyCheckModelId, apiKeysForUi.length, isAnyApiKeyChecking, runApiKeyConnectivityCheck, t]);

  const removeInvalidApiKeys = useCallback((keys: ReadonlyArray<string>, persistApiKeys: (keys: string[]) => void) => {
    if (isAnyApiKeyChecking) return;
    const invalid = keys.filter((key) => apiKeyConnectivity[key]?.status === 'failed');
    if (invalid.length === 0) return;
    persistApiKeys(keys.filter((key) => apiKeyConnectivity[key]?.status !== 'failed'));
  }, [apiKeyConnectivity, isAnyApiKeyChecking]);

  useEffect(() => {
    apiKeyConnectivityRef.current = apiKeyConnectivity;
  }, [apiKeyConnectivity]);

  useEffect(() => {
    if (healthKeyIndex >= healthKeysForUi.length) setHealthKeyIndex(0);
  }, [healthKeyIndex, healthKeysForUi.length]);

  useEffect(() => {
    const pendingRequests = apiKeyCheckRequestsRef.current;
    const unsub = onUiPortMessage((msg) => {
      if (msg.type !== 'health/model' && msg.type !== 'health/done' && msg.type !== 'health/error') return;

      const requestId = typeof msg.requestId === 'string' ? msg.requestId : '';
      if (!requestId) return;

      const apiKeyRequest = apiKeyCheckRequestsRef.current.get(requestId);
      if (apiKeyRequest && requestId !== healthRequestIdRef.current) {
        if (msg.type === 'health/model') {
          const status = msg.payload.status === 'ok' ? 'success' : 'failed';
          const latency = toRoundedLatency(msg.payload.latency);
          const error = isI18nText(msg.payload.error) ? msg.payload.error : undefined;
          const errorDetail = getHealthErrorDetail(msg.payload);
          const modelId = typeof msg.payload.modelId === 'string' ? msg.payload.modelId : undefined;

          settleApiKeyCheckRequest(requestId, {
            status,
            ...(latency != null ? { latency } : {}),
            ...(error ? { error } : {}),
            ...(errorDetail ? { errorDetail } : {}),
            ...(modelId ? { modelId } : {}),
          });
          return;
        }

        if (msg.type === 'health/error') {
          const error = getHealthError(msg);
          const errorDetail = getHealthErrorDetail(msg);
          settleApiKeyCheckRequest(requestId, {
            status: 'failed',
            error,
            ...(errorDetail ? { errorDetail } : {}),
          });
          toast.error(formatI18nText(t, error));
          return;
        }

        return;
      }

      if (requestId !== healthRequestIdRef.current) return;

      if (msg.type === 'health/model') {
        const modelId = typeof msg.payload.modelId === 'string' ? msg.payload.modelId : '';
        const status = msg.payload.status;
        if (!modelId || (status !== 'ok' && status !== 'partial' && status !== 'error')) return;

        const latency = toRoundedLatency(msg.payload.latency);
        const error = isI18nText(msg.payload.error) ? msg.payload.error : undefined;
        const errorDetail = getHealthErrorDetail(msg.payload);
        const keySummary = msg.payload.keySummary
          && typeof msg.payload.keySummary.total === 'number'
          && Number.isFinite(msg.payload.keySummary.total)
          && typeof msg.payload.keySummary.success === 'number'
          && Number.isFinite(msg.payload.keySummary.success)
          && typeof msg.payload.keySummary.failed === 'number'
          && Number.isFinite(msg.payload.keySummary.failed)
            ? {
                total: Math.max(0, Math.floor(msg.payload.keySummary.total)),
                success: Math.max(0, Math.floor(msg.payload.keySummary.success)),
                failed: Math.max(0, Math.floor(msg.payload.keySummary.failed)),
              }
            : undefined;

        setHealthResults((prev) => prev.map((result) => (
          result.modelId === modelId
            ? {
                ...result,
                status,
                ...(latency !== undefined ? { latency } : {}),
                ...(error ? { error } : {}),
                ...(errorDetail ? { errorDetail } : {}),
                ...(keySummary ? { keySummary } : {}),
              }
            : result
        )));
        return;
      }

      if (msg.type === 'health/error') {
        const error = getHealthError(msg);
        toast.error(formatI18nText(t, error));
      }

      healthRequestIdRef.current = null;
      setHealthRunning(false);
    });
    return () => {
      for (const pending of pendingRequests.values()) {
        pending.finish({ status: 'failed', error: { key: 'common.cancelled' } });
      }
      pendingRequests.clear();
      unsub();
    };
  }, [settleApiKeyCheckRequest, t]);

  return {
    abortHealthCheck,
    apiKeyCheckModelId,
    apiKeyConnectivity,
    canRunHealthCheck,
    clearHealthResults,
    healthConcurrent,
    healthKeyIndex,
    healthKeyMode,
    healthKeysForUi,
    healthOpen,
    healthResults,
    healthRunning,
    healthTimeout,
    invalidApiKeyCount,
    isAnyApiKeyChecking,
    maskHealthKey,
    removeInvalidApiKeys,
    resetApiKeyHealthState,
    retainApiKeyConnectivity,
    runAllApiKeyConnectivityChecks,
    runApiKeyConnectivityCheck,
    runHealthCheck,
    setApiKeyCheckModelId,
    setHealthConcurrent,
    setHealthKeyIndex,
    setHealthKeyMode,
    setHealthOpen,
    setHealthTimeout,
  };
}
