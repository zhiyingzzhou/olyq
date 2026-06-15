/**
 * 说明：技术栈探测商用边界 guard。
 *
 * 职责：
 * - 禁止第三方品牌词、源码、图标、遥测或 UI 进入 Olyq 生产运行时代码；
 * - 允许 Olyq 本地生成后的中性技术指纹包进入生产链路；
 * - 禁止恢复运行时网页授权 request/remove/contains 与 host-permission prompt 入口；
 * - 让合规边界从文档要求沉淀成测试护栏。
 */
// @vitest-environment node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const WORKSPACE_ROOT = path.resolve(ROOT, '..', '..');
const THIRD_PARTY_NOTICES_PATH = path.relative(ROOT, path.join(WORKSPACE_ROOT, 'THIRD_PARTY_NOTICES.md'));
const SCAN_ROOTS = ['src', 'scripts', 'public', 'manifest.config.mjs', 'package.json', THIRD_PARTY_NOTICES_PATH];
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.html', '.css', '.txt']);

/**
 * 递归收集指定目标下的文件。
 *
 * @param target - 相对扩展包根目录的文件或目录。
 * @returns 目标下所有文件的绝对路径。
 */
function collectFiles(target: string): string[] {
  const absolute = path.join(ROOT, target);
  const stat = statSync(absolute);
  if (stat.isFile()) return [absolute];
  const out: string[] = [];
  for (const entry of readdirSync(absolute)) {
    if (entry === 'dist' || entry === 'dist-firefox') continue;
    const next = path.join(absolute, entry);
    const nextStat = statSync(next);
    if (nextStat.isDirectory()) out.push(...collectFiles(path.relative(ROOT, next)));
    else out.push(next);
  }
  return out;
}

/**
 * 判断文件是否属于生产源码扫描范围。
 *
 * @param file - 绝对文件路径。
 * @returns 生产源码文本文件返回 `true`。
 */
function isProductionSource(file: string): boolean {
  const rel = path.relative(ROOT, file);
  if (!TEXT_EXTENSIONS.has(path.extname(file))) return false;
  if (/\.(spec|test)\.[tj]sx?$/.test(rel)) return false;
  if (rel.includes(`${path.sep}test${path.sep}`)) return false;
  return true;
}

/**
 * 读取所有生产源码文本。
 *
 * @returns 相对路径与文本内容。
 */
function readProductionFiles(): Array<{ rel: string; text: string }> {
  return SCAN_ROOTS.flatMap(collectFiles)
    .filter(isProductionSource)
    .map((file) => ({
      rel: path.relative(ROOT, file),
      text: readFileSync(file, 'utf8'),
    }));
}

describe('technology-stack commercial guard', () => {
  it('生产代码和生成产物不出现上游品牌词或直接路径', () => {
    const upstreamBrand = ['w', 'appalyzer'].join('');
    const banned = [
      new RegExp(upstreamBrand, 'i'),
      new RegExp(`${upstreamBrand}/technologies`, 'i'),
      new RegExp(`${upstreamBrand}/categories(?:\\.json)?`, 'i'),
      new RegExp(`${upstreamBrand}/images`, 'i'),
      new RegExp(`${upstreamBrand}/icons`, 'i'),
    ];
    const offenders = readProductionFiles().filter(({ text }) => banned.some((pattern) => pattern.test(text)));
    expect(offenders.map((item) => item.rel)).toEqual([]);
  });

  it('生产代码不恢复运行时网页授权 API 或提示模块', () => {
    const banned = [
      /chrome\.permissions\.(?:request|remove|contains)/,
      /\.permissions\.(?:request|remove|contains)\(/,
      /host-permission-prompt/,
      /host-permission-runtime/,
      /requestHostPermissions/,
      /removeHostPermissions/,
      /containsHostPermissions/,
      /optional_host_permissions/,
    ];
    const offenders = readProductionFiles().filter(({ text }) => banned.some((pattern) => pattern.test(text)));
    expect(offenders.map((item) => item.rel)).toEqual([]);
  });

  it('技术项 logo provider 只加载本地 compact catalog 并拼固定版本静态图片来源', () => {
    const iconProvider = readFileSync(path.join(ROOT, 'src/lib/technology-stack/icons.ts'), 'utf8');
    const iconCatalogSchema = readFileSync(path.join(ROOT, 'src/lib/technology-stack/icon-catalog-schema.ts'), 'utf8');
    expect(iconProvider).not.toMatch(new RegExp(`${['w', 'appalyzer'].join('')}/`, 'i'));
    expect(iconProvider).not.toMatch(/@latest/i);
    expect(iconProvider).not.toMatch(/unpkg\.com/i);
    expect(iconProvider).not.toMatch(/simple-icons/i);
    expect(iconProvider).not.toMatch(/lucide-static/i);
    expect(iconProvider).not.toMatch(/cdn\.jsdelivr\.net\/gh\/glincker\/thesvg/i);
    expect(iconProvider).not.toMatch(/cdn\.jsdelivr\.net\/gh\/tandpfun\/skill-icons/i);
    expect(iconProvider).not.toMatch(/api\.iconify\.design/i);
    expect(existsSync(path.join(ROOT, 'src/lib/technology-stack/icon-catalog.generated.ts'))).toBe(false);
    expect(iconCatalogSchema).toContain('data/technology-icons/catalog.compact.json');
    expect(iconCatalogSchema).toContain('https://cdn.jsdelivr.net/');
    expect(iconCatalogSchema).toContain('gh/glincker/thesvg@v2.3.0/public/icons/');
    expect(iconCatalogSchema).toContain('npm/material-icon-theme@5.34.0/icons/');
    expect(iconCatalogSchema).not.toMatch(/olyq-tech-icons/i);
    expect(iconCatalogSchema).not.toMatch(/api\.iconify\.design/i);
  });

  it('技术项 logo 只允许手动生成和手动校验，不接入自动流程', () => {
    expect(existsSync(path.join(ROOT, 'public/data/technology-icons/icon-candidates.json'))).toBe(false);
    expect(existsSync(path.join(ROOT, 'scripts/generate-technology-icon-candidates.mjs'))).toBe(false);
    expect(existsSync(path.join(ROOT, 'scripts/technology-icon-candidate-verification.mjs'))).toBe(false);
    expect(existsSync(path.join(ROOT, 'scripts/generate-technology-icon-catalog.mjs'))).toBe(false);
    expect(existsSync(path.join(ROOT, 'scripts/verify-technology-icon-catalog.mjs'))).toBe(false);
    expect(existsSync(path.join(ROOT, 'src/lib/technology-stack/icon-catalog.generated.ts'))).toBe(false);
    expect(existsSync(path.join(ROOT, 'public/data/technology-icons/catalog.compact.json'))).toBe(true);
    expect(existsSync(path.join(ROOT, 'public/data/technology-icons/catalog.full.json'))).toBe(true);
    expect(existsSync(path.join(ROOT, 'public/data/technology-icons/coverage.json'))).toBe(true);
    expect(existsSync(path.join(ROOT, 'public/data/technology-icons/missing-icons.json'))).toBe(true);

    const compactCatalogText = readFileSync(path.join(ROOT, 'public/data/technology-icons/catalog.compact.json'), 'utf8');
    expect(compactCatalogText).not.toMatch(/https?:\/\//i);
    expect(compactCatalogText).not.toMatch(/api\.iconify\.design|icon-sets\.iconify\.design/i);

    const packageJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.['generate:technology-icons']).toBe('node ./scripts/generate-technology-icons.mjs');
    expect(packageJson.scripts?.['verify:technology-icons']).toBe('node ./scripts/verify-technology-icons.mjs');

    const forbiddenPattern = /generate:technology-icons|verify:technology-icons|generate-technology-icon-catalog|verify-technology-icon-catalog|generate-technology-icon-candidates|technology-icon-candidate-verification/;
    for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
      if (name === 'generate:technology-icons' || name === 'verify:technology-icons') continue;
      expect(command, `${name} must not run technology icon generation or SVG validation`).not.toMatch(forbiddenPattern);
    }

    const workspacePackage = JSON.parse(readFileSync(path.join(WORKSPACE_ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    for (const [name, command] of Object.entries(workspacePackage.scripts ?? {})) {
      expect(command, `workspace ${name} must not run technology icon generation or SVG validation`).not.toMatch(forbiddenPattern);
    }

    const workspaceInitScriptPath = path.join(WORKSPACE_ROOT, 'init.sh');
    if (existsSync(workspaceInitScriptPath)) {
      const initScript = readFileSync(workspaceInitScriptPath, 'utf8');
      expect(initScript).not.toMatch(forbiddenPattern);
    }

    const generationScript = readFileSync(path.join(ROOT, 'scripts/generate-technology-icons.mjs'), 'utf8');
    expect(generationScript).not.toMatch(/api\.iconify\.design|icon-sets\.iconify\.design/i);
  });

  it('生产代码不恢复单一生态批量目录规则批次', () => {
    const banned = [
      /wordpress-plugin-foundation/i,
      /wordpress-theme-foundation/i,
      /wp-content\/plugins\/\{slug\}/i,
      /wp-content\/themes\/\{slug\}/i,
    ];
    const offenders = readProductionFiles().filter(({ text }) => banned.some((pattern) => pattern.test(text)));
    expect(offenders.map((item) => item.rel)).toEqual([]);
  });
});
