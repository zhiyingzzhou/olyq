import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const extensionRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRootDir = path.resolve(extensionRootDir, "..", "..");
const outputDir = path.join(extensionRootDir, "artifacts");
const packageJsonPath = path.join(repoRootDir, "package.json");
const zipDate = new Date("1980-01-01T00:00:00.000Z");

const releaseDocEntries = [
  "docs/release",
  "apps/extension/store-assets/chrome-web-store",
  "PRIVACY.md",
  "README.md",
  "README.en.md",
];

function usage() {
  return [
    "Usage: node ./apps/extension/scripts/package-release-docs.mjs [--label <label>] [--version <version>]",
    "",
    "Creates apps/extension/artifacts/olyq-release-docs-<label>.zip.",
  ].join("\n");
}

function parseArgs(argv) {
  let label = process.env.OLYQ_PACKAGE_LABEL || "";
  let version = process.env.OLYQ_RELEASE_VERSION || "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg !== "--label" && arg !== "--version") {
      throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }

    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${arg}\n\n${usage()}`);
    if (arg === "--label") label = value;
    if (arg === "--version") version = value;
    index += 1;
  }

  return {
    label: label.trim(),
    version: version.trim(),
  };
}

function validateLabel(label) {
  if (!label) throw new Error("Release docs label is empty.");
  if (!/^[A-Za-z0-9._-]+$/.test(label)) {
    throw new Error(`Release docs label "${label}" may only contain letters, numbers, dots, underscores, and hyphens.`);
  }
  return label;
}

async function readPackageVersion() {
  const raw = await fs.readFile(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw);
  return String(pkg.version || "").trim();
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
    if (entry.name === ".DS_Store") continue;

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

async function collectReleaseDocEntry(entry) {
  const absolutePath = path.join(repoRootDir, entry);
  if (!await pathExists(absolutePath)) return [];

  const stat = await fs.stat(absolutePath);
  if (stat.isDirectory()) return collectFiles(absolutePath, repoRootDir);
  if (stat.isFile()) return [{ absolutePath, relativePath: entry }];
  return [];
}

async function readChecksumsSummary() {
  const checksumsPath = path.join(outputDir, "SHA256SUMS.txt");
  if (!await pathExists(checksumsPath)) {
    return [
      "# 校验和",
      "",
      "生成这份发布文档包时，尚未发现 SHA256SUMS.txt。",
      "正式 GitHub Release 以顶层 SHA256SUMS.txt 附件作为校验和真源。",
      "",
    ].join("\n");
  }

  const checksums = await fs.readFile(checksumsPath, "utf8");
  return [
    "# 校验和",
    "",
    "打包这份发布文档前，release workflow 已生成以下 SHA-256 校验和：",
    "",
    "```text",
    checksums.trim(),
    "```",
    "",
  ].join("\n");
}

function buildReleaseNotesSummary(label, version) {
  return [
    "# Release Notes 来源",
    "",
    `发布标签：${label}`,
    `发布版本：${version}`,
    "",
    "正式 Release workflow 会让 GitHub 根据 `.github/release.yml` 自动生成 GitHub Release 发布说明。",
    "这个文件只记录发布说明的来源契约，避免发布文档包重复维护变更日志。",
    "",
    "最终发布说明以 GitHub Release 页面为准。",
    "",
  ].join("\n");
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

const { label: rawLabel, version: rawVersion } = parseArgs(process.argv.slice(2));
const version = rawVersion || await readPackageVersion();
const label = validateLabel(rawLabel || `v${version}`);

const files = [];
for (const entry of releaseDocEntries) {
  files.push(...await collectReleaseDocEntry(entry));
}

if (files.length < 1) throw new Error("Release docs package did not collect any files.");

const zip = new JSZip();
const fileCount = await addFilesToZip(zip, files);
zip.file("release-notes-source.md", buildReleaseNotesSummary(label, version), { date: zipDate });
zip.file("checksums-summary.md", await readChecksumsSummary(), { date: zipDate });

await fs.mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, `olyq-release-docs-${label}.zip`);
const archive = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 9 },
  platform: "UNIX",
});

await fs.writeFile(outputPath, archive);
console.log(`Created ${path.relative(extensionRootDir, outputPath)} with ${fileCount + 2} files.`);
