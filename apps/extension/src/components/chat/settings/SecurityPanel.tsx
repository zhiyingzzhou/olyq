/**
 * 说明：`SecurityPanel` 组件模块。
 *
 * 职责：
 * - 承载 `SecurityPanel` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SecurityPanel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { getExtensionManifestSnapshot } from '@/lib/extension/ui-actions';
import { hasInstallTimeWebHostPatterns } from '@/lib/extension/host-match-patterns';
import { Shield, Key, FileWarning, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingsPanelInset, SettingsPanelRoot, SettingsPanelScroller } from './layout';

/**
 * 安全面板。
 *
 * 该面板只做“只读审计”展示：
 * - 读取 manifest 中的 CSP、权限与可访问资源；
 * - 只展示安装期声明，不读取运行时可选网页授权状态；
 * - 不提供任何看似能改、实际无效的开关，避免误导用户。
 */
export function SecurityPanel() {
  const { t } = useTranslation();
  /** 当前扩展 manifest 快照。 */
  const manifest = getExtensionManifestSnapshot();

  /** 解析后的扩展页 CSP 文案。 */
  const csp =
    typeof manifest?.content_security_policy === 'string'
      ? manifest.content_security_policy
      : typeof manifest?.content_security_policy === 'object' && manifest?.content_security_policy
        ? (manifest.content_security_policy as Record<string, unknown>).extension_pages
        : null;

  const permissions = Array.isArray(manifest?.permissions) ? manifest!.permissions : [];
  const hostPermissions = Array.isArray((manifest as unknown as { host_permissions?: unknown })?.host_permissions)
    ? ((manifest as unknown as { host_permissions: string[] }).host_permissions)
    : [];
  const installTimeWebAccessDeclared = hasInstallTimeWebHostPatterns(hostPermissions);

  /** manifest 声明的 web_accessible_resources 资源清单。 */
  const war = Array.isArray((manifest as unknown as { web_accessible_resources?: unknown })?.web_accessible_resources)
    ? ((manifest as unknown as { web_accessible_resources: Array<{ resources?: string[] }> }).web_accessible_resources)
    : [];
  /** 扁平化后的 web accessible resources 资源路径。 */
  const warResources = war.flatMap((x) => Array.isArray(x.resources) ? x.resources : []);

  return (
    <SettingsPanelRoot>
      <SettingsPanelScroller>
        <SettingsPanelInset>
          <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-1">{t('securityPanel.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('securityPanel.description')}</p>
      </div>

      {/* 内容安全策略配置 */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium">{t('securityPanel.csp.title')}</h4>
        <div className="p-4 rounded-lg border border-border bg-card space-y-4">
          <div>
            <Label className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-500" />
              {t('securityPanel.csp.extensionPages')}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">{t('securityPanel.csp.note')}</p>
          </div>
          <div className="p-3 rounded bg-muted/50 font-mono text-xs text-muted-foreground break-all">
            {typeof csp === 'string' && csp.trim() ? csp : t('securityPanel.csp.missing')}
          </div>
        </div>
      </div>

      {/* 权限 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">{t('securityPanel.permissions.title')}</h4>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">{t('securityPanel.permissions.table.permission')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('securityPanel.permissions.table.type')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('securityPanel.permissions.table.source')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {permissions.map((name) => (
                <tr key={`perm:${name}`}>
                  <td className="px-3 py-2 font-mono">{name}</td>
                  <td className="px-3 py-2"><Badge variant="secondary" className="text-xs">{t('securityPanel.permissions.typeLabels.permissions')}</Badge></td>
                  <td className="px-3 py-2 text-muted-foreground">{t('securityPanel.permissions.sourceLabels.manifest')}</td>
                </tr>
              ))}
              {hostPermissions.map((name) => (
                <tr key={`host:${name}`}>
                  <td className="px-3 py-2 font-mono">{name}</td>
                  <td className="px-3 py-2"><Badge variant="secondary" className="text-xs">{t('securityPanel.permissions.typeLabels.hostPermissions')}</Badge></td>
                  <td className="px-3 py-2 text-muted-foreground">{t('securityPanel.permissions.sourceLabels.manifest')}</td>
                </tr>
              ))}
              {permissions.length === 0 && hostPermissions.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-muted-foreground" colSpan={3}>{t('securityPanel.permissions.missing')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 安装期普通网页访问声明 */}
      <div className="p-4 rounded-lg border border-border bg-card space-y-3">
        <h4 className="text-sm font-medium">{t('securityPanel.installTimeWebAccess.title')}</h4>
        <p className="text-xs text-muted-foreground">{t('securityPanel.installTimeWebAccess.description')}</p>
        <div className="flex items-center justify-between gap-2">
          <Badge variant={installTimeWebAccessDeclared ? 'default' : 'secondary'} className="text-xs">
            {installTimeWebAccessDeclared
              ? t('securityPanel.installTimeWebAccess.declared')
              : t('securityPanel.installTimeWebAccess.missing')}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {hostPermissions.length > 0
              ? t('securityPanel.installTimeWebAccess.count', { count: hostPermissions.length })
              : '—'}
          </span>
        </div>
      </div>

      {/* 可访问资源声明 */}
      <div className="p-4 rounded-lg border border-border bg-card space-y-3">
        <h4 className="text-sm font-medium">{t('securityPanel.webAccessibleResources.title')}</h4>
        <p className="text-xs text-muted-foreground">{t('securityPanel.webAccessibleResources.description')}</p>
        <div className="p-3 rounded bg-muted/50 font-mono text-xs text-muted-foreground space-y-1">
          {warResources.length > 0 ? warResources.map((r) => <p key={r}>{r}</p>) : <p>{t('securityPanel.webAccessibleResources.none')}</p>}
        </div>
      </div>

      <div className="p-4 rounded-lg border border-border bg-card space-y-3">
        <h4 className="text-sm font-medium">{t('securityPanel.credentials.title')}</h4>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Key className="h-4 w-4 text-amber-400" />
            <div>
              <Label className="text-sm">{t('securityPanel.credentials.modelApiKey')}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t('securityPanel.credentials.modelApiKeyDesc')}</p>
            </div>
          </div>
          <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">{t('common.enabled')}</Badge>
        </div>
      </div>

      <div className="p-4 rounded-lg border border-border bg-card space-y-3">
        <h4 className="text-sm font-medium">{t('securityPanel.networkTips.title')}</h4>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Globe className="h-4 w-4" />
          <span>{t('securityPanel.networkTips.allUrls')}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileWarning className="h-4 w-4" />
          <span>{t('securityPanel.networkTips.audit')}</span>
        </div>
      </div>
          </div>
        </SettingsPanelInset>
      </SettingsPanelScroller>
    </SettingsPanelRoot>
  );
}
