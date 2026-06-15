/**
 * 说明：`AssistantStoreDialog` 组件模块。
 *
 * 职责：
 * - 承载扩展内完整助手商店 overlay；
 * - 统一展示“我的预设 / 浏览器场景 / 通用助手”三组、全库搜索、预览确认、导入与管理；
 * - 编排用户预设的创建、编辑、批量删除与批量导出。
 *
 * 边界：
 * - 本组件不直接拥有内置预设真源，也不直接写浏览器存储；
 * - 它只消费上层传入的 builtin/user preset 数据与 CRUD 回调；
 * - 不新增 `/store` 页面，也不兼容旧 `AssistantRolePicker` 语义。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FileJson,
  Globe,
  Import,
  Plus,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AssistantIcon } from '@/components/chat/AssistantIcon';
import { PresetEditorDialog } from '@/components/chat/PresetEditorDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAssistantStore } from '@/hooks/useAssistantStore';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { toast } from '@/hooks/useToast';
import type { StoredAssistantPresetDraft } from '@/lib/assistant/preset-storage';
import { downloadText } from '@/lib/export/download';
import { BUILTIN_DEFAULT_ROLE_TEMPLATE_ID, type AssistantPreset, type StoredAssistantPreset } from '@/types/assistant';
import type { AssistantPresetSection, PresetLibrarySectionKey } from '@/data/role-templates';
import {
  CapabilityBadge,
  PresetMetaCard,
  StoreSectionButton,
} from './AssistantStoreDialog.parts';
import { AssistantStoreCatalogViewport } from './AssistantStoreCatalogViewport';
import { formatErrorMessage } from './AssistantStoreDialog.utils';
import { sortBrowserPresetItems } from './assistant-preset-order';

type AssistantStoreSectionKey = 'mine' | PresetLibrarySectionKey;

type PresetCatalogItem = {
  id: string;
  kind: 'builtin' | 'user';
  sectionKey: AssistantStoreSectionKey;
  preset: AssistantPreset | StoredAssistantPreset;
};

/** `AssistantStoreDialog` 组件入参。 */
export interface AssistantStoreDialogProps {
  /** 是否打开。 */
  open: boolean;
  /** 内置预设全集。 */
  builtinPresets: AssistantPreset[];
  /** 用户预设全集。 */
  userPresets: StoredAssistantPreset[];
  /** 内置分区信息。 */
  presetSections: AssistantPresetSection[];
  /** 关闭回调。 */
  onClose: () => void;
  /** 从预设创建助手。 */
  onCreateAssistantFromPreset: (presetId: string) => void;
  /** 创建用户预设。 */
  onCreatePreset: (draft: StoredAssistantPresetDraft) => string;
  /** 更新用户预设。 */
  onUpdatePreset: (presetId: string, updates: Partial<StoredAssistantPresetDraft>) => void;
  /** 删除用户预设。 */
  onDeletePresets: (presetIds: string[]) => void;
  /** 导入用户预设。 */
  onImportPresets: (input: unknown) => StoredAssistantPreset[];
  /** 导出用户预设。 */
  onExportPresets: (presetIds?: string[]) => StoredAssistantPreset[];
}

/**
 * 扩展内完整助手商店对话框。
 *
 * @remarks
 * 当前版本的产品语义已经彻底切换为“先预览、再显式确认添加到助手”，
 * 因此卡片点击不再直接创建助手实例。
 */
export function AssistantStoreDialog({
  open,
  builtinPresets,
  userPresets,
  presetSections,
  onClose,
  onCreateAssistantFromPreset,
  onCreatePreset,
  onUpdatePreset,
  onDeletePresets,
  onImportPresets,
  onExportPresets,
}: AssistantStoreDialogProps) {
  const { t } = useTranslation();
  const assistants = useAssistantStore((state) => state.assistants);
  const { confirm, ConfirmDialogPortal } = useConfirmDialog();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeSection, setActiveSection] = useState<AssistantStoreSectionKey>('mine');
  const [search, setSearch] = useState('');
  const [manageMode, setManageMode] = useState(false);
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);
  const [previewItem, setPreviewItem] = useState<PresetCatalogItem | null>(null);
  const [presetEditorItem, setPresetEditorItem] = useState<StoredAssistantPreset | null>(null);
  const [presetEditorOpen, setPresetEditorOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setActiveSection('mine');
    setSearch('');
    setManageMode(false);
    setSelectedPresetIds([]);
    setPreviewItem(null);
    setImportDialogOpen(false);
    setImportUrl('');
    setPresetEditorItem(null);
    setPresetEditorOpen(false);
  }, [open]);

  useEffect(() => {
    if (activeSection === 'mine' && !search.trim()) return;
    setManageMode(false);
    setSelectedPresetIds([]);
  }, [activeSection, search]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const assistant of assistants) {
      for (const tag of assistant.tags ?? []) {
        if (tag) tags.add(tag);
      }
    }
    for (const preset of userPresets) {
      for (const tag of preset.tags ?? []) {
        if (tag) tags.add(tag);
      }
    }
    return Array.from(tags).sort((left, right) => left.localeCompare(right));
  }, [assistants, userPresets]);

  const builtinDefaultPreset = useMemo(
    () => builtinPresets.find((preset) => preset.id === BUILTIN_DEFAULT_ROLE_TEMPLATE_ID) ?? null,
    [builtinPresets],
  );

  const builtinSectionMap = useMemo(() => {
    const map = new Map<PresetLibrarySectionKey, AssistantPresetSection>();
    for (const section of presetSections) {
      const normalizedPresets = section.key === 'browser'
        ? sortBrowserPresetItems(section.presets)
        : section.presets;

      if (section.key === 'general' && builtinDefaultPreset) {
        const hasDefaultAlready = normalizedPresets.some((preset) => preset.id === builtinDefaultPreset.id);
        map.set(section.key, {
          ...section,
          presets: hasDefaultAlready ? normalizedPresets : [builtinDefaultPreset, ...normalizedPresets],
        });
        continue;
      }
      map.set(section.key, {
        ...section,
        presets: normalizedPresets,
      });
    }
    if (!map.has('general')) {
      map.set('general', {
        key: 'general',
        title: t('assistant.store.general'),
        categories: [],
        presets: builtinDefaultPreset ? [builtinDefaultPreset] : [],
      });
    }
    if (!map.has('browser')) {
      map.set('browser', {
        key: 'browser',
        title: t('assistant.store.browser'),
        categories: [],
        presets: [],
      });
    }
    return map;
  }, [builtinDefaultPreset, presetSections, t]);

  const catalogItems = useMemo<PresetCatalogItem[]>(() => {
    const userItems: PresetCatalogItem[] = userPresets.map((preset) => ({
      id: preset.id,
      kind: 'user',
      sectionKey: 'mine',
      preset,
    }));
    const builtinItems: PresetCatalogItem[] = (['browser', 'general'] as PresetLibrarySectionKey[]).flatMap((sectionKey) => (
      (builtinSectionMap.get(sectionKey)?.presets ?? []).map((preset) => ({
        id: preset.id,
        kind: 'builtin' as const,
        sectionKey,
        preset,
      }))
    ));
    return [...userItems, ...builtinItems];
  }, [builtinSectionMap, userPresets]);

  const sectionCounts = useMemo(() => ({
    mine: userPresets.length,
    browser: builtinSectionMap.get('browser')?.presets.length ?? 0,
    general: builtinSectionMap.get('general')?.presets.length ?? 0,
  }), [builtinSectionMap, userPresets.length]);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      if (activeSection === 'mine') return catalogItems.filter((item) => item.sectionKey === 'mine');
      return catalogItems.filter((item) => item.sectionKey === activeSection);
    }
    return catalogItems.filter((item) => {
      const { preset } = item;
      return (
        preset.name.toLowerCase().includes(keyword)
        || (preset.description ?? '').toLowerCase().includes(keyword)
        || preset.prompt.toLowerCase().includes(keyword)
        || (preset.tags ?? []).some((tag) => tag.toLowerCase().includes(keyword))
      );
    });
  }, [activeSection, catalogItems, search]);

  const activeTitle = search.trim()
    ? t('assistant.store.searchResults')
    : activeSection === 'mine'
      ? t('assistant.store.mine')
      : activeSection === 'browser'
        ? builtinSectionMap.get('browser')?.title || t('assistant.store.browser')
        : builtinSectionMap.get('general')?.title || t('assistant.store.general');

  const toggleManagedPreset = useCallback((presetId: string) => {
    setSelectedPresetIds((current) => (
      current.includes(presetId)
        ? current.filter((id) => id !== presetId)
        : [...current, presetId]
    ));
  }, []);

  const handleCardClick = useCallback((item: PresetCatalogItem) => {
    if (manageMode && item.kind === 'user' && activeSection === 'mine' && !search.trim()) {
      toggleManagedPreset(item.id);
      return;
    }
    setPreviewItem(item);
  }, [activeSection, manageMode, search, toggleManagedPreset]);

  const handleCreateAssistant = useCallback((presetId: string) => {
    setPreviewItem(null);
    onCreateAssistantFromPreset(presetId);
  }, [onCreateAssistantFromPreset]);

  const handleOpenCreatePreset = useCallback(() => {
    setPresetEditorItem(null);
    setPresetEditorOpen(true);
  }, []);

  const handleOpenEditPreset = useCallback((preset: StoredAssistantPreset) => {
    setPreviewItem(null);
    setPresetEditorItem(preset);
    setPresetEditorOpen(true);
  }, []);

  const handlePresetSubmit = useCallback((draft: StoredAssistantPresetDraft) => {
    if (presetEditorItem) {
      onUpdatePreset(presetEditorItem.id, draft);
      toast.success(t('assistant.store.presetUpdated'));
      return;
    }
    const createdId = onCreatePreset(draft);
    if (createdId) toast.success(t('assistant.store.presetCreated'));
  }, [onCreatePreset, onUpdatePreset, presetEditorItem, t]);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedPresetIds.length < 1) return;
    const confirmed = await confirm({
      title: t('assistant.store.deleteSelectedTitle'),
      description: t('assistant.store.deleteSelectedDesc', { count: selectedPresetIds.length }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      variant: 'destructive',
    });
    if (!confirmed) return;
    onDeletePresets(selectedPresetIds);
    setSelectedPresetIds([]);
    toast.success(t('assistant.store.presetDeleted'));
  }, [confirm, onDeletePresets, selectedPresetIds, t]);

  const downloadPresetJson = useCallback(async (presets: StoredAssistantPreset[], filename: string) => {
    await downloadText(JSON.stringify(presets, null, 2), filename, 'application/json;charset=utf-8');
  }, []);

  const handleExportPreset = useCallback(async (presetId: string) => {
    const exported = onExportPresets([presetId]);
    if (exported.length < 1) {
      toast.error(t('assistant.store.exportEmpty'));
      return;
    }
    await downloadPresetJson(exported, `assistant-preset-${presetId}-${Date.now()}.json`);
    toast.success(t('assistant.store.exportSuccess', { count: exported.length }));
  }, [downloadPresetJson, onExportPresets, t]);

  const handleDeletePreset = useCallback(async (preset: StoredAssistantPreset) => {
    const confirmed = await confirm({
      title: t('assistant.store.deletePresetTitle'),
      description: t('assistant.store.deletePresetDesc', { name: preset.name }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      variant: 'destructive',
    });
    if (!confirmed) return;
    onDeletePresets([preset.id]);
    setSelectedPresetIds((current) => current.filter((id) => id !== preset.id));
    toast.success(t('assistant.store.presetDeletedOne'));
  }, [confirm, onDeletePresets, t]);

  const handleExportSelected = useCallback(async () => {
    const exported = onExportPresets(selectedPresetIds);
    if (exported.length < 1) {
      toast.error(t('assistant.store.exportEmpty'));
      return;
    }
    await downloadPresetJson(exported, `assistant-presets-selected-${Date.now()}.json`);
    toast.success(t('assistant.store.exportSuccess', { count: exported.length }));
  }, [downloadPresetJson, onExportPresets, selectedPresetIds, t]);

  const handleImportPayload = useCallback((payload: unknown) => {
    const imported = onImportPresets(payload);
    if (imported.length < 1) throw new Error(t('assistant.store.importEmpty'));
    setActiveSection('mine');
    setManageMode(false);
    setSelectedPresetIds([]);
    toast.success(t('assistant.store.importSuccess', { count: imported.length }));
    return imported;
  }, [onImportPresets, t]);

  const handleImportFromUrl = useCallback(async () => {
    const url = importUrl.trim();
    if (!url) {
      toast.error(t('assistant.store.importUrlRequired'));
      return;
    }

    setImporting(true);
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(t('assistant.store.importUrlFailedStatus', { status: response.status }));
      const payload = await response.json();
      handleImportPayload(payload);
      setImportDialogOpen(false);
      setImportUrl('');
    } catch (error) {
      toast.error(formatErrorMessage(error, t('assistant.store.importFailed')));
    } finally {
      setImporting(false);
    }
  }, [handleImportPayload, importUrl, t]);

  const handleImportFile = useCallback(async (file: File | null) => {
    if (!file) return;
    try {
      const raw = await file.text();
      const payload = JSON.parse(raw) as unknown;
      handleImportPayload(payload);
      setImportDialogOpen(false);
    } catch (error) {
      toast.error(formatErrorMessage(error, t('assistant.store.importFailed')));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [handleImportPayload, t]);

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
        <DialogContent
          data-testid="assistant-store-dialog"
          className="flex min-h-0 min-w-0 max-w-none flex-col gap-0 overflow-hidden rounded-lg p-0 h-[min(85vh,calc(100dvh-1.5rem))] max-h-[calc(100dvh-1.5rem)] w-[min(1024px,calc(100vw-1.5rem))]"
        >
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>{t('assistant.store.title')}</DialogTitle>
            <DialogDescription>{t('assistant.store.description')}</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col min-[960px]:flex-row">
            <aside className="min-w-0 shrink-0 border-b border-border bg-muted/30 p-2 min-[960px]:min-h-0 min-[960px]:w-48 min-[960px]:border-b-0 min-[960px]:border-r">
              <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {t('assistant.store.library')}
              </div>
              <div className="space-y-1">
                <StoreSectionButton
                  active={activeSection === 'mine' && !search.trim()}
                  title={t('assistant.store.mine')}
                  count={sectionCounts.mine}
                  onClick={() => setActiveSection('mine')}
                />
                <StoreSectionButton
                  active={activeSection === 'browser' && !search.trim()}
                  title={builtinSectionMap.get('browser')?.title || t('assistant.store.browser')}
                  count={sectionCounts.browser}
                  onClick={() => setActiveSection('browser')}
                />
                <StoreSectionButton
                  active={activeSection === 'general' && !search.trim()}
                  title={builtinSectionMap.get('general')?.title || t('assistant.store.general')}
                  count={sectionCounts.general}
                  onClick={() => setActiveSection('general')}
                />
              </div>
            </aside>

            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('assistant.store.searchPlaceholder')}
                    className="h-9 pl-9 text-sm"
                  />
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setImportDialogOpen(true)}>
                  <Import className="h-4 w-4" />
                  {t('assistant.store.import')}
                </Button>
                <Button
                  variant={manageMode ? 'default' : 'outline'}
                  size="sm"
                  className="gap-2"
                  onClick={() => setManageMode((current) => !current)}
                  disabled={activeSection !== 'mine' || Boolean(search.trim())}
                >
                  <Settings2 className="h-4 w-4" />
                  {t('assistant.store.manage')}
                </Button>
                <Button size="sm" className="gap-2" onClick={handleOpenCreatePreset}>
                  <Plus className="h-4 w-4" />
                  {t('assistant.store.createPreset')}
                </Button>
              </div>

              {manageMode ? (
                <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/20 px-5 py-3">
                  <div className="text-sm text-muted-foreground">
                    {t('assistant.store.selectedCount', { count: selectedPresetIds.length })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => void handleExportSelected()}
                    disabled={selectedPresetIds.length < 1}
                  >
                    <Download className="h-4 w-4" />
                    {t('assistant.store.exportSelected')}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    onClick={() => void handleDeleteSelected()}
                    disabled={selectedPresetIds.length < 1}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('assistant.store.deleteSelected')}
                  </Button>
                </div>
              ) : null}

              <div className="flex min-h-0 min-w-0 flex-1 flex-col px-5 py-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{activeTitle}</div>
                    <div className="text-xs text-muted-foreground">
                      {search.trim()
                        ? t('assistant.store.searchSummary', { count: filteredItems.length })
                        : t('assistant.store.sectionSummary', { count: filteredItems.length })}
                    </div>
                  </div>
                </div>

                <AssistantStoreCatalogViewport
                  activeSection={activeSection}
                  search={search}
                  filteredItems={filteredItems}
                  manageMode={manageMode}
                  selectedPresetIds={selectedPresetIds}
                  onCardClick={handleCardClick}
                  onToggleManagedPreset={toggleManagedPreset}
                  onEditUserPreset={handleOpenEditPreset}
                  onExportUserPreset={(presetId) => void handleExportPreset(presetId)}
                  onDeleteUserPreset={(preset) => void handleDeletePreset(preset)}
                  onPrimaryEmptyAction={handleOpenCreatePreset}
                  onSecondaryEmptyAction={() => setImportDialogOpen(true)}
                />
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewItem)} onOpenChange={(nextOpen) => { if (!nextOpen) setPreviewItem(null); }}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden rounded-lg p-0">
          {previewItem ? (
            <>
              <DialogHeader className="border-b border-border px-6 py-4">
                <DialogTitle className="flex items-center gap-3">
                  <AssistantIcon
                    iconId={previewItem.preset.iconId}
                    size={24}
                    className="h-10 w-10 rounded-lg border border-border/60 bg-muted/20"
                    iconClassName="h-5 w-5"
                  />
                  <div className="min-w-0">
                    <div className="truncate">{previewItem.preset.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant={previewItem.kind === 'user' ? 'default' : 'secondary'} className="rounded-full px-2 text-[10px]">
                        {previewItem.kind === 'user' ? t('assistant.store.mine') : t(`assistant.store.${previewItem.sectionKey}`)}
                      </Badge>
                      {(previewItem.preset.tags ?? []).map((tag) => (
                        <Badge key={`${previewItem.id}-${tag}`} variant="secondary" className="rounded-full px-2 text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </DialogTitle>
                <DialogDescription>{previewItem.preset.description || t('assistant.store.noDescription')}</DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <PresetMetaCard label={t('assistant.store.scenario')} value={t(`assistant.store.${previewItem.preset.scenario}`)} />
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <CapabilityBadge enabled={Boolean(previewItem.preset.enableWebSearch)} label={t('assistant.store.enableWebSearch')} />
                  <CapabilityBadge enabled={Boolean(previewItem.preset.enableGenerateImage)} label={t('assistant.store.enableGenerateImage')} />
                  <CapabilityBadge enabled={Boolean(previewItem.preset.enableMemory)} label={t('assistant.enableMemory')} />
                  <CapabilityBadge enabled={Boolean(previewItem.preset.mcpSelection && previewItem.preset.mcpSelection.mode !== 'disabled')} label="MCP" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t('assistant.systemPrompt')}</Label>
                  <Textarea value={previewItem.preset.prompt} readOnly className="min-h-[240px] text-sm" />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
                <Button variant="ghost" size="sm" onClick={() => setPreviewItem(null)}>
                  {t('common.cancel')}
                </Button>
                <Button size="sm" onClick={() => handleCreateAssistant(previewItem.id)}>
                  {t('assistant.store.addToAssistant')}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={importDialogOpen} onOpenChange={(nextOpen) => { if (!nextOpen) setImportDialogOpen(false); }}>
        <DialogContent className="max-w-lg rounded-lg">
          <DialogHeader>
            <DialogTitle>{t('assistant.store.importTitle')}</DialogTitle>
            <DialogDescription>{t('assistant.store.importDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="assistant-store-import-url" className="text-xs">
                {t('assistant.store.importFromUrl')}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="assistant-store-import-url"
                  value={importUrl}
                  onChange={(event) => setImportUrl(event.target.value)}
                  placeholder={t('assistant.store.importUrlPlaceholder')}
                  className="h-9"
                />
                <Button className="gap-2" onClick={() => void handleImportFromUrl()} disabled={importing}>
                  <Globe className="h-4 w-4" />
                  {t('assistant.store.import')}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">{t('assistant.store.importFromFile')}</Label>
              <div className="rounded-lg border border-dashed border-border bg-card p-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => {
                    void handleImportFile(event.target.files?.[0] ?? null);
                  }}
                />
                <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                  <FileJson className="h-4 w-4" />
                  {t('assistant.store.pickJsonFile')}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PresetEditorDialog
        open={presetEditorOpen}
        preset={presetEditorItem}
        availableTags={availableTags}
        onClose={() => {
          setPresetEditorOpen(false);
          setPresetEditorItem(null);
        }}
        onSubmit={handlePresetSubmit}
      />

      <ConfirmDialogPortal />
    </>
  );
}
