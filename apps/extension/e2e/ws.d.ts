/**
 * 说明：`ws` E2E 类型声明模块。
 *
 * 职责：
 * - 为 Playwright E2E 中使用到的 `ws` 提供最小类型声明；
 * - 仅覆盖当前测试里真正会访问到的 `WebSocket` 与 `WebSocketServer` 方法。
 *
 * 边界：
 * - 本文件不是第三方完整声明替代，只服务于当前仓库的 E2E 编译与类型检查。
 */
declare module 'ws' {
  import type { EventEmitter } from 'node:events';

  export class WebSocket extends EventEmitter {
    /** 主动关闭连接。 */
    close(code?: number, reason?: string): void;
    /** 强制终止连接。 */
    terminate(): void;
    /** 监听消息事件。 */
    on(event: 'message', listener: (data: string | Buffer) => void): this;
    /** 监听其它事件。 */
    on(event: string, listener: (...args: unknown[]) => void): this;
    /** 向对端发送文本消息。 */
    send(data: string): void;
  }

  export class WebSocketServer extends EventEmitter {
    clients: Set<WebSocket>;
    /** 创建一个临时 WebSocket 服务端。 */
    constructor(options?: { host?: string; port?: number });
    /** 返回当前监听地址。 */
    address(): { port: number } | string | null;
    /** 关闭服务端。 */
    close(callback?: (err?: Error) => void): void;
    /** 一次性监听 listening 事件。 */
    once(event: 'listening', listener: () => void): this;
    /** 一次性监听 error 事件。 */
    once(event: 'error', listener: (error: Error) => void): this;
    /** 监听新连接。 */
    on(event: 'connection', listener: (ws: WebSocket) => void): this;
    /** 监听其它事件。 */
    on(event: string, listener: (...args: unknown[]) => void): this;
  }
}
