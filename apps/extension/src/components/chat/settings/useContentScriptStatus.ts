/**
 * 说明：`useContentScriptStatus` 组件模块。
 *
 * 职责：
 * - 读取 manifest 静态 content script 与安装期网页 host match 状态；
 * - 给设置页、Shadow DOM 面板和开发者面板提供同一份只读快照；
 * - 不再提供网页授权、撤销或动态注册开关入口。
 *
 * 边界：
 * - 本 hook 不调用任何运行时网页授权 API；
 * - 不发送 `content-script/enabled/set` 或 `content-script/refresh`；
 * - 当前页面是否真正可采集仍由各 collector 的 tabs/message handshake 判断。
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/hooks/useToast';
import { formatI18nText } from '@/lib/i18n/format';
import { normalizeI18nText } from '@/lib/i18n/text';
import {
  canSendExtensionMessages,
  readContentScriptStatus,
  type ContentScriptStatusPayload,
} from '@/lib/extension/ui-actions';

/**
 * 生成“运行时不可用”时的兜底状态。
 *
 * @returns 一个不会触发后续注入逻辑的安全占位状态。
 */
function getUnavailableStatus(): ContentScriptStatusPayload {
  return {
    enabled: false,
    registrationMethod: 'none',
    scriptingAvailable: false,
    contentScriptsAvailable: false,
    declaredHostMatches: [],
    registered: false,
    bundledJs: null,
    lastRegistrationError: null,
  };
}

interface UseContentScriptStatusOptions {
  /** 是否在挂载后自动刷新。 */
  autoRefresh?: boolean;
}

/**
 * 统一读取内容脚本静态注入与 网络目标状态。
 *
 * 说明：
 * - 权限页与开发者面板都只通过这一个 hook 取数；
 * - 当前切换为安装期 `http/https` manifest host patterns 后，这里只暴露状态刷新，不暴露授权动作。
 */
export function useContentScriptStatus({ autoRefresh = true }: UseContentScriptStatusOptions = {}) {
  const { t } = useTranslation();
  /** 当前上下文是否具备向 Service Worker 发消息的能力。 */
  const runtimeAvailable = canSendExtensionMessages();

  /** Service Worker 返回的内容脚本状态快照。 */
  const [status, setStatus] = useState<ContentScriptStatusPayload | null>(null);
  /** hook 级异步操作是否执行中。 */
  const [busy, setBusy] = useState(false);
  /** manifest 是否声明了完整的普通网页 host patterns。 */
  const [installTimeWebAccessDeclared, setInstallTimeWebAccessDeclared] = useState<boolean | null>(null);

  /** 刷新站点权限与内容脚本注册状态。 */
  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      if (!runtimeAvailable) {
        setStatus(getUnavailableStatus());
        setInstallTimeWebAccessDeclared(false);
        return;
      }

      const res = await readContentScriptStatus();

      if (!res?.ok) {
        const err = res?.error ? formatI18nText(t, normalizeI18nText(res.error)) : t('common.error');
        toast({ title: t('common.error'), description: err, variant: 'destructive' });
        setStatus(null);
      } else {
        const p = (res.payload && typeof res.payload === 'object') ? (res.payload as Record<string, unknown>) : {};
        const registrationError = p.lastRegistrationError && typeof p.lastRegistrationError === 'object'
          ? p.lastRegistrationError as Record<string, unknown>
          : null;
        const next: ContentScriptStatusPayload = {
          enabled: Boolean(p.enabled),
          registrationMethod:
            (p.registrationMethod === 'static' || p.registrationMethod === 'none')
              ? p.registrationMethod
              : 'none',
          scriptingAvailable: Boolean(p.scriptingAvailable),
          contentScriptsAvailable: Boolean(p.contentScriptsAvailable),
          declaredHostMatches: Array.isArray(p.declaredHostMatches) ? p.declaredHostMatches.map((x) => String(x || '')).filter(Boolean) : [],
          registered: Boolean(p.registered),
          bundledJs: Array.isArray(p.bundledJs) ? p.bundledJs.map((x) => String(x || '')).filter(Boolean) : null,
          lastRegistrationError: registrationError
            ? {
                code:
                  registrationError.code === 'bundle-missing'
                  || registrationError.code === 'stale-loader'
                  || registrationError.code === 'script-fetch-failed'
                  || registrationError.code === 'inject-failed'
                  || registrationError.code === 'register-failed'
                    ? registrationError.code
                    : 'register-failed',
                phase: registrationError.phase === 'injection' ? 'injection' : 'registration',
                level: registrationError.level === 'warn' ? 'warn' : 'error',
                message: String(registrationError.message || '').trim(),
                detail: typeof registrationError.detail === 'string' ? registrationError.detail : undefined,
                reason: String(registrationError.reason || '').trim(),
                at: typeof registrationError.at === 'number' ? registrationError.at : 0,
              }
            : null,
        };
        setStatus(next);
        setInstallTimeWebAccessDeclared(
          next.declaredHostMatches.includes('http://*/*')
          && next.declaredHostMatches.includes('https://*/*'),
        );
      }
    } catch (e: unknown) {
      toast({
        title: t('common.error'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
      setStatus(null);
      setInstallTimeWebAccessDeclared(null);
    } finally {
      setBusy(false);
    }
  }, [runtimeAvailable, t]);

  useEffect(() => {
    if (!autoRefresh) return;
    void refresh();
  }, [autoRefresh, refresh]);

  return {
    runtimeAvailable,
    status,
    busy,
    installTimeWebAccessDeclared,
    refresh,
  };
}
