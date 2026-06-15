/**
 * 说明：`shared` 组件模块。
 *
 * 职责：
 * - 承载 `shared` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SettingsCardProps`、`SettingsCard`、`SettingsSection`、`SettingsRowProps` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { normalizeSyncIntervalMinutes, normalizeMaxBackups, SYNC_INTERVAL_MINUTES_OPTIONS } from '@/lib/sync/normalize';

const MAX_BACKUPS_OPTIONS = [0, 1, 3, 5, 10, 20, 50] as const;

/**
 * 生成自动同步间隔的展示文案。
 *
 * @param t - 国际化函数。
 * @param minutes - 规范化后的分钟数。
 * @returns 面向用户展示的同步间隔标签。
 */
function syncIntervalLabel(t: (key: string, opts?: Record<string, unknown>) => string, minutes: number) {
  if (minutes <= 0) return t('cloudSyncPanel.autoSync.off');
  if (minutes < 60) return t('cloudSyncPanel.autoSync.minute_interval', { count: minutes });
  if (minutes % 60 === 0) return t('cloudSyncPanel.autoSync.hour_interval', { count: minutes / 60 });
  return `${minutes} min`;
}

/**
 * 生成备份保留数量的展示文案。
 *
 * @param t - 国际化函数。
 * @param n - 最大备份数。
 * @returns `0` 会被解释为“不限”。
 */
function maxBackupsLabel(t: (key: string, opts?: Record<string, unknown>) => string, n: number) {
  if (n <= 0) return t('cloudSyncPanel.maxBackups.unlimited');
  return String(n);
}

/**
 * 云同步设置区块容器属性。
 */
export interface SettingsCardProps {
  /**
   * 卡片标题。
   */
  title: string;
  /**
   * 卡片内部设置项内容。
   */
  children: React.ReactNode;
}

/**
 * 云同步设置面板中的卡片容器。
 *
 * @param props - 卡片标题与内容。
 * @returns 统一样式的设置区块。
 */
export function SettingsCard({ title, children }: SettingsCardProps) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm">
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
      </div>
      <div className="border-t border-border/30" />
      <div className="p-4 space-y-4">
        {children}
      </div>
    </div>
  );
}

/**
 * 设置分组容器属性。
 */
export interface SettingsSectionProps {
  /**
   * 分组标题。
   */
  title?: React.ReactNode;
  /**
   * 分组说明。
   */
  description?: React.ReactNode;
  /**
   * 分组内的设置项。
   */
  children: React.ReactNode;
}

/**
 * 云同步设置面板中的分组容器。
 *
 * 用途：
 * - 把“授权 / 快照备份 / 状态同步”这类不同语义的设置项明确分段；
 * - 让 provider 面板在不复制样式细节的前提下复用同一套信息层级。
 *
 * @param props - 分组标题、说明与内部设置项。
 * @returns 带标题说明与统一分隔线的设置分组。
 */
export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section className="space-y-2">
      {(title || description) && (
        <div className="space-y-1">
          {title ? <h4 className="text-sm font-semibold text-foreground">{title}</h4> : null}
          {description ? <p className="text-xs leading-relaxed text-muted-foreground/80">{description}</p> : null}
        </div>
      )}
      <div className="divide-y divide-border/30">
        {children}
      </div>
    </section>
  );
}

/**
 * 单条设置项行属性。
 */
export interface SettingsRowProps {
  /**
   * 左侧主标签。
   */
  label: React.ReactNode;
  /**
   * 左侧补充说明。
   */
  description?: string;
  /**
   * 右侧交互控件。
   */
  children: React.ReactNode;
}

/**
 * 云同步设置面板中的通用设置行。
 *
 * @param props - 标签、说明与右侧控件。
 * @returns 一条左右分栏的设置项布局。
 */
export function SettingsRow({
  label,
  description,
  children,
}: SettingsRowProps) {
  return (
    <div className="settings-responsive-row grid min-h-[48px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
      <div className="settings-responsive-lead min-w-0">
        <Label className="text-sm font-medium text-foreground/90">{label}</Label>
        {description && (
          <p className="text-xs text-muted-foreground/80 mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="settings-responsive-control min-w-0 shrink-0 justify-self-end">{children}</div>
    </div>
  );
}

/**
 * 自动同步间隔选择器属性。
 */
export interface SyncIntervalSelectProps {
  /**
   * 当前选中的同步间隔（分钟）。
   */
  value: number;
  /**
   * 选择变化后的回调，入参始终为规范化后的分钟数。
   */
  onChange: (v: number) => void;
}

/**
 * 自动同步间隔下拉框。
 *
 * @param props - 当前值与变更回调。
 * @returns 可直接用于设置面板的选择器组件。
 */
export function SyncIntervalSelect({ value, onChange }: SyncIntervalSelectProps) {
  const { t } = useTranslation();
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(normalizeSyncIntervalMinutes(Number(v)))}>
      <SelectTrigger className="h-8 w-32 text-sm"><SelectValue /></SelectTrigger>
      <SelectContent>
        {SYNC_INTERVAL_MINUTES_OPTIONS.map((m) => (
          <SelectItem key={m} value={String(m)}>{syncIntervalLabel(t, m)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * 最大备份数选择器属性。
 */
export interface MaxBackupsSelectProps {
  /**
   * 当前保留的最大备份数量，`0` 表示不限。
   */
  value: number;
  /**
   * 选择变化后的回调，入参为规范化后的数量。
   */
  onChange: (v: number) => void;
}

/**
 * 最大备份数下拉框。
 *
 * @param props - 当前值与变更回调。
 * @returns 可直接用于设置面板的选择器组件。
 */
export function MaxBackupsSelect({ value, onChange }: MaxBackupsSelectProps) {
  const { t } = useTranslation();
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(normalizeMaxBackups(Number(v)))}>
      <SelectTrigger className="h-8 w-24 text-sm"><SelectValue /></SelectTrigger>
      <SelectContent>
        {MAX_BACKUPS_OPTIONS.map((n) => (
          <SelectItem key={n} value={String(n)}>{maxBackupsLabel(t, n)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * 多设备同步立即执行按钮属性。
 */
export interface SyncNowButtonProps {
  /**
   * 当前是否正在执行同步。
   */
  syncing: boolean;
  /**
   * 外部业务是否禁用按钮，例如 provider 配置不完整。
   */
  disabled: boolean;
  /**
   * 用户点击按钮时触发的一次性同步动作。
   */
  onClick: () => void;
  /**
   * 按钮内的可见文案。
   */
  children: React.ReactNode;
}

/**
 * 云同步面板共用的“同步当前状态”按钮。
 *
 * 说明：
 * - WebDAV 与 S3 的多设备同步是同一个用户动作，视觉上统一使用 outline 按钮；
 * - 边框由共享组件固定承载，避免 provider 面板之间再次出现一个像文本、一个像按钮的漂移。
 *
 * @param props - 同步状态、禁用态、点击回调与按钮文案。
 * @returns 带边框和同步中 spinner 的按钮。
 */
export function SyncNowButton({ syncing, disabled, onClick, children }: SyncNowButtonProps) {
  return (
    <Button variant="outline" size="sm" className="gap-1.5 whitespace-nowrap" disabled={disabled || syncing} onClick={onClick}>
      {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </Button>
  );
}

/**
 * 密码输入框属性。
 */
export interface PasswordInputProps {
  /**
   * 当前输入值。
   */
  value: string;
  /**
   * 文本变化时的回调。
   */
  onChange: (v: string) => void;
  /**
   * 输入框占位文案。
   */
  placeholder?: string;
  /**
   * 当前是否显示明文。
   */
  show: boolean;
  /**
   * 点击眼睛按钮时切换显示状态的回调。
   */
  onToggle: () => void;
}

/**
 * 带明文切换按钮的密码输入框。
 *
 * @param props - 当前值、占位文案与显示状态控制器。
 * @returns 云同步凭证输入场景复用的密码控件。
 */
export function PasswordInput({ value, onChange, placeholder, show, onToggle }: PasswordInputProps) {
  return (
    <div className="relative min-w-0">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        className="h-8 w-56 text-sm pr-9"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
