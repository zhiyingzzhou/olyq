#!/usr/bin/env node
/**
 * 说明：根级扩展产物边界校验。
 *
 * 职责：
 * - 防止仓库根目录重新出现旧扩展 `dist*` 目录；
 * - 明确本地手动加载扩展时只能选择 `apps/extension/dist` 这类 package 内产物。
 *
 * 边界：
 * - 本脚本只检查 `olyq/` 根目录的一层目录，不扫描或删除任何文件；
 * - `apps/extension/dist`、`apps/extension/dist-firefox` 和 E2E 构建目录是合法产物。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenRootDistDirs = [
  "dist",
  "dist-e2e",
  "dist-firefox",
  "dist-firefox-e2e",
];

const existing = forbiddenRootDistDirs.filter((dirName) => {
  const absolutePath = path.join(repoRoot, dirName);
  try {
    return fs.statSync(absolutePath).isDirectory();
  } catch {
    return false;
  }
});

if (existing.length > 0) {
  const details = existing
    .map((dirName) => `- ${dirName}`)
    .join("\n");
  console.error(
    [
      "根级旧扩展构建目录不允许存在，避免 Chrome 误加载过期 Side Panel 产物。",
      details,
      "",
      "请删除这些根级目录；本地加载 Chromium 扩展时选择：",
      "  apps/extension/dist",
      "",
      "Firefox 生产产物位于：",
      "  apps/extension/dist-firefox",
    ].join("\n"),
  );
  process.exit(1);
}

console.log("Extension dist boundary verified: root dist* directories are absent.");
