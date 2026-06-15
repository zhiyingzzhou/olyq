/**
 * 说明：`PresetEditorDialog` 组件模块。
 *
 * 职责：
 * - 承载“我的预设”的创建与编辑表单；
 * - 只暴露当前产品允许维护的用户预设字段；
 * - 复用现有 MCP 选择与共享标签组件，避免再长第二套交互语义。
 *
 * 边界：
 * - 本组件不直接写 store，由上层通过 `onSubmit` 接收规整后的草稿；
 * - 不承载 browser-context override，也不兼容旧 `preset-prefs` 结构。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Hammer, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  ASSISTANT_ICON_OPTIONS,
  DEFAULT_ASSISTANT_ICON_ID,
  getAssistantIconOption,
  normalizeAssistantIconId,
  type AssistantIconOption,
} from '@/lib/assistant-icons';
import { AssistantIcon } from '@/components/chat/AssistantIcon';
import { AssistantTagPicker } from '@/components/chat/AssistantTagPicker';
import { SelectionPanelEmpty, SelectionPanelRow } from '@/components/chat/SelectionPanelShared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  createAutoMcpServerSelection,
  createDisabledMcpServerSelection,
  createManualMcpServerSelection,
  resolveSelectedMcpServerIds,
} from '@/lib/mcp/selection';
import { useMcpServersResource } from '@/lib/mcp/use-mcp-servers-resource';
import type { StoredAssistantPreset } from '@/types/assistant';
import type { StoredAssistantPresetDraft } from '@/lib/assistant/preset-storage';

/** `PresetEditorDialog` 组件入参。 */
export interface PresetEditorDialogProps {
  /** 是否打开。 */
  open: boolean;
  /** 当前编辑的用户预设；为空时表示新建。 */
  preset: StoredAssistantPreset | null;
  /** 可点选标签全集。 */
  availableTags: string[];
  /** 关闭回调。 */
  onClose: () => void;
  /** 提交当前草稿。 */
  onSubmit: (draft: StoredAssistantPresetDraft) => void;
}

/**
 * 用户预设编辑弹窗。
 *
 * @remarks
 * 当前产品明确要求用户预设只保存固定字段，因此这里不开放：
 * - browser-context override
 * - 模型、temperature / topP / maxTokens 等每话题运行时参数
 * - 知识库、web search provider 等额外扩展字段
 */
export function PresetEditorDialog({
  open,
  preset,
  availableTags,
  onClose,
  onSubmit,
}: PresetEditorDialogProps) {
  const { t } = useTranslation();
  const mcpServersResource = useMcpServersResource(open);
  const enabledMcpServers = mcpServersResource.enabledServers;

  const [scenario, setScenario] = useState<'browser' | 'general'>('general');
  const [iconId, setIconId] = useState<AssistantIconOption['id']>(DEFAULT_ASSISTANT_ICON_ID);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [enableGenerateImage, setEnableGenerateImage] = useState(false);
  const [enableMemory, setEnableMemory] = useState(false);
  const [mcpSelection, setMcpSelection] = useState(() => createAutoMcpServerSelection());

  useEffect(() => {
    const nextPreset = preset;
    setScenario(nextPreset?.scenario ?? 'general');
    setIconId(normalizeAssistantIconId(nextPreset?.iconId) ?? DEFAULT_ASSISTANT_ICON_ID);
    setName(nextPreset?.name || '');
    setDescription(nextPreset?.description || '');
    setPrompt(nextPreset?.prompt || '');
    setTags(nextPreset?.tags ?? []);
    setEnableWebSearch(Boolean(nextPreset?.enableWebSearch));
    setEnableGenerateImage(Boolean(nextPreset?.enableGenerateImage));
    setEnableMemory(Boolean(nextPreset?.enableMemory));
    setMcpSelection(nextPreset?.mcpSelection ?? createAutoMcpServerSelection());
  }, [preset, open]);

  const selectedIconOption = useMemo(() => getAssistantIconOption(iconId), [iconId]);
  const manualMcpServerIds = mcpSelection.mode === 'manual' ? mcpSelection.manualServerIds : [];
  const selectedMcpCount = resolveSelectedMcpServerIds(
    mcpSelection,
    enabledMcpServers.map((server) => server.id),
  ).length;
  const selectedMcpCountLabel = mcpSelection.mode === 'auto' ? t('mcpSelection.mcpModes.auto') : String(selectedMcpCount);

  const setPresetMcpMode = useCallback((mode: 'disabled' | 'auto' | 'manual') => {
    setMcpSelection((current) => {
      if (mode === 'disabled') return createDisabledMcpServerSelection();
      if (mode === 'manual') return createManualMcpServerSelection(current.mode === 'manual' ? current.manualServerIds : []);
      return createAutoMcpServerSelection();
    });
  }, []);

  const togglePresetMcpServer = useCallback((serverId: string) => {
    setMcpSelection((current) => {
      const manualIds = current.mode === 'manual' ? current.manualServerIds : [];
      return createManualMcpServerSelection(
        manualIds.includes(serverId)
          ? manualIds.filter((id) => id !== serverId)
          : [...manualIds, serverId],
      );
    });
  }, []);

  const handleSave = useCallback(() => {
    if (!name.trim() || !prompt.trim()) return;
    onSubmit({
      scenario,
      iconId: normalizeAssistantIconId(iconId) ?? undefined,
      name: name.trim(),
      description: description.trim() || undefined,
      prompt: prompt.trim(),
      tags,
      enableWebSearch,
      enableGenerateImage,
      enableMemory,
      mcpSelection,
    });
    onClose();
  }, [
    description,
    enableGenerateImage,
    enableMemory,
    enableWebSearch,
    iconId,
    mcpSelection,
    name,
    onClose,
    onSubmit,
    prompt,
    scenario,
    tags,
  ]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden rounded-lg p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>{preset ? t('assistant.store.editPreset') : t('assistant.store.createPreset')}</DialogTitle>
          <DialogDescription>{t('assistant.store.presetEditorDesc')}</DialogDescription>
        </DialogHeader>

        <div data-testid="preset-editor-scroll-body" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-3 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <AssistantIcon
                  iconId={iconId}
                  size={28}
                  className="h-11 w-11 rounded-lg border border-border/60 bg-background/80"
                  iconClassName="h-6 w-6"
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{name.trim() || t('assistant.store.presetUntitled')}</div>
                  <div className="truncate text-xs text-muted-foreground">{t(selectedIconOption.labelKey) || iconId}</div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t('assistant.store.scenario')}</Label>
                <Select value={scenario} onValueChange={(value) => setScenario(value as 'browser' | 'general')}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="browser">{t('assistant.store.scenarioBrowser')}</SelectItem>
                    <SelectItem value="general">{t('assistant.store.scenarioGeneral')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t('assistant.icon')}</Label>
                <Select value={iconId} onValueChange={(value) => setIconId(value as AssistantIconOption['id'])}>
                  <SelectTrigger className="h-9">
                    <div className="flex min-w-0 items-center gap-2">
                      <AssistantIcon iconId={iconId} size={18} iconClassName="h-4.5 w-4.5" />
                      <span className="truncate text-sm">{t(selectedIconOption.labelKey) || iconId}</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {ASSISTANT_ICON_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id} textValue={t(option.labelKey) || option.id}>
                        <div className="flex items-center gap-2">
                          <AssistantIcon iconId={option.id} size={18} iconClassName="h-4.5 w-4.5" />
                          <span>{t(option.labelKey) || option.id}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('assistant.name')}</Label>
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('assistant.namePlaceholder')} className="h-9" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t('assistant.description')}</Label>
                <Textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t('assistant.descriptionPlaceholder')}
                  className="min-h-[84px] text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t('assistant.systemPrompt')}</Label>
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={t('assistant.systemPromptPlaceholder')}
                  className="min-h-[160px] text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t('assistant.tags')}</Label>
                <AssistantTagPicker value={tags} availableTags={availableTags} onChange={setTags} />
                <p className="text-xs text-muted-foreground">{t('assistant.tagsHint')}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="text-sm font-medium">{t('assistant.store.capabilities')}</div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t('assistant.store.enableWebSearch')}</div>
                  <div className="text-xs text-muted-foreground">{t('assistant.store.enableWebSearchDesc')}</div>
                </div>
                <Switch checked={enableWebSearch} onCheckedChange={setEnableWebSearch} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t('assistant.store.enableGenerateImage')}</div>
                  <div className="text-xs text-muted-foreground">{t('assistant.store.enableGenerateImageDesc')}</div>
                </div>
                <Switch checked={enableGenerateImage} onCheckedChange={setEnableGenerateImage} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t('assistant.enableMemory')}</div>
                  <div className="text-xs text-muted-foreground">{t('assistant.store.enableMemoryDesc')}</div>
                </div>
                <Switch checked={enableMemory} onCheckedChange={setEnableMemory} />
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border bg-card p-4">
            <div>
              <div className="text-sm font-medium">{t('mcpBridgePanel.title')}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('assistant.store.mcpDesc')}</p>
            </div>

            <div className="space-y-1 rounded-lg border border-border/60 bg-background/70 p-2">
              <SelectionPanelRow
                title={t('mcpSelection.mcpModes.disabled')}
                description={t('assistant.store.mcpDisabledDesc')}
                icon={<X className="h-4 w-4" />}
                selected={mcpSelection.mode === 'disabled'}
                onClick={() => setPresetMcpMode('disabled')}
              />
              <SelectionPanelRow
                title={t('mcpSelection.mcpModes.auto')}
                description={t('assistant.store.mcpAutoDesc')}
                icon={<Sparkles className="h-4 w-4" />}
                selected={mcpSelection.mode === 'auto'}
                right={<Badge variant="secondary" className="text-[10px]">{selectedMcpCountLabel}</Badge>}
                onClick={() => setPresetMcpMode('auto')}
              />
              <SelectionPanelRow
                title={t('mcpSelection.mcpModes.manual')}
                description={t('assistant.store.mcpManualDesc')}
                icon={<Hammer className="h-4 w-4" />}
                selected={mcpSelection.mode === 'manual'}
                right={<Badge variant="secondary" className="text-[10px]">{manualMcpServerIds.length}</Badge>}
                onClick={() => setPresetMcpMode('manual')}
              />
            </div>

            {mcpSelection.mode === 'manual' ? (
              mcpServersResource.status === 'loading' ? (
                <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-4 text-xs text-muted-foreground">
                  {t('common.loading')}
                </div>
              ) : mcpServersResource.status === 'error' ? (
                <div className="rounded-lg border border-border/60 bg-background/70">
                  <SelectionPanelEmpty
                    title={t('common.error')}
                    description={mcpServersResource.error.message || t('common.error')}
                  />
                </div>
              ) : enabledMcpServers.length > 0 ? (
                <div className="space-y-1 rounded-lg border border-border/60 bg-background/70 p-2">
                  {enabledMcpServers.map((server) => (
                    <SelectionPanelRow
                      key={server.id}
                      title={server.name}
                      description={server.url || ''}
                      icon={<Hammer className="h-4 w-4" />}
                      selected={manualMcpServerIds.includes(server.id)}
                      onClick={() => togglePresetMcpServer(server.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-border/60 bg-background/70">
                  <SelectionPanelEmpty
                    title={t('mcpSelection.noMcpServers')}
                    description={t('assistant.store.noMcpServersDesc')}
                  />
                </div>
              )
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!name.trim() || !prompt.trim()}>
            {preset ? t('assistant.store.savePreset') : t('assistant.store.createPreset')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
