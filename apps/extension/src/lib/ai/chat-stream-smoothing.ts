/**
 * 说明：`chat-stream-smoothing` 主聊天流式平滑模块。
 *
 * 职责：
 * - 把 provider 不稳定的正文 / reasoning chunk 切成本地可控的可见片段；
 * - 保持 AI SDK stream part 结构不变，只处理 `text-delta` 与 `reasoning-delta`；
 * - 为普通发送、重发、重新生成和 compare 共用的主聊天链路提供统一 transform。
 *
 * 边界：
 * - 本模块不读取用户设置，不新增持久化状态，也不伪造正文；
 * - tool/source/file/raw/progress 等非文本事件由 AI SDK transform 原样透传；
 * - 前端仍由 `run-stream-chat` 的 rAF flush 控制 UI 写回频率。
 */
import {
  smoothStream,
  type ChunkDetector,
  type StreamTextTransform,
  type ToolSet,
} from 'ai';

/** 主聊天本地平滑输出的默认片段间隔。 */
export const CHAT_STREAM_SMOOTH_DELAY_MS = 10;

interface GraphemeSegment {
  readonly segment: string;
}

interface GraphemeSegmenter {
  segment(input: string): Iterable<GraphemeSegment>;
}

type IntlWithSegmenter = typeof Intl & {
  readonly Segmenter: new (
    locales?: string | readonly string[],
    options?: { readonly granularity: 'grapheme' },
  ) => GraphemeSegmenter;
};

/** `createChatSmoothStreamTransform` 的内部测试选项；生产调用保持空参数。 */
export interface ChatSmoothStreamTransformOptions {
  /** 覆盖 AI SDK smoothStream 延迟，仅供单测消除计时等待。 */
  readonly delayInMs?: number | null;
  /** 覆盖底层 delay 实现，仅供单测观察 transform 排序。 */
  readonly delay?: (delayInMs: number | null) => Promise<void>;
}

const graphemeSegmenter = new (Intl as IntlWithSegmenter).Segmenter(undefined, {
  granularity: 'grapheme',
});

const CJK_GRAPHEME_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const COMPOSITE_EMOJI_GRAPHEME_PATTERN = /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u;
const NEWLINE_PREFIX_PATTERN = /^(?:\r\n|[\r\n])/u;
const HORIZONTAL_SPACE_PREFIX_PATTERN = /^[^\S\r\n]+/u;
const WORD_START_PATTERN = /^[\p{Letter}\p{Number}]/u;
const WORD_PREFIX_PATTERN = /^[\p{Letter}\p{Number}][\p{Letter}\p{Number}\p{Mark}]*(?:[._'’/-][\p{Letter}\p{Number}\p{Mark}]+)*/u;

/**
 * 读取 buffer 开头的首个完整字素。
 *
 * @param buffer - smoothStream 当前累积的待切分文本。
 * @returns 可安全释放的首个字素；若疑似半截 surrogate / ZWJ 序列则返回 `null` 等下一块。
 */
function readFirstGrapheme(buffer: string): string | null {
  const first = graphemeSegmenter.segment(buffer)[Symbol.iterator]().next().value;
  const segment = first?.segment;
  if (!segment) return null;

  // 上游若极端地把 surrogate pair、emoji modifier 或 ZWJ 序列切在半截，先等下一块补齐。
  const lastCodeUnit = segment.charCodeAt(segment.length - 1);
  if (
    segment.length === buffer.length
    && (
      (lastCodeUnit >= 0xD800 && lastCodeUnit <= 0xDBFF)
      || segment.endsWith('\u200D')
      || COMPOSITE_EMOJI_GRAPHEME_PATTERN.test(segment)
    )
  ) {
    return null;
  }
  return segment;
}

/**
 * 检测主聊天下一段可见平滑 chunk。
 *
 * @param buffer - AI SDK smoothStream 当前累积的文本 buffer。
 * @returns 可立即释放的 buffer 前缀；返回 `null` 表示继续等待更多文本或终态 flush。
 */
export const detectChatSmoothChunk: ChunkDetector = (buffer) => {
  if (!buffer) return null;

  const newline = NEWLINE_PREFIX_PATTERN.exec(buffer)?.[0];
  if (newline) return newline;

  const horizontalSpace = HORIZONTAL_SPACE_PREFIX_PATTERN.exec(buffer)?.[0];
  if (horizontalSpace) return horizontalSpace;

  const firstGrapheme = readFirstGrapheme(buffer);
  if (!firstGrapheme) return null;

  if (CJK_GRAPHEME_PATTERN.test(firstGrapheme)) {
    return firstGrapheme;
  }

  if (COMPOSITE_EMOJI_GRAPHEME_PATTERN.test(firstGrapheme)) {
    return firstGrapheme;
  }

  if (WORD_START_PATTERN.test(firstGrapheme)) {
    const word = WORD_PREFIX_PATTERN.exec(buffer)?.[0];
    if (word) {
      if (word.length === buffer.length) return null;
      const suffixSpaces = HORIZONTAL_SPACE_PREFIX_PATTERN.exec(buffer.slice(word.length))?.[0] ?? '';
      return `${word}${suffixSpaces}`;
    }
  }

  // 标点、emoji、其它符号按首个完整字素释放，避免把组合字符拆坏。
  return firstGrapheme;
};

/**
 * 创建主聊天 AI SDK stream transform。
 *
 * @remarks
 * 生产链路始终使用默认 `10ms` 平滑节奏；可选参数只服务单测，不暴露为用户设置。
 * 返回的 transform 由 AI SDK 负责仅平滑 `text-delta` 与 `reasoning-delta`，
 * 非文本事件会先 flush 已缓存文本再原样透传。
 */
export function createChatSmoothStreamTransform<TOOLS extends ToolSet = ToolSet>(
  options: ChatSmoothStreamTransformOptions = {},
): StreamTextTransform<TOOLS> {
  return smoothStream<TOOLS>({
    delayInMs: options.delayInMs ?? CHAT_STREAM_SMOOTH_DELAY_MS,
    chunking: detectChatSmoothChunk,
    _internal: options.delay ? { delay: options.delay } : undefined,
  });
}
