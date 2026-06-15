import { readFileSync } from "node:fs";

const PACKAGE_JSON_URL = new URL("./package.json", import.meta.url);

function resolveEnv(name, env = process.env) {
  return String(env[name] || '').trim();
}

function readPackageVersion() {
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_URL, "utf8"));
  const version = String(packageJson.version || '').trim();
  if (!version) throw new Error("Olyq package.json version is required for extension builds.");
  return version;
}

export function resolveTargetBrowser(raw = process.env.OLYQ_TARGET) {
  const target = String(raw || '').trim().toLowerCase();
  return target === 'firefox' ? 'firefox' : 'chromium';
}

export function getBuildConfig(env = process.env) {
  const target = resolveTargetBrowser(env.OLYQ_TARGET);
  const version = readPackageVersion();
  return {
    target,
    version,
    firefoxId: target === 'firefox' ? (resolveEnv('OLYQ_FIREFOX_ID', env) || 'olyq@example.com') : '',
    chromiumExtensionKey: target === 'chromium' ? resolveEnv('OLYQ_CHROMIUM_EXTENSION_KEY', env) : '',
  };
}

export function getRuntimeBuildConfig(buildConfig) {
  return {
    target: buildConfig.target,
    appVersion: buildConfig.version,
  };
}
