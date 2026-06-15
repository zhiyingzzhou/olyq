/**
 * 说明：`model-manager-types` 组件模块。
 *
 * 职责：
 * - 承载 `model-manager-types` 相关的当前文件实现与模块边界；
 * - 对外暴露 `AnthropicCacheControl`、`BedrockConfig`、`VertexConfig` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ProviderConfig, ProviderType } from '@/lib/ai/types';
import type { LobeIconEntry } from '@/lib/ai/lobe-icon-list';
import type { RefObject } from 'react';

/** Anthropic prompt cache 控制项。 */
export type AnthropicCacheControl = NonNullable<ProviderConfig['anthropicCacheControl']>;

/** Bedrock 授权配置。 */
export type BedrockConfig = NonNullable<ProviderConfig['bedrock']>;

/** Vertex AI 配置。 */
export type VertexConfig = NonNullable<ProviderConfig['vertex']>;

/** Provider API 兼容性选项。 */
export type ProviderApiOptions = NonNullable<ProviderConfig['apiOptions']>;

/** Add Provider 表单状态。 */
export interface AddProviderFormState {
  /** Provider 展示名称。 */
  readonly name: string;
  /** Provider 类型，决定请求协议与特定配置字段。 */
  readonly type: ProviderType;
  /** 鉴权方式；OAuth provider 不展示通用 API Key 鉴权 header 配置。 */
  readonly authType?: ProviderConfig['authType'];
  /** 通用 API Host。 */
  readonly apiHost: string;
  /** Anthropic Messages 协议专属 API Host。 */
  readonly anthropicApiHost: string;
  /** API 版本号（按对应 Provider 的兼容协议生效）。 */
  readonly apiVersion: string;
  /** 用户自定义 Logo 或内置图标引用。 */
  readonly logo: string;
  /** OpenAI 兼容层的附加 API 选项。 */
  readonly apiOptions?: ProviderApiOptions;
  /** API Key 鉴权 header 配置；缺省表示使用平台默认规则。 */
  readonly apiKeyAuth?: ProviderConfig['apiKeyAuth'];
  /** 服务层级，例如优先级/吞吐策略。 */
  readonly serviceTier?: ProviderConfig['serviceTier'];
  /** 模型输出冗长度控制。 */
  readonly verbosity?: ProviderConfig['verbosity'];
  /** Anthropic Prompt Cache 控制项。 */
  readonly anthropicCacheControl?: AnthropicCacheControl;
  /** AWS Bedrock 授权信息。 */
  readonly bedrock?: BedrockConfig;
  /** Vertex AI 配置。 */
  readonly vertex?: VertexConfig;
  /** Provider 级请求频率限制（字符串表单态）。 */
  readonly rateLimit: string;
  /** 用户给当前 Provider 留下的补充说明。 */
  readonly notes: string;
}

/** 内置图标选择器状态。 */
export interface BuiltinIconPickerState {
  /** 图标选择浮层是否打开。 */
  readonly open: boolean;
  /** 内置图标目录是否仍在加载。 */
  readonly loading: boolean;
  /** 图标搜索关键字。 */
  readonly search: string;
}

/** ModelManager Add Provider 对话框 props。 */
export interface ModelManagerAddProviderDialogProps {
  /** 对话框是否打开。 */
  readonly open: boolean;
  /** 正在编辑的 Provider ID；为空表示新增。 */
  readonly editingProviderId: string | null;
  /** 是否展开高级配置区域。 */
  readonly advancedOpen: boolean;
  /** 内置图标选择器状态。 */
  readonly builtinPicker: BuiltinIconPickerState;
  /** 已加载的内置图标列表。 */
  readonly builtinIcons: ReadonlyArray<LobeIconEntry>;
  /** 当前 Provider 表单状态。 */
  readonly addProviderForm: AddProviderFormState;
  /** 外层控制对话框开关。 */
  readonly onOpenChange: (open: boolean) => void;
  /** 切换高级配置展开状态。 */
  readonly onAdvancedToggle: (next: boolean) => void;
  /** 局部更新 Provider 表单。 */
  readonly onFormPatch: (patch: Partial<AddProviderFormState>) => void;
  /** 保存新增/编辑结果。 */
  readonly onSave: () => void;
  /** 取消并回滚当前编辑态。 */
  readonly onCancel: () => void;
  /** 当前表单是否允许保存。 */
  readonly isSaveDisabled: boolean;
  /** 请求加载内置图标目录。 */
  readonly onRequestBuiltinIcons: () => void;
  /** 更新内置图标搜索关键字。 */
  readonly onBuiltinSearch: (text: string) => void;
  /** 选中某个内置图标作为 Provider Logo。 */
  readonly onSelectBuiltinIcon: (icon: LobeIconEntry) => void;
  /** 清空自定义/内置 Logo。 */
  readonly onResetLogo: () => void;
  /** 隐藏的头像上传输入框引用。 */
  readonly avatarInputRef: RefObject<HTMLInputElement | null>;
  /** 处理自定义头像上传。 */
  readonly onAvatarUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** 切换内置图标选择器开关。 */
  readonly onToggleBuiltinPicker: (open: boolean) => void;
}
