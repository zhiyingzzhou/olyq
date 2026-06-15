/**
 * 说明：`PaintSettingsPanel` 页面模块。
 *
 * 职责：
 * - 承载 `PaintSettingsPanel` 相关的当前文件实现与模块边界；
 * - 对外暴露 `PaintSettingsPanel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { type ChangeEvent, type ReactNode, type RefObject } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, ImagePlus, Settings2, SlidersHorizontal, Sparkles, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { HelpTip } from '@/components/ui/help-tip';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { TooltipAction } from '@/components/ui/tooltip-action';
import type { Painting } from '@/hooks/usePaintStore';
import { extractFilesFromDataTransfer, hasFilesInDataTransfer } from '@/lib/dom/file-transfer';
import type { ImageGenerationCapability } from '@/lib/ai/image-generation-params';
import { cn } from '@/lib/utils';

import { PaintImageThumb } from './PaintImageThumb';
import { PaintParameterCombobox } from './PaintParameterCombobox';

/** 绘图设置侧栏属性。 */
interface PaintSettingsPanelProps {
  /** 当前激活的绘图任务。 */
  readonly active: Painting | null;
  /** 当前拖拽上传高亮状态。 */
  readonly inputDropActive: boolean;
  /** 隐藏文件输入框引用。 */
  readonly inputFileRef: RefObject<HTMLInputElement | null>;
  /** 当前是否正在生成。 */
  readonly isGenerating: boolean;
  /** 当前模型展示名称。 */
  readonly modelLabel: string;
  /** 当前模型对应的图片生成能力真源。 */
  readonly capability: ImageGenerationCapability;
  /** 高级参数 JSON 是否校验失败。 */
  readonly providerOptionsJsonError?: string;
  /** 更新纵横比。 */
  readonly onAspectRatioChange: (value: string) => void;
  /** 更新生成数量。 */
  readonly onCountChange: (value: string) => void;
  /** 处理拖拽文件。 */
  readonly onDropFiles: (files: File[]) => void;
  /** 处理文件选择器变更。 */
  readonly onInputFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  /** 打开文件选择器。 */
  readonly onOpenInputFilePicker: () => void;
  /** 打开模型选择器。 */
  readonly onOpenModelPicker: () => void;
  /** 更新高级 providerOptions JSON。 */
  readonly onProviderOptionsJsonChange: (value: string) => void;
  /** 更新质量参数。 */
  readonly onQualityChange: (value: string) => void;
  /** 删除一张输入图。 */
  readonly onRemoveInput: (imageId: string) => void;
  /** 更新 seed。 */
  readonly onSeedChange: (value: string) => void;
  /** 设置拖拽高亮状态。 */
  readonly onSetDropActive: (active: boolean) => void;
  /** 更新尺寸参数。 */
  readonly onSizeChange: (value: string) => void;
}

/** 左侧设置分组属性。 */
interface PaintSettingsSectionProps {
  /** 分组标题。 */
  readonly title: string;
  /** 分组右侧附加信息。 */
  readonly aside?: ReactNode;
  /** 分组正文。 */
  readonly children: ReactNode;
}

/** 统一的 Paint 左侧设置分组，保持设置页普通区块密度。 */
function PaintSettingsSection({ title, aside, children }: PaintSettingsSectionProps) {
  return (
    <section className="overflow-hidden rounded-lg border border-border/70 bg-card/70">
      <div className="flex h-9 items-center justify-between gap-2 border-b border-border/60 px-3">
        <h2 className="text-xs font-medium text-foreground">{title}</h2>
        {aside ? <div className="shrink-0 text-[11px] text-muted-foreground">{aside}</div> : null}
      </div>
      <div className="divide-y divide-border/50">{children}</div>
    </section>
  );
}

/** 设置分组内的紧凑行属性。 */
interface PaintSettingsRowProps {
  /** 行标签。 */
  readonly label: ReactNode;
  /** 行说明。 */
  readonly description?: ReactNode;
  /** 行内容。 */
  readonly children: ReactNode;
  /** 纵向布局时使用。 */
  readonly stacked?: boolean;
}

/** 统一设置行，避免 Paint 左侧出现松散表单碎片。 */
function PaintSettingsRow({ label, description, children, stacked = false }: PaintSettingsRowProps) {
  return (
    <div
      className={cn(
        'paint-settings-row px-3 py-2.5',
        stacked ? 'space-y-2' : 'grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] items-center gap-3',
      )}
    >
      <div className="min-w-0">
        <div className="text-xs font-medium text-foreground">{label}</div>
        {description ? <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</div> : null}
      </div>
      <div className="paint-settings-control min-w-0">{children}</div>
    </div>
  );
}

/**
 * 绘图设置侧栏。
 *
 * 集中承载模型、参数和输入图片管理，
 * 所有具体写入都由外层 `Paint` 页面控制。
 */
export function PaintSettingsPanel({
  active,
  inputDropActive,
  inputFileRef,
  isGenerating,
  modelLabel,
  capability,
  providerOptionsJsonError,
  onAspectRatioChange,
  onCountChange,
  onDropFiles,
  onInputFileChange,
  onOpenInputFilePicker,
  onOpenModelPicker,
  onProviderOptionsJsonChange,
  onQualityChange,
  onRemoveInput,
  onSeedChange,
  onSetDropActive,
  onSizeChange,
}: PaintSettingsPanelProps) {
  const { t } = useTranslation();
  const showSize = capability.params.size.status === 'supported' && capability.params.size.control === 'enum';
  const showAspectRatio = capability.params.aspectRatio.status === 'supported' && capability.params.aspectRatio.control === 'enum';
  const showQuality = capability.params.quality.status === 'supported' && capability.params.quality.control === 'enum';
  const showSeed = capability.params.seed.status === 'supported' && capability.params.seed.control === 'integer';
  const showAdvanced = capability.advancedProviderOptions.enabled;
  const providerKeys = capability.advancedProviderOptions.allowedProviderKeys;
  const providerOptionsDescriptionId = 'paint-provider-options-description';
  const providerOptionsErrorId = providerOptionsJsonError ? 'paint-provider-options-error' : undefined;
  const providerOptionsDescribedBy = providerOptionsErrorId
    ? `${providerOptionsDescriptionId} ${providerOptionsErrorId}`
    : providerOptionsDescriptionId;

  return (
    <ScrollArea className="h-full" data-paint-settings-panel data-testid="paint-settings-panel">
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <div className="text-sm font-semibold">{t('paint.settings')}</div>
            <div className="text-[11px] text-muted-foreground">{t('paint.promptInBottom')}</div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-card text-muted-foreground">
            <SlidersHorizontal className="h-4 w-4" />
          </div>
        </div>

        <PaintSettingsSection title={t('paint.modelAndOutput')} aside={t('paint.outputTotalCount')}>
          <PaintSettingsRow
            label={t('paint.model')}
            description={active?.model ? active.model.split('/')[0] : t('paint.selectModel')}
            stacked
          >
            <Button variant="outline" className="w-full justify-between" onClick={onOpenModelPicker} disabled={isGenerating}>
              <span className="truncate">{modelLabel || t('paint.selectModel')}</span>
              <span className="text-xs text-muted-foreground">
                {active?.model ? active.model.split('/')[0] : ''}
              </span>
            </Button>
          </PaintSettingsRow>

          <PaintSettingsRow label={t('paint.count')} description={t('paint.countHint')}>
            <Input
              type="number"
              min={1}
              max={capability.count.productMax}
              value={active?.params.n ?? 1}
              disabled={isGenerating}
              onChange={(e) => onCountChange(e.target.value)}
            />
          </PaintSettingsRow>
          {showSeed ? (
            <PaintSettingsRow
              label={(
                <span className="inline-flex items-center gap-1">
                  <span>{t('paint.seed')}</span>
                  <HelpTip content={t('paint.paramHelp.seed')} side="top" align="start" />
                </span>
              )}
            >
              <Input
                aria-label={t('paint.seed')}
                type="number"
                placeholder={capability.params.seed.placeholder ?? '123'}
                value={active?.params.seed ?? ''}
                disabled={isGenerating}
                onChange={(e) => onSeedChange(e.target.value)}
              />
            </PaintSettingsRow>
          ) : null}
        </PaintSettingsSection>

        {showSize || showAspectRatio || showQuality ? (
          <PaintSettingsSection title={t('paint.supportedParameters')} aside={t('paint.verifiedOnly')}>
            {showSize ? (
              <PaintSettingsRow
                label={(
                  <span className="inline-flex items-center gap-1">
                    <span>{t('paint.size')}</span>
                    <HelpTip content={t('paint.paramHelp.size')} side="top" align="start" />
                  </span>
                )}
                stacked
              >
                <PaintParameterCombobox
                  ariaLabel={t('paint.size')}
                  options={capability.params.size.options}
                  placeholder={capability.params.size.placeholder ?? '1024x1024'}
                  value={active?.params.size ?? ''}
                  disabled={isGenerating}
                  onChange={onSizeChange}
                />
              </PaintSettingsRow>
            ) : null}
            {showAspectRatio ? (
              <PaintSettingsRow
                label={(
                  <span className="inline-flex items-center gap-1">
                    <span>{t('paint.aspectRatio')}</span>
                    <HelpTip content={t('paint.paramHelp.aspectRatio')} side="top" align="start" />
                  </span>
                )}
                stacked
              >
                <PaintParameterCombobox
                  ariaLabel={t('paint.aspectRatio')}
                  options={capability.params.aspectRatio.options}
                  placeholder={capability.params.aspectRatio.placeholder ?? '16:9'}
                  value={active?.params.aspectRatio ?? ''}
                  disabled={isGenerating}
                  onChange={onAspectRatioChange}
                />
              </PaintSettingsRow>
            ) : null}
            {showQuality ? (
              <PaintSettingsRow
                label={(
                  <span className="inline-flex items-center gap-1">
                    <span>{t('paint.quality')}</span>
                    <HelpTip content={t('paint.paramHelp.quality')} side="top" align="start" />
                  </span>
                )}
                stacked
              >
                <PaintParameterCombobox
                  ariaLabel={t('paint.quality')}
                  options={capability.params.quality.options}
                  placeholder={capability.params.quality.placeholder ?? 'standard'}
                  value={active?.params.quality ?? ''}
                  disabled={isGenerating}
                  onChange={onQualityChange}
                />
              </PaintSettingsRow>
            ) : null}
          </PaintSettingsSection>
        ) : null}

        <section
          className={cn(
            'overflow-hidden rounded-lg border bg-card/70 transition-colors',
            inputDropActive ? 'border-primary/70 bg-primary/5' : 'border-border/70',
          )}
          onDragEnter={(e) => {
            if (isGenerating) return;
            if (!hasFilesInDataTransfer(e.dataTransfer)) return;
            e.preventDefault();
            onSetDropActive(true);
          }}
          onDragOver={(e) => {
            if (isGenerating) return;
            if (!hasFilesInDataTransfer(e.dataTransfer)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={(e) => {
            if (isGenerating) return;
            e.preventDefault();
            onSetDropActive(false);
          }}
          onDrop={(e) => {
            if (isGenerating) return;
            e.preventDefault();
            onSetDropActive(false);
            const files = extractFilesFromDataTransfer(e.dataTransfer);
            if (files.length === 0) return;
            onDropFiles(files);
          }}
        >
          <div className="paint-input-images-header flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/50 text-muted-foreground">
                <ImagePlus className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-foreground">{t('paint.inputImages')}</div>
                <div className="truncate text-[11px] text-muted-foreground">{t('paint.dropImagesHere')}</div>
              </div>
            </div>
            <div className="paint-input-images-actions inline-flex items-center gap-2">
              <input
                ref={inputFileRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={onInputFileChange}
                disabled={isGenerating}
              />
              <Button
                variant="secondary"
                size="sm"
                className="h-8 gap-2"
                type="button"
                disabled={isGenerating}
                onClick={onOpenInputFilePicker}
              >
                <ImagePlus className="h-4 w-4" />
                {t('paint.addImages')}
              </Button>
            </div>
          </div>

          {active?.inputImages?.length ? (
            <div className="paint-input-images-grid grid grid-cols-2 gap-2 p-3">
              {active.inputImages.map((img) => (
                <div key={img.id} className="group relative overflow-hidden rounded-lg">
                  <PaintImageThumb image={img} />
                  <TooltipAction tooltip={t('paint.remove')}>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute right-1.5 top-1.5 h-7 w-7 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                      onClick={() => onRemoveInput(img.id)}
                      aria-label={t('paint.remove')}
                      disabled={isGenerating}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipAction>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-3 py-4 text-xs leading-relaxed text-muted-foreground">
              <InlineNotice
                icon={Sparkles}
                iconSize="xs"
                surface="plain"
                tone="muted"
                className="text-xs"
                bodyClassName="leading-relaxed"
              >
                {t('paint.noInputImages')}
              </InlineNotice>
            </div>
          )}
        </section>

        {showAdvanced ? (
          <Collapsible>
            <div className="overflow-hidden rounded-lg border border-border/70 bg-card/70">
              <div className="flex h-11 items-center border-b border-border/60">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="group h-full min-w-0 flex-1 justify-between rounded-none px-3 text-xs font-medium hover:bg-muted/40"
                    aria-label={t('paint.advancedProviderOptions')}
                    disabled={isGenerating}
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate">{t('paint.advancedProviderOptions')}</span>
                      <span className="rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                        {t('paint.optionalNativeParam')}
                      </span>
                    </span>
                    <span className="shrink-0">
                      <ChevronRight className="h-4 w-4 group-data-[state=open]:hidden" />
                      <ChevronDown className="hidden h-4 w-4 group-data-[state=open]:block" />
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <div className="pr-3">
                  <HelpTip
                    content={t('paint.advancedProviderOptionsHelp')}
                    side="top"
                    align="end"
                    contentClassName="max-w-72"
                  />
                </div>
              </div>
              <CollapsibleContent className="space-y-3 px-3 py-3">
                <div id={providerOptionsDescriptionId} className="space-y-2">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {t('paint.advancedProviderOptionsDescription')}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">{t('paint.allowedNamespaces')}</span>
                    {providerKeys.map((key) => (
                      <span
                        key={key}
                        className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-foreground"
                      >
                        {key}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {t('paint.advancedProviderOptionsReservedHint')}
                  </p>
                </div>
                <div
                  className={cn(
                    'rounded-lg border bg-background shadow-inner transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
                    providerOptionsJsonError ? 'border-destructive/70' : 'border-border/70',
                  )}
                >
                  <div className="flex h-7 items-center justify-between border-b border-border/60 px-3 text-[10px] text-muted-foreground">
                    <span>{t('paint.jsonObject')}</span>
                    <span>{t('paint.leaveBlankAllowed')}</span>
                  </div>
                  <Textarea
                    aria-label={t('paint.advancedProviderOptions')}
                    aria-describedby={providerOptionsDescribedBy}
                    aria-invalid={Boolean(providerOptionsJsonError)}
                    className="min-h-[112px] resize-y border-0 bg-transparent px-3 py-2 font-mono text-xs leading-5 shadow-none ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                    placeholder={t('paint.advancedProviderOptionsPlaceholder', {
                      provider: providerKeys[0] ?? 'provider',
                    })}
                    value={active?.params.providerOptionsJson ?? ''}
                    disabled={isGenerating}
                    onChange={(event) => onProviderOptionsJsonChange(event.target.value)}
                  />
                </div>
                {providerOptionsJsonError ? (
                  <InlineNotice
                    id={providerOptionsErrorId}
                    icon={AlertCircle}
                    iconSize="xs"
                    tone="destructive"
                    align="start"
                    className="text-xs"
                    bodyClassName="break-words leading-relaxed"
                  >
                    {providerOptionsJsonError}
                  </InlineNotice>
                ) : (
                  <div className="text-[11px] leading-relaxed text-muted-foreground">
                    {t('paint.advancedProviderOptionsHint', {
                      providers: providerKeys.join(', '),
                    })}
                  </div>
                )}
              </CollapsibleContent>
            </div>
          </Collapsible>
        ) : null}
      </div>
    </ScrollArea>
  );
}
