import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(rootDir, 'assets/product');
const publicDir = path.join(rootDir, 'apps/www/public/product');
const iconSourceDir = path.join(rootDir, 'apps/extension/public/icons');
const iconPublicDir = path.join(rootDir, 'apps/www/public/icons');

function listPngFiles(dir) {
  return fs.readdirSync(dir).filter((name) => name.endsWith('.png')).sort();
}

if (!fs.existsSync(sourceDir)) {
  throw new Error(`Product asset source directory does not exist: ${sourceDir}`);
}

const sourceFiles = listPngFiles(sourceDir);
if (sourceFiles.length === 0) {
  throw new Error(`Product asset source directory has no PNG files: ${sourceDir}`);
}

fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });

for (const fileName of sourceFiles) {
  fs.copyFileSync(path.join(sourceDir, fileName), path.join(publicDir, fileName));
}

if (!fs.existsSync(iconSourceDir)) {
  throw new Error(`Olyq icon source directory does not exist: ${iconSourceDir}`);
}

const iconFiles = listPngFiles(iconSourceDir).filter((name) => name.startsWith('olyq-'));

if (iconFiles.length === 0) {
  throw new Error(`Olyq icon source directory has no icon PNG files: ${iconSourceDir}`);
}

fs.rmSync(iconPublicDir, { recursive: true, force: true });
fs.mkdirSync(iconPublicDir, { recursive: true });

for (const fileName of iconFiles) {
  fs.copyFileSync(path.join(iconSourceDir, fileName), path.join(iconPublicDir, fileName));
}

console.log(`Synced ${sourceFiles.length} product asset PNGs and ${iconFiles.length} Olyq icons to apps/www/public.`);
