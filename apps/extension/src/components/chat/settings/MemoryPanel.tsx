/**
 * 说明：`MemoryPanel` 组件模块。
 *
 * 职责：
 * - 承载 `MemoryPanel` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MemoryPanel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ModelPickerDialog } from '@/components/chat/ModelPickerDialog';
import { toast } from '@/hooks/useToast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { generateEmbedding } from '@/lib/embedding';
import { defaultChatModelFilter } from '@/lib/ai/model-filters';
import { supportsEmbeddingProvider, supportsRerankProvider } from '@/lib/ai/provider-capabilities';
import { useModelOptions, type ModelOption } from '@/hooks/useModelOptions';
import {
  addMemory,
  clearAllMemories,
  deleteMemory,
  getMemoryConfig,
  isMemoryConfigured,
  listMemories,
  saveMemoryConfig,
  subscribeMemoryConfigChange,
  updateMemory,
  type GlobalMemoryConfig,
  type MemoryItem,
} from '@/lib/memory';
import { logger } from '@/lib/logger';
import { subscribeStoreReloadSignal } from '@/lib/storage/reload-signal';
import { MemoryEditDialog } from '@/components/chat/settings/memory-panel/MemoryEditDialog';
import { MemoryListSection } from '@/components/chat/settings/memory-panel/MemoryListSection';
import { MemorySettingsSection, type MemoryModelDisplay } from '@/components/chat/settings/memory-panel/MemorySettingsSection';
import { SettingsPanelInset, SettingsPanelRoot, SettingsPanelScroller } from './layout';

/** 默认的记忆租户 ID。当前扩展仅维护单用户本地记忆，因此固定为该值。 */
const DEFAULT_USER_ID = 'default-user';
/** 当前模型选择器弹窗所服务的记忆模型类型。 */
type MemoryModelPickerTarget = 'embedding' | 'llm' | 'rerank';

/**
 * 判断模型是否为 embedding 类型。
 *
 * @param m - 待判断模型。
 * @returns 命中 embedding 主类时返回 `true`。
 */
function isEmbeddingModel(m: ModelOption) {
  return m.kind === 'embedding';
}

/**
 * 判断模型是否为 rerank 类型。
 *
 * @param m - 待判断模型。
 * @returns 命中 rerank 主类时返回 `true`。
 */
function isRerankModel(m: ModelOption) {
  return m.kind === 'rerank';
}

/**
 * 全局记忆设置面板。
 *
 * 职责：
 * - 管理记忆配置、模型选择和数量展示；
 * - 提供新增、编辑、删除、清空本地记忆的 UI；
 * - 在新增和编辑时同步重算 embedding，保证向量与文本内容一致。
 */
export function MemoryPanel() {
  const { t } = useTranslation();
  const { confirm, ConfirmDialogPortal } = useConfirmDialog();
  const { providers, models, modelMap, getModelLabel } = useModelOptions();

  /** 当前全局记忆配置快照。 */
  const [config, setConfig] = useState<GlobalMemoryConfig>(() => getMemoryConfig());
  /** 当前加载出的全部记忆项。 */
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  /** 首次加载是否完成。 */
  const [loaded, setLoaded] = useState(false);

  /** 记忆列表搜索关键词。 */
  const [search, setSearch] = useState('');
  /** 新增表单是否展开。 */
  const [addOpen, setAddOpen] = useState(false);
  /** 新增记忆输入草稿。 */
  const [addText, setAddText] = useState('');

  /** 编辑弹窗是否打开。 */
  const [editOpen, setEditOpen] = useState(false);
  /** 当前正在编辑的记忆项。 */
  const [editing, setEditing] = useState<MemoryItem | null>(null);
  /** 编辑弹窗中的草稿文本。 */
  const [editText, setEditText] = useState('');
  /** 当前打开的模型选择器目标。 */
  const [modelPickerTarget, setModelPickerTarget] = useState<MemoryModelPickerTarget | null>(null);

  /** Provider ID -\> Provider 配置映射，用于校验模型能力和展示 Logo。 */
  const providerMapById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers],
  );

  /** 当前所有可用于 embedding 的模型。 */
  const embeddingModels = useMemo(
    () =>
      models.filter((model) => {
        if (!isEmbeddingModel(model)) return false;
        const provider = providerMapById.get(model.providerId);
        return Boolean(provider && supportsEmbeddingProvider(provider));
      }),
    [models, providerMapById],
  );
  const rerankModels = useMemo(
    () =>
      models.filter((model) => {
        if (!isRerankModel(model)) return false;
        const provider = providerMapById.get(model.providerId);
        return Boolean(provider && supportsRerankProvider(provider));
      }),
    [models, providerMapById],
  );
  /** 当前所有可用于 LLM 生成的模型。 */
  const llmModels = useMemo(() => models.filter(defaultChatModelFilter), [models]);

  /** embedding 模型 ID 白名单。 */
  const embeddingModelIds = useMemo(() => new Set(embeddingModels.map((model) => model.id)), [embeddingModels]);
  /** llm 模型 ID 白名单。 */
  const llmModelIds = useMemo(() => new Set(llmModels.map((model) => model.id)), [llmModels]);
  /** rerank 模型 ID 白名单。 */
  const rerankModelIds = useMemo(() => new Set(rerankModels.map((model) => model.id)), [rerankModels]);

  /** 当前配置中的 embedding 模型是否已失效。 */
  const hasInvalidEmbeddingModel = Boolean(config.embeddingModel && !embeddingModelIds.has(config.embeddingModel));
  /** 当前配置中的 llm 模型是否已失效。 */
  const hasInvalidLlmModel = Boolean(config.llmModel && !llmModelIds.has(config.llmModel));
  /** 当前配置中的 rerank 模型是否已失效。 */
  const hasInvalidRerankModel = Boolean(config.rerankModel && !rerankModelIds.has(config.rerankModel));
  /** 当前是否存在任意已失效模型选择。 */
  const hasInvalidSelection = hasInvalidEmbeddingModel || hasInvalidLlmModel || hasInvalidRerankModel;
  /** 记忆能力当前是否完整可用。 */
  const configured = isMemoryConfigured(config) && !hasInvalidEmbeddingModel && !hasInvalidLlmModel;

  /** 从本地存储重新加载全部记忆。 */
  const reload = useCallback(async () => {
    const items = await listMemories({ userId: DEFAULT_USER_ID, limit: 10_000, offset: 0 }).catch(() => []);
    setMemories(items);
  }, []);

  useEffect(() => {
    void Promise.all([reload(), Promise.resolve()]).then(() => setLoaded(true));
  }, [reload]);

  useEffect(() => {
    /** 内存配置变化时刷新面板中的配置快照。 */
    const onConfigChange = () => setConfig(getMemoryConfig());
    /** 内存条目变化时重载列表，保证新增/删除/编辑后 UI 立即同步。 */
    const onMemoryChanged = () => { void reload(); };
    /** 云同步或恢复触发全局 reload 时，同时刷新配置和记忆列表。 */
    const onStoreReload = () => {
      onConfigChange();
      void reload();
    };

    const unsubscribeConfig = subscribeMemoryConfigChange(onConfigChange);
    const unsubscribeReload = subscribeStoreReloadSignal(onStoreReload);
    window.addEventListener('olyq:memory-changed', onMemoryChanged as EventListener);
    return () => {
      unsubscribeConfig();
      unsubscribeReload();
      window.removeEventListener('olyq:memory-changed', onMemoryChanged as EventListener);
    };
  }, [reload]);

  /**
   * 更新全局记忆配置。
   *
   * @param patch - 本次要覆盖的字段。
   */
  const updateConfig = useCallback((patch: Partial<GlobalMemoryConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    saveMemoryConfig(next);
  }, [config]);

  /**
   * 将模型 ID 解析成面板展示信息。
   *
   * @param id - 模型 ID。
   * @returns 用于设置区按钮展示的名称与 Provider 信息。
   */
  const resolveModelDisplay = useCallback((id?: string): MemoryModelDisplay => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      return { label: t('common.notSet') };
    }

    const opt = modelMap.get(normalizedId);
    const providerId = opt?.providerId || normalizedId.split('/')[0] || undefined;
    const provider = providerId ? providerMapById.get(providerId) : undefined;
    const fallbackLabel = normalizedId.split('/').slice(1).join('/') || getModelLabel(normalizedId);

    return {
      label: opt?.name || fallbackLabel,
      providerId,
      providerLogo: provider?.logo,
    };
  }, [getModelLabel, modelMap, providerMapById, t]);

  const embeddingModelDisplay = useMemo(
    () => resolveModelDisplay(config.embeddingModel),
    [config.embeddingModel, resolveModelDisplay],
  );

  const llmModelDisplay = useMemo(
    () => resolveModelDisplay(config.llmModel),
    [config.llmModel, resolveModelDisplay],
  );

  const rerankModelDisplay = useMemo(
    () => resolveModelDisplay(config.rerankModel),
    [config.rerankModel, resolveModelDisplay],
  );

  const invalidSelectionLabel = useMemo(() => {
    const labels: string[] = [];
    if (hasInvalidEmbeddingModel) labels.push(t('memory.embeddingModel'));
    if (hasInvalidLlmModel) labels.push(t('memory.llmModel'));
    if (hasInvalidRerankModel) labels.push(t('memory.rerankModel'));
    return labels.join(', ');
  }, [hasInvalidEmbeddingModel, hasInvalidLlmModel, hasInvalidRerankModel, t]);

  /** 打开指定类型的模型选择器。 */
  const handleOpenModelPicker = useCallback((target: MemoryModelPickerTarget) => {
    setModelPickerTarget(target);
  }, []);

  /** 关闭当前模型选择器。 */
  const handleCloseModelPicker = useCallback(() => {
    setModelPickerTarget(null);
  }, []);

  /**
   * 清空指定类型的模型配置。
   *
   * @param target - 模型类型。
   */
  const handleClearModel = useCallback((target: MemoryModelPickerTarget) => {
    if (target === 'embedding') {
      updateConfig({ embeddingModel: undefined });
      return;
    }
    if (target === 'llm') {
      updateConfig({ llmModel: undefined });
      return;
    }
    updateConfig({ rerankModel: undefined });
  }, [updateConfig]);

  /** 模型选择器当前选中的值。 */
  const modelPickerValue = useMemo(() => {
    if (modelPickerTarget === 'embedding') return config.embeddingModel || '';
    if (modelPickerTarget === 'llm') return config.llmModel || '';
    if (modelPickerTarget === 'rerank') return config.rerankModel || '';
    return '';
  }, [config.embeddingModel, config.llmModel, config.rerankModel, modelPickerTarget]);

  const modelPickerFilter = useCallback((model: ModelOption) => {
    if (modelPickerTarget === 'embedding') return embeddingModelIds.has(model.id);
    if (modelPickerTarget === 'llm') return llmModelIds.has(model.id);
    if (modelPickerTarget === 'rerank') return rerankModelIds.has(model.id);
    return false;
  }, [embeddingModelIds, llmModelIds, modelPickerTarget, rerankModelIds]);

  /**
   * 处理模型选择器回传。
   *
   * @param modelId - 新选中的模型 ID。
   */
  const handleSelectModel = useCallback((modelId: string) => {
    if (modelPickerTarget === 'embedding') {
      updateConfig({ embeddingModel: modelId });
      return;
    }
    if (modelPickerTarget === 'llm') {
      updateConfig({ llmModel: modelId });
      return;
    }
    if (modelPickerTarget === 'rerank') {
      updateConfig({ rerankModel: modelId });
    }
  }, [modelPickerTarget, updateConfig]);

  /** 打开记忆编辑弹窗。 */
  const openEdit = useCallback((m: MemoryItem) => {
    setEditing(m);
    setEditText(m.memory);
    setEditOpen(true);
  }, []);

  /**
   * 删除单条记忆。
   *
   * @param id - 记忆 ID。
   * @param content - 记忆文本，用于确认文案。
   */
  const handleDelete = useCallback(async (id: string, content: string) => {
    const ok = await confirm({
      title: t('memory.deleteConfirmTitle'),
      description: t('memory.deleteConfirmDesc', { content: content.slice(0, 30) }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      variant: 'destructive',
    });
    if (!ok) return;
    await deleteMemory(id).catch((e) => logger.memory.error('deleteMemory failed', e, { id }));
    setMemories((prev) => prev.filter((x) => x.id !== id));
  }, [confirm, t]);

  /** 清空全部本地记忆。 */
  const handleClearAll = useCallback(async () => {
    const ok = await confirm({
      title: t('memory.clearConfirm'),
      description: t('memory.clearConfirmDesc'),
      confirmLabel: t('common.clear'),
      cancelLabel: t('common.cancel'),
      variant: 'destructive',
    });
    if (!ok) return;
    await clearAllMemories().catch((e) => logger.memory.error('clearAllMemories failed', e));
    setMemories([]);
    toast({ title: t('memory.cleared') });
  }, [confirm, t]);

  /** 新增一条手工记忆，并同步生成 embedding。 */
  const handleAdd = useCallback(async () => {
    const text = addText.trim();
    if (!text) return;
    if (!config.embeddingModel || hasInvalidEmbeddingModel) {
      toast({
        title: t('common.error'),
        description: hasInvalidEmbeddingModel ? t('memory.invalidEmbeddingModel') : t('memory.configureEmbeddingFirst'),
        variant: 'destructive',
      });
      return;
    }

    try {
      const vec = await generateEmbedding({
        items: [{ type: 'text', text }],
        options: { model: config.embeddingModel, normalize: true },
      });
      await addMemory({
        userId: DEFAULT_USER_ID,
        memory: text,
        embedding: vec,
        metadata: { source: 'manual' },
      });
      setAddText('');
      setAddOpen(false);
      await reload();
      toast({ title: t('memory.added') });
    } catch (e: unknown) {
      toast({ title: t('common.error'), description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  }, [addText, config.embeddingModel, hasInvalidEmbeddingModel, reload, t]);

  /** 保存编辑后的记忆内容，并重新生成 embedding。 */
  const handleEditSave = useCallback(async () => {
    const m = editing;
    if (!m) return;
    const text = editText.trim();
    if (!text) return;
    if (!config.embeddingModel || hasInvalidEmbeddingModel) {
      toast({
        title: t('common.error'),
        description: hasInvalidEmbeddingModel ? t('memory.invalidEmbeddingModel') : t('memory.configureEmbeddingFirst'),
        variant: 'destructive',
      });
      return;
    }

    try {
      const vec = await generateEmbedding({
        items: [{ type: 'text', text }],
        options: { model: config.embeddingModel, normalize: true },
      });
      await updateMemory({
        id: m.id,
        memory: text,
        embedding: vec,
        metadata: { ...(m.metadata ?? {}), source: 'manual-edit' },
      });
      setEditOpen(false);
      setEditing(null);
      setEditText('');
      await reload();
      toast({ title: t('memory.updated') });
    } catch (e: unknown) {
      toast({ title: t('common.error'), description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  }, [config.embeddingModel, editText, editing, hasInvalidEmbeddingModel, reload, t]);

  /** 搜索过滤后的记忆列表。 */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return memories;
    return memories.filter((m) => m.memory.toLowerCase().includes(q));
  }, [memories, search]);

  /** 顶部配置区展示的记忆数量文案。 */
  const memCountText = useMemo(() => {
    return t('memory.count', { count: memories.length });
  }, [memories.length, t]);

  if (!loaded) return null;

  return (
    <>
      <SettingsPanelRoot>
        <SettingsPanelScroller>
          <SettingsPanelInset>
            <div className="space-y-5">
              <MemorySettingsSection
                config={config}
                embeddingModelDisplay={embeddingModelDisplay}
                llmModelDisplay={llmModelDisplay}
                rerankModelDisplay={rerankModelDisplay}
                hasInvalidEmbeddingModel={hasInvalidEmbeddingModel}
                hasInvalidLlmModel={hasInvalidLlmModel}
                hasInvalidRerankModel={hasInvalidRerankModel}
                hasInvalidSelection={hasInvalidSelection}
                invalidSelectionLabel={invalidSelectionLabel}
                configured={configured}
                memCountText={memCountText}
                onUpdateConfig={updateConfig}
                onOpenModelPicker={handleOpenModelPicker}
                onClearModel={handleClearModel}
              />

              <MemoryListSection
                memories={memories}
                filteredMemories={filtered}
                addOpen={addOpen}
                addText={addText}
                search={search}
                onSetAddOpen={setAddOpen}
                onSetAddText={setAddText}
                onSetSearch={setSearch}
                onAdd={handleAdd}
                onOpenEdit={openEdit}
                onDelete={handleDelete}
                onClearAll={handleClearAll}
              />
            </div>
          </SettingsPanelInset>
        </SettingsPanelScroller>
      </SettingsPanelRoot>

      <ModelPickerDialog
        open={modelPickerTarget !== null}
        value={modelPickerValue}
        onSelect={handleSelectModel}
        onClose={handleCloseModelPicker}
        filter={modelPickerFilter}
      />

      <MemoryEditDialog
        open={editOpen}
        value={editText}
        onOpenChange={(open) => {
          if (!open) setEditOpen(false);
        }}
        onChange={setEditText}
        onSave={handleEditSave}
      />

      <ConfirmDialogPortal />
    </>
  );
}
