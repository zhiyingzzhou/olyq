/**
 * 说明：`ServiceWorkerPanel` 组件模块。
 *
 * 职责：
 * - 承载 `ServiceWorkerPanel` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ServiceWorkerPanel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Activity, Clock, Heart, CheckCircle, Zap } from 'lucide-react';
import { postUiPortMessage } from '@/extension/bridge/ui-port';
import { readSwKeepAliveConfig } from '@/lib/extension/ui-actions';
import { normalizeSwKeepAliveConfig, type SwKeepAliveConfig } from '@/lib/extension/sw-keepalive-config';
import { createId } from '@/lib/utils/id';
import { useTranslation } from 'react-i18next';
import { SettingsPanelInset, SettingsPanelRoot, SettingsPanelScroller } from './layout';
import { useSwStatusPoller } from './useSwStatusPoller';

/**
 * Service Worker 设置与状态面板。
 *
 * 负责展示线程活跃状态、保活策略与持久化能力，
 * 同时通过 UI Port 与后台交换实时状态和保活配置。
 */
export function ServiceWorkerPanel() {
  const { t } = useTranslation();
  /** 是否启用 alarms 保活。 */
  const [alarmsEnabled, setAlarmsEnabled] = useState(true);
  /** alarms 保活周期，单位分钟。 */
  const [periodInMinutes, setPeriodInMinutes] = useState(1);
  /** 最近一次从后台拿到的 Service Worker 状态快照。 */
  const { portReady, status } = useSwStatusPoller({ intervalMs: 1500 });

  /**
   * 格式化持续时长。
   *
   * @param ms - 毫秒时长。
   * @returns 适合 UI 展示的“分:秒”文案。
   */
  const formatDuration = (ms: number) => {
    const sec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return t('serviceWorkerPanel.time.duration', { minutes: m, seconds: String(s).padStart(2, '0') });
  };

  useEffect(() => {
    let alive = true;
    void readSwKeepAliveConfig().then((res) => {
      if (!alive || !res || res.ok !== true || typeof res.payload !== 'object' || !res.payload) return;
      const cfg = normalizeSwKeepAliveConfig(res.payload);
      setAlarmsEnabled(cfg.alarmsEnabled);
      setPeriodInMinutes(cfg.periodInMinutes);
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * 更新后台保活配置。
   *
   * @param next - 新的保活配置。
   */
  const setKeepAlive = (next: SwKeepAliveConfig) => {
    const cfg = normalizeSwKeepAliveConfig(next);
    setAlarmsEnabled(cfg.alarmsEnabled);
    setPeriodInMinutes(cfg.periodInMinutes);
    const requestId = createId();
    postUiPortMessage({ type: 'sw/keepalive/set', requestId, payload: cfg });
  };

  /** 当前线程状态标签。 */
  const workerStatus = useMemo(() => {
    if (!portReady) return 'unavailable';
    return status ? 'active' : 'unknown';
  }, [portReady, status]);

  /** 当前线程已运行时长。 */
  const uptime = status ? formatDuration(Date.now() - status.startedAt) : '—';
  /** 距离最近一次 alarm 事件的时间。 */
  const lastEvent = status?.lastAlarmAt
    ? t('serviceWorkerPanel.time.ago', { duration: formatDuration(Date.now() - status.lastAlarmAt) })
    : '—';

  return (
    <SettingsPanelRoot>
      <SettingsPanelScroller>
        <SettingsPanelInset>
          <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-1">{t('serviceWorkerPanel.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('serviceWorkerPanel.description')}</p>
      </div>

      {/* 状态面板 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="min-w-0 p-4 rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-muted-foreground">{t('serviceWorkerPanel.status.threadStatus')}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={workerStatus === 'active' ? 'default' : 'secondary'} className="text-xs">
              {workerStatus === 'active'
                ? t('serviceWorkerPanel.status.active')
                : workerStatus === 'unavailable'
                  ? t('serviceWorkerPanel.status.unavailable')
                  : t('serviceWorkerPanel.status.unknown')}
            </Badge>
          </div>
        </div>
        <div className="min-w-0 p-4 rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">{t('serviceWorkerPanel.status.uptime')}</span>
          </div>
          <p className="text-sm font-medium break-words">{uptime}</p>
        </div>
        <div className="min-w-0 p-4 rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <span className="text-xs text-muted-foreground">{t('serviceWorkerPanel.status.lastEvent')}</span>
          </div>
          <p className="text-sm font-medium break-words">{lastEvent}</p>
        </div>
      </div>

      {/* 生命周期状态表 */}
      <div>
        <h4 className="text-sm font-medium mb-3">{t('serviceWorkerPanel.lifecycle.title')}</h4>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">{t('serviceWorkerPanel.lifecycle.table.state')}</th>
                <th className="text-left px-4 py-2 font-medium">{t('serviceWorkerPanel.lifecycle.table.trigger')}</th>
                <th className="text-left px-4 py-2 font-medium">{t('serviceWorkerPanel.lifecycle.table.impact')}</th>
                <th className="text-left px-4 py-2 font-medium">{t('serviceWorkerPanel.lifecycle.table.strategy')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="px-4 py-2">
                  <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">{t('serviceWorkerPanel.lifecycle.rows.active.state')}</Badge>
                </td>
                <td className="px-4 py-2 text-muted-foreground">{t('serviceWorkerPanel.lifecycle.rows.active.trigger')}</td>
                <td className="px-4 py-2 text-muted-foreground">{t('serviceWorkerPanel.lifecycle.rows.active.impact')}</td>
                <td className="px-4 py-2 text-muted-foreground">{t('serviceWorkerPanel.lifecycle.rows.active.strategy')}</td>
              </tr>
              <tr>
                <td className="px-4 py-2">
                  <Badge className="bg-amber-500/20 text-amber-400 text-xs">{t('serviceWorkerPanel.lifecycle.rows.idle.state')}</Badge>
                </td>
                <td className="px-4 py-2 text-muted-foreground">{t('serviceWorkerPanel.lifecycle.rows.idle.trigger')}</td>
                <td className="px-4 py-2 text-muted-foreground">{t('serviceWorkerPanel.lifecycle.rows.idle.impact')}</td>
                <td className="px-4 py-2 text-muted-foreground">{t('serviceWorkerPanel.lifecycle.rows.idle.strategy')}</td>
              </tr>
              <tr>
                <td className="px-4 py-2">
                  <Badge className="bg-red-500/20 text-red-400 text-xs">{t('serviceWorkerPanel.lifecycle.rows.terminated.state')}</Badge>
                </td>
                <td className="px-4 py-2 text-muted-foreground">{t('serviceWorkerPanel.lifecycle.rows.terminated.trigger')}</td>
                <td className="px-4 py-2 text-muted-foreground">{t('serviceWorkerPanel.lifecycle.rows.terminated.impact')}</td>
                <td className="px-4 py-2 text-muted-foreground">{t('serviceWorkerPanel.lifecycle.rows.terminated.strategy')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 保活设置 */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium">{t('serviceWorkerPanel.keepalive.title')}</h4>

        <div className="space-y-4 p-4 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Heart className="h-4 w-4 text-red-400" />
              <div>
                <Label className="text-sm">{t('serviceWorkerPanel.keepalive.alarms.title')}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{t('serviceWorkerPanel.keepalive.alarms.desc')}</p>
              </div>
            </div>
            <Switch checked={alarmsEnabled} onCheckedChange={(v) => setKeepAlive({ alarmsEnabled: v, periodInMinutes })} />
          </div>
          {alarmsEnabled && (
            <div className="ml-7 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">{t('serviceWorkerPanel.keepalive.alarms.interval')}</Label>
                <span className="text-xs text-muted-foreground">
                  {t('serviceWorkerPanel.keepalive.alarms.intervalValue', { count: periodInMinutes })}
                </span>
              </div>
              <Slider
                value={[periodInMinutes]}
                min={1}
                max={10}
                step={1}
                onValueChange={([v]) => setKeepAlive({ alarmsEnabled, periodInMinutes: v })}
              />
            </div>
          )}
        </div>

        <div className="space-y-4 p-4 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-4 w-4 text-blue-400" />
              <div>
                <Label className="text-sm">{t('serviceWorkerPanel.keepalive.port.title')}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{t('serviceWorkerPanel.keepalive.port.desc')}</p>
              </div>
            </div>
            <Badge variant="secondary" className="text-xs">
              {status?.uiPortCount
                ? t('serviceWorkerPanel.keepalive.port.connected', { count: status.uiPortCount })
                : t('serviceWorkerPanel.keepalive.port.disconnected')}
            </Badge>
          </div>
        </div>
      </div>

      {/* 持久化配置 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">{t('serviceWorkerPanel.persistence.title')}</h4>
        <div className="p-4 rounded-lg border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">{t('serviceWorkerPanel.persistence.autoSave.title')}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t('serviceWorkerPanel.persistence.autoSave.desc')}</p>
            </div>
            <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">{t('common.enabled')}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">{t('serviceWorkerPanel.persistence.recovery.title')}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t('serviceWorkerPanel.persistence.recovery.desc')}</p>
            </div>
            <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">{t('common.enabled')}</Badge>
          </div>
        </div>
      </div>
          </div>
        </SettingsPanelInset>
      </SettingsPanelScroller>
    </SettingsPanelRoot>
  );
}
