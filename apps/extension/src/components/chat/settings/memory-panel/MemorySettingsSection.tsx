/**
 * 说明：`MemorySettingsSection` 组件模块。
 *
 * 职责：
 * - 承载 `MemorySettingsSection` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MemoryModelDisplay`、`MemorySettingsSectionProps`、`MemorySettingsSection` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ReactNode } from 'react';
import { Brain, ChevronsUpDown, Database, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ProviderIcon } from '@/components/ui/ProviderIcon';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { HelpTip } from '@/components/ui/help-tip';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { pickProviderUiMeta } from '@/lib/ai/provider-ui-meta';
import { DEFAULT_MEMORY_CONFIG } from '@/lib/memory';
import type { GlobalMemoryConfig } from '@/lib/memory';

/**
 * 记忆模型选择器中用于展示当前值的轻量视图模型。
 *
 * 说明：
 * - 只保留 UI 渲染真正需要的标签与 Provider 信息；
 * - 不直接透传完整模型对象，避免配置区与模型目录结构耦合过深。
 */
export interface MemoryModelDisplay {
  /** UI 中展示的模型名称或占位文案。 */
  readonly label: string;
  /** 关联的 provider ID，用于回显图标与来源。 */
  readonly providerId?: string;
  /** Provider 自定义 Logo 地址。 */
  readonly providerLogo?: string;
}

/** 单行模型选择器的展示与交互属性。 */
interface MemoryModelPickerRowProps {
  /** 左侧图标区域。 */
  readonly icon: ReactNode;
  /** 该行配置项名称。 */
  readonly label: string;
  /** 该行配置项帮助文案。 */
  readonly helpText: string;
  /** 当前选中模型的展示信息。 */
  readonly value: MemoryModelDisplay;
  /** 当前是否已经选中有效值。 */
  readonly hasValue: boolean;
  /** 触发选择弹窗的测试标识。 */
  readonly triggerTestId: string;
  /** 清空按钮的测试标识。 */
  readonly clearTestId: string;
  /** 打开模型选择弹窗。 */
  readonly onOpen: () => void;
  /** 清空当前模型选择。 */
  readonly onClear: () => void;
}

/** 带帮助提示的设置标签，说明文案统一收进共享 tooltip。 */
function MemorySettingLabel({
  label,
  helpText,
}: {
  readonly label: string;
  readonly helpText: string;
}) {
  return (
    <div className="memory-setting-label flex min-w-0 items-center gap-1">
      <Label className="min-w-0 truncate text-sm">{label}</Label>
      <HelpTip content={helpText} side="top" align="start" contentClassName="max-w-sm" />
    </div>
  );
}

/**
 * MemoryPanel 中的单行模型选择器。
 *
 * embedding / LLM / rerank 三种模型选择都复用这一行，确保按钮结构、
 * Provider 图标和清空行为保持一致，减少重复 UI 逻辑。
 */
function MemoryModelPickerRow({
  icon,
  label,
  helpText,
  value,
  hasValue,
  triggerTestId,
  clearTestId,
  onOpen,
  onClear,
}: MemoryModelPickerRowProps) {
  const { t } = useTranslation();
  const providerUi = pickProviderUiMeta(value.providerId || '');
  const clearLabel = t('memory.clearModelSelection', { model: label });

  return (
    <div className="memory-model-picker-row settings-responsive-row grid grid-cols-[minmax(0,1fr)_minmax(220px,320px)] items-start gap-3">
      <div className="settings-responsive-lead flex min-w-0 items-center gap-2 pt-1">
        {icon}
        <MemorySettingLabel label={label} helpText={helpText} />
      </div>
      <div className="memory-model-picker-field settings-responsive-control flex min-w-0 w-full flex-col justify-self-end">
        <div className="memory-model-picker-control memory-model-picker-shell flex h-8 min-w-0 items-center overflow-hidden rounded-md border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <button
            type="button"
            className="memory-model-picker-trigger flex h-full min-w-0 flex-1 items-center justify-between gap-2 px-3 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none"
            onClick={onOpen}
            data-testid={triggerTestId}
          >
            <span className="flex min-w-0 items-center gap-2 overflow-hidden">
              {hasValue && value.providerId ? (
                <ProviderIcon
                  providerId={value.providerId}
                  customLogo={value.providerLogo}
                  fallbackIcon={providerUi.icon}
                  fallbackColor={providerUi.color}
                  size="xs"
                />
              ) : null}
              <span className={`min-w-0 flex-1 truncate ${hasValue ? '' : 'text-muted-foreground'}`}>{value.label}</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
          </button>
          {hasValue ? (
            <TooltipAction tooltip={clearLabel}>
              <button
                type="button"
                className="memory-model-picker-clear settings-responsive-icon-action mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={onClear}
                aria-label={clearLabel}
                data-testid={clearTestId}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </TooltipAction>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** MemoryPanel 配置区属性。 */
export interface MemorySettingsSectionProps {
  /** 当前全局记忆配置。 */
  readonly config: GlobalMemoryConfig;
  /** embedding 模型展示标签。 */
  readonly embeddingModelDisplay: MemoryModelDisplay;
  /** llm 模型展示标签。 */
  readonly llmModelDisplay: MemoryModelDisplay;
  /** rerank 模型展示标签。 */
  readonly rerankModelDisplay: MemoryModelDisplay;
  /** 是否存在无效 embedding 模型。 */
  readonly hasInvalidEmbeddingModel: boolean;
  /** 是否存在无效 llm 模型。 */
  readonly hasInvalidLlmModel: boolean;
  /** 是否存在无效 rerank 模型。 */
  readonly hasInvalidRerankModel: boolean;
  /** 是否存在任何无效选择。 */
  readonly hasInvalidSelection: boolean;
  /** 失效模型名称汇总。 */
  readonly invalidSelectionLabel: string;
  /** 当前配置是否完整可用。 */
  readonly configured: boolean;
  /** 记忆数量展示文本。 */
  readonly memCountText: string;
  /** 更新配置。 */
  readonly onUpdateConfig: (patch: Partial<GlobalMemoryConfig>) => void;
  /** 打开对应模型选择弹窗。 */
  readonly onOpenModelPicker: (target: 'embedding' | 'llm' | 'rerank') => void;
  /** 清空对应模型。 */
  readonly onClearModel: (target: 'embedding' | 'llm' | 'rerank') => void;
}

/**
 * MemoryPanel 配置区。
 *
 * 负责记忆功能总开关、模型配置和 topK 等参数设置。
 * 这里不做配置推导或校验，只展示父层已经计算好的状态，并把变更事件回抛。
 */
export function MemorySettingsSection({
  config,
  embeddingModelDisplay,
  llmModelDisplay,
  rerankModelDisplay,
  hasInvalidSelection,
  invalidSelectionLabel,
  configured,
  memCountText,
  onUpdateConfig,
  onOpenModelPicker,
  onClearModel,
}: MemorySettingsSectionProps) {
  const { t } = useTranslation();

  return (
    <div>
      <h3 className="mb-1 text-base font-semibold">{t('memory.title')}</h3>
      <p className="mb-3 text-sm text-muted-foreground">{t('memory.description')}</p>
      <Alert className="mb-4 bg-muted/20">
        <AlertTitle>{t('memory.ruleTitle')}</AlertTitle>
        <AlertDescription>
          <ul className="list-disc space-y-1 pl-4">
            <li>{t('memory.rule1')}</li>
            <li>{t('memory.rule2')}</li>
            <li>{t('memory.rule3')}</li>
          </ul>
        </AlertDescription>
      </Alert>

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="memory-switch-row settings-responsive-row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="settings-responsive-lead flex min-w-0 items-center gap-2">
            <Brain className="h-4 w-4 text-violet-500" />
            <div className="min-w-0">
              <MemorySettingLabel label={t('memory.enable')} helpText={t('memory.enableDesc')} />
            </div>
          </div>
          <div className="memory-switch-control settings-responsive-control justify-self-end">
            <Switch checked={config.enabled} onCheckedChange={(value) => onUpdateConfig({ enabled: value })} />
          </div>
        </div>

        {config.enabled && !configured ? (
          <Alert className="bg-muted/20">
            <AlertTitle>{t('memory.notConfiguredTitle')}</AlertTitle>
            <AlertDescription>{t('memory.notConfiguredDesc')}</AlertDescription>
          </Alert>
        ) : null}

        {config.enabled && hasInvalidSelection ? (
          <Alert className="bg-muted/20">
            <AlertTitle>{t('memory.invalidSelectionTitle')}</AlertTitle>
            <AlertDescription>
              {/* 这里使用父层聚合后的失效模型名称，避免组件内部重复拼装业务文案。 */}
              {t('memory.invalidSelectionDesc', { models: invalidSelectionLabel })}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-1 gap-3">
          <MemoryModelPickerRow
            icon={<Database className="h-4 w-4 text-blue-500" />}
            label={t('memory.embeddingModel')}
            helpText={t('memory.embeddingModelDesc')}
            value={embeddingModelDisplay}
            hasValue={Boolean(config.embeddingModel)}
            triggerTestId="memory-embedding-model-trigger"
            clearTestId="memory-embedding-model-clear"
            onOpen={() => onOpenModelPicker('embedding')}
            onClear={() => onClearModel('embedding')}
          />

          <MemoryModelPickerRow
            icon={<Brain className="h-4 w-4 text-violet-500" />}
            label={t('memory.llmModel')}
            helpText={t('memory.llmModelDesc')}
            value={llmModelDisplay}
            hasValue={Boolean(config.llmModel)}
            triggerTestId="memory-llm-model-trigger"
            clearTestId="memory-llm-model-clear"
            onOpen={() => onOpenModelPicker('llm')}
            onClear={() => onClearModel('llm')}
          />

          <MemoryModelPickerRow
            icon={<Search className="h-4 w-4 text-amber-500" />}
            label={t('memory.rerankModel')}
            helpText={t('memory.rerankModelDesc')}
            value={rerankModelDisplay}
            hasValue={Boolean(config.rerankModel)}
            triggerTestId="memory-rerank-model-trigger"
            clearTestId="memory-rerank-model-clear"
            onOpen={() => onOpenModelPicker('rerank')}
            onClear={() => onClearModel('rerank')}
          />

          <div className="settings-responsive-row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="settings-responsive-lead min-w-0">
              <MemorySettingLabel label={t('memory.topK')} helpText={t('memory.topKDesc')} />
            </div>
            <div className="settings-responsive-control justify-self-end">
              <Input
                type="number"
                min={1}
                max={20}
                value={config.topK}
                onChange={(event) => onUpdateConfig({ topK: Number(event.target.value) || DEFAULT_MEMORY_CONFIG.topK })}
                className="h-8 w-20 text-xs"
              />
            </div>
          </div>

          <div className="text-xs text-muted-foreground">{memCountText}</div>
        </div>
      </div>
    </div>
  );
}
