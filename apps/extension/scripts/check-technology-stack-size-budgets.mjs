#!/usr/bin/env node
/**
 * 检查 technology-stack 规则收敛后的构建体积预算。
 *
 * 说明：
 * - 本地中性 fingerprint JSON 资产随扩展打包，不进入 Service Worker 主 chunk；
 * - 技术项图标由 UI 从本地小型 compact catalog 展开固定版本 jsDelivr URL，不允许恢复大候选 JSON 资产；
 * - 构建后检查是否误把旧规则资产带回 dist，并继续守住 Service Worker 与 zip 体积；
 * - 预算只约束技术栈相关风险，不替代通用 bundle 分析。
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');

const DIST_DIR = path.resolve(PACKAGE_ROOT, process.argv[2] || 'dist');

const BUDGETS = {
  serviceWorkerChunkBytes: Math.floor(1.7 * 1024 * 1024),
  extensionZipBytes: 5 * 1024 * 1024,
  iconCompactCatalogBytes: 128 * 1024,
};

const FINGERPRINT_RULE_ASSET_RE = /^data\/technology-fingerprints\/fingerprint-rules\.json$/;
const ICON_CANDIDATE_ASSET_RE = /^data\/technology-icons\/icon-candidates\.json$/;
const ICON_COMPACT_CATALOG_ASSET_RE = /^data\/technology-icons\/catalog\.compact\.json$/;
const UPSTREAM_BRAND_RE = new RegExp(['w', 'appalyzer'].join(''), 'i');
const REFERRAL_PARAM_RE = /\butm_(?:source|medium|campaign|term|content)\b/i;
const RUNTIME_TEXT_FILE_RE = /\.(?:html|js|json|css|txt|md)$/i;

async function listFiles(directory, relativeDirectory = '') {
  const absoluteDirectory = path.join(directory, relativeDirectory);
  const entries = await fsp.readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = relativeDirectory ? path.posix.join(relativeDirectory, entry.name) : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(directory, relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

async function buildZipSize(directory) {
  const zip = new JSZip();
  const files = await listFiles(directory);
  for (const relativePath of files) {
    zip.file(relativePath, await fsp.readFile(path.join(directory, relativePath)));
  }
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  return buffer.length;
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)}KiB`;
}

async function main() {
  const failures = [];
  const files = await listFiles(DIST_DIR);
  const forbiddenRuleAssets = files.filter((file) => /technology-stack-(?:npm-cdn|curated-domains).*\.(?:json|js)$/.test(file));
  for (const relativePath of forbiddenRuleAssets) {
    failures.push(`forbidden generated technology-stack rule asset in dist: ${relativePath}`);
  }
  const runtimeBrandOffenders = [];
  for (const relativePath of files.filter((file) => RUNTIME_TEXT_FILE_RE.test(file))) {
    const text = await fsp.readFile(path.join(DIST_DIR, relativePath), 'utf8');
    if (UPSTREAM_BRAND_RE.test(text)) runtimeBrandOffenders.push(relativePath);
  }
  for (const relativePath of runtimeBrandOffenders) {
    failures.push(`runtime dist file contains banned upstream brand token: ${relativePath}`);
  }
  const fingerprintRuleAssets = files.filter((file) => FINGERPRINT_RULE_ASSET_RE.test(file));
  if (fingerprintRuleAssets.length !== 1) {
    failures.push(`expected exactly one neutral fingerprint rule asset, got ${fingerprintRuleAssets.length}`);
  }
  const iconCandidateAssets = files.filter((file) => ICON_CANDIDATE_ASSET_RE.test(file));
  for (const relativePath of iconCandidateAssets) {
    failures.push(`forbidden technology icon candidate table in dist: ${relativePath}`);
  }
  const iconCompactCatalogAssets = files.filter((file) => ICON_COMPACT_CATALOG_ASSET_RE.test(file));
  if (iconCompactCatalogAssets.length !== 1) {
    failures.push(`expected exactly one technology icon compact catalog asset, got ${iconCompactCatalogAssets.length}`);
  }
  for (const relativePath of iconCompactCatalogAssets) {
    const stat = await fsp.stat(path.join(DIST_DIR, relativePath));
    if (stat.size > BUDGETS.iconCompactCatalogBytes) {
      failures.push(`${relativePath} ${formatBytes(stat.size)} > ${formatBytes(BUDGETS.iconCompactCatalogBytes)}`);
    }
  }
  for (const relativePath of fingerprintRuleAssets) {
    const text = await fsp.readFile(path.join(DIST_DIR, relativePath), 'utf8');
    if (UPSTREAM_BRAND_RE.test(text)) {
      failures.push(`neutral fingerprint rule asset contains banned upstream brand token: ${relativePath}`);
    }
    if (REFERRAL_PARAM_RE.test(text)) {
      failures.push(`neutral fingerprint rule asset contains referral/marketing parameter: ${relativePath}`);
    }
  }

  const serviceWorkerChunks = files.filter((file) => /^assets\/service-worker.*\.js$/.test(file));
  if (serviceWorkerChunks.length !== 1) {
    failures.push(`expected exactly one service-worker chunk, got ${serviceWorkerChunks.length}`);
  }
  for (const relativePath of serviceWorkerChunks) {
    const stat = await fsp.stat(path.join(DIST_DIR, relativePath));
    if (stat.size > BUDGETS.serviceWorkerChunkBytes) {
      failures.push(`${relativePath} ${formatBytes(stat.size)} > ${formatBytes(BUDGETS.serviceWorkerChunkBytes)}`);
    }
    const text = await fsp.readFile(path.join(DIST_DIR, relativePath), 'utf8');
    if (
      text.includes('cloudflare-browser-insights')
      || text.includes('TECHNOLOGY_ICON_CATALOG_BY_KEY')
      || text.includes('data/technology-icons/catalog.compact.json')
      || text.includes('cdn.jsdelivr.net/gh/zhiyingzzhou/olyq-tech-icons')
      || text.includes('olyq-tech-icons')
      || text.includes('gh/glincker/thesvg@v2.3.0/public/icons/')
      || text.includes('npm/simple-icons@16.18.1/icons/')
      || text.includes('npm/devicon@2.17.0/icons/')
      || text.includes('npm/material-icon-theme@5.34.0/icons/')
      || text.includes('gh/tandpfun/skill-icons@7f7e691e71aec64e8354bf697835e009d1ad80f8/icons/')
      || text.includes('npm/@tabler/icons@3.44.0/icons/outline/')
      || text.includes('public/icons/cloudflare/default.svg')
      || text.includes('api.iconify.design')
      || text.includes('icon-sets.iconify.design')
    ) {
      failures.push(`${relativePath} contains bundled technology icon catalog or dynamic icon URL resolver`);
    }
  }

  const zipBytes = await buildZipSize(DIST_DIR);
  if (zipBytes > BUDGETS.extensionZipBytes) {
    failures.push(`extension zip ${formatBytes(zipBytes)} > ${formatBytes(BUDGETS.extensionZipBytes)}`);
  }

  process.stdout.write([
    `Technology stack size budgets for ${path.relative(PACKAGE_ROOT, DIST_DIR) || DIST_DIR}:`,
    `- forbidden generated rule assets: ${forbiddenRuleAssets.length}`,
    `- runtime brand offenders: ${runtimeBrandOffenders.length}`,
    `- neutral fingerprint rule assets: ${fingerprintRuleAssets.join(', ') || '(missing)'}`,
    `- forbidden technology icon candidate assets: ${iconCandidateAssets.length}`,
    `- technology icon compact catalog assets: ${iconCompactCatalogAssets.join(', ') || '(missing)'}`,
    `- service worker: ${serviceWorkerChunks.join(', ') || '(missing)'}`,
    `- extension zip: ${formatBytes(zipBytes)}`,
  ].join('\n') + '\n');

  if (failures.length > 0) {
    for (const failure of failures) process.stderr.write(`FAIL ${failure}\n`);
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
