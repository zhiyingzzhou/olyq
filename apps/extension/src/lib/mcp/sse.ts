/**
 * 说明：`sse` 基础能力模块。
 *
 * 职责：
 * - 承载 `sse` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SseEvent`、`parseSseStream` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/** 解析后的 SSE 事件（仅保留 MCP 需要的字段） */
export type SseEvent = {
  /** 事件名（缺省视为 "message"） */
  event: string;
  /** 事件数据（多行 data 会以 `\\n` 拼接） */
  data: string;
  /** F1-2: 事件 ID，用于断线重连时的 Last-Event-ID 恢复 */
  id?: string;
  /** F1-2: 重连延迟（毫秒），由服务端通过 retry 字段指定 */
  retry?: number;
};

/**
 * 解析 text/event-stream
 * - 仅实现 MCP 所需字段：event/data
 * - data 支持多行拼接（以 \\n 连接）
 */
export async function* parseSseStream(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');

  let buffer = '';
  let curEvent = '';
  let curId: string | undefined;
  let dataLines: string[] = [];

  /**
   * 在遇到空行或流结束时，把当前累计字段封装成一个完整 SSE 事件。
   *
   * 说明：
   * - `event` 为空时按 SSE 规范回退为 `message`；
   * - flush 后会重置当前事件缓冲，供下一条事件继续累积。
   */
  const flush = (): SseEvent | null => {
    if (!curEvent && dataLines.length === 0) return null;
    const data = dataLines.join('\n');
    const ev = curEvent || 'message';
    const id = curId;
    curEvent = '';
    dataLines = [];
    const result: SseEvent = { event: ev, data };
    if (id !== undefined) result.id = id;
    return result;
  };

  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const lf = buffer.indexOf('\n');
      if (lf < 0) break;
      let line = buffer.slice(0, lf);
      buffer = buffer.slice(lf + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);

      // 事件结束：空行
      if (line === '') {
        const ev = flush();
        if (ev) yield ev;
        continue;
      }

      // 注释行
      if (line.startsWith(':')) continue;

      const idx = line.indexOf(':');
      const field = idx >= 0 ? line.slice(0, idx) : line;
      let val = idx >= 0 ? line.slice(idx + 1) : '';
      if (val.startsWith(' ')) val = val.slice(1);

      if (field === 'event') curEvent = val;
      else if (field === 'data') dataLines.push(val);
      // 修复 F1-2：解析 id 字段，用于断线重连时的 Last-Event-ID
      else if (field === 'id') curId = val;
      // 修复 F1-2：解析 retry 字段，控制重连延迟（毫秒）
      else if (field === 'retry') {
        const ms = parseInt(val, 10);
        if (!isNaN(ms)) {
          // 通过一个特殊事件通知调用方更新重连延迟
          yield { event: 'retry', data: '', retry: ms };
        }
      }
    }
  }

  // 流结束时补一次 flush
  const ev = flush();
  if (ev) yield ev;
}
