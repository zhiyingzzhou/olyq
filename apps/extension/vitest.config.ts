/**
 * 说明：`vitest.config` 源码模块。
 *
 * 职责：
 * - 承载 `vitest.config` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // 完整扩展测试矩阵包含重 DOM 交互、源码审计与 i18n 扫描；全量并发时冷启动会明显慢于单文件运行。
    // 统一使用 30s 预算，保持断言不降级，同时避免负载型超时污染同文件后续用例。
    testTimeout: 30_000,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
