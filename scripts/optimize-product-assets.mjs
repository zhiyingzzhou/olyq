import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(rootDir, 'assets/product');
const publicDir = path.join(rootDir, 'apps/www/public/product');
const tinifyShrinkUrl = 'https://api.tinify.com/shrink';
const supportedExtensions = new Set(['.png']);

function parseArgs(argv) {
  const options = {
    concurrency: 2,
    dryRun: false,
    force: false,
    include: [],
    limit: Number.POSITIVE_INFINITY,
    sync: true,
  };

  for (const arg of argv) {
    if (arg === '--') {
      continue;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--no-sync') {
      options.sync = false;
    } else if (arg.startsWith('--concurrency=')) {
      options.concurrency = parsePositiveInteger(arg, '--concurrency');
    } else if (arg.startsWith('--limit=')) {
      options.limit = parsePositiveInteger(arg, '--limit');
    } else if (arg.startsWith('--include=')) {
      options.include.push(...arg.slice('--include='.length).split(',').map((value) => value.trim()).filter(Boolean));
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.concurrency > 6) {
    throw new Error('--concurrency must be 6 or lower; keep TinyPNG API usage gentle and predictable.');
  }

  return options;
}

function parsePositiveInteger(arg, optionName) {
  const [, rawValue = ''] = arg.split('=');
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return value;
}

function listProductImages({ include, limit }) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Product asset source directory does not exist: ${sourceDir}`);
  }

  const files = fs.readdirSync(sourceDir)
    .filter((fileName) => supportedExtensions.has(path.extname(fileName).toLowerCase()))
    .filter((fileName) => include.length === 0 || include.some((pattern) => fileName.includes(pattern)))
    .sort()
    .slice(0, limit);

  if (files.length === 0) {
    throw new Error('No product PNG files matched the current filters.');
  }

  return files.map((fileName) => ({
    fileName,
    filePath: path.join(sourceDir, fileName),
  }));
}

function buildAuthHeader(apiKey) {
  return `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`;
}

async function readTinifyError(response) {
  const text = await response.text();
  try {
    const body = JSON.parse(text);
    return `${body.error ?? response.statusText}: ${body.message ?? text}`;
  } catch {
    return text || response.statusText;
  }
}

async function optimizeOneImage({ fileName, filePath }, { authHeader, force, onStage }) {
  onStage('reading');
  const before = fs.statSync(filePath).size;
  const input = fs.readFileSync(filePath);

  // Tinify 官方 HTTP API 是显式的两段式事务：
  // 1. 把原图字节 POST 到 /shrink。
  // 2. 再从响应 Location header 指向的地址下载压缩结果。
  // 这里直接保留协议细节，避免额外 SDK 依赖，也方便后续审计额度 header、HTTP 失败和重试策略。
  onStage('uploading');
  const shrinkResponse = await fetch(tinifyShrinkUrl, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'image/png',
    },
    body: input,
  });

  if (!shrinkResponse.ok) {
    throw new Error(`TinyPNG shrink failed for ${fileName} (${shrinkResponse.status}): ${await readTinifyError(shrinkResponse)}`);
  }

  const location = shrinkResponse.headers.get('location');
  if (!location) {
    throw new Error(`TinyPNG shrink response did not include a Location header for ${fileName}.`);
  }

  onStage('downloading');
  const outputResponse = await fetch(location, {
    headers: { Authorization: authHeader },
  });

  if (!outputResponse.ok) {
    throw new Error(`TinyPNG download failed for ${fileName} (${outputResponse.status}): ${await readTinifyError(outputResponse)}`);
  }

  const output = Buffer.from(await outputResponse.arrayBuffer());
  const after = output.byteLength;
  const compressionCount = shrinkResponse.headers.get('compression-count') ?? outputResponse.headers.get('compression-count') ?? 'unknown';

  if (!force && after >= before) {
    onStage('skipping');
    return {
      after,
      before,
      compressionCount,
      fileName,
      skipped: true,
    };
  }

  const tempPath = `${filePath}.tinify-${process.pid}.tmp`;
  try {
    // 先写入同目录临时文件，再用 rename 原子替换源文件。
    // 这样即使进程中断或文件系统写入失败，也不会用半截压缩图覆盖原图。
    onStage('writing');
    fs.writeFileSync(tempPath, output);
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }

  return {
    after,
    before,
    compressionCount,
    fileName,
    skipped: false,
  };
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = [];
  let cursor = 0;
  let firstError = null;

  async function runWorker() {
    while (!firstError && cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        firstError ??= error;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  if (firstError) {
    throw firstError;
  }
  return results;
}

function syncWebsiteCopy() {
  fs.rmSync(publicDir, { recursive: true, force: true });
  fs.mkdirSync(publicDir, { recursive: true });

  for (const fileName of fs.readdirSync(sourceDir).filter((name) => name.endsWith('.png')).sort()) {
    fs.copyFileSync(path.join(sourceDir, fileName), path.join(publicDir, fileName));
  }
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function createProgressReporter(total) {
  const stream = process.stderr;
  const active = new Map();
  const state = {
    changedCount: 0,
    completedCount: 0,
    failedCount: 0,
    latestCompressionCount: 'unknown',
    savedTotal: 0,
    scannedTotal: 0,
    skippedCount: 0,
  };

  // 交互式终端可以安全地重绘单行进度；CI 日志和重定向输出不能处理控制码，
  // 所以非 TTY 场景改用稳定的一行一事件日志，方便排查和 grep。
  const interactive = Boolean(stream.isTTY && !process.env.CI);
  let renderedLine = false;

  function clearRenderedLine() {
    if (!interactive || !renderedLine) {
      return;
    }
    readline.clearLine(stream, 0);
    readline.cursorTo(stream, 0);
    renderedLine = false;
  }

  function writeEventLine(message) {
    clearRenderedLine();
    stream.write(`${message}\n`);
  }

  function render() {
    if (!interactive) {
      return;
    }

    const activeText = [...active.entries()]
      .map(([fileName, stage]) => `${fileName}:${stage}`)
      .join(', ') || 'idle';
    const status = [
      `TinyPNG ${state.completedCount}/${total}`,
      `optimized ${state.changedCount}`,
      `skipped ${state.skippedCount}`,
      `failed ${state.failedCount}`,
      `saved ${formatBytes(state.savedTotal)}`,
      `count ${state.latestCompressionCount}`,
      activeText,
    ].join(' | ');
    const width = stream.columns && stream.columns > 20 ? stream.columns - 1 : 120;

    readline.clearLine(stream, 0);
    readline.cursorTo(stream, 0);
    stream.write(status.length > width ? `${status.slice(0, Math.max(0, width - 1))}…` : status);
    renderedLine = true;
  }

  return {
    abort() {
      clearRenderedLine();
    },
    complete(result) {
      active.delete(result.fileName);
      state.completedCount += 1;
      state.latestCompressionCount = result.compressionCount;
      state.scannedTotal += result.before;

      if (result.skipped) {
        state.skippedCount += 1;
        writeEventLine(`skipped ${result.fileName}: Tinify output was not smaller (${formatBytes(result.before)} -> ${formatBytes(result.after)})`);
      } else {
        const saved = result.before - result.after;
        state.changedCount += 1;
        state.savedTotal += saved;
        writeEventLine(`optimized ${result.fileName}: ${formatBytes(result.before)} -> ${formatBytes(result.after)} (${formatBytes(saved)} saved)`);
      }

      render();
    },
    fail(fileName, error) {
      active.delete(fileName);
      state.completedCount += 1;
      state.failedCount += 1;
      writeEventLine(`failed ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
      render();
    },
    finish({ synced }) {
      clearRenderedLine();
      if (synced) {
        stream.write('Synced optimized product asset PNGs to apps/www/public/product.\n');
      }
      stream.write(`TinyPNG complete: ${state.changedCount} optimized, ${state.skippedCount} skipped, ${state.failedCount} failed, ${formatBytes(state.savedTotal)} actually saved from ${formatBytes(state.scannedTotal)} scanned, compression count ${state.latestCompressionCount}.\n`);
    },
    start(fileName) {
      active.set(fileName, 'queued');
      if (!interactive) {
        writeEventLine(`start ${fileName}`);
      }
      render();
    },
    stage(fileName, stage) {
      active.set(fileName, stage);
      render();
    },
  };
}

function printUsage() {
  console.log(`Usage:
  TINIFY_API_KEY=... pnpm optimize:product-assets
  pnpm optimize:product-assets -- --dry-run

Options:
  --dry-run              List matching files without calling the TinyPNG API.
  --include=pattern     Only optimize files whose name contains the pattern. Repeat or comma-separate.
  --limit=N             Optimize at most N files.
  --concurrency=N       Parallel requests, default 2, max 6.
  --force               Write Tinify output even when it is not smaller.
  --no-sync             Do not refresh apps/www/public/product after optimization.
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const images = listProductImages(options);

  if (options.dryRun) {
    console.log(`TinyPNG dry run: ${images.length} product PNG(s) matched.`);
    for (const image of images) {
      console.log(`- ${image.fileName} (${formatBytes(fs.statSync(image.filePath).size)})`);
    }
    return;
  }

  const apiKey = process.env.TINIFY_API_KEY;
  if (!apiKey) {
    throw new Error('TINIFY_API_KEY is required. Run with --dry-run to preview files without using the API.');
  }

  const authHeader = buildAuthHeader(apiKey);
  const progress = createProgressReporter(images.length);

  try {
    await runWithConcurrency(images, options.concurrency, async (image) => {
      progress.start(image.fileName);
      try {
        const result = await optimizeOneImage(image, {
          authHeader,
          force: options.force,
          onStage: (stage) => progress.stage(image.fileName, stage),
        });
        progress.complete(result);
        return result;
      } catch (error) {
        progress.fail(image.fileName, error);
        throw error;
      }
    });
  } catch (error) {
    progress.abort();
    throw error;
  }

  if (options.sync) {
    syncWebsiteCopy();
  }

  progress.finish({ synced: options.sync });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  printUsage();
  process.exitCode = 1;
});
