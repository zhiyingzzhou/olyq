/**
 * 说明：`main` 页面风格 benchmark 页面入口。
 *
 * 职责：
 * - 初始化 benchmark 页面 DOM；
 * - 把 page-style benchmark runtime 暴露到全局，供 Node runner 和手工调试复用；
 * - 提供一个极简状态面板，方便直接打开页面排查结果。
 *
 * 边界：
 * - 本入口只属于 benchmark 页面，不接入扩展 UI、SW 或 content-script 通信；
 * - 这里只做装配，不重复实现 page-style 采样逻辑；
 * - benchmark 页面会通过 `__olyq_shadow_host__` 被 page-style 采样器自动跳过。
 */
import {
  createPageStyleBenchmarkHarness,
  type PageStyleBenchmarkHarness,
} from './runtime';

declare global {
  interface Window {
    __OLYQ_PAGE_STYLE_BENCHMARK__?: PageStyleBenchmarkHarness;
  }
}

const statusNode = document.getElementById('benchmark-status');
const host = document.getElementById('page-style-benchmark-host');

if (!(host instanceof HTMLElement)) {
  throw new Error('missing #page-style-benchmark-host');
}

/**
 * 更新页面上的 benchmark 状态文字。
 *
 * @param text - 状态说明。
 */
function writeStatus(text: string): void {
  if (statusNode) {
    statusNode.textContent = `${new Date().toISOString()}  ${text}`;
  }
}

window.__OLYQ_PAGE_STYLE_BENCHMARK__ = createPageStyleBenchmarkHarness(host, writeStatus);
writeStatus('bootstrap-complete');
