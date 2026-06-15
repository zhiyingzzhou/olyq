/**
 * 说明：`vite-env.d` 源码模块。
 *
 * 职责：
 * - 承载 `vite-env.d` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/// <reference types="vite/client" /> // 说明：TypeScript 三斜线指令（Vite 注入的客户端类型）
// 说明：Vite 注入的全局类型声明（请保持三斜线指令原样，避免影响构建/类型检查）

interface OlyqRuntimeBuildConfig {
  target: "chromium" | "firefox";
  appVersion: string;
}

declare const __OLYQ_BUILD_CONFIG__: OlyqRuntimeBuildConfig;
