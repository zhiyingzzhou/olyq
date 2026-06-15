/**
 * 说明：`PerformancePanel` 组件模块。
 *
 * 职责：
 * - 承载 `PerformancePanel` 相关的当前文件实现与模块边界；
 * - 对外暴露 `PerformancePanel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { Cpu, HardDrive, MemoryStick, Layers, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChromeStorageConfig } from '@/hooks/useChromeStorageConfig';
import {
  canReadSystemCpuUsageTotals,
  readSystemCpuUsageTotals,
  type SystemCpuUsageTotals,
} from '@/lib/extension/ui-actions';
import {
  DEFAULT_OFFSCREEN_UNLOAD_CONFIG,
  OFFSCREEN_UNLOAD_CONFIG_KEY,
  normalizeOffscreenUnloadConfig,
  type OffscreenUnloadConfig,
} from '@/lib/extension/offscreen-unload-config';
import { SettingsPanelInset, SettingsPanelRoot, SettingsPanelScroller } from './layout';
import { useSwStatusPoller } from './useSwStatusPoller';

type CpuMetricState =
  | { status: 'loading' }
  | { status: 'ready'; pct: number }
  | { status: 'unavailable' };

/**
 * 性能面板。
 *
 * 展示运行时 CPU、堆内存、存储占用与后台状态，
 * 同时允许用户配置自动卸载 Offscreen 的资源回收策略。
 */
export function PerformancePanel() {
  const { t } = useTranslation();
  const cpuSupported = canReadSystemCpuUsageTotals();
  const [unloadConfig, patchUnloadConfig] = useChromeStorageConfig<OffscreenUnloadConfig>(
    OFFSCREEN_UNLOAD_CONFIG_KEY,
    DEFAULT_OFFSCREEN_UNLOAD_CONFIG,
    (raw) => normalizeOffscreenUnloadConfig(raw),
  );

  /** 是否允许后台在空闲时自动关闭 Offscreen。 */
  const autoUnload = unloadConfig.autoUnload;
  /** 空闲超时阈值，单位秒。 */
  const idleTimeout = unloadConfig.idleTimeout;

  /** 当前页面 JS Heap 使用情况。 */
  const [heap, setHeap] = useState<{ usedMB: number; limitMB: number } | null>(null);
  /** 当前站点存储用量估算。 */
  const [storage, setStorage] = useState<{ usedMB: number; quotaMB: number } | null>(null);
  /** 当前 CPU 卡片的展示状态。 */
  const [cpu, setCpu] = useState<CpuMetricState>(() =>
    cpuSupported ? { status: 'loading' } : { status: 'unavailable' },
  );
  /** 后台 Service Worker / Offscreen 状态。 */
  const { status: sw } = useSwStatusPoller({ intervalMs: 2000 });

  useEffect(() => {
    // 读取 JS Heap（Chrome 才会暴露 performance.memory；其它环境返回 null）
    /** 读取当前页面的 JS Heap 使用量，并转换为 MB 供仪表盘展示。 */
    const readHeap = () => {
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      if (!mem) return setHeap(null);
      const usedMB = mem.usedJSHeapSize / 1024 / 1024;
      const limitMB = mem.jsHeapSizeLimit / 1024 / 1024;
      setHeap({ usedMB, limitMB });
    };
    readHeap();
    const t = window.setInterval(readHeap, 2000);
    return () => window.clearInterval(t);
  }, []);

  // 系统 CPU 使用率（基于 chrome.system.cpu 累计时间差分的估算值）
  const prevCpuRef = useRef<SystemCpuUsageTotals | null>(null);
  useEffect(() => {
    if (!cpuSupported) {
      prevCpuRef.current = null;
      setCpu({ status: 'unavailable' });
      return;
    }
    setCpu({ status: 'loading' });
    prevCpuRef.current = null;
    let alive = true;
    /**
     * 将 CPU 卡片切到不可用状态。
     *
     * 说明：系统 CPU 数据只服务展示，不参与 offscreen 回收决策；读取失败时保持静默降级。
     */
    const markUnavailable = () => {
      prevCpuRef.current = null;
      if (!alive) return;
      setCpu({ status: 'unavailable' });
    };
    /**
     * 读取一轮系统 CPU 累计时间并用上一轮样本计算忙碌比例。
     *
     * @remarks
     * 该指标只用于设置页展示；读取失败或浏览器不支持时会切到不可用状态，不影响运行时回收策略。
     */
    const read = () => {
      void readSystemCpuUsageTotals().then((sample) => {
        if (!alive) return;
        if (!sample) {
          markUnavailable();
          return;
        }

        const prev = prevCpuRef.current;
        prevCpuRef.current = sample;
        if (!prev) {
          setCpu({ status: 'loading' });
          return;
        }
        const dt = sample.total - prev.total;
        const di = sample.idle - prev.idle;
        if (!Number.isFinite(dt) || dt <= 0) {
          markUnavailable();
          return;
        }
        const busy = Math.max(0, Math.min(1, (dt - di) / dt));
        setCpu({ status: 'ready', pct: busy * 100 });
      }).catch(markUnavailable);
    };
    read();
    const timer = window.setInterval(read, 2000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [cpuSupported]);

  useEffect(() => {
    // 存储占用（包含 IndexedDB/CacheStorage 等）
    /** 读取当前扩展上下文可见的存储占用与配额估算值。 */
    const readStorage = () => {
      if (!navigator.storage?.estimate) return setStorage(null);
      navigator.storage.estimate().then((est) => {
        const usage = typeof est.usage === 'number' ? est.usage : 0;
        const quota = typeof est.quota === 'number' ? est.quota : 0;
        setStorage({ usedMB: usage / 1024 / 1024, quotaMB: quota / 1024 / 1024 });
      }).catch(() => setStorage(null));
    };
    readStorage();
    const t = window.setInterval(readStorage, 10_000);
    return () => window.clearInterval(t);
  }, []);

  const heapPct = useMemo(() => {
    if (!heap || !heap.limitMB) return 0;
    return Math.min(100, (heap.usedMB / heap.limitMB) * 100);
  }, [heap]);

  /** 当前存储占用百分比。 */
  const storagePct = useMemo(() => {
    if (!storage || !storage.quotaMB) return 0;
    return Math.min(100, (storage.usedMB / storage.quotaMB) * 100);
  }, [storage]);

  return (
    <SettingsPanelRoot>
      <SettingsPanelScroller>
        <SettingsPanelInset>
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-semibold mb-1">{t('performancePanel.title')}</h3>
              <p className="text-sm text-muted-foreground">{t('performancePanel.description')}</p>
            </div>

            {/* 实时指标 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 mb-3">
                  <Cpu className="h-4 w-4 text-blue-500" />
                  <span className="text-xs text-muted-foreground">{t('performancePanel.metrics.cpu')}</span>
                </div>
                {cpu.status === 'ready' ? (
                  <>
                    <p className="text-2xl font-bold">{cpu.pct.toFixed(0)}%</p>
                    <Progress value={cpu.pct} className="h-1.5 mt-2" />
                    <p className="text-xs text-muted-foreground mt-1">{t('performancePanel.cpu.estimated')}</p>
                  </>
                ) : cpu.status === 'loading' ? (
                  <>
                    <p className="text-sm font-medium">{t('performancePanel.cpu.loading')}</p>
                    <div className="mt-2 space-y-2">
                      <Skeleton className="h-10 w-24" />
                      <Progress value={28} className="h-1.5 opacity-60" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{t('performancePanel.cpu.loadingDesc')}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">{t('performancePanel.cpu.unavailable')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('performancePanel.cpu.unavailableDesc')}</p>
                  </>
                )}
              </div>
              <div className="p-4 rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 mb-3">
                  <MemoryStick className="h-4 w-4 text-purple-500" />
                  <span className="text-xs text-muted-foreground">{t('performancePanel.metrics.jsHeap')}</span>
                </div>
                <p className="text-2xl font-bold">
                  {heap ? heap.usedMB.toFixed(0) : '—'}{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    / {heap ? heap.limitMB.toFixed(0) : '—'} MB
                  </span>
                </p>
                <Progress value={heapPct} className="h-1.5 mt-2" />
              </div>
              <div className="p-4 rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 mb-3">
                  <HardDrive className="h-4 w-4 text-amber-500" />
                  <span className="text-xs text-muted-foreground">{t('performancePanel.metrics.storageUsage')}</span>
                </div>
                <p className="text-2xl font-bold">
                  {storage ? storage.usedMB.toFixed(0) : '—'}{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    / {storage ? storage.quotaMB.toFixed(0) : '—'} MB
                  </span>
                </p>
                <Progress value={storagePct} className="h-1.5 mt-2" />
              </div>
              <div className="p-4 rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs text-muted-foreground">{t('performancePanel.metrics.background')}</span>
                </div>
                <p className="text-sm font-medium">
                  {t('performancePanel.background.summary', {
                    uiPortCount: sw?.uiPortCount ?? 0,
                    offscreen: sw?.offscreenDoc ? t('common.created') : t('common.notCreated'),
                  })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('performancePanel.background.offscreenPort', {
                    status: sw?.offscreenPortConnected ? t('common.connected') : t('common.disconnected'),
                  })}
                </p>
              </div>
            </div>

            {/* 自动卸载设置 */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">{t('performancePanel.unload.title')}</h4>
              <div className="p-4 rounded-lg border border-border bg-card space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">{t('performancePanel.unload.autoUnload')}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('performancePanel.unload.autoUnloadDesc')}</p>
                  </div>
                  <Switch checked={autoUnload} onCheckedChange={(checked) => patchUnloadConfig({ autoUnload: checked })} />
                </div>

                {autoUnload && (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-xs">{t('performancePanel.unload.idleTimeout')}</Label>
                      <span className="text-xs text-muted-foreground">{t('performancePanel.units.seconds', { count: idleTimeout })}</span>
                    </div>
                    <Slider
                      value={[idleTimeout]}
                      min={60}
                      max={600}
                      step={30}
                      onValueChange={([v]) => patchUnloadConfig({ idleTimeout: v })}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 存储后端 */}
            <div className="p-4 rounded-lg border border-border bg-card space-y-3">
              <h4 className="text-sm font-medium">{t('performancePanel.storage.title')}</h4>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">{t('performancePanel.storage.chatPrompts')}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('performancePanel.storage.chatPromptsDesc')}</p>
                </div>
                <Badge variant="secondary" className="text-xs">{t('performancePanel.storage.sharedJson')}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">{t('performancePanel.storage.modelKeys')}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('performancePanel.storage.modelKeysDesc')}</p>
                </div>
                <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">{t('common.enabled')}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">{t('performancePanel.storage.memory')}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('performancePanel.storage.memoryDesc')}</p>
                </div>
                <Badge variant="secondary" className="text-xs">IndexedDB</Badge>
              </div>
            </div>

            {/* 性能提示 */}
            <InlineNotice icon={AlertTriangle} tone="warning" align="start" className="rounded-lg p-4" bodyClassName="space-y-2">
              <h4 className="text-sm font-medium text-foreground">{t('performancePanel.tips.title')}</h4>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• {t('performancePanel.tips.swMemoryLimit')}</li>
              </ul>
            </InlineNotice>
          </div>
        </SettingsPanelInset>
      </SettingsPanelScroller>
    </SettingsPanelRoot>
  );
}
