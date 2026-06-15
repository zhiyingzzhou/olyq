#!/usr/bin/env node
/**
 * 说明：根级扩展构建产物报告。
 *
 * 职责：
 * - 在根级 workspace build 命令结束后明确打印真实产物目录；
 * - 产物目录或 manifest 缺失时直接失败，避免把“根级没有 dist”误判为构建没输出。
 *
 * 边界：
 * - 本脚本只报告 `apps/extension/` package 内的构建产物；
 * - 不创建根级 `dist*`、不创建软链接，也不删除任何目录。
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const targets = {
  chromium: {
    label: "Chromium extension",
    distDir: "apps/extension/dist",
    buildCommand: "pnpm build:extension:chromium",
    loadHint: "Chrome 加载已解压扩展时请选择这个目录。",
  },
  firefox: {
    label: "Firefox extension",
    distDir: "apps/extension/dist-firefox",
    buildCommand: "pnpm build:extension:firefox",
    loadHint: "Firefox 临时载入附加组件时请选择该目录中的 manifest.json。",
  },
  "chromium-e2e": {
    label: "Chromium extension E2E",
    distDir: "apps/extension/dist-e2e",
    buildCommand: "pnpm build:extension:test:chromium",
    loadHint: "这是 E2E 测试产物，不是日常手动加载入口。",
  },
  "firefox-e2e": {
    label: "Firefox extension E2E",
    distDir: "apps/extension/dist-firefox-e2e",
    buildCommand: "pnpm build:extension:test:firefox",
    loadHint: "这是 E2E 测试产物，不是 Firefox 发布产物。",
  },
};

const targetName = process.argv[2];
const target = targets[targetName];

if (!target) {
  console.error(
    [
      "Unknown extension build output target.",
      `Expected one of: ${Object.keys(targets).join(", ")}`,
    ].join("\n"),
  );
  process.exit(1);
}

const distPath = path.join(repoRoot, target.distDir);
const manifestPath = path.join(distPath, "manifest.json");

if (!fs.existsSync(distPath) || !fs.statSync(distPath).isDirectory()) {
  console.error(
    [
      `${target.label} build output is missing:`,
      `  ${target.distDir}`,
      "",
      "请在 olyq/ 根目录运行：",
      `  ${target.buildCommand}`,
      "",
      "注意：根级 build 命令只是 workspace 编排入口，产物不会写到根级 dist。",
    ].join("\n"),
  );
  process.exit(1);
}

if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) {
  console.error(
    [
      `${target.label} manifest is missing:`,
      `  ${path.join(target.distDir, "manifest.json")}`,
      "",
      "请重新运行：",
      `  ${target.buildCommand}`,
    ].join("\n"),
  );
  process.exit(1);
}

console.log(
  [
    "",
    `${target.label} build output is ready:`,
    `  ${target.distDir}`,
    "",
    target.loadHint,
    `Absolute path: ${distPath}`,
  ].join("\n"),
);
