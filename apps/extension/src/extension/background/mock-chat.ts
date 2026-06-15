/**
 * 说明：`mock-chat` 后台运行时模块。
 *
 * 职责：
 * - 承载 `mock-chat` 相关的当前文件实现与模块边界；
 * - 对外暴露 `mockStreamChatV1` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ChatStreamParams } from '@/lib/ai/types';
import type { StreamChatEvent } from '@/lib/ai/stream-chat';
import { toI18nTextFromError } from '@/lib/i18n/error';
import { i18nText } from '@/lib/i18n/text';

/**
 * 在支持 AbortSignal 的情况下等待指定毫秒数。
 *
 * @param ms - 等待时长。
 * @param signal - 中断信号。
 * @returns 等待完成或被取消后的 Promise。
 */
function sleep(ms: number, signal: AbortSignal) {
  const t = Math.max(0, Math.floor(ms));
  if (t <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    /**
     * 响应外部取消并结束当前模拟等待。
     *
     * 说明：
     * - 会同步清理定时器与事件监听，避免 mock 流程在取消后继续往后推进；
     * - 统一抛出 `AbortError`，让上层与真实 Provider 流程保持相同的取消语义。
     */
    const onAbort = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      try { signal.removeEventListener('abort', onAbort); } catch { /* 忽略 */ }
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal.aborted) return onAbort();
    timer = setTimeout(() => {
      try { signal.removeEventListener('abort', onAbort); } catch { /* 忽略 */ }
      resolve();
    }, t);
    signal.addEventListener('abort', onAbort);
  }).catch(() => undefined);
}

/**
 * 取出本轮对话中最后一条用户消息文本。
 *
 * @param params - 当前聊天请求参数。
 * @returns 最后一条 user 消息内容。
 */
function lastUserText(params: ChatStreamParams) {
  const msgs = Array.isArray(params.messages) ? params.messages : [];
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i];
    if (m?.role === 'user') return String(m.content || '');
  }
  return '';
}

/**
 * 向调用方发出一段文本增量。
 *
 * @param requestId - 当前请求 ID。
 * @param onEvent - 事件回调。
 * @param text - 本次增量文本。
 */
function emitDelta(requestId: string, onEvent: (e: StreamChatEvent) => void, text: string) {
  if (!text) return;
  onEvent({ type: 'chat/delta', requestId, delta: text });
}

/**
 * 向调用方发出一段 reasoning 增量。
 *
 * @param requestId - 当前请求 ID。
 * @param onEvent - 事件回调。
 * @param text - 本次 reasoning 增量文本。
 */
function emitReasoning(requestId: string, onEvent: (e: StreamChatEvent) => void, text: string) {
  if (!text) return;
  onEvent({ type: 'chat/reasoning', requestId, delta: text });
}

/**
 * 发送“生成完成”事件。
 *
 * @param requestId - 当前请求 ID。
 * @param onEvent - 事件回调。
 */
function emitDone(requestId: string, onEvent: (e: StreamChatEvent) => void) {
  onEvent({ type: 'chat/done', requestId, usage: { inputTokens: 0, outputTokens: 0 } });
}

/**
 * 发送“已取消”错误事件。
 *
 * @param requestId - 当前请求 ID。
 * @param onEvent - 事件回调。
 */
function emitCancelled(requestId: string, onEvent: (e: StreamChatEvent) => void) {
  onEvent({ type: 'chat/error', requestId, error: i18nText('errors.cancelled') });
}

/**
 * 将文本切分成固定大小的小块，用于模拟流式输出。
 *
 * @param text - 原始文本。
 * @param size - 每块大小。
 * @returns 分块后的字符串数组。
 */
function chunksOf(text: string, size = 6) {
  const out: string[] = [];
  const s = Math.max(1, Math.floor(size));
  for (let i = 0; i < text.length; i += s) out.push(text.slice(i, i + s));
  return out;
}

/**
 * 构造一段接近真实页面分析结果的长 Markdown。
 *
 * 说明：
 * - 仅供 mock E2E 使用，用来覆盖“长 assistant markdown + 下一条 user/assistant”的真实布局链路；
 * - 内容特意包含标题、列表和 inline code，尽量贴近当前线上容易出问题的消息形态。
 */
function buildLongMarkdownMockAnswer() {
  return [
    '## 页面主旨',
    '',
    '- 当前页面是 Bootstrap 官网首页，核心信息是：Bootstrap 是一个“功能完整、可扩展”的前端工具包，用于快速搭建响应式网站。',
    '- 页面重点强调 4 个能力：快速接入、Sass 定制、CSS 变量扩展、无需 jQuery 的 JavaScript 插件。',
    '- 页面还补充推广了 `Bootstrap Icons`，说明它可以独立于 Bootstrap 使用。',
    '',
    '## 页面结构',
    '',
    '- 顶部导航：有 `Docs`、`Examples`、`Icons`、`Blog`，并带搜索框和版本切换。',
    '- Hero 首屏：主标题是 `Build fast, responsive sites with Bootstrap`。',
    '- 简介：介绍它支持 Sass、预置栅格和组件，以及 JavaScript 插件。',
    '- 快速操作：提供 `npm i bootstrap@5.3.8` 命令和 `Read the docs` 按钮。',
    '',
    '## 设计规范',
    '',
    '- 视觉目标：把 Bootstrap 表达成现代、易上手、可扩展的前端框架，视觉上兼顾技术感与亲和力。',
    '- 字重上，正文多为 `400`，重点按钮/标题常用 `500`、`600`。',
    '- 首屏主标题采用超大号黑体式粗字，形成强品牌锚点；正文则明显回归功能说明导向。',
    '- 页面整体是居中布局，最大内容宽度接近 `1378px`。',
    '- 结构上是典型的粘附导航 + Hero + 多个 section + 页脚。',
    '- section 间距较大，常见为 `24px / 48px / 96px`，说明它依赖充足留白建立层级。',
    '- 组件上大量使用浅灰底、细边框、小圆角、轻阴影，视觉更克制。',
    '- 页面不是纯平白底，而是带有柔和的大面积光晕/渐变背景。',
    '- `radius/md`：`6px`。',
    '- `type/body`：`16px / 24px`。',
    '- `space/section`：`48px` 到 `96px`。',
    '',
    '## 页面模式',
    '',
    '- 首屏：品牌图标 + 超大标题 + 简短说明 + 双 CTA。',
    '- 内容段落：大标题 + 描述 + 代码示例/图示。',
    '- 示例区：浅底卡片式代码框，突出“即拿即用”。',
    '- 底部：多列导航页脚，承接文档生态。',
    '',
    '## 补充说明',
    '',
    '- 这是一段额外补充说明，用来把回复继续拉长，模拟真实页面分析场景。'.repeat(16),
  ].join('\n');
}

/**
 * 构造一段会持续增高的 reasoning 文本，供 transcript 动态高度回归复用。
 *
 * 说明：
 * - 内容特意包含多段落与列表，保证 disclosure 展开后高度会持续增长；
 * - 这里只模拟 reasoning 链路，不改变正文/tool 的既有 contract。
 */
function buildSlowReasoningMockTrace() {
  return [
    '先确认当前回归只关心 transcript 自己的滚动锚点，不碰消息内块的滚动 owner。',
    '',
    '接着分三步检查：',
    '- 当前阅读锚点是不是还在原来的行。',
    '- 视口顶部附近的动态增高，是否被错误当成“安全可修正的上方行”。',
    '- 尾部流式增长和已离底阅读之间，是否仍然只保留一套 owner。',
    '',
    '如果这三件事混在一起，用户明明在往上读，列表却会因为高度回灌出现来回抖动。',
    '',
    '因此这段 reasoning 会持续追加多段文本，用来模拟真实模型在展开思考过程后仍不断写入同一条 assistant 消息的场景。',
    '',
    '最后再补一小段收尾说明，确保 E2E 有足够长的窗口观察 scrollTop 是否保持稳定。',
  ].join('\n');
}

/**
 * 测试模式 Mock：在不依赖任何真实 Provider/API 密钥的情况下，模拟 chat/stream-v1 的完整事件流。
 *
 * 触发规则（通过用户输入控制，便于 E2E 覆盖不同分支）：
 * - 包含 "\@tool"：发起 browser/evaluate，并立即返回 tool-result
 */
export async function mockStreamChatV1(
  requestId: string,
  params: ChatStreamParams,
  onEvent: (e: StreamChatEvent) => void,
  signal: AbortSignal,
) {
  const delay = (() => {
    const raw = (import.meta as unknown as { env?: Record<string, unknown> }).env?.VITE_OLYQ_E2E_DELAY_MS;
    const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : 12;
    return Number.isFinite(n) ? Math.max(0, Math.min(200, Math.floor(n))) : 12;
  })();

  const text = lastUserText(params);
  const lower = text.toLowerCase();

  const isTool = lower.includes('@tool');
  const isSlow = lower.includes('@slow');
  const isSlowReasoning = lower.includes('@slow-reasoning');
  const isLongMarkdown = lower.includes('@layout-markdown');

  try {
    if (signal.aborted) {
      emitCancelled(requestId, onEvent);
      return;
    }

    // 先给一点"正在思考"的流式效果
    for (const c of chunksOf(`Mock(${params.model || 'model'})：`, 4)) {
      if (signal.aborted) {
        emitCancelled(requestId, onEvent);
        return;
      }
      emitDelta(requestId, onEvent, c);
      await sleep(isSlow ? Math.max(delay, 80) : delay, signal);
    }

    if (isTool) {
      const toolCallId = `tc_${requestId}_tool`;
      onEvent({
        type: 'chat/tool-call',
        requestId,
        toolCallId,
        toolName: 'browser/evaluate',
        args: { expression: '1 + 1' },
      });
      await sleep(delay, signal);
      onEvent({
        type: 'chat/tool-result',
        requestId,
        toolCallId,
        toolName: 'browser/evaluate',
        result: { ok: true, value: 2 },
      });
      await sleep(delay, signal);
      emitDelta(requestId, onEvent, `\n\n工具返回：2`);
      await sleep(delay, signal);
    }

    if (isSlowReasoning) {
      const reasoning = buildSlowReasoningMockTrace();
      const reasoningDelay = Math.max(delay, 80);
      for (const chunk of chunksOf(`${reasoning}\n`, 5)) {
        if (signal.aborted) {
          emitCancelled(requestId, onEvent);
          return;
        }
        emitReasoning(requestId, onEvent, chunk);
        await sleep(reasoningDelay, signal);
      }
    }

    // 默认回复：回显用户输入（保持可断言）
    if (!isTool) {
      const filler = (isSlow || isSlowReasoning) ? `\n${'…'.repeat(220)}\n` : '\n';
      const answerBody = isLongMarkdown
        ? buildLongMarkdownMockAnswer()
        : isSlowReasoning
          ? '正文阶段：这里继续补一段最终回答，用来确认 reasoning 结束后 transcript 还能稳定收尾。'
          : `你说：${text || '（空）'}`;
      const answer = `\n\n${answerBody}${filler}\n（来自 E2E Mock）`;
      const stepDelay = (isSlow || isSlowReasoning) ? Math.max(delay, 80) : delay;
      const chunkSize = (isSlow || isSlowReasoning) ? 4 : 8;
      for (const c of chunksOf(answer, chunkSize)) {
        if (signal.aborted) {
          emitCancelled(requestId, onEvent);
          return;
        }
        emitDelta(requestId, onEvent, c);
        await sleep(stepDelay, signal);
      }
    }

    if (signal.aborted) {
      emitCancelled(requestId, onEvent);
      return;
    }
    emitDone(requestId, onEvent);
  } catch (e: unknown) {
    // 统一把 abort 转成"已取消生成"，避免测试 flake
    if (signal.aborted || (e instanceof Error && e.name === 'AbortError')) {
      emitCancelled(requestId, onEvent);
      return;
    }
    onEvent({ type: 'chat/error', requestId, error: toI18nTextFromError(e) });
  }
}
