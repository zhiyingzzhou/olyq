/**
 * 说明：`QuickPhraseManager` 组件模块。
 *
 * 职责：
 * - 承载快捷短语的阻塞式管理弹窗；
 * - 在同一个可发现入口里管理当前助手常用短语和全局快捷短语；
 * - 复用扩展现有 Dialog、Tabs、TooltipAction 与 shared JSON 配置通道。
 *
 * 边界：
 * - 本组件不实现旧 `name` 字段兼容；
 * - 聊天输入区插入逻辑由 quick panel controller 负责。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Check, Globe2, Pencil, Plus, Search, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { QuickPhraseSortableList } from '@/components/chat/QuickPhraseSortableList';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAssistantStore } from '@/hooks/useAssistantStore';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { sortQuickPhrases } from '@/lib/quick-phrases/phrase-normalize';
import { createId } from '@/lib/utils/id';
import {
  addQuickPhrase,
  deleteQuickPhrase,
  getQuickPhrases,
  reorderQuickPhrases,
  subscribeQuickPhrases,
  updateQuickPhrase,
  type QuickPhrase,
} from '@/lib/quick-phrases/phrase-store';

/** 快捷短语管理弹窗入参。 */
interface Props {
  /** 是否打开弹窗。 */
  open: boolean;
  /** 关闭弹窗回调。 */
  onClose: () => void;
  /** 当前会话绑定的助手 ID，用于直接管理该助手常用短语。 */
  activeAssistantId?: string | null;
}

/** 管理表单当前模式。 */
type PhraseFormMode = 'create' | 'edit';

/** 当前管理的快捷短语作用域。 */
type PhraseManageScope = 'assistant' | 'global';

/**
 * 将过滤后的可见短语顺序映射回完整短语列表。
 *
 * @param allPhrases - 当前完整展示顺序。
 * @param visibleOrder - 拖拽后的可见短语顺序。
 * @returns 保留不可见条目原位后的完整顺序。
 */
function applyVisiblePhraseOrder(allPhrases: QuickPhrase[], visibleOrder: QuickPhrase[]): QuickPhrase[] {
  const visibleIds = new Set(visibleOrder.map((phrase) => phrase.id));
  let visibleCursor = 0;
  return allPhrases.map((phrase) => {
    if (!visibleIds.has(phrase.id)) return phrase;
    const replacement = visibleOrder[visibleCursor] ?? phrase;
    visibleCursor += 1;
    return replacement;
  });
}

/**
 * 按当前 UI 顺序重写短语排序值。
 *
 * @param phrases - 已按 UI 顺序排列的短语。
 * @returns 写入稳定 `order` 和 `updatedAt` 后的新数组。
 */
function stampPhraseOrder(phrases: QuickPhrase[]): QuickPhrase[] {
  const now = Date.now();
  const length = phrases.length;
  return phrases.map((phrase, index) => ({
    ...phrase,
    order: length - index,
    updatedAt: now,
  }));
}

/**
 * 快捷短语管理弹窗。
 *
 * @param props - 弹窗开关与关闭回调。
 * @returns 当前助手短语与全局短语的搜索、新增、编辑、删除确认与排序界面。
 */
export function QuickPhraseManager({ open, onClose, activeAssistantId = null }: Props) {
  const { t } = useTranslation();
  const { confirm, ConfirmDialogPortal } = useConfirmDialog();
  const activeAssistant = useAssistantStore((state) => {
    const normalizedAssistantId = String(activeAssistantId || '').trim();
    if (!normalizedAssistantId) return null;
    return state.assistants.find((assistant) => assistant.id === normalizedAssistantId) ?? null;
  });
  const hasActiveAssistant = Boolean(activeAssistant);
  const activeAssistantRecordId = activeAssistant?.id ?? '';
  const updateAssistantConfig = useAssistantStore((state) => state.updateAssistantConfig);
  const [phrases, setPhrases] = useState<QuickPhrase[]>(() => getQuickPhrases());
  const [scope, setScope] = useState<PhraseManageScope>(() => (activeAssistant ? 'assistant' : 'global'));
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<PhraseFormMode>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const assistantPhrases = useMemo(() => sortQuickPhrases(activeAssistant?.regularPhrases ?? []), [activeAssistant?.regularPhrases]);
  const sourcePhrases = scope === 'assistant' && activeAssistant ? assistantPhrases : phrases;

  useEffect(() => {
    if (!open) return;
    setPhrases(getQuickPhrases());
    setScope(hasActiveAssistant ? 'assistant' : 'global');
    setQuery('');
  }, [activeAssistantRecordId, hasActiveAssistant, open]);

  useEffect(() => {
    return subscribeQuickPhrases(() => setPhrases(getQuickPhrases()));
  }, []);

  useEffect(() => {
    if (!activeAssistant && scope === 'assistant') setScope('global');
  }, [activeAssistant, scope]);

  const filteredPhrases = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return sourcePhrases;
    return sourcePhrases.filter((phrase) => {
      return phrase.title.toLowerCase().includes(normalizedQuery)
        || phrase.content.toLowerCase().includes(normalizedQuery);
    });
  }, [query, sourcePhrases]);

  const resetForm = useCallback(() => {
    setMode('create');
    setEditingId(null);
    setTitle('');
    setContent('');
  }, []);

  const beginEdit = useCallback((phrase: QuickPhrase) => {
    setMode('edit');
    setEditingId(phrase.id);
    setTitle(phrase.title);
    setContent(phrase.content);
  }, []);

  const commitAssistantPhrases = useCallback((next: QuickPhrase[]) => {
    if (!activeAssistant) return;
    updateAssistantConfig(activeAssistant.id, { regularPhrases: sortQuickPhrases(next) });
  }, [activeAssistant, updateAssistantConfig]);

  const handleSubmit = useCallback(() => {
    const nextTitle = title.trim();
    const nextContent = content.trim();
    if (!nextTitle || !nextContent) return;

    if (scope === 'assistant' && activeAssistant) {
      if (mode === 'edit' && editingId) {
        const now = Date.now();
        commitAssistantPhrases(assistantPhrases.map((phrase) => (
          phrase.id === editingId
            ? { ...phrase, title: nextTitle, content: nextContent, updatedAt: now }
            : phrase
        )));
        resetForm();
        return;
      }

      const now = Date.now();
      commitAssistantPhrases([
        {
          id: createId(),
          title: nextTitle,
          content: nextContent,
          createdAt: now,
          updatedAt: now,
          order: now,
        },
        ...assistantPhrases,
      ]);
      resetForm();
      return;
    }

    if (mode === 'edit' && editingId) {
      updateQuickPhrase(editingId, { title: nextTitle, content: nextContent });
      resetForm();
      return;
    }

    addQuickPhrase({ title: nextTitle, content: nextContent });
    resetForm();
  }, [activeAssistant, assistantPhrases, commitAssistantPhrases, content, editingId, mode, resetForm, scope, title]);

  const handleReorderVisiblePhrases = useCallback((visibleOrder: QuickPhrase[]) => {
    if (scope === 'assistant') {
      if (!activeAssistant) return;
      commitAssistantPhrases(stampPhraseOrder(query.trim()
        ? applyVisiblePhraseOrder(assistantPhrases, visibleOrder)
        : visibleOrder));
      return;
    }

    reorderQuickPhrases(query.trim()
      ? applyVisiblePhraseOrder(phrases, visibleOrder)
      : visibleOrder);
  }, [activeAssistant, assistantPhrases, commitAssistantPhrases, phrases, query, scope]);

  const handleDelete = useCallback((candidate: { scope: PhraseManageScope; phrase: QuickPhrase }) => {
    if (candidate.scope === 'assistant') {
      if (activeAssistant) {
        commitAssistantPhrases(stampPhraseOrder(assistantPhrases.filter((phrase) => phrase.id !== candidate.phrase.id)));
      }
    } else {
      deleteQuickPhrase(candidate.phrase.id);
    }
    if (editingId === candidate.phrase.id && scope === candidate.scope) resetForm();
  }, [activeAssistant, assistantPhrases, commitAssistantPhrases, editingId, resetForm, scope]);

  const requestDelete = useCallback(async (candidate: { scope: PhraseManageScope; phrase: QuickPhrase }) => {
    const ok = await confirm({
      title: t('quickPhrase.deleteConfirmTitle'),
      description: t('quickPhrase.deleteConfirmDesc'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      variant: 'destructive',
    });
    if (!ok) return;
    handleDelete(candidate);
  }, [confirm, handleDelete, t]);

  const handleScopeChange = useCallback((nextScope: string) => {
    if (nextScope !== 'assistant' && nextScope !== 'global') return;
    if (nextScope === 'assistant' && !activeAssistant) return;
    setScope(nextScope);
    setQuery('');
    resetForm();
  }, [activeAssistant, resetForm]);

  const formIsValid = title.trim().length > 0 && content.trim().length > 0;
  const panelDescription = scope === 'assistant' && activeAssistant
    ? t('quickPhrase.assistantManageDesc')
    : t('quickPhrase.manageGlobalDesc');

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
        <DialogContent className="flex h-[min(720px,calc(100vh-2rem))] w-[min(860px,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden rounded-lg p-0">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>{t('quickPhrase.manageTitle')}</DialogTitle>
            <DialogDescription>{t('quickPhrase.manageDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 border-b border-border px-6 py-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <Tabs value={scope} onValueChange={handleScopeChange} className="w-full md:w-auto">
                <TabsList className={`grid w-full md:w-[18rem] ${activeAssistant ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {activeAssistant ? (
                    <TabsTrigger value="assistant" className="gap-1.5">
                      <Bot className="h-3.5 w-3.5" />
                      {t('quickPhrase.assistantScope')}
                    </TabsTrigger>
                  ) : null}
                  <TabsTrigger value="global" className="gap-1.5">
                    <Globe2 className="h-3.5 w-3.5" />
                    {t('quickPhrase.globalScope')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="relative w-full md:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('quickPhrase.search')}
                  className="h-9 pl-9"
                />
              </div>
            </div>

            <div className="flex min-h-5 items-center gap-2 text-xs text-muted-foreground">
              {scope === 'assistant' && activeAssistant ? (
                <span className="truncate font-medium text-foreground">{activeAssistant.name}</span>
              ) : null}
              <span className="truncate">{panelDescription}</span>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-background md:grid-cols-[minmax(0,1fr)_18rem]">
            <div data-testid="quick-phrase-list-panel" className="min-h-0 overflow-y-auto border-b border-border/70 p-4 md:border-b-0 md:border-r">
              <QuickPhraseSortableList
                phrases={filteredPhrases}
                selectedId={editingId}
                emptyTitle={query.trim() ? t('quickPhrase.noResults') : t('quickPhrase.empty')}
                emptyDescription={scope === 'assistant' ? t('quickPhrase.assistantManageDesc') : t('quickPhrase.addFromInputDesc')}
                actionVisibility={scope === 'assistant' ? 'always' : 'hover'}
                onReorder={handleReorderVisiblePhrases}
                onEdit={beginEdit}
                onDelete={(phrase) => { void requestDelete({ scope, phrase }); }}
              />
            </div>

            <div className="min-h-0 overflow-y-auto p-4">
              <div className="divide-y divide-border/70 rounded-lg border border-border bg-card p-4">
                <section className="flex items-start gap-2 pb-3">
                  <div className="mt-0.5 shrink-0 text-muted-foreground">
                    {mode === 'edit' ? <Pencil className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">
                      {mode === 'edit' ? t('common.edit') : t('quickPhrase.add')}
                    </div>
                    <div className="mt-0.5 text-xs leading-5 text-muted-foreground">
                      {scope === 'assistant' ? t('quickPhrase.assistantScopeDesc') : t('quickPhrase.globalScopeDesc')}
                    </div>
                  </div>
                </section>

                <section className="space-y-1.5 py-3">
                  <Label className="text-xs">{t('quickPhrase.titleLabel')}</Label>
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={t('quickPhrase.titlePlaceholder')}
                    className="h-9"
                  />
                </section>

                <section className="space-y-1.5 py-3">
                  <Label className="text-xs">{t('quickPhrase.contentLabel')}</Label>
                  <Textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder={t('quickPhrase.contentPlaceholder')}
                    className="min-h-[140px] resize-none text-sm"
                  />
                </section>

                <section className="flex justify-end gap-2 pt-3">
                  {mode === 'edit' ? (
                    <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                      {t('common.cancel')}
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" disabled={!formIsValid} onClick={handleSubmit}>
                    {mode === 'edit' ? <Check className="mr-1.5 h-4 w-4" /> : <Plus className="mr-1.5 h-4 w-4" />}
                    {mode === 'edit' ? t('common.save') : t('quickPhrase.add')}
                  </Button>
                </section>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialogPortal />
    </>
  );
}
