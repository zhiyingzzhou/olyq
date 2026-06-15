/**
 * 说明：`auto-rename` 基础能力模块。
 *
 * 职责：
 * - 承载 `auto-rename` 相关的当前文件实现与模块边界；
 * - 对外暴露 `buildTopicTitleSample` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { generateObjectTask } from '@/lib/object-gen';
import { toUserFacingAiErrorText } from '@/lib/ai/utils/api-errors';
import { I18nError, isI18nError } from '@/lib/i18n/error';
import { i18nText } from '@/lib/i18n/text';
import type { I18nText } from '@/types/i18n';
import type { Message } from '@/types/chat';

/** 话题标题采样构建器的可选截断与抽样配置。 */
type BuildTopicTitleSampleOptions = {
  /** 取前 N 条消息（默认 3） */
  headCount?: number;
  /** 取后 N 条消息（默认 3；仅当总长度足够时才会启用） */
  tailCount?: number;
  /** 每条消息最多保留的字符数（默认 360） */
  perMessageMaxChars?: number;
};

/** 把消息角色转换成标题采样 prompt 中使用的中文标签。 */
function roleLabel(role: Message['role']): '用户' | '助手' | '系统' {
  if (role === 'user') return '用户';
  if (role === 'assistant') return '助手';
  return '系统';
}

/** 根据附件数量生成精简提示，帮助标题模型理解“这轮对话还包含图片/文件”。 */
function buildAttachmentHint(m: Message): string {
  const atts = Array.isArray(m.attachments) ? m.attachments : [];
  if (atts.length === 0) return '';

  const images = atts.filter((a) => a?.type === 'image').length;
  const files = atts.filter((a) => a?.type === 'file').length;
  const parts: string[] = [];
  if (images > 0) parts.push(`图片×${images}`);
  if (files > 0) parts.push(`文件×${files}`);
  if (parts.length === 0) return '';
  return `（${parts.join('，')}）`;
}

/**
 * 规范化单条消息采样片段。
 *
 * 说明：
 * - 会把大代码块折叠成占位文本，避免标题生成提示被无意义代码淹没；
 * - 会合并空白并按最大长度裁剪，控制 token 体积。
 */
function normalizeSnippet(raw: unknown, maxChars: number): string {
  const text = typeof raw === 'string' ? raw : String(raw ?? '');

  // 说明：标题生成只需要“语义线索”，大段代码块/格式化文本会显著拉高 token 与耗时。
  const withoutCodeBlocks = text.replace(/```[\s\S]*?```/g, ' [代码块] ');

  // 折叠空白，减少 token 浪费
  const compact = withoutCodeBlocks.replace(/\s+/g, ' ').trim();
  if (!compact) return '';

  return compact.length > maxChars ? `${compact.slice(0, maxChars)}…` : compact;
}

/**
 * 构建“话题标题生成”所需的对话采样文本。
 *
 * 目标：
 * - 让模型用尽量少的 token 获取足够语义线索；
 * - 避免把整段对话原文（尤其是长 Markdown / 代码块）塞进 prompt，导致标题生成变慢甚至超时。
 */
export function buildTopicTitleSample(
  messages: Message[],
  opts?: BuildTopicTitleSampleOptions,
): string {
  const headCount = typeof opts?.headCount === 'number' && Number.isFinite(opts.headCount) ? Math.max(1, Math.floor(opts.headCount)) : 3;
  const tailCount = typeof opts?.tailCount === 'number' && Number.isFinite(opts.tailCount) ? Math.max(0, Math.floor(opts.tailCount)) : 3;
  const perMessageMaxChars =
    typeof opts?.perMessageMaxChars === 'number' && Number.isFinite(opts.perMessageMaxChars)
      ? Math.max(80, Math.floor(opts.perMessageMaxChars))
      : 360;

  const list = Array.isArray(messages) ? messages : [];
  const usable = list.filter((m) => m && (m.role === 'user' || m.role === 'assistant'));
  if (usable.length === 0) return '';

  const head = usable.slice(0, headCount);
  const useTail = tailCount > 0 && usable.length > headCount + tailCount;
  const tail = useTail ? usable.slice(-tailCount) : [];

  const out: string[] = [];
  for (const m of head) {
    const hint = buildAttachmentHint(m);
    const snippet = normalizeSnippet(m.content, perMessageMaxChars);
    const body = snippet ? `${snippet}${hint}` : hint;
    if (!body) continue;
    out.push(`${roleLabel(m.role)}：${body}`);
  }

  if (tail.length > 0) out.push('系统：…（中间略）');

  for (const m of tail) {
    const hint = buildAttachmentHint(m);
    const snippet = normalizeSnippet(m.content, perMessageMaxChars);
    const body = snippet ? `${snippet}${hint}` : hint;
    if (!body) continue;
    out.push(`${roleLabel(m.role)}：${body}`);
  }

  return out.join('\n');
}

/** 将自动命名标题统一裁剪到产品允许的可读长度。 */
export function clampAutoRenameTitle(raw: string): string {
  const text = String(raw || '').replace(/\n/g, ' ').trim();
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

/**
 * 基于对话消息请求自动命名标题。
 *
 * 说明：
 * - 标题请求统一走后台 `topic-title` 任务；
 * - UI 不再各自拼 prompt 或各自做 timeout 映射，避免手动/静默链路分叉；
 * - 返回前会做最终裁剪，保证所有入口拿到的是同一份标题规范。
 */
export async function generateAutoRenameTitle(modelId: string, messages: Message[]): Promise<string> {
  const sample = buildTopicTitleSample(messages, {
    headCount: 3,
    tailCount: 3,
    perMessageMaxChars: 360,
  });

  try {
    const { title } = await generateObjectTask({
      taskId: 'topic-title',
      model: modelId,
      input: { sample },
      timeoutMs: 30_000,
    });
    return clampAutoRenameTitle(title);
  } catch (error: unknown) {
    if (isI18nError(error) && error.i18n.key === 'errors.objectTimeout') {
      throw new I18nError('errors.autoRenameTimeout');
    }
    throw error;
  }
}

/** 判断错误详情是否像是原始 SSE / prompt body，不适合直接展示给用户。 */
function looksLikeUnsafeAutoRenameDetail(error: unknown): boolean {
  const detail = error instanceof Error
    ? String(error.message || '')
    : typeof error === 'string'
      ? error
      : '';
  const normalized = detail.trim();
  if (!normalized) return false;
  if (normalized.length > 500) return true;

  return (
    normalized.includes('event: response.created')
    || normalized.includes('event: response.completed')
    || normalized.includes('text/event-stream')
    || normalized.includes('"instructions"')
    || normalized.includes('"response":{"id":"resp_')
  );
}

/** 自动命名错误只允许保留稳定短详情，长 payload / SSE body 必须回退到通用失败文案。 */
function sanitizeAutoRenameErrorText(text: I18nText): I18nText {
  const detail = typeof text.params?.detail === 'string' ? text.params.detail.trim() : '';
  if (!detail) return text;
  if (looksLikeUnsafeAutoRenameDetail(detail)) return i18nText('errors.objectGenerationFailed');
  return text;
}

/**
 * 将自动命名失败统一归一成用户可见的国际化文案。
 *
 * 说明：
 * - 手动按钮和静默自动命名都必须走同一套格式化逻辑；
 * - 这里优先保留稳定的 I18nError，再用 AI API 错误归一化兜底，避免把原始 SSE body 或内部 prompt 直接写进 UI。
 */
export function toAutoRenameErrorText(error: unknown): I18nText {
  if (isI18nError(error)) return sanitizeAutoRenameErrorText(error.i18n);
  if (looksLikeUnsafeAutoRenameDetail(error)) return i18nText('errors.objectGenerationFailed');
  return sanitizeAutoRenameErrorText(toUserFacingAiErrorText(error));
}
