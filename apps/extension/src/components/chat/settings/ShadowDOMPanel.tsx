/**
 * 说明：`ShadowDOMPanel` 组件模块。
 *
 * 职责：
 * - 承载 `ShadowDOMPanel` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ShadowDOMPanel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Palette, MousePointer, Code, Eye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getExtensionManifestSnapshot,
  readContentScriptStatus,
} from '@/lib/extension/ui-actions';
import { SettingsPanelInset, SettingsPanelRoot, SettingsPanelScroller } from './layout';

/**
 * Shadow DOM 架构说明面板。
 *
 * 用于展示当前扩展在侧边栏、内容脚本和 Offscreen 中的运行方式、
 * Shadow Root 隔离收益以及运行时注入状态。
 */
export function ShadowDOMPanel() {
  const { t } = useTranslation();
  /** 当前 manifest 快照。 */
  const manifest = getExtensionManifestSnapshot();
  /** 是否声明了 Side Panel / Sidebar 宿主。 */
  const hasPanel = Boolean((manifest as unknown as { side_panel?: unknown })?.side_panel)
    || Boolean((manifest as unknown as { sidebar_action?: unknown })?.sidebar_action);
  /** 是否声明了 Offscreen 能力。 */
  const hasOffscreen = Array.isArray((manifest as unknown as { permissions?: unknown[] })?.permissions)
    && ((manifest as unknown as { permissions: unknown[] }).permissions.includes('offscreen'));

  // 彻底切换：manifest 静态 content_scripts 匹配普通 http/https 页面。
  // 真实标签页是否可响应仍由 SW 的 content-script/status/get 与 per-tab handshake 给出。
  const [cs, setCs] = useState<{ enabled: boolean; registered: boolean; declaredHostMatches: number } | null>(null);
  useEffect(() => {
    let alive = true;
    void readContentScriptStatus().then((res) => {
      if (!alive || !res || res.ok !== true || typeof res.payload !== 'object' || !res.payload) {
        setCs(null);
        return;
      }
      const p = res.payload as Record<string, unknown>;
      const enabled = Boolean(p.enabled);
      const registered = Boolean(p.registered);
      const declaredHostMatches = Array.isArray(p.declaredHostMatches) ? p.declaredHostMatches.length : 0;
      setCs({ enabled, registered, declaredHostMatches });
    });
    return () => {
      alive = false;
    };
  }, []);

  /** 内容脚本在运行时是否真正可用。 */
  const contentScriptActive = Boolean(cs?.enabled && cs.registered && (cs.declaredHostMatches ?? 0) > 0);

  return (
    <SettingsPanelRoot>
      <SettingsPanelScroller>
        <SettingsPanelInset>
          <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-1">{t('shadowDomPanel.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('shadowDomPanel.description')}</p>
      </div>

      {/* 架构示意图 */}
      <div className="p-4 rounded-lg border border-border bg-card">
        <h4 className="text-sm font-medium mb-3">{t('shadowDomPanel.architectureTitle')}</h4>
        <div className="space-y-2 text-xs font-mono">
          <div className="p-3 rounded border border-border bg-muted/30">
            <p className="text-muted-foreground mb-2">{t('shadowDomPanel.hostDomComment')}</p>
            <div className="ml-4 p-3 rounded border border-primary/30 bg-primary/5">
              <p className="text-primary mb-2">&lt;olyq-shadow-host&gt;</p>
              <div className="ml-4 p-3 rounded border border-purple-500/30 bg-purple-500/5">
                <p className="text-purple-400 mb-2">{t('shadowDomPanel.shadowRootOpen')}</p>
                <div className="ml-4 space-y-1">
                  <p className="text-muted-foreground">{t('shadowDomPanel.injectedStyleLine')}</p>
                  <div className="p-2 rounded border border-emerald-500/30 bg-emerald-500/5">
                    <p className="text-emerald-400">{t('shadowDomPanel.eventDispatchTitle')}</p>
                    <p className="text-muted-foreground ml-4">{t('shadowDomPanel.eventDispatchFlow')}</p>
                  </div>
                </div>
              </div>
              <p className="text-primary">&lt;/olyq-shadow-host&gt;</p>
            </div>
          </div>
        </div>
      </div>

      {/* 隔离收益 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="min-w-0 p-4 rounded-lg border border-border bg-card text-center">
          <Palette className="h-5 w-5 mx-auto text-blue-400 mb-2" />
          <p className="text-sm font-medium">{t('shadowDomPanel.benefits.style.title')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('shadowDomPanel.benefits.style.desc')}</p>
        </div>
        <div className="min-w-0 p-4 rounded-lg border border-border bg-card text-center">
          <MousePointer className="h-5 w-5 mx-auto text-amber-400 mb-2" />
          <p className="text-sm font-medium">{t('shadowDomPanel.benefits.event.title')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('shadowDomPanel.benefits.event.desc')}</p>
        </div>
        <div className="min-w-0 p-4 rounded-lg border border-border bg-card text-center">
          <Eye className="h-5 w-5 mx-auto text-purple-400 mb-2" />
          <p className="text-sm font-medium">{t('shadowDomPanel.benefits.consistent.title')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('shadowDomPanel.benefits.consistent.desc')}</p>
        </div>
      </div>

      {/* 配置 */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium">{t('shadowDomPanel.currentImplTitle')}</h4>
        <div className="p-4 rounded-lg border border-border bg-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">{t('shadowDomPanel.shadowRootMode')}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t('shadowDomPanel.shadowRootModeDesc')}</p>
            </div>
            <Badge variant="secondary" className="text-xs">open</Badge>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">{t('shadowDomPanel.styleInjection')}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t('shadowDomPanel.styleInjectionDesc')}</p>
            </div>
            <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">{t('common.enabled')}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">{t('shadowDomPanel.reactPortal')}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t('shadowDomPanel.reactPortalDesc')}</p>
            </div>
            <Badge variant="secondary" className="text-xs">{t('common.notUsed')}</Badge>
          </div>
        </div>
      </div>

      {/* 内容脚本注入 */}
      <div className="p-4 rounded-lg border border-border bg-card space-y-3">
        <h4 className="text-sm font-medium">{t('shadowDomPanel.injectionConfigTitle')}</h4>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">{t('shadowDomPanel.table.mode')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('shadowDomPanel.table.desc')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('shadowDomPanel.table.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="px-3 py-2 font-mono">{t('shadowDomPanel.injectionModes.sidePanel')}</td>
                <td className="px-3 py-2 text-muted-foreground">{t('shadowDomPanel.injection.sidePanelDesc')}</td>
                <td className="px-3 py-2">
                  <Badge className={`${hasPanel ? 'bg-emerald-500/20 text-emerald-400' : ''} text-xs`} variant={hasPanel ? 'default' : 'secondary'}>
                    {hasPanel ? t('common.enabled') : t('common.disabled')}
                  </Badge>
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">{t('shadowDomPanel.injectionModes.contentScript')}</td>
                <td className="px-3 py-2 text-muted-foreground">{t('shadowDomPanel.injection.contentScriptDesc')}</td>
                <td className="px-3 py-2">
                  <Badge className={`${contentScriptActive ? 'bg-emerald-500/20 text-emerald-400' : ''} text-xs`} variant={contentScriptActive ? 'default' : 'secondary'}>
                    {contentScriptActive ? t('common.enabled') : t('common.disabled')}
                  </Badge>
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">{t('shadowDomPanel.injectionModes.offscreen')}</td>
                <td className="px-3 py-2 text-muted-foreground">{t('shadowDomPanel.injection.offscreenDesc')}</td>
                <td className="px-3 py-2">
                  <Badge className={`${hasOffscreen ? 'bg-emerald-500/20 text-emerald-400' : ''} text-xs`} variant={hasOffscreen ? 'default' : 'secondary'}>
                    {hasOffscreen ? t('common.enabled') : t('common.disabled')}
                  </Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 代码示例 */}
      <div className="p-4 rounded-lg border border-border bg-card space-y-2">
        <div className="flex items-center gap-2">
          <Code className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">{t('shadowDomPanel.coreCodeTitle')}</h4>
        </div>
        <div className="p-3 rounded bg-muted/50 font-mono text-xs text-muted-foreground overflow-x-auto">
          <pre>{`// src/extension/content-script/index.ts（节选）
const host = ensureHost();
const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
// 在 shadow 内注入 <style> 与菜单 DOM，所有交互通过 sendMessage 走 SW`}</pre>
        </div>
      </div>
          </div>
        </SettingsPanelInset>
      </SettingsPanelScroller>
    </SettingsPanelRoot>
  );
}
