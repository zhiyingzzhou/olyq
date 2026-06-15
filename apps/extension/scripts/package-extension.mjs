import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const extensionRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRootDir = path.resolve(extensionRootDir, "..", "..");
const packageJsonPath = path.join(extensionRootDir, "package.json");
const outputDir = path.join(extensionRootDir, "artifacts");
const zipDate = new Date("1980-01-01T00:00:00.000Z");

const addonTargets = {
  chromium: {
    distDir: "dist",
    filePrefix: "olyq-chrome-web-store",
  },
  firefox: {
    distDir: "dist-firefox",
    filePrefix: "olyq-firefox-amo-addon",
  },
};

const sourceRootEntries = [
  ".github/release.yml",
  "CONTRIBUTING.md",
  "CONTRIBUTING.en.md",
  "LICENSE",
  "PRIVACY.md",
  "README.md",
  "README.en.md",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
];

const sourceExtensionEntries = [
  "apps/extension/build-config.mjs",
  "apps/extension/crx-manifest-helpers.mjs",
  "apps/extension/eslint.config.js",
  "apps/extension/manifest.config.mjs",
  "apps/extension/package.json",
  "apps/extension/postcss.config.js",
  "apps/extension/public",
  "apps/extension/scripts",
  "apps/extension/src",
  "apps/extension/tailwind.config.mjs",
  "apps/extension/tsconfig.app.json",
  "apps/extension/tsconfig.base.json",
  "apps/extension/tsconfig.e2e.json",
  "apps/extension/tsconfig.json",
  "apps/extension/tsconfig.node.json",
  "apps/extension/vite.config.mjs",
  "apps/extension/vitest.config.ts",
];

const sourceExcludeSegments = new Set([
  ".cache",
  ".git",
  ".idea",
  ".vscode",
  "artifacts",
  "dist",
  "dist-e2e",
  "dist-firefox",
  "dist-firefox-e2e",
  "node_modules",
  "test-results",
]);

const sourceExcludeFileNames = new Set([
  ".DS_Store",
  "pnpm-debug.log",
]);

function usage() {
  return [
    "Usage: node ./scripts/package-extension.mjs <chromium|firefox|firefox-source|all> [--label <label>]",
    "",
    "The script packages existing production build outputs. Run pnpm build:chromium",
    "or pnpm build:firefox before packaging the matching addon target.",
    "",
    "Outputs are named by submission intent:",
    "- chromium       -> olyq-chrome-web-store-<label>.zip",
    "- firefox        -> olyq-firefox-amo-addon-<label>.zip",
    "- firefox-source -> olyq-firefox-amo-source-<label>.zip",
    "- all            -> all three artifacts above",
  ].join("\n");
}

function parseArgs(argv) {
  const target = argv[0] || "all";
  let label = process.env.OLYQ_PACKAGE_LABEL || "";

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg !== "--label" && arg !== "--version") {
      throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }

    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${arg}\n\n${usage()}`);
    label = value;
    index += 1;
  }

  if (!["all", "chromium", "firefox", "firefox-source"].includes(target)) {
    throw new Error(`Unknown target: ${target}\n\n${usage()}`);
  }

  return { target, label: label.trim() };
}

async function readPackageVersion() {
  const raw = await fs.readFile(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw);
  return String(pkg.version || "").trim();
}

function validateLabel(label) {
  if (!label) throw new Error("Package label is empty.");
  if (!/^[A-Za-z0-9._-]+$/.test(label)) {
    throw new Error(`Package label "${label}" may only contain letters, numbers, dots, underscores, and hyphens.`);
  }
  return label;
}

function shouldSkipSourcePath(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  const basename = path.basename(normalized);
  if (sourceExcludeFileNames.has(basename)) return true;
  return normalized.split("/").some((segment) => sourceExcludeSegments.has(segment));
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function collectFiles(dir, baseDir = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const sortedEntries = entries.sort((left, right) => left.name.localeCompare(right.name));
  const files = [];

  for (const entry of sortedEntries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath, baseDir));
      continue;
    }

    if (entry.isFile()) {
      files.push({
        absolutePath,
        relativePath: path.relative(baseDir, absolutePath).split(path.sep).join("/"),
      });
    }
  }

  return files;
}

async function collectSourceEntry(entry) {
  const absolutePath = path.join(repoRootDir, entry);
  if (!await pathExists(absolutePath)) return [];

  const stat = await fs.stat(absolutePath);
  if (stat.isDirectory()) {
    const files = await collectFiles(absolutePath, repoRootDir);
    return files.filter((file) => !shouldSkipSourcePath(file.relativePath));
  }
  if (stat.isFile() && !shouldSkipSourcePath(entry)) {
    return [{ absolutePath, relativePath: entry }];
  }
  return [];
}

async function addFilesToZip(zip, files) {
  const sortedFiles = files
    .filter((file, index, all) => all.findIndex((candidate) => candidate.relativePath === file.relativePath) === index)
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  for (const file of sortedFiles) {
    zip.file(file.relativePath, await fs.readFile(file.absolutePath), { date: zipDate });
  }

  return sortedFiles.length;
}

async function writeZip(zip, fileName) {
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, fileName);
  const archive = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "UNIX",
  });

  await fs.writeFile(outputPath, archive);
  return outputPath;
}

async function packageAddonTarget(targetName, label) {
  const target = addonTargets[targetName];
  const distDir = path.join(extensionRootDir, target.distDir);
  const manifestPath = path.join(distDir, "manifest.json");

  if (!await pathExists(manifestPath)) {
    throw new Error(`Missing ${target.distDir}/manifest.json. Run pnpm build:${targetName} before packaging.`);
  }

  const files = await collectFiles(distDir);
  if (files.length < 1) throw new Error(`${target.distDir} does not contain any files to package.`);

  const zip = new JSZip();
  const fileCount = await addFilesToZip(zip, files);
  const outputPath = await writeZip(zip, `${target.filePrefix}-${label}.zip`);
  console.log(`Created ${path.relative(extensionRootDir, outputPath)} with ${fileCount} files.`);
}

function buildAmoSourceReadme(label) {
  return [
    "# Olyq Firefox AMO Source Package",
    "",
    `Release label: ${label}`,
    "",
    "This archive contains the source material needed by Mozilla reviewers to",
    "rebuild the Firefox extension package submitted as:",
    "",
    `- olyq-firefox-amo-addon-${label}.zip`,
    "",
    "## Rebuild Steps",
    "",
    "```bash",
    "corepack enable",
    "pnpm install --frozen-lockfile",
    "pnpm --filter @olyq/extension build:firefox",
    "pnpm --filter @olyq/extension package:firefox",
    "```",
    "",
    "The rebuilt addon package is written to:",
    "",
    "```text",
    `apps/extension/artifacts/olyq-firefox-amo-addon-${label}.zip`,
    "```",
    "",
    "## Source Scope",
    "",
    "This source package intentionally excludes generated outputs and local",
    "machine state, including `node_modules`, `dist`, `dist-firefox`,",
    "`dist-e2e`, `dist-firefox-e2e`, `artifacts`, `test-results`, and caches.",
    "",
  ].join("\n");
}

async function packageFirefoxSource(label) {
  const files = [];
  for (const entry of [...sourceRootEntries, ...sourceExtensionEntries]) {
    files.push(...await collectSourceEntry(entry));
  }

  if (files.length < 1) throw new Error("Firefox source package did not collect any files.");

  const zip = new JSZip();
  const fileCount = await addFilesToZip(zip, files);
  zip.file("AMO_SOURCE_REBUILD.md", buildAmoSourceReadme(label), { date: zipDate });
  const outputPath = await writeZip(zip, `olyq-firefox-amo-source-${label}.zip`);
  console.log(`Created ${path.relative(extensionRootDir, outputPath)} with ${fileCount + 1} files.`);
}

const { target, label: rawLabel } = parseArgs(process.argv.slice(2));
const label = validateLabel(rawLabel || await readPackageVersion());

if (target === "all" || target === "chromium") {
  await packageAddonTarget("chromium", label);
}

if (target === "all" || target === "firefox") {
  await packageAddonTarget("firefox", label);
}

if (target === "all" || target === "firefox-source") {
  await packageFirefoxSource(label);
}
