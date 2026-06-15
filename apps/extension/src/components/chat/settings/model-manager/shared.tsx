/**
 * 说明：`shared` 组件模块。
 *
 * 职责：
 * - 承载 `shared` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelItem`、`Provider`、`ApiKeyConnectivityState` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { CapabilityPill } from '@/components/chat/CapabilityPill';
import { toast } from '@/hooks/useToast';
import { DEFAULT_PROVIDERS } from '@/lib/ai/config/provider-defaults';
import { normalizeApiKeyString, splitApiKeys } from '@/lib/ai/api-keys';
import type { LobeIconEntry } from '@/lib/ai/lobe-icon-list';
import { capabilityLabel } from '@/lib/ai/capability-label';
import { createEmptyModelRegistry, type ModelModality, type ModelRegistryState, type ResolveConfidence, type ResolvedModelMeta } from '@/lib/ai/model-registry';
import {
  deriveDisplayModelBadgeKeys,
  derivePrimaryKindBadgeKeys,
  derivePrimaryKindKey,
  deriveSystemModelTypes,
  getSystemSemanticBadgeKeys,
  sortSystemSemanticBadgeKeys,
  type DisplayModelBadgeKey,
  type PrimaryKindKey,
  type SystemSemanticBadgeKey,
  USER_MODEL_TYPE_ORDER,
} from '@/lib/ai/model-type-system';
import { buildLobeIconUrl } from '@/lib/ai/provider-icons';
import { hasExtensionSharedStorageRuntime } from '@/lib/extension/runtime-api';
import type { I18nText } from '@/types/i18n';
import type { ProviderConfig, ProviderModelConfig, ProviderType, TransportProtocol, UserModelType } from '@/lib/ai/types';
import { formatIconName } from './icon-name';

export { HelpTip } from '@/components/ui/help-tip';

/** 模型配置项别名。 */
export type ModelItem = ProviderModelConfig;

/** Provider 配置别名。 */
export type Provider = ProviderConfig;

/** API Key 连通性状态。 */
export interface ApiKeyConnectivityState {
  /** 当前检查状态。 */
  readonly status: 'not_checked' | 'checking' | 'success' | 'failed';
  /** 可选延迟。 */
  readonly latency?: number;
  /** 可选错误信息。 */
  readonly error?: I18nText;
  /** 可选技术详情。 */
  readonly errorDetail?: string;
  /** 可选命中的模型 ID。 */
  readonly modelId?: string;
}

/** 待完成的 API Key 连通性请求。 */
export interface PendingApiKeyCheckRequest {
  /** 当前检查中的 key。 */
  readonly key: string;
  /** 超时定时器。 */
  readonly timeoutId: number;
  /** 结束回调。 */
  readonly finish: (nextState?: ApiKeyConnectivityState | null) => void;
}

/** API Key 编辑状态。 */
export type ApiKeyEditingState =
  | { readonly mode: 'add'; readonly value: string }
  | { readonly mode: 'edit'; readonly index: number; readonly value: string };

/** API Key 连通性检查候选模型。 */
export interface ApiKeyModelCandidate {
  /** 模型 ID。 */
  readonly id: string;
  /** 可选展示名。 */
  readonly name?: string;
}

/** 模型编辑表单状态。 */
export interface ModelFormState {
  /** 发送给 Provider 的模型 ID。 */
  readonly id: string;
  /** UI 展示名称。 */
  readonly name: string;
  /** 分组名称。 */
  readonly group: string;
  /**
   * 用户手动覆盖的风格模型类型。
   *
   * 说明：
   * - `undefined` = 完全跟随系统识别；
   * - `[]` = 用户明确清空全部可编辑类型；
   * - 非空数组 = 用户显式覆盖。
   */
  readonly manualModelTypes?: ReadonlyArray<UserModelType>;
  /** 是否支持 text delta。 */
  readonly supportedTextDelta?: boolean;
}

/** Provider 表单状态。 */
export interface ProviderFormState {
  /** Provider 名称。 */
  readonly name: string;
  /** Provider 类型。 */
  readonly type: ProviderType;
  /** 鉴权方式；用于判断高级配置是否适用于通用 API Key 路径。 */
  readonly authType?: Provider['authType'];
  /** API Host。 */
  readonly apiHost: string;
  /** Anthropic Messages 协议专属 API Host。 */
  readonly anthropicApiHost: string;
  /** API 版本。 */
  readonly apiVersion: string;
  /** Logo。 */
  readonly logo: string;
  /** API 选项。 */
  readonly apiOptions?: Provider['apiOptions'];
  /** API Key 鉴权 header 配置。 */
  readonly apiKeyAuth?: Provider['apiKeyAuth'];
  /** 服务等级。 */
  readonly serviceTier?: Provider['serviceTier'];
  /** verbosity。 */
  readonly verbosity?: Provider['verbosity'];
  /** Anthropic cache control。 */
  readonly anthropicCacheControl?: Provider['anthropicCacheControl'];
  /** Bedrock 配置。 */
  readonly bedrock?: Provider['bedrock'];
  /** Vertex 配置。 */
  readonly vertex?: Provider['vertex'];
  /** 限速。 */
  readonly rateLimit: string;
  /** 备注。 */
  readonly notes: string;
}

/** 用于 UI 展示的模型注册表视图。 */
export type ResolvedRegistryView = ResolvedModelMeta & {
  /** Provider 中显式配置的协议。 */
  readonly configuredTransportProtocol?: TransportProtocol;
  /** 供共享版本排序复用的稳定排序身份。 */
  readonly versionSortKey: string;
  /** 当前模型的主类键。 */
  readonly primaryKindKey: PrimaryKindKey;
  /** 主类 badge。 */
  readonly primaryKindBadgeKeys: ReadonlyArray<PrimaryKindKey>;
  /** 当前面向用户展示的 8 类模型类型。 */
  readonly userModelTypes: ReadonlyArray<UserModelType>;
  /** 只读系统语义 badge。 */
  readonly systemSemanticKeys: ReadonlyArray<SystemSemanticBadgeKey>;
  /** 列表行右侧真正显示的 badge。 */
  readonly rowBadgeKeys: ReadonlyArray<DisplayModelBadgeKey>;
};

/** Provider 类型选项。 */
export const PROVIDER_TYPE_OPTIONS: ReadonlyArray<{ readonly value: ProviderType; readonly labelKey: string }> = [
  { value: 'openai-response', labelKey: 'OpenAI（Responses）' },
  { value: 'openai', labelKey: 'OpenAI / OpenAI Compatible' },
  { value: 'dashscope', labelKey: 'DashScope（通义千问）' },
  { value: 'siliconflow', labelKey: 'SiliconFlow（硅基流动）' },
  { value: 'anthropic', labelKey: 'Anthropic（Claude）' },
  { value: 'cohere', labelKey: 'Cohere' },
  { value: 'gemini', labelKey: 'Gemini' },
  { value: 'deepseek', labelKey: 'DeepSeek' },
  { value: 'groq', labelKey: 'Groq' },
  { value: 'azure-openai', labelKey: 'Azure OpenAI' },
  { value: 'vertexai', labelKey: 'Vertex AI' },
  { value: 'vertex-anthropic', labelKey: 'Vertex AI（Anthropic）' },
  { value: 'aws-bedrock', labelKey: 'AWS Bedrock' },
  { value: 'mistral', labelKey: 'Mistral' },
  { value: 'new-api', labelKey: 'NewAPI' },
  { value: 'gateway', labelKey: 'AI Gateway' },
  { value: 'xai', labelKey: 'xAI (Grok)' },
  { value: 'ollama', labelKey: 'Ollama（本地）' },
];

/** 传输协议选项。 */
export const TRANSPORT_PROTOCOL_OPTIONS: ReadonlyArray<{ readonly value: TransportProtocol; readonly label: string }> = [
  { value: 'openai-chat', label: 'OpenAI Chat Completions' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic-messages', label: 'Anthropic Messages' },
  { value: 'gemini-generate-content', label: 'Gemini GenerateContent' },
  { value: 'cohere-chat', label: 'Cohere Chat' },
  { value: 'bedrock-converse', label: 'AWS Bedrock Converse' },
  { value: 'embedding-api', label: 'Embedding API' },
  { value: 'rerank-api', label: 'Rerank API' },
  { value: 'image-api', label: 'Image API' },
  { value: 'video-api', label: 'Video API' },
  { value: 'transcription-api', label: 'Transcription API' },
  { value: 'speech-api', label: 'Speech API' },
  { value: 'moderation-api', label: 'Moderation API' },
  { value: 'unknown', label: 'Unknown' },
];

/** 系统 Provider ID 集合。 */
export const SYSTEM_PROVIDER_IDS = new Set(DEFAULT_PROVIDERS.map((provider) => provider.id));

/** 空 Provider。 */
export const EMPTY_PROVIDER: Provider = {
  id: '',
  name: '',
  type: 'openai',
  enabled: false,
  apiKey: '',
  apiHost: '',
  models: [],
};

/** 创建空模型表单。 */
export function createEmptyModelForm(): ModelFormState {
  return {
    id: '',
    name: '',
    group: '',
    manualModelTypes: undefined,
    supportedTextDelta: undefined,
  };
}

/** 创建空 Provider 表单。 */
export function createEmptyProviderForm(): ProviderFormState {
  return {
    name: '',
    type: 'openai',
    authType: undefined,
    apiHost: '',
    anthropicApiHost: '',
    apiVersion: '',
    logo: '',
    apiOptions: undefined,
    apiKeyAuth: undefined,
    serviceTier: undefined,
    verbosity: undefined,
    anthropicCacheControl: undefined,
    bedrock: undefined,
    vertex: undefined,
    rateLimit: '',
    notes: '',
  };
}

/** 拆分 API Key 字符串。 */
export function splitApiKeysString(raw: string): string[] {
  return splitApiKeys(raw);
}

/** 去重并保持顺序。 */
export function uniqStringsKeepOrder(items: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const value = String(raw || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** 格式化 API Key 字符串。 */
export function formatApiKeysString(keys: ReadonlyArray<string>): string {
  return normalizeApiKeyString(uniqStringsKeepOrder([...keys]).join(','));
}

/** 序列化 provider 快照。 */
export function serializeProvidersSnapshot(providers: ReadonlyArray<Provider>): string {
  return JSON.stringify(providers);
}

/** 掩码显示 API Key。 */
export function maskApiKeyForUi(key: string): string {
  const value = String(key || '').trim();
  if (!value) return '';
  if (value.length > 24) return `${value.slice(0, 8)}…${value.slice(-8)}`;
  if (value.length > 16) return `${value.slice(0, 4)}…${value.slice(-4)}`;
  if (value.length > 8) return `${value.slice(0, 2)}…${value.slice(-2)}`;
  return value;
}

/** IME 合成输入判断。 */
export function isImeComposingLikeEvent(
  event: {
    readonly key?: string;
    readonly isComposing?: boolean;
    readonly nativeEvent?: {
      readonly isComposing?: boolean;
      readonly keyCode?: number;
    } | null;
  },
): boolean {
  return Boolean(
    event.isComposing
    || event.nativeEvent?.isComposing
    || event.nativeEvent?.keyCode === 229
    || event.key === 'Process',
  );
}

/** 判断未知值是否为 record。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

/**
 * 对用户可见模型类型做稳定排序。
 *
 * 说明：
 * - 用户层现在固定为 8 类模型类型；
 * - 排序顺序严格跟随 `USER_MODEL_TYPE_ORDER`，避免 UI 在不同页面出现顺序漂移。
 */
export function sortUserModelTypes(keys: ReadonlyArray<UserModelType>): ReadonlyArray<UserModelType> {
  const set = new Set(keys)
  return USER_MODEL_TYPE_ORDER.filter((type) => set.has(type))
}

/** 是否使用 preview fallback provider。 */
export function shouldUsePreviewFallbackProviders(): boolean {
  return !hasExtensionSharedStorageRuntime();
}

/** 创建默认 provider 列表。 */
export function createDefaultProviders(): Provider[] {
  return DEFAULT_PROVIDERS.map((provider) => ({
    ...provider,
    models: (provider.models || []).map((model) => ({
      ...model,
      name: model.name || model.id,
      group: model.group || provider.name,
    })),
  }));
}

/** 创建初始 provider 状态。 */
export function createInitialProviderState(): Provider[] {
  return shouldUsePreviewFallbackProviders() ? createDefaultProviders() : [];
}

/** 用户模型类型 badge 组件属性。 */
export interface UserModelTypeBadgesProps {
  /** 需要展示的用户模型类型列表。 */
  readonly modelTypes: ReadonlyArray<UserModelType>;
  /** 是否只显示图标。 */
  readonly iconOnly?: boolean;
}

/**
 * 用户模型类型 badge。
 *
 * 说明：
 * - 只给用户层列表与筛选入口使用；
 * - 现在用户层已经收口为 8 类，其中 `image_generation` 是图片生成主类在用户层的正式投影；
 * - 所有渲染统一走 `CapabilityPill iconOnly`，文本通过 tooltip 暴露，避免 badge 本体再次塞入文案。
 */
export function UserModelTypeBadges({
  modelTypes,
  iconOnly = true,
}: UserModelTypeBadgesProps) {
  const { t } = useTranslation();
  if (modelTypes.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {modelTypes.map((key) => {
        const text = capabilityLabel(key, t);
        return <CapabilityPill key={key} capability={key} label={text} active size="sm" iconOnly={iconOnly} />;
      })}
    </div>
  );
}

/** 主类 badge 组件属性。 */
export interface PrimaryKindBadgesProps {
  /** 需要展示的主类键列表。 */
  readonly primaryKindKeys: ReadonlyArray<PrimaryKindKey>;
  /** 是否只显示图标。 */
  readonly iconOnly?: boolean;
}

/**
 * 主类 badge。
 *
 * 说明：
 * - 主类层固定对应 8 大主类；
 * - 当前产品要求主类 badge 与其它模型类型 badge 一样统一成 icon-only；
 * - 文案通过 tooltip 暴露，避免详情区和列表区出现两套不同的 badge 视觉。
 */
export function PrimaryKindBadges({
  primaryKindKeys,
  iconOnly = true,
}: PrimaryKindBadgesProps) {
  const { t } = useTranslation();
  if (primaryKindKeys.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {primaryKindKeys.map((key) => {
        const text = capabilityLabel(key, t);
        return <CapabilityPill key={key} capability={key} label={text} active size="sm" iconOnly={iconOnly} />;
      })}
    </div>
  );
}

/** 列表行右侧 badge 属性。 */
export interface RowBadgeKeysBadgesProps {
  /** 当前列表项右侧真正需要展示的 badge 键。 */
  readonly badgeKeys: ReadonlyArray<DisplayModelBadgeKey>;
}

/**
 * 列表行右侧 badge。
 *
 * 说明：
 * - 这组 badge 统一显示用户模型类型；
 * - `image_generation` 现在已经正式进入用户模型类型，不再依赖系统主类回补；
 * - 它只是一层展示投影，不改变用户模型类型与系统语义的真源边界。
 */
export function RowBadgeKeysBadges({
  badgeKeys,
}: RowBadgeKeysBadgesProps) {
  const { t } = useTranslation();
  if (badgeKeys.length === 0) return null;
  return (
    <div className="flex items-center justify-end gap-2">
      {badgeKeys.map((key) => {
        const text = capabilityLabel(key, t);
        return <CapabilityPill key={key} capability={key} label={text} active size="sm" iconOnly />;
      })}
    </div>
  );
}

/** 系统语义 badge 属性。 */
export interface SystemSemanticBadgesProps {
  /** 系统识别得到的只读语义键列表。 */
  readonly semanticKeys: ReadonlyArray<SystemSemanticBadgeKey>;
}

/**
 * 系统语义 badge。
 *
 * 说明：
 * - 只给“系统识别主类/系统识别能力”这类只读区域使用；
 * - 允许显示 `image-generation`、`structured_output` 等系统专属语义。
 */
export function SystemSemanticBadges({
  semanticKeys,
}: SystemSemanticBadgesProps) {
  const { t } = useTranslation();
  if (semanticKeys.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {semanticKeys.map((key) => {
        const text = capabilityLabel(key, t);
        return <CapabilityPill key={key} capability={key} label={text} active size="sm" iconOnly />;
      })}
    </div>
  );
}

/** 根据系统结果构造用户可见模型类型。 */
export function buildUserModelTypes(meta: Pick<ResolvedModelMeta, 'kind' | 'features'>): ReadonlyArray<UserModelType> {
  return sortUserModelTypes(deriveSystemModelTypes(meta));
}

/** 根据系统结果构造主类键。 */
export function buildPrimaryKindKey(meta: Pick<ResolvedModelMeta, 'kind'>): PrimaryKindKey {
  return derivePrimaryKindKey(meta)
}

/** 根据系统结果构造主类 badge。 */
export function buildPrimaryKindBadgeKeys(meta: Pick<ResolvedModelMeta, 'kind'>): ReadonlyArray<PrimaryKindKey> {
  return derivePrimaryKindBadgeKeys(meta)
}

/** 根据系统结果构造列表行右侧真正显示的 badge。 */
export function buildRowBadgeKeys(meta: Pick<ResolvedModelMeta, 'kind' | 'features'>): ReadonlyArray<DisplayModelBadgeKey> {
  return deriveDisplayModelBadgeKeys(meta);
}

/** 根据系统结果构造只读系统语义 badge。 */
export function buildSystemSemanticKeys(meta: Pick<ResolvedModelMeta, 'kind' | 'features'>): ReadonlyArray<SystemSemanticBadgeKey> {
  return sortSystemSemanticBadgeKeys(getSystemSemanticBadgeKeys(meta));
}

/** Lazy 图标选择格属性。 */
export interface LazyIconProps {
  /** 当前图标条目。 */
  readonly icon: LobeIconEntry;
  /** 当前是否使用暗色图标资源。 */
  readonly isDark: boolean;
  /** 点击图标时的回调。 */
  readonly onSelect: () => void;
}

/** Lazy 图标选择格。 */
export function LazyIcon({
  icon,
  isDark,
  onSelect,
}: LazyIconProps) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const src = buildLobeIconUrl(icon.id, isDark, icon.c);
  if (status === 'error') return null;
  return (
    <TooltipAction tooltip={formatIconName(icon.id)}>
      <button
        type="button"
        onClick={onSelect}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg transition-all hover:bg-accent hover:ring-2 ring-primary"
      >
        {status === 'loading' ? <span className="absolute inset-0 animate-pulse rounded-lg bg-muted" /> : null}
        <img
          src={src}
          alt={icon.id}
          width={28}
          height={28}
          className={`rounded transition-opacity duration-200 ${status === 'ok' ? 'opacity-100' : 'opacity-0'}`}
          style={{ width: 28, height: 28 }}
          loading="lazy"
          onLoad={() => setStatus('ok')}
          onError={() => setStatus('error')}
        />
      </button>
    </TooltipAction>
  );
}

/** 行内错误详情入口属性。 */
export interface InlineErrorDetailsProps {
  /** 行内摘要。 */
  readonly summary: string;
  /** 弹窗里展示的完整详情。 */
  readonly detail?: string;
  /** 摘要样式。 */
  readonly summaryClassName?: string;
  /** “详情”按钮样式。 */
  readonly buttonClassName?: string;
}

/**
 * 行内错误详情入口。
 *
 * 说明：
 * - 模型管理里的错误详情不再只依赖 hover tooltip；
 * - 行内继续展示摘要，但完整报错改成显式“详情”按钮打开 dialog，保证可发现、可复制。
 */
export function InlineErrorDetails({
  summary,
  detail,
  summaryClassName,
  buttonClassName,
}: InlineErrorDetailsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const summaryRef = useRef<HTMLSpanElement | null>(null);
  const [summaryOverflowing, setSummaryOverflowing] = useState(false);
  const summaryText = String(summary || '').trim();
  const detailText = String(detail || summary || '').trim();

  useEffect(() => {
    const element = summaryRef.current;
    if (!element || !summaryText) {
      setSummaryOverflowing(false);
      return;
    }

    /** 检测摘要文本是否已经发生视觉截断。 */
    const updateOverflow = () => {
      setSummaryOverflowing(element.scrollWidth > element.clientWidth + 1);
    };

    updateOverflow();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => updateOverflow());
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateOverflow);
    return () => window.removeEventListener('resize', updateOverflow);
  }, [summaryText]);

  const showDetailsButton = Boolean(detailText) && (detailText !== summaryText || summaryOverflowing);

  if (!detailText) return null;

  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        {summaryText ? (
          <span ref={summaryRef} className={`min-w-0 flex-1 truncate ${summaryClassName || ''}`} title={summaryText}>
            {summaryText}
          </span>
        ) : null}
        {showDetailsButton ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-6 shrink-0 px-2 text-[11px] ${buttonClassName || ''}`}
            onClick={() => setOpen(true)}
          >
            {t('message.details')}
          </Button>
        ) : null}
      </div>
      <Dialog open={showDetailsButton && open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('message.errorDetails')}</DialogTitle>
            <DialogDescription className="sr-only">{t('message.errorDetails')}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border bg-muted/20 p-3">
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{detailText}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void (async () => {
                  try {
                    await navigator.clipboard?.writeText?.(detailText);
                    toast.success(t('common.copied'));
                  } catch {
                    toast.error(t('common.copyFailed'));
                  }
                })();
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              {t('common.copy')}
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              {t('common.close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 空 registry。 */
export const EMPTY_MODEL_REGISTRY: ModelRegistryState = createEmptyModelRegistry();

/** modality 标签。 */
export function joinModelModalities(
  modalities: ReadonlyArray<ModelModality>,
  modalityLabel: (value: ModelModality) => string,
  emptyLabel: string,
) {
  return modalities.length > 0 ? modalities.map((item) => modalityLabel(item)).join(' / ') : emptyLabel;
}

/** 置信度标签。 */
export function formatResolveConfidence(
  value: ResolveConfidence,
  confidenceLabel: (value: ResolveConfidence) => string,
) {
  return confidenceLabel(value);
}
