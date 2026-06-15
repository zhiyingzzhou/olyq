/**
 * 说明：`DeveloperPanel` 组件模块。
 *
 * 职责：
 * - 承载 `DeveloperPanel` 相关的当前文件实现与模块边界；
 * - 对外暴露 `DeveloperPanel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bug, ClipboardCopy, FlaskConical, Maximize2, RefreshCw, RotateCcw, Shield, Wrench } from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/useToast';
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore';
import { useDeveloperToolsStore } from '@/hooks/useDeveloperToolsStore';
import { cn } from '@/lib/utils';
import { useContentScriptStatus } from './useContentScriptStatus';
import {
  formatCompactRequestId,
  formatDebugPayload,
  formatDebugTime,
  stringifyDebugValue,
  summarizePayload,
} from './DeveloperPanel.utils';
import { WelcomeDemo } from '../WelcomeDemo';
import { SettingsPanelInset, SettingsPanelRoot, SettingsPanelScroller } from './layout';

/** 开发者模式总面板。 */
export function DeveloperPanel() {
  const { t } = useTranslation();
  const { settings, setSettings } = useChatSettingsStore(
    (s) => ({
      settings: s.settings,
      setSettings: s.setSettings,
    }),
    shallow,
  );
  const { events, clearEvents } = useDeveloperToolsStore(
    (s) => ({
      events: s.events,
      clearEvents: s.clearEvents,
    }),
    shallow,
  );
  const { status, busy, refresh } = useContentScriptStatus();

  const reverseEvents = useMemo(() => [...events].reverse(), [events]);
  const latestEventId = reverseEvents[0]?.id ?? null;
  const [selectedEventId, setSelectedEventId] = useState<string | null>(latestEventId);
  const latestEventIdRef = useRef<string | null>(latestEventId);
  const [wrapPayloadLines, setWrapPayloadLines] = useState(true);
  const [prettifyPayload, setPrettifyPayload] = useState(true);
  const [payloadDialogOpen, setPayloadDialogOpen] = useState(false);

  useEffect(() => {
    const previousLatestEventId = latestEventIdRef.current;
    const selectedStillExists = selectedEventId
      ? reverseEvents.some((event) => event.id === selectedEventId)
      : false;

    if (!latestEventId) {
      if (selectedEventId !== null) setSelectedEventId(null);
    } else if (!selectedStillExists || selectedEventId === null || selectedEventId === previousLatestEventId) {
      if (selectedEventId !== latestEventId) setSelectedEventId(latestEventId);
    }

    latestEventIdRef.current = latestEventId;
  }, [latestEventId, reverseEvents, selectedEventId]);

  const selectedEvent = reverseEvents.find((event) => event.id === selectedEventId) ?? reverseEvents[0] ?? null;
  const selectedPayloadText = useMemo(
    () => formatDebugPayload(selectedEvent?.payload, prettifyPayload),
    [prettifyPayload, selectedEvent?.payload],
  );
  const payloadScrollbars = wrapPayloadLines ? 'vertical' : 'both';
  const payloadSurfaceClassName = 'w-full';
  const payloadTextClassName = cn(
    'min-w-full bg-background/70 p-4 text-xs leading-5 text-foreground',
    wrapPayloadLines ? 'whitespace-pre-wrap break-all' : 'w-max whitespace-pre',
  );

  useEffect(() => {
    if (selectedEvent) return;
    if (payloadDialogOpen) setPayloadDialogOpen(false);
  }, [payloadDialogOpen, selectedEvent]);

  /**
   * 内部函数变量：`update`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const update = (patch: Partial<typeof settings>) => {
    setSettings({ ...settings, ...patch });
  };

  /**
   * 内部函数变量：`copyText`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: t('common.success'), description: t('developerPanel.debugEvents.copySuccess') });
    } catch {
      toast({
        title: t('common.error'),
        description: t('developerPanel.debugEvents.copyFailed'),
        variant: 'destructive',
      });
    }
  };

  return (
    <SettingsPanelRoot>
      <SettingsPanelScroller>
        <SettingsPanelInset>
          <div className="space-y-6">
            <div>
              <h3 className="mb-1 text-base font-semibold">{t('developerPanel.title')}</h3>
              <p className="text-sm text-muted-foreground">{t('developerPanel.description')}</p>
            </div>

            <div className="space-y-4 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-amber-500" />
                <h4 className="text-sm font-medium">{t('developerPanel.experimental.title')}</h4>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label className="text-sm">{t('chatDialog.autoTranslateWithSpace')}</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('chatDialog.autoTranslateWithSpaceDesc')}</p>
                </div>
                <Switch
                  checked={settings.autoTranslateWithSpace ?? false}
                  onCheckedChange={(value) => update({ autoTranslateWithSpace: value })}
                />
              </div>
            </div>

            <div className="space-y-4 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Bug className="h-4 w-4 text-blue-500" />
                    <h4 className="text-sm font-medium">{t('developerPanel.debugEvents.title')}</h4>
                    <Badge variant="secondary" className="text-[11px]">
                      {events.length}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t('developerPanel.debugEvents.description')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => clearEvents()} disabled={events.length === 0}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    {t('developerPanel.debugEvents.clear')}
                  </Button>
                </div>
              </div>

              {reverseEvents.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                  {t('developerPanel.debugEvents.empty')}
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(20rem,0.88fr)]">
                  <div className="min-h-0 overflow-hidden rounded-lg border border-border/60 bg-background/50">
                    <div className="border-b border-border/60 px-4 py-3">
                      <div className="text-xs font-medium text-foreground/80">
                        {t('developerPanel.debugEvents.listTitle')}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{t('developerPanel.debugEvents.description')}</p>
                    </div>
                    <ScrollArea
                      className="h-[22rem] min-h-0 lg:h-[30rem]"
                      viewportClassName="h-full"
                      data-testid="developer-debug-events-list-scroll"
                    >
                      <div
                        data-testid="developer-debug-events-list-content"
                        className="min-h-full divide-y divide-border/60"
                      >
                        {reverseEvents.map((event) => {
                          const isSelected = event.id === selectedEvent?.id;
                          const compactRequestId = formatCompactRequestId(event.requestId);
                          return (
                            <button
                              key={event.id}
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => setSelectedEventId(event.id)}
                              className={cn(
                                'flex w-full min-w-0 flex-col gap-2 px-4 py-3 text-left transition-colors',
                                isSelected
                                  ? 'bg-primary/5 ring-1 ring-inset ring-primary/15'
                                  : 'bg-transparent hover:bg-muted/25',
                              )}
                            >
                              <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                <Badge variant="outline" className="font-mono">
                                  {event.source}
                                </Badge>
                                <span className="font-mono">{formatDebugTime(event.timestamp)}</span>
                                <span className="min-w-0 max-w-full truncate font-mono" title={event.requestId || '—'}>
                                  {compactRequestId}
                                </span>
                              </div>
                              <div className="truncate text-sm font-medium text-foreground" title={event.kind}>
                                {event.kind}
                              </div>
                              <p
                                className="line-clamp-2 text-xs leading-5 text-muted-foreground"
                                title={summarizePayload(event.payload)}
                              >
                                {summarizePayload(event.payload)}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>

                  <div className="min-h-0 overflow-hidden rounded-lg border border-border/60 bg-muted/20">
                    {selectedEvent ? (
                      <div
                        className="flex h-[22rem] min-h-0 flex-col lg:h-[30rem]"
                        data-testid="developer-debug-event-detail"
                      >
                        <div className="border-b border-border/60 px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-foreground/80">
                                {t('developerPanel.debugEvents.detailTitle')}
                              </div>
                              <div className="mt-1 truncate text-sm font-semibold" title={selectedEvent.kind}>
                                {selectedEvent.kind}
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                {summarizePayload(selectedEvent.payload)}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void copyText(stringifyDebugValue(selectedEvent))}
                            >
                              <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />
                              {t('developerPanel.debugEvents.copy')}
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-2 border-b border-border/60 px-4 py-3 text-xs text-muted-foreground sm:grid-cols-3">
                          <div>
                            <div className="font-medium text-foreground/80">
                              {t('developerPanel.debugEvents.requestId')}
                            </div>
                            <div className="mt-1 font-mono break-all">{selectedEvent.requestId || '—'}</div>
                          </div>
                          <div>
                            <div className="font-medium text-foreground/80">
                              {t('developerPanel.debugEvents.source')}
                            </div>
                            <div className="mt-1 font-mono break-all">{selectedEvent.source}</div>
                          </div>
                          <div>
                            <div className="font-medium text-foreground/80">
                              {t('developerPanel.debugEvents.kind')}
                            </div>
                            <div className="mt-1 font-mono break-all">{selectedEvent.kind}</div>
                          </div>
                        </div>

                        <div className="flex min-h-0 flex-1 flex-col">
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
                            <div className="text-xs font-medium text-foreground/80">
                              {t('developerPanel.debugEvents.payload')}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 rounded-full px-2.5 text-[11px]"
                                data-testid="developer-debug-event-expand-button"
                                onClick={() => setPayloadDialogOpen(true)}
                              >
                                <Maximize2 className="h-3.5 w-3.5" />
                                {t('developerPanel.debugEvents.expand')}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={wrapPayloadLines ? 'secondary' : 'ghost'}
                                aria-pressed={wrapPayloadLines}
                                className="h-7 rounded-full px-2.5 text-[11px]"
                                data-testid="developer-debug-event-wrap-toggle"
                                onClick={() => setWrapPayloadLines((value) => !value)}
                              >
                                {t('developerPanel.debugEvents.wrapLines')}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={prettifyPayload ? 'secondary' : 'ghost'}
                                aria-pressed={prettifyPayload}
                                className="h-7 rounded-full px-2.5 text-[11px]"
                                data-testid="developer-debug-event-prettify-toggle"
                                onClick={() => setPrettifyPayload((value) => !value)}
                              >
                                {t('developerPanel.debugEvents.prettifyJson')}
                              </Button>
                            </div>
                          </div>
                          <ScrollArea
                            className="min-h-0 flex-1"
                            viewportClassName="h-full"
                            scrollbars={payloadScrollbars}
                            data-testid="developer-debug-event-payload-scroll"
                          >
                            <div
                              data-testid="developer-debug-event-payload-surface"
                              className={payloadSurfaceClassName}
                            >
                              <pre
                                data-testid="developer-debug-event-payload-text"
                                className={payloadTextClassName}
                              >
                                {selectedPayloadText}
                              </pre>
                            </div>
                          </ScrollArea>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-[22rem] items-center justify-center px-6 text-center text-sm text-muted-foreground lg:h-[30rem]">
                        {t('developerPanel.debugEvents.detailEmpty')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-emerald-500" />
                    <h4 className="text-sm font-medium">{t('developerPanel.snapshot.title')}</h4>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t('developerPanel.snapshot.description')}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={busy}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  {t('common.refresh')}
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">{t('developerPanel.snapshot.enabled')}</div>
                  <div className="mt-1 text-sm font-medium">
                    {status?.enabled ? t('common.enabled') : t('common.disabled')}
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">{t('developerPanel.snapshot.registered')}</div>
                  <div className="mt-1 text-sm font-medium">
                    {status?.registered ? t('common.yes') : t('common.no')}
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">{t('developerPanel.snapshot.method')}</div>
                  <div className="mt-1 font-mono text-sm font-medium">{status?.registrationMethod ?? 'none'}</div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">{t('developerPanel.snapshot.origins')}</div>
                  <div className="mt-2 break-all font-mono text-xs">
                    {status?.declaredHostMatches?.length ? status.declaredHostMatches.join(', ') : '—'}
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">{t('developerPanel.snapshot.loader')}</div>
                  <div className="mt-2 break-all font-mono text-xs">
                    {(status?.bundledJs ?? []).join(', ') || '—'}
                  </div>
                </div>
              </div>

              {status?.lastRegistrationError ? (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">{t('developerPanel.snapshot.lastRegistrationError')}</div>
                  <div className="mt-2 text-sm font-medium">{status.lastRegistrationError.message}</div>
                  <div className="mt-2 space-y-1 break-all font-mono text-xs text-muted-foreground">
                    <div>{status.lastRegistrationError.code}</div>
                    <div>{status.lastRegistrationError.reason}</div>
                    {status.lastRegistrationError.detail ? <div>{status.lastRegistrationError.detail}</div> : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-4 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-violet-500" />
                <h4 className="text-sm font-medium">{t('developerPanel.rendering.title')}</h4>
              </div>
              <p className="text-xs text-muted-foreground">{t('developerPanel.rendering.description')}</p>
              <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                <WelcomeDemo />
              </div>
            </div>
          </div>

          <Dialog open={payloadDialogOpen} onOpenChange={setPayloadDialogOpen}>
            <DialogContent
              data-testid="developer-debug-event-dialog"
              className="flex min-h-0 min-w-0 max-w-none flex-col gap-0 overflow-hidden rounded-lg p-0 h-[min(90vh,calc(100dvh-1.5rem))] max-h-[calc(100dvh-1.5rem)] w-[min(1120px,calc(100vw-1.5rem))]"
            >
              <DialogHeader className="gap-0 border-b border-border px-6 py-4 pr-14">
                <DialogTitle>{t('developerPanel.debugEvents.payloadDialogTitle')}</DialogTitle>
                <DialogDescription className="mt-2 break-all text-xs font-mono leading-5">
                  {selectedEvent
                    ? `${selectedEvent.kind} · ${selectedEvent.source} · ${selectedEvent.requestId || '—'}`
                    : t('developerPanel.debugEvents.detailEmpty')}
                </DialogDescription>
              </DialogHeader>

              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-6 py-3">
                  <div className="text-xs font-medium text-foreground/80">{t('developerPanel.debugEvents.payload')}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={wrapPayloadLines ? 'secondary' : 'ghost'}
                      aria-pressed={wrapPayloadLines}
                      className="h-7 rounded-full px-2.5 text-[11px]"
                      data-testid="developer-debug-event-dialog-wrap-toggle"
                      onClick={() => setWrapPayloadLines((value) => !value)}
                    >
                      {t('developerPanel.debugEvents.wrapLines')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={prettifyPayload ? 'secondary' : 'ghost'}
                      aria-pressed={prettifyPayload}
                      className="h-7 rounded-full px-2.5 text-[11px]"
                      data-testid="developer-debug-event-dialog-prettify-toggle"
                      onClick={() => setPrettifyPayload((value) => !value)}
                    >
                      {t('developerPanel.debugEvents.prettifyJson')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full px-2.5 text-[11px]"
                      data-testid="developer-debug-event-dialog-copy-button"
                      onClick={() => void copyText(selectedPayloadText)}
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                      {t('developerPanel.debugEvents.copyPayload')}
                    </Button>
                  </div>
                </div>

                <ScrollArea
                  className="min-h-0 flex-1"
                  viewportClassName="h-full"
                  scrollbars={payloadScrollbars}
                  data-testid="developer-debug-event-dialog-payload-scroll"
                >
                  <div
                    data-testid="developer-debug-event-dialog-payload-surface"
                    className={payloadSurfaceClassName}
                  >
                    <pre
                      data-testid="developer-debug-event-dialog-payload-text"
                      className={payloadTextClassName}
                    >
                      {selectedPayloadText}
                    </pre>
                  </div>
                </ScrollArea>
              </div>
            </DialogContent>
          </Dialog>
        </SettingsPanelInset>
      </SettingsPanelScroller>
    </SettingsPanelRoot>
  );
}
