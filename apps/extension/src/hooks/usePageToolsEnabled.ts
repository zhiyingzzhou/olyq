/**
 * 说明：`usePageToolsEnabled` Hook 模块。
 *
 * 职责：
 * - 承载 `usePageToolsEnabled` 相关的当前文件实现与模块边界；
 * - 对外暴露 `UsePageToolsEnabledResult`、`usePageToolsEnabled` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearPageToolsDisabledSites,
  DEFAULT_PAGE_TOOLS_SETTINGS,
  enablePageToolsForSite,
  loadPageToolsSettings,
  setPageToolsEnabled,
  subscribePageToolsSettings,
} from '@/lib/extension/page-tools';

/** `usePageToolsEnabled` 的返回结构。 */
export interface UsePageToolsEnabledResult {
  /** 网页工具总开关的当前值。 */
  enabled: boolean;
  /** 当前被禁用网页工具的精确站点 origin 列表。 */
  disabledSiteOrigins: string[];
  /** 是否已完成首次加载。 */
  loaded: boolean;
  /** 写入新的总开关值。 */
  setEnabled: (next: boolean) => Promise<void>;
  /** 恢复指定站点的网页工具。 */
  enableSite: (pageUrl: string) => Promise<void>;
  /** 清空全部站点级禁用项。 */
  clearDisabledSites: () => Promise<void>;
  /** 重新从存储层拉取一次最新设置。 */
  reload: () => Promise<void>;
}

/**
 * usePageToolsEnabled
 *
 * - 从 chrome.storage.local 读取“网页工具”开关（划词助手/元素选择器等）
 * - 监听 storage 变化，确保设置面板/工具栏/其他入口实时一致
 */
export function usePageToolsEnabled(): UsePageToolsEnabledResult {
  const [enabled, setEnabledState] = useState<boolean>(DEFAULT_PAGE_TOOLS_SETTINGS.enabled);
  const [disabledSiteOrigins, setDisabledSiteOrigins] = useState<string[]>(DEFAULT_PAGE_TOOLS_SETTINGS.disabledSiteOrigins);
  const [loaded, setLoaded] = useState(false);
  /** 标记组件是否仍然挂载，防止异步 reload/订阅回调在卸载后写状态。 */
  const mountedRef = useRef(true);

  /**
   * 从存储层重新读取最新设置。
   *
   * 说明：
   * - 读取结果以 storage 为准，不依赖组件本地缓存；
   * - 卸载后若异步请求才返回，会直接丢弃结果，避免越界 setState。
   */
  const reload = useCallback(async () => {
    const s = await loadPageToolsSettings();
    if (!mountedRef.current) return;
    setEnabledState(Boolean(s.enabled));
    setDisabledSiteOrigins([...s.disabledSiteOrigins]);
    setLoaded(true);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void reload();

    // 统一订阅 storage 回流，保证多个入口改开关时 UI 最终一致。
    const unsub = subscribePageToolsSettings((next) => {
      if (!mountedRef.current) return;
      setEnabledState(Boolean(next.enabled));
      setDisabledSiteOrigins([...next.disabledSiteOrigins]);
      setLoaded(true);
    });

    return () => {
      mountedRef.current = false;
      unsub();
    };
  }, [reload]);

  /**
   * 写入网页工具总开关。
   *
   * 说明：
   * - 最终 UI 状态依赖 storage 订阅回流，不做本地乐观更新；
   * - 这样可以避免多入口同时改值时出现本地状态覆盖最新存储结果。
   */
  const setEnabled = useCallback(async (next: boolean) => {
    // 说明：由 storage.onChanged 驱动最终状态同步，这里不做本地乐观写入，避免并发覆盖。
    await setPageToolsEnabled(Boolean(next));
  }, []);

  /**
   * 恢复单个站点。
   *
   * @param pageUrl - 待恢复的精确 origin 或网页 URL。
   */
  const enableSite = useCallback(async (pageUrl: string) => {
    await enablePageToolsForSite(pageUrl);
  }, []);

  /** 清空全部站点级禁用。 */
  const clearDisabledSites = useCallback(async () => {
    await clearPageToolsDisabledSites();
  }, []);

  return { enabled, disabledSiteOrigins, loaded, setEnabled, enableSite, clearDisabledSites, reload };
}
