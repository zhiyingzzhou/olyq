#!/usr/bin/env node
/**
 * 说明：浏览器扩展构建产物 invariant 校验。
 *
 * 职责：
 * - 校验生产 manifest 中的静态 content script 指向稳定 loader；
 * - 校验 loader、主 bundle 存在且主 bundle 登记在 WAR；
 * - 校验 content script 主 bundle 不再包含动态 import 懒加载切分；
 * - 防止 page-facing content script 重新生成 `"/assets/*.js"` 这类宿主站点 origin 请求。
 *
 * 边界：
 * - 本脚本只读取构建产物，不生成、不修补、不保留旧 hash 文件；
 * - 权限、host access 与运行时协议仍由源码和现有测试守住。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  CONTENT_SCRIPT_OUTPUT_FILES,
} from './extension-content-script-output.mjs';

const WEB_PAGE_MATCHES = ['http://*/*', 'https://*/*'];
const ROOT = process.cwd();
const REQUIRED_EXTENSION_PAGE_CSP_DIRECTIVES = [
  "script-src 'self' 'wasm-unsafe-eval'",
  "object-src 'self'",
];
const FORBIDDEN_CSP_TOKENS = [
  "'unsafe-eval'",
];
const DYNAMIC_EXECUTION_PATTERNS = [
  { name: 'eval()', pattern: /\beval\s*\((?!\?)/ },
  { name: 'new Function()', pattern: /\bnew\s+Function\s*\(/ },
  { name: 'Function("return this")', pattern: /\bFunction\(\s*(['"`])return this\1\s*\)\s*(?:\(\s*\))?/ },
  { name: 'Function("r", "regeneratorRuntime = r")', pattern: /\bFunction\(\s*(['"`])r\1\s*,\s*(['"`])regeneratorRuntime = r\2\s*\)\s*\(\s*runtime\s*\)/ },
  { name: 'Function(string)', pattern: /(?<![\w$.])Function\s*\(\s*(['"`])(?:\\.|(?!\1)[\s\S]){0,200}\1\s*(?:,|\))/ },
  { name: 'global dynamic execution', pattern: /\b(?:globalThis|window|self|global)\s*\.\s*(?:eval|Function)\s*\(/ },
  { name: 'Function alias execution', pattern: /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*Function\b[\s\S]{0,160}?\b(?:new\s+)?\1\s*\(/ },
];

function fail(message) {
  console.error(`[check-extension-build-output] ${message}`);
  process.exit(1);
}

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function sameStringArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

async function readText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    fail(`无法读取 ${path.relative(ROOT, filePath)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readJson(filePath) {
  const text = await readText(filePath);
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${path.relative(ROOT, filePath)} 不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function assertFileExists(buildDir, relativePath) {
  const filePath = path.join(buildDir, relativePath);
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) fail(`${relativePath} 不是文件`);
  } catch {
    fail(`缺少构建产物 ${relativePath}`);
  }
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(filePath));
    } else if (entry.isFile()) {
      files.push(filePath);
    }
  }
  return files;
}

async function assertNoDynamicExecution(buildDir) {
  const jsFiles = (await walkFiles(buildDir)).filter((filePath) => filePath.endsWith('.js'));
  for (const filePath of jsFiles) {
    const code = await readText(filePath);
    for (const { name, pattern } of DYNAMIC_EXECUTION_PATTERNS) {
      const match = pattern.exec(code);
      if (!match) continue;
      const relativePath = path.relative(ROOT, filePath);
      const start = Math.max(0, match.index - 80);
      const end = Math.min(code.length, match.index + 160);
      const frame = code.slice(start, end).replace(/\s+/g, ' ');
      fail(`${relativePath} 包含 MV3 CSP 禁止的动态执行入口 ${name}: ${frame}`);
    }
  }
}

function collectWarResources(manifest) {
  const war = Array.isArray(manifest.web_accessible_resources) ? manifest.web_accessible_resources : [];
  const resources = new Set();
  for (const entry of war) {
    if (!sameStringArray(entry?.matches, WEB_PAGE_MATCHES)) {
      fail(`WAR matches 漂移: ${JSON.stringify(entry?.matches ?? null)}`);
    }
    for (const resource of Array.isArray(entry?.resources) ? entry.resources : []) {
      const normalized = toPosixPath(resource);
      if (!normalized || normalized.startsWith('/')) {
        fail(`WAR resource 必须是 manifest 相对路径: ${JSON.stringify(resource)}`);
      }
      if (normalized.includes('*')) {
        fail(`WAR resource 不允许使用通配符扩大网页可访问面: ${normalized}`);
      }
      resources.add(normalized);
    }
  }
  return resources;
}

function readExtensionPageCsp(manifest) {
  const csp = manifest.content_security_policy;
  if (typeof csp === 'string') return csp;
  if (csp && typeof csp === 'object' && typeof csp.extension_pages === 'string') {
    return csp.extension_pages;
  }
  fail('manifest 缺少 content_security_policy.extension_pages');
}

function assertManifestMv3Invariant(manifest) {
  if (manifest.manifest_version !== 3) {
    fail(`manifest_version 必须固定为 3，实际为 ${JSON.stringify(manifest.manifest_version)}`);
  }

  const csp = readExtensionPageCsp(manifest);
  for (const token of FORBIDDEN_CSP_TOKENS) {
    if (csp.includes(token)) fail(`extension_pages CSP 不允许包含 ${token}: ${csp}`);
  }
  for (const directive of REQUIRED_EXTENSION_PAGE_CSP_DIRECTIVES) {
    if (!csp.includes(directive)) fail(`extension_pages CSP 缺少必要指令 ${directive}: ${csp}`);
  }

  const serviceWorker = manifest.background?.service_worker;
  if (typeof serviceWorker !== 'string' || serviceWorker.trim().length === 0) {
    fail('manifest.background.service_worker 必须存在');
  }
  if (manifest.background?.type !== 'module') {
    fail(`MV3 background.type 必须固定为 module，实际为 ${JSON.stringify(manifest.background?.type ?? null)}`);
  }
}

function findStaticWebContentScript(manifest) {
  const scripts = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
  return scripts.find((script) => sameStringArray(script?.matches, WEB_PAGE_MATCHES));
}

function collectDynamicImportsFromMain(mainCode) {
  const imports = [];
  const dynamicImportPattern = /import\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of mainCode.matchAll(dynamicImportPattern)) {
    imports.push(String(match[1]));
  }
  return imports;
}

async function main() {
  const buildDirArg = process.argv[2];
  if (!buildDirArg) fail('缺少构建目录参数，例如：node ./scripts/check-extension-build-output.mjs dist');
  const buildDir = path.resolve(ROOT, buildDirArg);
  const manifest = await readJson(path.join(buildDir, 'manifest.json'));
  assertManifestMv3Invariant(manifest);
  await assertNoDynamicExecution(buildDir);
  await assertFileExists(buildDir, manifest.background.service_worker);

  const contentScript = findStaticWebContentScript(manifest);
  if (!contentScript) fail('manifest 缺少 http/https 静态 content script');
  if (!sameStringArray(contentScript.js, [CONTENT_SCRIPT_OUTPUT_FILES.loader])) {
    fail(`content script js 必须固定为 ${CONTENT_SCRIPT_OUTPUT_FILES.loader}，实际为 ${JSON.stringify(contentScript.js ?? null)}`);
  }
  if (contentScript.run_at !== 'document_idle') {
    fail(`content script run_at 必须固定为 document_idle，实际为 ${JSON.stringify(contentScript.run_at ?? null)}`);
  }

  const warResources = collectWarResources(manifest);
  await assertFileExists(buildDir, CONTENT_SCRIPT_OUTPUT_FILES.loader);
  await assertFileExists(buildDir, CONTENT_SCRIPT_OUTPUT_FILES.main);

  const loaderCode = await readText(path.join(buildDir, CONTENT_SCRIPT_OUTPUT_FILES.loader));
  if (!loaderCode.includes(`chrome.runtime.getURL("${CONTENT_SCRIPT_OUTPUT_FILES.main}")`)) {
    fail(`content script loader 未指向 ${CONTENT_SCRIPT_OUTPUT_FILES.main}`);
  }
  if (/chrome\.runtime\.getURL\(["']\/assets\//.test(loaderCode)) {
    fail('content script loader 仍包含 /assets 根相对资源请求');
  }

  const mainCode = await readText(path.join(buildDir, CONTENT_SCRIPT_OUTPUT_FILES.main));
  if (/import\(\s*["']\/assets\//.test(mainCode) || /new URL\(\s*["']\/assets\//.test(mainCode)) {
    fail('content script main bundle 仍包含 /assets 根相对资源请求');
  }

  const dynamicImports = collectDynamicImportsFromMain(mainCode);
  if (dynamicImports.length > 0) {
    fail(`content script main bundle 不允许动态 import: ${dynamicImports.join(', ')}`);
  }

  if (!warResources.has(CONTENT_SCRIPT_OUTPUT_FILES.main)) fail(`WAR 缺少 content script 资源 ${CONTENT_SCRIPT_OUTPUT_FILES.main}`);
  if (!warResources.has('technology-stack-bridge.js')) {
    fail('WAR 缺少技术栈 page-world bridge: technology-stack-bridge.js');
  }

  console.log(`Extension 构建产物校验通过：${path.relative(ROOT, buildDir) || '.'}`);
}

await main();
