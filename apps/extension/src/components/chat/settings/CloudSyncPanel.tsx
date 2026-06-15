/**
 * 说明：`CloudSyncPanel` 组件模块。
 *
 * 职责：
 * - 承载 `CloudSyncPanel` 相关的当前文件实现与模块边界；
 * - 对外暴露 `CloudSyncPanel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Database, HardDrive, Globe, Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { DataDirContent } from './cloud-sync/DataDirContent';
import { LocalBackupContent } from './cloud-sync/LocalBackupContent';
import { WebDAVContent } from './cloud-sync/WebDAVContent';
import { S3Content } from './cloud-sync/S3Content';

/** 云同步面板内部子页签。 */
type SubTab = 'data-dir' | 'local-backup' | 'webdav' | 's3';

/** 云同步导航分组配置。 */
const navSections = [
  {
    labelKey: 'cloudSyncPanel.nav.sections.base',
    items: [
      { id: 'data-dir' as SubTab, labelKey: 'cloudSyncPanel.nav.items.dataDir', icon: Database },
    ],
  },
  {
    labelKey: 'cloudSyncPanel.nav.sections.backup',
    items: [
      { id: 'local-backup' as SubTab, labelKey: 'cloudSyncPanel.nav.items.localBackup', icon: HardDrive },
      { id: 'webdav' as SubTab, labelKey: 'cloudSyncPanel.nav.items.webdav', icon: Globe },
      { id: 's3' as SubTab, labelKey: 'cloudSyncPanel.nav.items.s3', icon: Server },
    ],
  },
];

/**
 * 云同步与备份面板。
 *
 * 负责左侧导航和右侧子面板切换，不直接实现各同步协议逻辑；
 * 实际的数据目录、备份和云端配置能力由子内容组件承载。
 */
export function CloudSyncPanel() {
  const { t } = useTranslation();
  /** 当前选中的子页签。 */
  const [activeTab, setActiveTab] = useState<SubTab>('data-dir');
  const activeItem = navSections.flatMap((section) => section.items).find((item) => item.id === activeTab)
    ?? navSections[0].items[0];
  const ActiveIcon = activeItem.icon;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-0 px-6 py-6 min-[720px]:flex-row">
        <div
          data-testid="cloud-sync-compact-nav"
          className="mb-4 shrink-0 min-[720px]:hidden"
        >
          <Select value={activeTab} onValueChange={(value) => setActiveTab(value as SubTab)}>
            <SelectTrigger aria-label={t('settings.cloudSync')} className="h-9 w-full bg-background text-sm">
              <div
                data-testid="cloud-sync-compact-select-value"
                className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden"
              >
                <ActiveIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{t(activeItem.labelKey)}</span>
              </div>
            </SelectTrigger>
            <SelectContent align="start">
              {navSections.flatMap((section) => section.items).map((item) => {
                const Icon = item.icon;
                return (
                  <SelectItem key={item.id} value={item.id}>
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{t(item.labelKey)}</span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        {/* 左侧导航 */}
        <div className="hidden w-48 shrink-0 overflow-y-auto border-r border-border/50 pr-1 min-[720px]:block">
          {navSections.map((section, idx) => (
            <div key={section.labelKey} className={cn(idx > 0 && 'mt-4')}>
              <p className="text-xs text-muted-foreground/70 px-3 mb-1.5 uppercase tracking-wider">{t(section.labelKey)}</p>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      'flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm transition-colors text-left',
                      isActive
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {t(item.labelKey)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* 右侧内容 */}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto min-[720px]:pl-5">
          {activeTab === 'data-dir' && <DataDirContent />}
          {activeTab === 'local-backup' && <LocalBackupContent />}
          {activeTab === 'webdav' && <WebDAVContent />}
          {activeTab === 's3' && <S3Content />}
        </div>
      </div>
    </div>
  );
}
