/**
 * 说明：`Paint` 页面模块。
 *
 * 职责：
 * - 承载 `Paint` 相关的当前文件实现与模块边界；
 * - 对外暴露 `Paint` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { shallow } from 'zustand/shallow';

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ModelPickerDialog } from '@/components/chat/ModelPickerDialog';
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore';
import { toast } from '@/hooks/useToast';
import { usePreventWindowFileDrop } from '@/hooks/usePreventWindowFileDrop';
import { usePaintStore, type PaintingImageRef } from '@/hooks/usePaintStore';
import { useModelOptions, type ModelOption } from '@/hooks/useModelOptions';
import { isDedicatedImageModelLike } from '@/lib/ai/model-filters';
import {
  filterSupportedImageGenerationStandardParams,
  parseImageGenerationProviderOptionsJson,
  resolveImageGenerationCapability,
} from '@/lib/ai/image-generation-params';
import { supportsImageProvider } from '@/lib/ai/provider-capabilities';
import { blobToDataUrl, dataUrlToBlob, deleteAttachments, getAttachmentBlob, putImageAttachment } from '@/lib/attachments';
import { isImageFile } from '@/lib/dom/file-transfer';
import { generateImagesRuntime } from '@/lib/image-gen-runtime';
import { formatUserError } from '@/lib/i18n/user-message';
import { logger } from '@/lib/logger';

import { PaintHeader } from './paint/PaintHeader';
import { PaintHistoryPanel } from './paint/PaintHistoryPanel';
import { PaintMainWorkspace } from './paint/PaintMainWorkspace';
import { PaintResponsiveDrawer } from './paint/PaintResponsiveLayout';
import {
  getInitialPaintLayoutMode,
  resolvePaintLayoutMode,
  type PaintCompactDrawer,
  type PaintLayoutMode,
} from './paint/paintResponsiveLayoutContract';
import { PaintSettingsPanel } from './paint/PaintSettingsPanel';
import { buildDefaultPaintingSeed, buildEffectivePaintPrompt, fileToImageRef } from './paint/helpers';

/** Paint 三栏布局持久化 ID；v2 用于丢弃 react-resizable-panels v4 升级期间写入的坏布局。 */
const PAINT_EXPANDED_LAYOUT_STORAGE_ID = 'olyq:paint:layout.v2';

/** Paint expanded 模式的稳定默认布局，直接使用 v4 的 panel id 到百分比映射结构。 */
const PAINT_EXPANDED_DEFAULT_LAYOUT = { 'paint-settings': 24, 'paint-artboard': 52, 'paint-history': 24 };

/**
 * 绘图工作台主页面。
 *
 * 负责：
 * - 管理绘图任务列表与当前激活任务；
 * - 协调模型选择、参数编辑、输入图上传和结果预览；
 * - 调用图片生成链路，并把输出结果写回附件存储。
 */
export default function Paint() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { providers, modelMap, getModelLabel } = useModelOptions();
  const { defaultImageModel, defaultImagePromptPrefix } = useChatSettingsStore((s) => ({
    defaultImageModel: s.settings.defaultImageModel,
    defaultImagePromptPrefix: s.settings.defaultImagePromptPrefix,
  }), shallow);

  const paintings = usePaintStore((s) => s.paintings);
  const activeId = usePaintStore((s) => s.activePaintingId);
  const setActive = usePaintStore((s) => s.setActivePaintingId);
  const createPainting = usePaintStore((s) => s.createPainting);
  const patchPainting = usePaintStore((s) => s.patchPainting);
  const deletePainting = usePaintStore((s) => s.deletePainting);

  /** 当前激活的绘图任务。 */
  const active = useMemo(() => paintings.find((painting) => painting.id === activeId) ?? null, [paintings, activeId]);
  /** 模型选择器弹窗是否打开。 */
  const [pickerOpen, setPickerOpen] = useState(false);
  /** 当前是否正在调用图片生成。 */
  const [isGenerating, setIsGenerating] = useState(false);
  /** 当前生成任务开始时间，只服务画板生成态计时，不写入持久化状态。 */
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  /** 左侧设置栏是否折叠。 */
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  /** 右侧历史栏是否折叠。 */
  const [rightCollapsed, setRightCollapsed] = useState(false);
  /** 当前结果预览索引。 */
  const [previewIndex, setPreviewIndex] = useState(0);
  /** 输入图片区是否处于拖拽高亮状态。 */
  const [inputDropActive, setInputDropActive] = useState(false);
  /** Paint 工作区布局模式，唯一由根容器宽度派生。 */
  const [layoutMode, setLayoutMode] = useState<PaintLayoutMode>(getInitialPaintLayoutMode);
  /** compact 布局下当前打开的支持抽屉。 */
  const [compactDrawer, setCompactDrawer] = useState<PaintCompactDrawer | null>(null);

  /** 当前生成任务的 AbortController。 */
  const abortRef = useRef<AbortController | null>(null);
  /** 输入图片文件选择器引用。 */
  const inputFileRef = useRef<HTMLInputElement | null>(null);
  /** 左侧可伸缩面板句柄。 */
  const leftPanelRef = useRef<PanelImperativeHandle | null>(null);
  /** 右侧可伸缩面板句柄。 */
  const rightPanelRef = useRef<PanelImperativeHandle | null>(null);
  /** Paint 工作区根容器引用，用于以真实可用宽度派生布局模式。 */
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  /** Provider ID -\> Provider 配置映射，用于过滤图片模型。 */
  const providerMapById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers],
  );

  usePreventWindowFileDrop();

  useEffect(() => {
    setPreviewIndex(0);
  }, [activeId]);

  useEffect(() => {
    const length = active?.outputImages?.length ?? 0;
    if (length === 0) {
      if (previewIndex !== 0) setPreviewIndex(0);
      return;
    }
    // 当输出张数减少时，把当前索引自动收敛到有效范围内。
    if (previewIndex >= length) setPreviewIndex(Math.max(0, length - 1));
  }, [active?.outputImages?.length, previewIndex]);

  useEffect(() => {
    const node = workspaceRef.current;
    if (!node) return;

    /**
     * 布局模式只看 Paint 工作区自身宽度：
     * - sidepanel / 新标签页 / 宿主 resize 都通过这一条入口收口；
     * - 不把模式写入持久化，避免 compact 抽屉影响 expanded 三栏保存尺寸。
     */
    const updateLayoutMode = () => {
      const rect = node.getBoundingClientRect();
      const width = rect.width || node.clientWidth || window.innerWidth;
      setLayoutMode(resolvePaintLayoutMode(width));
    };

    updateLayoutMode();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateLayoutMode);
      return () => window.removeEventListener('resize', updateLayoutMode);
    }

    const observer = new ResizeObserver(updateLayoutMode);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (layoutMode === 'expanded') setCompactDrawer(null);
  }, [layoutMode]);

  /**
   * 过滤出当前可用的图片生成模型。
   *
   * @param model - 候选模型。
   * @returns 仅当模型语义和 provider 能力都满足图片生成时返回 `true`。
   */
  const imageModelFilter = useCallback((model: ModelOption) => {
    if (!isDedicatedImageModelLike({
      id: model.id,
      providerId: model.providerId,
      kind: model.kind,
      features: model.features,
    })) {
      return false;
    }
    const provider = providerMapById.get(model.providerId);
    return Boolean(provider && supportsImageProvider(provider));
  }, [providerMapById]);

  const createDefaultPainting = useCallback(() => {
    return createPainting(buildDefaultPaintingSeed(defaultImageModel));
  }, [createPainting, defaultImageModel]);

  /**
   * 确保当前存在激活绘图任务。
   *
   * @returns 当前或新建绘图任务 ID。
   */
  const ensureActive = useCallback(() => {
    if (active) return active.id;
    return createDefaultPainting();
  }, [active, createDefaultPainting]);

  const patchActiveParams = useCallback((params: {
    n?: number;
    seed?: number | undefined;
    size?: string;
    aspectRatio?: string;
    quality?: string;
    providerOptionsJson?: string;
  }) => {
    const id = ensureActive();
    patchPainting(id, { params });
  }, [ensureActive, patchPainting]);

  /** 选择图片生成模型。 */
  const onPickModel = useCallback((modelId: string) => {
    const id = ensureActive();
    patchPainting(id, { model: modelId });
  }, [ensureActive, patchPainting]);

  /**
   * 把用户上传/拖拽的文件加入当前输入图片区。
   *
   * @param files - 原始文件列表。
   */
  const addInputImages = useCallback(async (files: File[]) => {
    const list = (Array.isArray(files) ? files : []).filter(isImageFile);
    if (list.length === 0) {
      toast({ title: t('common.tip'), description: t('paint.noUsableImages') });
      return;
    }

    const id = ensureActive();
    const createdIds: string[] = [];

    try {
      const refs: PaintingImageRef[] = [];
      for (const file of list) {
        const ref = await fileToImageRef(file);
        refs.push(ref);
        createdIds.push(ref.id);
      }

      const current = usePaintStore.getState().paintings.find((painting) => painting.id === id);
      const nextImages = [...(current?.inputImages ?? []), ...refs];
      patchPainting(id, { inputImages: nextImages });
    } catch (error: unknown) {
      if (createdIds.length > 0) {
        void deleteAttachments(createdIds).catch((cleanupError) => {
          logger.general.error('paint cleanup input attachments failed', cleanupError);
        });
      }
      toast({ title: t('common.error'), description: formatUserError(t, error), variant: 'destructive' });
    }
  }, [ensureActive, patchPainting, t]);

  /** 文件选择器变更处理。 */
  const onInputFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    void addInputImages(files);
  }, [addInputImages]);

  /** 打开输入图片文件选择器。 */
  const onOpenInputFilePicker = useCallback(() => {
    if (isGenerating) return;
    inputFileRef.current?.click();
  }, [isGenerating]);

  /** 更新生成数量。 */
  const onCountChange = useCallback((value: string) => {
    const n = Math.max(1, Math.min(10, Math.floor(Number(value || 1))));
    patchActiveParams({ n });
  }, [patchActiveParams]);

  /** 更新种子参数。 */
  const onSeedChange = useCallback((value: string) => {
    const next = value.trim();
    patchActiveParams({ seed: next ? Number(next) : undefined });
  }, [patchActiveParams]);

  /** 更新尺寸参数。 */
  const onSizeChange = useCallback((value: string) => {
    patchActiveParams({ size: value });
  }, [patchActiveParams]);

  /** 更新纵横比参数。 */
  const onAspectRatioChange = useCallback((value: string) => {
    patchActiveParams({ aspectRatio: value });
  }, [patchActiveParams]);

  /** 更新质量参数。 */
  const onQualityChange = useCallback((value: string) => {
    patchActiveParams({ quality: value });
  }, [patchActiveParams]);

  /** 更新高级 providerOptions JSON。 */
  const onProviderOptionsJsonChange = useCallback((value: string) => {
    patchActiveParams({ providerOptionsJson: value });
  }, [patchActiveParams]);

  /** 更新提示词。 */
  const onPromptChange = useCallback((value: string) => {
    const id = ensureActive();
    patchPainting(id, { prompt: value });
  }, [ensureActive, patchPainting]);

  /** 删除一张输入图片。 */
  const onRemoveInput = useCallback((imageId: string) => {
    if (!active) return;
    patchPainting(active.id, { inputImages: active.inputImages.filter((image) => image.id !== imageId) });
  }, [active, patchPainting]);

  /**
   * 发起图片生成。
   *
   * 会校验模型、提示词和输入图，再调用生成链路并把结果附件写回当前绘图任务。
   */
  const onGenerate = async () => {
    const id = ensureActive();
    const current = usePaintStore.getState().paintings.find((painting) => painting.id === id) ?? null;
    if (!current) return;

    const model = String(current.model || '').trim();
    if (!model) {
      toast({ title: t('common.error'), description: t('paint.modelRequired'), variant: 'destructive' });
      return;
    }

    const prompt = buildEffectivePaintPrompt(defaultImagePromptPrefix, current.prompt || '');
    const inputRefs = Array.isArray(current.inputImages) ? current.inputImages : [];
    if (!prompt && inputRefs.length === 0) {
      toast({ title: t('common.error'), description: t('paint.promptOrImageRequired'), variant: 'destructive' });
      return;
    }

    const option = modelMap.get(model);
    if (!option || !imageModelFilter(option)) {
      toast({ title: t('common.error'), description: t('paint.modelUnavailable'), variant: 'destructive' });
      return;
    }
    const capability = resolveImageGenerationCapability({
      providerType: option.providerType,
      providerId: option.providerId,
      modelId: option.modelId,
      baseModelKey: option.baseModelKey,
      canonicalId: option.canonicalId,
    });
    const providerOptionsResult = parseImageGenerationProviderOptionsJson(capability, current.params.providerOptionsJson ?? '');
    if (!providerOptionsResult.ok) {
      toast({
        title: t('common.error'),
        description: t(providerOptionsResult.messageKey, providerOptionsResult.params),
        variant: 'destructive',
      });
      return;
    }

    if (isGenerating) return;
    setIsGenerating(true);
    setGenerationStartedAt(Date.now());

    const controller = new AbortController();
    abortRef.current = controller;
    const createdOutputIds: string[] = [];

    try {
      const inputImages: string[] = [];
      for (const ref of inputRefs) {
        const blob = await getAttachmentBlob(ref.id);
        if (!blob) continue;
        const dataUrl = await blobToDataUrl(blob);
        if (dataUrl.startsWith('data:')) inputImages.push(dataUrl);
      }

      const supportedParams = filterSupportedImageGenerationStandardParams(capability, current.params);

      const response = await generateImagesRuntime({
        model,
        prompt,
        ...(inputImages.length > 0 ? { inputImages } : {}),
        n: Math.max(1, Math.min(capability.count.productMax, Math.floor(Number(current.params.n || 1)))),
        ...(supportedParams.size ? { size: supportedParams.size } : {}),
        ...(supportedParams.aspectRatio ? { aspectRatio: supportedParams.aspectRatio } : {}),
        ...(typeof supportedParams.seed === 'number' ? { seed: supportedParams.seed } : {}),
        ...(supportedParams.quality ? { quality: supportedParams.quality } : {}),
        ...(Object.keys(providerOptionsResult.value).length > 0 ? { providerOptions: providerOptionsResult.value } : {}),
        signal: controller.signal,
      });

      const outputRefs: PaintingImageRef[] = [];
      for (const image of response.images) {
        const parsed = dataUrlToBlob(image.dataUrl);
        const attachment = await putImageAttachment({
          blob: parsed.blob,
          name: image.name,
          mime: image.mime || parsed.mime,
        });
        outputRefs.push({
          id: attachment.id,
          name: attachment.name,
          mime: attachment.mime,
          size: attachment.size,
        });
        createdOutputIds.push(attachment.id);
      }

      patchPainting(id, { outputImages: outputRefs });
      setPreviewIndex(0);
      toast({ title: t('paint.generated'), description: t('paint.generatedCount', { count: outputRefs.length }) });
    } catch (error: unknown) {
      if (createdOutputIds.length > 0) {
        void deleteAttachments(createdOutputIds).catch((cleanupError) => {
          logger.general.error('paint cleanup failed output attachments failed', cleanupError);
        });
      }
      const cancelled = error instanceof DOMException && error.name === 'AbortError';
      toast({
        title: cancelled ? t('common.cancelled') : t('common.error'),
        description: cancelled ? t('paint.cancelled') : formatUserError(t, error),
        variant: cancelled ? 'default' : 'destructive',
      });
    } finally {
      abortRef.current = null;
      setIsGenerating(false);
      setGenerationStartedAt(null);
    }
  };

  /** 中断当前生成任务。 */
  const onStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /** 新建一条绘图记录并切换到它。 */
  const onCreate = useCallback(() => {
    const id = createDefaultPainting();
    setActive(id);
  }, [createDefaultPainting, setActive]);

  /** 展开或折叠左侧设置栏。 */
  const toggleLeftPanel = useCallback(() => {
    if (layoutMode === 'compact') {
      setCompactDrawer((current) => (current === 'settings' ? null : 'settings'));
      return;
    }
    const panel = leftPanelRef.current;
    if (!panel) return;
    if (leftCollapsed) panel.expand();
    else panel.collapse();
  }, [layoutMode, leftCollapsed]);

  /** 展开或折叠右侧历史栏。 */
  const toggleRightPanel = useCallback(() => {
    if (layoutMode === 'compact') {
      setCompactDrawer((current) => (current === 'history' ? null : 'history'));
      return;
    }
    const panel = rightPanelRef.current;
    if (!panel) return;
    if (rightCollapsed) panel.expand();
    else panel.collapse();
  }, [layoutMode, rightCollapsed]);

  /** 当前激活模型的展示名称。 */
  const activeModelLabel = active?.model ? getModelLabel(active.model) : '';
  /** 当前激活模型的参数推荐项。 */
  const activeCapability = useMemo(() => {
    const option = active?.model ? modelMap.get(active.model) : null;
    return resolveImageGenerationCapability(option
      ? {
          providerType: option.providerType,
          providerId: option.providerId,
          modelId: option.modelId,
          baseModelKey: option.baseModelKey,
          canonicalId: option.canonicalId,
        }
      : null);
  }, [active?.model, modelMap]);
  /** 高级 providerOptions JSON 的即时校验结果。 */
  const activeProviderOptionsJsonError = useMemo(() => {
    const raw = active?.params.providerOptionsJson ?? '';
    if (!raw.trim()) return undefined;
    const result = parseImageGenerationProviderOptionsJson(activeCapability, raw);
    return result.ok ? undefined : t(result.messageKey, result.params);
  }, [active?.params.providerOptionsJson, activeCapability, t]);

  const openModelPicker = useCallback(() => {
    setPickerOpen(true);
  }, []);

  const settingsPanel = (
    <PaintSettingsPanel
      active={active}
      inputDropActive={inputDropActive}
      inputFileRef={inputFileRef}
      isGenerating={isGenerating}
      modelLabel={activeModelLabel}
      capability={activeCapability}
      providerOptionsJsonError={activeProviderOptionsJsonError}
      onAspectRatioChange={onAspectRatioChange}
      onCountChange={onCountChange}
      onDropFiles={addInputImages}
      onInputFileChange={onInputFileChange}
      onOpenInputFilePicker={onOpenInputFilePicker}
      onOpenModelPicker={openModelPicker}
      onProviderOptionsJsonChange={onProviderOptionsJsonChange}
      onQualityChange={onQualityChange}
      onRemoveInput={onRemoveInput}
      onSeedChange={onSeedChange}
      onSetDropActive={setInputDropActive}
      onSizeChange={onSizeChange}
    />
  );

  const historyPanel = (
    <PaintHistoryPanel
      activeId={activeId}
      paintings={paintings}
      getModelLabel={getModelLabel}
      onDelete={deletePainting}
      onSelect={(id) => {
        setActive(id);
        if (layoutMode === 'compact') setCompactDrawer(null);
      }}
    />
  );

  const artboardAndComposer = (
    <PaintMainWorkspace
      images={active?.outputImages ?? []}
      previewIndex={previewIndex}
      onPreviewIndexChange={setPreviewIndex}
      isGenerating={isGenerating}
      prompt={active?.prompt ?? ''}
      artboardModelLabel={active ? getModelLabel(active.model) || active.model || t('paint.noModel') : t('paint.noModel')}
      composerModelLabel={activeModelLabel}
      generationStartedAt={generationStartedAt}
      onGenerate={onGenerate}
      onPromptChange={onPromptChange}
      onStop={onStop}
    />
  );

  return (
    <div className="h-screen flex flex-col bg-background">
      <PaintHeader
        layoutMode={layoutMode}
        leftCollapsed={layoutMode === 'compact' ? compactDrawer !== 'settings' : leftCollapsed}
        rightCollapsed={layoutMode === 'compact' ? compactDrawer !== 'history' : rightCollapsed}
        onBack={() => navigate('/')}
        onCreate={onCreate}
        onToggleLeftPanel={toggleLeftPanel}
        onToggleRightPanel={toggleRightPanel}
      />

      <div
        ref={workspaceRef}
        className="flex-1 min-h-0 min-w-0 overflow-hidden"
        data-paint-workspace
        data-paint-layout={layoutMode}
        data-testid="paint-workspace"
      >
        {layoutMode === 'expanded' ? (
          <ResizablePanelGroup
            direction="horizontal"
            autoSaveId={PAINT_EXPANDED_LAYOUT_STORAGE_ID}
            defaultLayout={PAINT_EXPANDED_DEFAULT_LAYOUT}
            panelIds={['paint-settings', 'paint-artboard', 'paint-history']}
            testId="paint-expanded-panel-group"
          >
            <ResizablePanel
              id="paint-settings"
              panelRef={leftPanelRef}
              defaultSize="24%"
              minSize="18%"
              maxSize="36%"
              collapsible
              collapsedSize="0%"
              onResize={(size) => setLeftCollapsed(size.asPercentage <= 0.5)}
              className="min-w-0 overflow-hidden border-r border-border/60 bg-muted/20"
            >
              {leftCollapsed ? null : settingsPanel}
            </ResizablePanel>

            <ResizableHandle withHandle data-testid="paint-left-resize-handle" />

            <ResizablePanel id="paint-artboard" defaultSize="52%" minSize="32%" className="min-w-0 bg-background">
              {artboardAndComposer}
            </ResizablePanel>

            <ResizableHandle withHandle data-testid="paint-right-resize-handle" />

            <ResizablePanel
              id="paint-history"
              panelRef={rightPanelRef}
              defaultSize="24%"
              minSize="18%"
              maxSize="36%"
              collapsible
              collapsedSize="0%"
              onResize={(size) => setRightCollapsed(size.asPercentage <= 0.5)}
              className="min-w-0 overflow-hidden border-l border-border/60 bg-muted/20"
            >
              {rightCollapsed ? null : historyPanel}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <>
            {artboardAndComposer}
            <PaintResponsiveDrawer
              open={compactDrawer === 'settings'}
              side="left"
              title={t('paint.settings')}
              description={t('paint.promptInBottom')}
              onOpenChange={(open) => setCompactDrawer(open ? 'settings' : null)}
            >
              {settingsPanel}
            </PaintResponsiveDrawer>
            <PaintResponsiveDrawer
              open={compactDrawer === 'history'}
              side="right"
              title={t('paint.history')}
              description={t('paint.historyCount', { count: paintings.length })}
              onOpenChange={(open) => setCompactDrawer(open ? 'history' : null)}
            >
              {historyPanel}
            </PaintResponsiveDrawer>
          </>
        )}
      </div>

      <ModelPickerDialog
        open={pickerOpen}
        value={active?.model ?? ''}
        onSelect={(modelId) => {
          onPickModel(modelId);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
        title={t('paint.pickModelTitle')}
        description={t('paint.pickModelDesc')}
        filter={imageModelFilter}
      />
    </div>
  );
}
