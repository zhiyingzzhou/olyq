/**
 * 说明：`DeveloperPanel.utils` 组件模块。
 *
 * 职责：
 * - 承载开发者面板的本地格式化 helper；
 * - 让主面板文件专注在状态与视图装配，而不是字符串整形细节；
 * - 保持调试事件列表与详情区使用同一套展示规则。
 *
 * 边界：
 * - 这里只处理纯格式化逻辑；
 * - 不依赖 React，也不直接读写 store 或浏览器 API。
 */

/**
 * 把调试时间戳格式化为紧凑的本地时间串。
 *
 * @param timestamp - 事件时间戳。
 * @returns 适合列表展示的本地时间文本。
 */
export function formatDebugTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '--:--:--';
  }
}

/**
 * 把任意调试值稳定序列化为字符串。
 *
 * @param value - 任意调试负载。
 * @param spacing - JSON 缩进宽度。
 * @returns 可展示字符串。
 */
export function stringifyDebugValue(value: unknown, spacing = 2): string {
  try {
    return JSON.stringify(value, null, spacing);
  } catch {
    return String(value);
  }
}

/**
 * 尝试把 JSON 字符串解析回结构化值。
 *
 * @param value - 原始字符串。
 * @returns 成功时返回结构化对象，失败返回 `null`。
 */
export function tryParseJsonString(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * 根据当前阅读模式格式化调试 payload。
 *
 * @param payload - 原始负载。
 * @param prettify - 是否启用 JSON 格式化。
 * @returns 详情区展示文本。
 */
export function formatDebugPayload(payload: unknown, prettify: boolean): string {
  if (!prettify) {
    if (typeof payload === 'string') return payload;
    return stringifyDebugValue(payload, 0);
  }

  if (typeof payload === 'string') {
    const parsed = tryParseJsonString(payload);
    if (parsed !== null) return stringifyDebugValue(parsed);
    return payload;
  }

  return stringifyDebugValue(payload);
}

/**
 * 生成调试事件列表用的单行摘要。
 *
 * @param payload - 原始事件负载。
 * @returns 截断后的摘要文本。
 */
export function summarizePayload(payload: unknown): string {
  const text = stringifyDebugValue(payload).replace(/\s+/g, ' ').trim();
  return text.length > 140 ? `${text.slice(0, 140)}...` : text || '—';
}

/**
 * 收敛长 requestId 的列表展示长度。
 *
 * @param requestId - 原始请求 ID。
 * @returns 适合列表使用的紧凑 requestId。
 */
export function formatCompactRequestId(requestId: string): string {
  const value = String(requestId || '').trim();
  if (!value) return '—';
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}
