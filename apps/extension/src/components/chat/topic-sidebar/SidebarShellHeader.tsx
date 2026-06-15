/**
 * 说明：`SidebarShellHeader` 组件模块。
 *
 * 职责：
 * - 承载 `SidebarShellHeader` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SidebarShellHeader` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { ExternalLink, PanelLeftClose } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { TooltipAction } from '@/components/ui/tooltip-action';

interface SidebarShellHeaderProps {
  onOpenInNewTab?: () => void;
  onToggleCollapse?: () => void;
}

/** 侧边栏公共外壳头部：只承载宿主动作，品牌交给浏览器外壳、manifest 与页面 title。 */
export function SidebarShellHeader({
  onOpenInNewTab,
  onToggleCollapse,
}: SidebarShellHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 px-3">
      <div className="min-w-0 flex-1" aria-hidden="true" />
      {onOpenInNewTab && (
        <TooltipAction tooltip={t('sidebar.openInNewTab')}>
          <button
            type="button"
            onClick={onOpenInNewTab}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
        </TooltipAction>
      )}
      {onToggleCollapse && (
        <TooltipAction tooltip={t('sidebar.collapse')} side="right">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </TooltipAction>
      )}
    </div>
  );
}
