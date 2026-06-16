import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 读取仓库声明的 Node.js 精确版本。
 *
 * @param fileName - 版本声明文件名。
 * @returns 去掉可选 `v` 前缀后的版本号。
 */
function readDeclaredVersion(fileName) {
  const filePath = path.join(repoRoot, fileName);
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  return raw.replace(/^v/i, '');
}

const requiredVersion = readDeclaredVersion('.node-version');
const nvmrcVersion = readDeclaredVersion('.nvmrc');
const actual = process.versions.node;

if (requiredVersion !== nvmrcVersion) {
  console.error(
    `Olyq Node.js version declarations drifted: .node-version=${requiredVersion}, .nvmrc=${nvmrcVersion}.`,
  );
  process.exit(1);
}

if (actual !== requiredVersion) {
  console.error(
    `Olyq verification requires Node.js ${requiredVersion} to match GitHub Actions. Current Node.js: ${actual}.`,
  );
  console.error('Switch to the exact version declared in .node-version / .nvmrc before running pnpm commands.');
  process.exit(1);
}

console.log(`Node.js ${actual} verified.`);
