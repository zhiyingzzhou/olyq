#!/usr/bin/env node
/**
 * 说明：依赖升级后的一键回归烟测入口。
 *
 * 职责：
 * - 串联依赖漂移、安全审计、lint、类型、单测、双浏览器构建与 mock E2E；
 * - 将命令输出中的 warning / pageerror / console error 类信号升级为失败；
 * - 为依赖升级收尾提供稳定、可复跑的本地命令。
 *
 * 边界：
 * - 本脚本只编排现有验证命令，不修改源码、不写入状态；
 * - provider live 凭证验证仍通过显式 `pnpm e2e:live` 触发，避免默认回归依赖外部密钥。
 */
import { spawn } from 'node:child_process';
import process from 'node:process';

const STRICT_OUTPUT_RULES = [
  {
    label: 'warning line prefix',
    pattern: /(?:^|\n)\s*(?:WARN(?:ING)?|warning)(?:[\s:.\u2009-]|$)/i,
  },
  {
    label: 'diagnostic Warning:',
    pattern: /\bWarning:\s/i,
  },
  {
    label: 'warning count summary',
    pattern: /\b\d+\s+warnings?\s+(?:generated|found)\b/i,
  },
  {
    label: 'deprecated subdependencies',
    pattern: /\bdeprecated subdependencies\b/i,
  },
  {
    label: 'pageerror',
    pattern: /\bpageerror\b/i,
  },
  {
    label: 'console error/warn',
    pattern: /\bconsole\.(?:error|warn)\b/i,
  },
  {
    label: 'React warning',
    pattern: /\bReact warning\b/i,
  },
  {
    label: 'blocked aria-hidden',
    pattern: /\bBlocked aria-hidden\b/i,
  },
  {
    label: 'unhandled rejection',
    pattern: /\bUnhandledPromiseRejection\b/i,
  },
  {
    label: 'uncaught promise',
    pattern: /\bUncaught \(in promise\)\b/i,
  },
];

const COMMANDS = [
  {
    label: '依赖漂移',
    command: 'pnpm',
    args: ['outdated', '--format', 'json'],
    parseJson: true,
    allowExitCodes: [0, 1],
    validate: (json) => Object.keys(json).length === 0
      ? null
      : `仍有过期依赖: ${JSON.stringify(json, null, 2)}`,
  },
  {
    label: '安全审计',
    command: 'pnpm',
    args: ['audit', '--json'],
    parseJson: true,
    validate: (json) => {
      const vulnerabilities = json?.metadata?.vulnerabilities ?? {};
      const failingCount = Number(vulnerabilities.moderate ?? 0)
        + Number(vulnerabilities.high ?? 0)
        + Number(vulnerabilities.critical ?? 0);
      return failingCount === 0
        ? null
        : `audit 仍有 moderate/high/critical: ${JSON.stringify(vulnerabilities)}`;
    },
  },
  { label: 'Lint', command: 'pnpm', args: ['lint'] },
  { label: 'TypeScript', command: 'pnpm', args: ['typecheck'] },
  { label: 'Vitest', command: 'pnpm', args: ['test'] },
  { label: 'Chromium 构建', command: 'pnpm', args: ['build:chromium'] },
  { label: 'Firefox 构建', command: 'pnpm', args: ['build:firefox'] },
  { label: 'Mock E2E', command: 'pnpm', args: ['e2e:mock'] },
];

/** 输出失败并退出当前 smoke。 */
function fail(message) {
  console.error(`[dependency-upgrade-smoke] ${message}`);
  process.exit(1);
}

/**
 * 判断当前输出是否包含升级回归 warning。
 *
 * @param output - 命令 stdout/stderr 合并文本。
 * @returns 第一个命中的 pattern 文本。
 */
function findStrictOutputViolation(output) {
  for (const rule of STRICT_OUTPUT_RULES) {
    if (rule.pattern.test(output)) return rule.label;
  }
  return null;
}

/**
 * 从命令输出中解析 JSON。
 *
 * @param output - 命令 stdout/stderr 合并文本。
 * @returns 解析后的 JSON 值。
 */
function parseJsonOutput(output) {
  const trimmed = output.trim();
  if (!trimmed) return {};
  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  const startCandidates = [firstBrace, firstBracket].filter((index) => index >= 0);
  if (startCandidates.length === 0) throw new Error('输出中没有 JSON 起点');
  return JSON.parse(trimmed.slice(Math.min(...startCandidates)));
}

/**
 * 执行单条验证命令。
 *
 * @param step - 当前验证步骤。
 * @returns 命令输出文本。
 */
function runStep(step) {
  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      cwd: process.cwd(),
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';

    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      output += text;
      process.stderr.write(text);
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${step.label} 收到信号 ${signal}`));
        return;
      }
      const allowedExitCodes = step.allowExitCodes ?? [0];
      if (!allowedExitCodes.includes(code ?? 1)) {
        reject(new Error(`${step.label} 退出码 ${code ?? 1}`));
        return;
      }
      resolve(output);
    });
  });
}

for (const step of COMMANDS) {
  console.log(`\n[dependency-upgrade-smoke] ${step.label}`);
  const output = await runStep(step);
  const violation = findStrictOutputViolation(output);
  if (violation) fail(`${step.label} 输出包含严格禁止的 warning/error 信号: /${violation}/`);

  if (step.parseJson) {
    let json;
    try {
      json = parseJsonOutput(output);
    } catch (error) {
      fail(`${step.label} JSON 解析失败: ${error instanceof Error ? error.message : String(error)}`);
    }
    const validationError = step.validate?.(json);
    if (validationError) fail(validationError);
  }
}

console.log('\n[dependency-upgrade-smoke] 全部依赖升级烟测通过');
