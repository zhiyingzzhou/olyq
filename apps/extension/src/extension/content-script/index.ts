/**
 * 说明：Content Script 薄入口。
 *
 * 职责：
 * - 保持 manifest 静态入口稳定；
 * - 只启动网页工具运行时，不承载业务分发或浏览器 API 直连；
 * - 让实际生命周期、通信和事件清理都集中在 `runtime/page-tools-runtime.ts`。
 */
import { installPageToolsRuntime } from './runtime/page-tools-runtime';

installPageToolsRuntime();
