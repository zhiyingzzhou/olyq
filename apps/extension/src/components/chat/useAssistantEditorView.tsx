/**
 * 说明：`useAssistantEditorView` 组件模块。
 *
 * 职责：
 * - 承载 `useAssistantEditorView` 相关的当前文件实现与模块边界；
 * - 对外暴露 `AssistantEditorProps`、`useAssistantEditorView` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Hammer, Sparkles, X } from 'lucide-react';
import type { Assistant, AssistantConfig } from '@/types/assistant';
import { AssistantIcon } from '@/components/chat/AssistantIcon';
import { AssistantTagPicker } from '@/components/chat/AssistantTagPicker';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from 'react-i18next';
import { SelectionPanelEmpty, SelectionPanelRow } from '@/components/chat/SelectionPanelShared';
import {
  BUILTIN_BROWSER_CONTEXT_PROFILES,
  DEFAULT_BROWSER_CONTEXT_PROFILE_ID,
  getBrowserContextAssistantOverride,
  removeBrowserContextAssistantOverride,
  resolveBrowserContextPolicyForAssistant,
  upsertBrowserContextAssistantOverride,
  type BrowserContextAssistantOverrideMode,
  type BrowserContextSourceId,
} from '@/lib/browser-context';
import { getBrowserContextProfilePresentation } from '@/lib/browser-context/profile-presentation';
import {
  ASSISTANT_ICON_OPTIONS,
  DEFAULT_ASSISTANT_ICON_ID,
  getAssistantIconOption,
  normalizeAssistantIconId,
} from '@/lib/assistant-icons';
import { useAssistantStore } from '@/hooks/useAssistantStore';
import { getMemoryConfig, isMemoryConfigured } from '@/lib/memory';
import {
  createAutoMcpServerSelection,
  createDisabledMcpServerSelection,
  createManualMcpServerSelection,
  resolveSelectedMcpServerIds,
} from '@/lib/mcp/selection';
import { resolveAssistantMcpSelection } from '@/lib/mcp/assistant-selection-storage';
import { useMcpServersResource } from '@/lib/mcp/use-mcp-servers-resource';
import { normalizeQuickPhrases } from '@/lib/quick-phrases/phrase-normalize';

/** AssistantEditor 组件入参：仅用于编辑现有助手 */
export interface AssistantEditorProps {
  /** 是否打开弹窗 */
  open: boolean;
  /** 关闭弹窗回调 */
  onClose: () => void;
  /** 当前编辑的助手 */
  assistant: Assistant;
  /** 更新回调 */
  onUpdate: (id: string, updates: Partial<AssistantConfig>) => void;
  /** 可选：打开 MCP 设置（扩展设置 → MCP） */
  onOpenMcpSettings?: () => void;
}

/**
 * 助手编辑弹窗的视图控制器。
 *
 * 职责：
 * - 管理助手编辑表单状态
 * - 编排记忆开关、MCP 服务器选择、浏览器上下文等助手级能力
 * - 在提交时输出与 `Assistant` 存储结构一致的数据片段
 */
export function useAssistantEditorView({ open, onClose, assistant, onUpdate, onOpenMcpSettings }: AssistantEditorProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [iconId, setIconId] = useState<Assistant['iconId']>(DEFAULT_ASSISTANT_ICON_ID);
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tagList, setTagList] = useState<string[]>([]);
  const [regularPhrases, setRegularPhrases] = useState(() => normalizeQuickPhrases(assistant.regularPhrases));
  const [browserContextMode, setBrowserContextMode] = useState<BrowserContextAssistantOverrideMode>('inherit');
  const [browserContextProfileId, setBrowserContextProfileId] = useState<string>(DEFAULT_BROWSER_CONTEXT_PROFILE_ID);
  const [browserContextCustomTitle, setBrowserContextCustomTitle] = useState('');
  const [browserContextCustomDescription, setBrowserContextCustomDescription] = useState('');
  const [browserContextCustomOutputFormat, setBrowserContextCustomOutputFormat] = useState<'text' | 'markdown' | 'json'>('text');
  const [browserContextCustomMaxPromptChars, setBrowserContextCustomMaxPromptChars] = useState('2400');
  const [browserContextCustomCacheTtlMs, setBrowserContextCustomCacheTtlMs] = useState('60000');
  const [browserContextCustomSources, setBrowserContextCustomSources] = useState<BrowserContextSourceId[]>(['tab-meta', 'readable-dom']);
  const [enableMemory, setEnableMemory] = useState(false);
  const [mcpSelection, setMcpSelection] = useState(() => createAutoMcpServerSelection());

  // 收集所有助手的已有标签（去重）
  const allAssistants = useAssistantStore((s) => (Array.isArray(s.assistants) ? s.assistants : []));
  const userPresets = useAssistantStore((s) => (Array.isArray(s.userPresets) ? s.userPresets : []));
  const existingTags = useMemo(() => {
    const set = new Set<string>();
    for (const a of allAssistants) {
      for (const t of a.tags ?? []) {
        if (t) set.add(t);
      }
    }
    for (const preset of userPresets) {
      for (const tag of preset.tags ?? []) {
        if (tag) set.add(tag);
      }
    }
    return Array.from(set).sort();
  }, [allAssistants, userPresets]);

  const selectedIconOption = useMemo(() => getAssistantIconOption(iconId), [iconId]);

  const memoryCfg = getMemoryConfig();
  const memoryAvailable = memoryCfg.enabled && isMemoryConfigured(memoryCfg);
  const mcpServersResource = useMcpServersResource(open);
  const enabledMcpServers = mcpServersResource.enabledServers;
  const mcpMode = mcpSelection.mode; const manualMcpServerIds = mcpSelection.manualServerIds;

  useEffect(() => {
    setName(assistant.name);
    setIconId(normalizeAssistantIconId(assistant.iconId) ?? DEFAULT_ASSISTANT_ICON_ID);
    setDescription(assistant.description || '');
    setPrompt(assistant.prompt);
    setTagList(assistant.tags ?? []);
    setRegularPhrases(normalizeQuickPhrases(assistant.regularPhrases)); setEnableMemory(Boolean(assistant.enableMemory));
    setMcpSelection(resolveAssistantMcpSelection(assistant));

    const override = getBrowserContextAssistantOverride(assistant.id);
    const resolvedPolicy = resolveBrowserContextPolicyForAssistant(assistant);
    const effectiveProfile = override?.mode === 'custom' && override.customProfile ? override.customProfile : resolvedPolicy.profile;

    setBrowserContextMode(override?.mode ?? 'inherit');
    setBrowserContextProfileId(override?.profileId || effectiveProfile.id || DEFAULT_BROWSER_CONTEXT_PROFILE_ID);
    setBrowserContextCustomTitle(effectiveProfile.title || assistant.name);
    setBrowserContextCustomDescription(effectiveProfile.description || '');
    setBrowserContextCustomOutputFormat(effectiveProfile.outputFormat);
    setBrowserContextCustomMaxPromptChars(String(effectiveProfile.maxPromptChars));
    setBrowserContextCustomCacheTtlMs(String(effectiveProfile.cacheTtlMs));
    setBrowserContextCustomSources(effectiveProfile.sources);
  }, [assistant, open]);

  const selectedMcpCount = useMemo(
    () => resolveSelectedMcpServerIds(mcpSelection, enabledMcpServers.map((server) => server.id)).length,
    [enabledMcpServers, mcpSelection],
  );
  const selectedMcpCountLabel = mcpSelection.mode === 'auto' ? t('mcpSelection.mcpModes.auto') : String(selectedMcpCount);
  const browserContextResolvedPreview = useMemo(
    () => resolveBrowserContextPolicyForAssistant({
      id: assistant.id,
      tags: tagList,
    }),
    [assistant.id, tagList],
  );
  const resolvedProfilePresentation = useMemo(
    () => getBrowserContextProfilePresentation(browserContextResolvedPreview.profile, t),
    [browserContextResolvedPreview.profile, t],
  );

  const setAssistantMcpMode = useCallback((mode: 'auto' | 'manual' | 'disabled') => {
    if (mode === 'auto') {
      setMcpSelection(createAutoMcpServerSelection());
      return;
    }
    if (mode === 'disabled') {
      setMcpSelection(createDisabledMcpServerSelection());
      return;
    }
    setMcpSelection((prev) => {
      if (prev.mode === 'manual' && prev.manualServerIds.length > 0) return prev;
      const first = enabledMcpServers[0]?.id;
      return createManualMcpServerSelection(first ? [first] : []);
    });
  }, [enabledMcpServers]);

  const toggleAssistantMcpServer = useCallback((serverId: string) => {
    setMcpSelection((prev) => {
      const next = new Set(prev.mode === 'manual' ? prev.manualServerIds : []);
      if (next.has(serverId)) next.delete(serverId);
      else next.add(serverId);
      return createManualMcpServerSelection(Array.from(next));
    });
  }, []);

  /**
   * 切换自定义 profile 中的 source 开关。
   *
   * @param sourceId - 目标 source。
   */
  const toggleBrowserContextCustomSource = useCallback((sourceId: BrowserContextSourceId) => {
    setBrowserContextCustomSources((current) => {
      if (current.includes(sourceId)) {
        return current.length > 1 ? current.filter((item) => item !== sourceId) : current;
      }
      return [...current, sourceId];
    });
  }, []);

  /**
   * 校验并提交当前助手表单。
   *
   * 说明：
   * - `name` 和 `prompt` 是必填项，缺失时直接忽略保存动作；
   * - 当前编辑器只服务“编辑现有助手”。
   */
  const handleSave = () => {
    if (!name.trim() || !prompt.trim()) return;

    const data: Partial<AssistantConfig> = {
      name: name.trim(),
      iconId,
      description: description.trim() || undefined,
      prompt: prompt.trim(),
      tags: tagList.length > 0 ? tagList : undefined,
      regularPhrases,
      enableMemory: Boolean(enableMemory),
      mcpSelection,
    };

    onUpdate(assistant.id, data);

    if (browserContextMode === 'inherit') {
      removeBrowserContextAssistantOverride(assistant.id);
    } else if (browserContextMode === 'disabled') {
      upsertBrowserContextAssistantOverride({
        assistantId: assistant.id,
        mode: 'disabled',
      });
    } else if (browserContextMode === 'profile') {
      upsertBrowserContextAssistantOverride({
        assistantId: assistant.id,
        mode: 'profile',
        profileId: browserContextProfileId,
      });
    } else {
      upsertBrowserContextAssistantOverride({
        assistantId: assistant.id,
        mode: 'custom',
        customProfile: {
          id: `custom:${assistant.id}`,
          title: browserContextCustomTitle.trim() || `${assistant.name} Browser Context`,
          description: browserContextCustomDescription.trim(),
          sources: browserContextCustomSources,
          outputFormat: browserContextCustomOutputFormat,
          maxPromptChars: Math.max(200, Number(browserContextCustomMaxPromptChars || 2400)),
          cacheTtlMs: Math.max(5_000, Number(browserContextCustomCacheTtlMs || 60_000)),
        },
      });
    }

    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b border-border/60">
          <DialogTitle>{t('assistant.updateAssistant')}</DialogTitle>
          <DialogDescription>{t('assistant.editDesc')}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-4">
          {/* 主图标 + 名称 */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,210px)_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('assistant.icon')}</Label>
              <Select value={selectedIconOption.id} onValueChange={(value) => setIconId(value as Assistant['iconId'])}>
                <SelectTrigger className="h-9">
                  <div className="flex min-w-0 items-center gap-2">
                    <AssistantIcon iconId={selectedIconOption.id} size={16} iconClassName="h-4 w-4" />
                    <span className="truncate text-sm">{t(selectedIconOption.labelKey)}</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {ASSISTANT_ICON_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      <span className="inline-flex items-center gap-2">
                        <AssistantIcon iconId={option.id} size={16} iconClassName="h-4 w-4" />
                        <span>{t(option.labelKey)}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">{t('assistant.name')} *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('assistant.namePlaceholder')} className="h-9" />
            </div>
          </div>

          {/* 描述 */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t('assistant.description')}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('assistant.descriptionPlaceholder')} className="h-9" />
          </div>

          {/* 系统提示词 */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t('assistant.systemPrompt')} *</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('assistant.systemPromptPlaceholder')}
              className="min-h-[120px] text-sm"
            />
          </div>

          {/* 标签 */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t('assistant.tags')}</Label>
            <AssistantTagPicker value={tagList} onChange={setTagList} availableTags={existingTags} />
            <p className="text-xs text-muted-foreground">{t('assistant.tagsHint')}</p>
          </div>

          <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/10 p-3">
            <div>
              <Label className="text-xs">{t('assistant.browserContext.title')}</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('assistant.browserContext.desc')}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('assistant.browserContext.mode')}</Label>
              <Select value={browserContextMode} onValueChange={(value) => setBrowserContextMode(value as BrowserContextAssistantOverrideMode)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">{t('assistant.browserContext.modeInherit')}</SelectItem>
                  <SelectItem value="disabled">{t('assistant.browserContext.modeDisabled')}</SelectItem>
                  <SelectItem value="profile">{t('assistant.browserContext.modeProfile')}</SelectItem>
                  <SelectItem value="custom">{t('assistant.browserContext.modeCustom')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {browserContextMode === 'inherit'
                  ? t('assistant.browserContext.inheritHint', {
                    profileTitle: resolvedProfilePresentation.title,
                    profileId: browserContextResolvedPreview.profile.id,
                  })
                  : browserContextMode === 'disabled'
                    ? t('assistant.browserContext.disabledHint')
                    : browserContextMode === 'profile'
                      ? t('assistant.browserContext.profileHint')
                      : t('assistant.browserContext.customHint')}
              </p>
            </div>

            {browserContextMode === 'profile' ? (
              <div className="space-y-1.5">
                <Label className="text-xs">{t('assistant.browserContext.profile')}</Label>
                <Select value={browserContextProfileId} onValueChange={setBrowserContextProfileId}>
                  <SelectTrigger className="h-9">
                    <span className="truncate text-sm">
                      {getBrowserContextProfilePresentation(
                        BUILTIN_BROWSER_CONTEXT_PROFILES.find((profile) => profile.id === browserContextProfileId)
                          ?? BUILTIN_BROWSER_CONTEXT_PROFILES[0],
                        t,
                      ).title}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {BUILTIN_BROWSER_CONTEXT_PROFILES.map((profile) => {
                      const presentation = getBrowserContextProfilePresentation(profile, t);
                      return (
                        <SelectItem key={profile.id} value={profile.id} textValue={presentation.title}>
                          <div className="py-1">
                            <div className="text-sm font-medium">{presentation.title}</div>
                            <div className="text-xs text-muted-foreground">{presentation.description}</div>
                            <div className="text-[11px] text-muted-foreground/80">{presentation.detail}</div>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {browserContextMode === 'custom' ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('assistant.browserContext.customTitle')}</Label>
                  <Input value={browserContextCustomTitle} onChange={(event) => setBrowserContextCustomTitle(event.target.value)} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('assistant.browserContext.customDescription')}</Label>
                  <Input value={browserContextCustomDescription} onChange={(event) => setBrowserContextCustomDescription(event.target.value)} className="h-9" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('assistant.browserContext.outputFormat')}</Label>
                    <Select value={browserContextCustomOutputFormat} onValueChange={(value) => setBrowserContextCustomOutputFormat(value as 'text' | 'markdown' | 'json')}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">text</SelectItem>
                        <SelectItem value="markdown">markdown</SelectItem>
                        <SelectItem value="json">json</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('assistant.browserContext.maxPromptChars')}</Label>
                    <Input value={browserContextCustomMaxPromptChars} onChange={(event) => setBrowserContextCustomMaxPromptChars(event.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('assistant.browserContext.cacheTtlMs')}</Label>
                    <Input value={browserContextCustomCacheTtlMs} onChange={(event) => setBrowserContextCustomCacheTtlMs(event.target.value)} className="h-9" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('assistant.browserContext.sources')}</Label>
                  <div className="flex flex-wrap gap-2">
                    {(['tab-meta', 'readable-dom', 'selection-snapshot', 'element-snapshot'] as BrowserContextSourceId[]).map((sourceId) => {
                      const selected = browserContextCustomSources.includes(sourceId);
                      return (
                        <button
                          key={sourceId}
                          type="button"
                          onClick={() => toggleBrowserContextCustomSource(sourceId)}
                          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${selected ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-accent'}`}
                        >
                          {sourceId}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-xs">{t('mcpBridgePanel.title')}</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('mcpSelection.mcpModeDesc')}</p>
              </div>
              {onOpenMcpSettings ? (
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={onOpenMcpSettings}>
                  {t('common.open')}
                </Button>
              ) : null}
            </div>

            <div className="space-y-1 rounded-2xl border border-border/60 bg-muted/10 p-2">
              <SelectionPanelRow
                title={t('mcpSelection.mcpModes.disabled')}
                description={t('mcpSelection.mcpModeDesc')}
                icon={<X className="h-4 w-4" />}
                selected={mcpMode === 'disabled'}
                onClick={() => setAssistantMcpMode('disabled')}
              />
              <SelectionPanelRow
                title={t('mcpSelection.mcpModes.auto')}
                description={t('mcpSelection.mcpModeDesc')}
                icon={<Sparkles className="h-4 w-4" />}
                selected={mcpMode === 'auto'}
                right={<Badge variant="secondary" className="text-[10px]">{selectedMcpCountLabel}</Badge>}
                onClick={() => setAssistantMcpMode('auto')}
              />
                <SelectionPanelRow
                  title={t('mcpSelection.mcpModes.manual')}
                  description={t('mcpSelection.mcpServers')}
                  icon={<Hammer className="h-4 w-4" />}
                  selected={mcpMode === 'manual'}
                  right={<Badge variant="secondary" className="text-[10px]">{manualMcpServerIds.length}</Badge>}
                  onClick={() => setAssistantMcpMode('manual')}
                />
              </div>

            {mcpMode === 'manual' ? (
              mcpServersResource.status === 'loading' ? (
                <div className="rounded-2xl border border-border/60 bg-background/70 px-3 py-4 text-xs text-muted-foreground">
                  {t('common.loading')}
                </div>
              ) : mcpServersResource.status === 'error' ? (
                <div className="rounded-2xl border border-border/60 bg-background/70">
                  <SelectionPanelEmpty
                    title={t('common.error')}
                    description={mcpServersResource.error.message || t('common.error')}
                    action={onOpenMcpSettings ? (
                      <Button type="button" size="sm" variant="outline" onClick={onOpenMcpSettings}>
                        {t('mcpBridgePanel.title')}
                      </Button>
                    ) : undefined}
                  />
                </div>
              ) : enabledMcpServers.length > 0 ? (
                <div className="space-y-1 rounded-2xl border border-border/60 bg-background/70 p-2">
                  {enabledMcpServers.map((server) => (
                    <SelectionPanelRow
                      key={server.id}
                      title={server.name}
                      description={server.url || ''}
                      icon={<Hammer className="h-4 w-4" />}
                      selected={manualMcpServerIds.includes(server.id)}
                      onClick={() => toggleAssistantMcpServer(server.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-border/60 bg-background/70">
                  <SelectionPanelEmpty
                    title={t('mcpSelection.noMcpServers')}
                    description={t('mcpSelection.mcpModeDesc')}
                    action={onOpenMcpSettings ? (
                      <Button type="button" size="sm" variant="outline" onClick={onOpenMcpSettings}>
                        {t('mcpBridgePanel.title')}
                      </Button>
                    ) : undefined}
                  />
                </div>
              )
            ) : null}
          </div>

          {/* 全局记忆 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-xs">{t('assistant.enableMemory')}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{t('assistant.enableMemoryDesc')}</p>
              </div>
              <Switch checked={enableMemory} onCheckedChange={setEnableMemory} disabled={!memoryAvailable} />
            </div>
            {!memoryAvailable && (
              <p className="text-xs text-muted-foreground">{t('assistant.enableMemoryUnavailable')}</p>
            )}
          </div>

          {/* 操作区 */}
        </div>
        </div>

        <div className="px-6 py-4 border-t border-border/60 shrink-0 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
            <Button size="sm" onClick={handleSave} disabled={!name.trim() || !prompt.trim()}>
              {t('common.save')}
            </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
