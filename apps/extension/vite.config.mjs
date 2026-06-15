import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { componentTagger } from "lovable-tagger";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config.mjs";
import { getBuildConfig, getRuntimeBuildConfig } from "./build-config.mjs";
import {
  resolveBrowserExtensionAssetFileName,
  resolveBrowserExtensionChunkFileName,
  resolveBrowserExtensionEntryFileName,
} from "./scripts/extension-content-script-output.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function walkAst(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const value of Object.values(node)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const child of value) walkAst(child, visit);
    } else if (typeof value === "object" && typeof value.type === "string") {
      walkAst(value, visit);
    }
  }
}

function formatCodeFrame(code, index) {
  const start = Math.max(0, index - 80);
  const end = Math.min(code.length, index + 160);
  return code.slice(start, end).replace(/\s+/g, " ");
}

function createMv3CspSafeThirdPartyGlobalsPlugin() {
  const globalThisFallbackPattern = /\bFunction\(\s*(['"`])return this\1\s*\)\s*\(\s*\)/g;
  const regeneratorRuntimeFallbackPattern = /\bFunction\(\s*(['"`])r\1\s*,\s*(['"`])regeneratorRuntime = r\2\s*\)\s*\(\s*runtime\s*\)/g;
  const zodDocModuleIdPattern = /(?:^|[/\\])zod[/\\]v4[/\\]core[/\\]doc\.js(?:\?|$)/;
  const zodDocCompilePattern = /compile\(\)\s*\{[\s\S]*?return\s+new\s+F\(\.\.\.args,\s*lines\.join\("\\n"\)\);\s*\}/;
  const zodSourceAllowsEvalProbePattern = /try\s*\{\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*Function\s*;\s*new\s+\1\s*\(\s*(['"`])\2\s*\)\s*;\s*return\s+true\s*;?\s*\}\s*catch\s*(?:\([^)]*\))?\s*\{\s*return\s+false\s*;?\s*\}/g;
  const zodSourceDirectAllowsEvalProbePattern = /try\s*\{\s*(?:new\s+)?Function\(\s*(['"`])\1\s*\)\s*;\s*return\s+true\s*;?\s*\}\s*catch\s*(?:\([^)]*\))?\s*\{\s*return\s+false\s*;?\s*\}/g;
  const zodMinifiedDirectAllowsEvalProbePattern = /try\s*\{\s*return\s+(?:new\s+)?Function\(\s*(['"`])\1\s*\)\s*,\s*!0\s*\}\s*catch\s*(?:\([^)]*\))?\s*\{\s*return\s*!1\s*\}/g;
  const zodMinifiedAliasAllowsEvalProbePattern = /try\s*\{\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*Function\s*;\s*return\s+new\s+\1\s*\(\s*(['"`])\2\s*\)\s*,\s*!0\s*\}\s*catch\s*(?:\([^)]*\))?\s*\{\s*return\s*!1\s*\}/g;

  function sanitizeMv3CspCode(code) {
    return code
      .replace(globalThisFallbackPattern, "globalThis")
      .replace(regeneratorRuntimeFallbackPattern, "globalThis.regeneratorRuntime = runtime")
      .replace(zodSourceAllowsEvalProbePattern, "return false")
      .replace(zodSourceDirectAllowsEvalProbePattern, "return false")
      .replace(zodMinifiedDirectAllowsEvalProbePattern, "return!1")
      .replace(zodMinifiedAliasAllowsEvalProbePattern, "return!1");
  }

  return {
    name: "olyq-mv3-csp-safe-third-party-globals",
    enforce: "post",
    transform(code, id) {
      if (!zodDocModuleIdPattern.test(id)) return null;
      const sanitizedCode = code.replace(
        zodDocCompilePattern,
        'compile() {\n        throw new Error("Zod JIT is disabled in Olyq MV3 builds.");\n    }',
      );
      return sanitizedCode === code ? null : { code: sanitizedCode, map: null };
    },
    renderChunk(code, chunk) {
      // 说明：Mermaid / Cytoscape / lodash 系依赖仍会把传统 UMD 全局探测打进 ESM 产物。
      // MV3 扩展禁止动态代码执行；现代扩展运行时已经稳定提供 globalThis，因此这里在输出阶段彻底改写。
      //
      // Zod v4 会在 `allowsEval` 内用 `Function("")` 试探运行时能力；扩展环境明确不允许
      // 这类动态执行，因此构建产物直接固定为 `false`，让 Zod 走非 JIT 路径。
      const sanitizedCode = sanitizeMv3CspCode(code);
      const ast = this.parse(sanitizedCode);
      const findings = [];

      walkAst(ast, (node) => {
        if (node.type !== "CallExpression" && node.type !== "NewExpression") return;
        const callee = node.callee;
        const isDirectEval = node.type === "CallExpression"
          && callee?.type === "Identifier"
          && callee.name === "eval";
        const isFunctionCtor = callee?.type === "Identifier"
          && callee.name === "Function";
        const isKnownGlobalObject = callee?.type === "MemberExpression"
          && callee.object?.type === "Identifier"
          && ["globalThis", "window", "self", "global"].includes(callee.object.name);
        const isMemberDynamicEval = node.type === "CallExpression"
          && isKnownGlobalObject
          && callee.property?.type === "Identifier"
          && (callee.property.name === "eval" || callee.property.name === "Function");

        if (isDirectEval || isFunctionCtor || isMemberDynamicEval) {
          findings.push({
            kind: isDirectEval ? "eval" : isFunctionCtor ? "Function" : `.${callee.property.name}`,
            start: node.start ?? 0,
          });
        }
      });

      if (findings.length > 0) {
        const details = findings
          .slice(0, 5)
          .map((finding) => `${finding.kind} @ ${finding.start}: ${formatCodeFrame(sanitizedCode, finding.start)}`)
          .join("\n");
        this.error(`MV3 CSP 动态执行守卫失败：${chunk.fileName}\n${details}`);
      }

      return sanitizedCode === code ? null : { code: sanitizedCode, map: null };
    },
  };
}

function removeConflictingRolldownOptions(pluginConfig) {
  if (!pluginConfig?.build?.rollupOptions || !pluginConfig.build.rolldownOptions) return pluginConfig;
  const { rolldownOptions: _rolldownOptions, ...build } = pluginConfig.build;
  return { ...pluginConfig, build };
}

function createCrxPlugins() {
  return crx({ manifest }).map((plugin) => {
    if (
      plugin.name !== "crx:content-scripts"
      || plugin.apply !== "build"
      || plugin.enforce !== "pre"
      || typeof plugin.config !== "function"
    ) {
      return plugin;
    }

    const originalConfig = plugin.config;
    return {
      ...plugin,
      async config(config, env) {
        // CRXJS 2.4.0 在 Vite 8 下会把传入的 `rolldownOptions` 原样带回，再追加
        // `rollupOptions.preserveEntrySignatures`。Rolldown 会因此忽略该插件的
        // `rollupOptions` 并打印 warning；删除返回片段里的冗余 `rolldownOptions` 后，
        // Vite 仍会按当前构建器转换选项，同时保留 CRXJS 对 content script 的签名约束。
        const result = await originalConfig.call(this, config, env);
        return removeConflictingRolldownOptions(result);
      },
    };
  });
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const buildConfig = getBuildConfig();
  const target = buildConfig.target;
  const runtimeBuildConfig = getRuntimeBuildConfig(buildConfig);
  const e2eFlag = mode === "test" ? "1" : "";
  const includeWebPreview = process.env.OLYQ_WEB_PREVIEW === "1";
  return {
    // 重要：E2E（mode=test）构建会开启 mock（VITE_OLYQ_E2E=1）。
    // 为避免日常手动加载扩展时误用到 E2E 产物，这里把测试构建输出到单独目录。
    build: {
      chunkSizeWarningLimit: 1600,
      // 彻底切换：浏览器扩展不再产出 Vite 的 modulepreload 注入。
      // 原因：
      // - content script 会运行在真实网页环境里；
      // - Vite 的 preload helper 会把依赖写成 `/assets/*.js` 这类根相对路径；
      // - 一旦该 helper 落到 GitHub 等强 CSP 页面，就会把扩展 chunk 解析成 `https://host/assets/*`，
      //   触发网页自己的 CSP 拦截，而不是从 `chrome-extension://` 加载。
      // 扩展安装后资源已在本地，保留 preload 价值很低，去掉它反而能保证网页注入链路稳定。
      modulePreload: false,
      // benchmark runner 需要读取 test build manifest 来定位 page-style chunk 并执行体积预算。
      // 默认扩展产物不需要 manifest，避免增加日常发布目录里的额外元数据。
      manifest: mode === "test",
      outDir: (() => {
        const isFirefox = target === "firefox";
        if (mode === "test") return isFirefox ? "dist-firefox-e2e" : "dist-e2e";
        return isFirefox ? "dist-firefox" : "dist";
      })(),
      // 说明：Firefox 构建（sidebar_action）目前不会被 CRXJS 自动识别为 HTML 入口。
      // 为保证 Side Panel/Sidebar 的主面板页面在两端都被正确产出，这里显式声明多入口。
      rollupOptions: {
        output: {
          entryFileNames: resolveBrowserExtensionEntryFileName,
          chunkFileNames: resolveBrowserExtensionChunkFileName,
          assetFileNames: resolveBrowserExtensionAssetFileName,
        },
        input: {
          // 扩展入口：主面板与离屏文档。toolbar action 直接打开侧栏，不再产出用户可见 popup。
          ...(mode === "test" ? {
            // page-style benchmark 只进入 test build：
            // - 它复用真实 page-style 内核做浏览器级跑分和结构性回归守卫；
            // - 不属于默认扩展交互面，也不应进入日常产物主链路。
            pageStyleBenchmark: path.resolve(__dirname, "src/bench/page-style/index.html"),
          } : {}),
          ...(includeWebPreview ? {
            // Web 预览/调试入口：仅在显式启用时单独产出，不再进入默认扩展构建。
            app: path.resolve(__dirname, "index.html"),
          } : {}),
          panel: path.resolve(__dirname, "src/extension/sidepanel/index.html"),
          offscreen: path.resolve(__dirname, "src/extension/offscreen/index.html"),
        },
      },
    },
    define: {
      __OLYQ_BUILD_CONFIG__: JSON.stringify(runtimeBuildConfig),
      "import.meta.env.VITE_OLYQ_E2E": JSON.stringify(e2eFlag),
    },
    server: {
      // 扩展开发（CRXJS）强烈建议使用固定端口：
      // - Vite 的 HMR client 默认会从 `location.port` 推断 websocket 端口
      // - 而 chrome-extension:// 页面没有端口，导致 ws 端口推断为空（=80），从而出现
      //   “[vite] failed to connect to websocket ... (browser) localhost:/ <--[WebSocket]--> localhost:8080/”
      //
      // 解决：
      // - 固定 server.port，并启用 strictPort，避免端口自动漂移导致 dist 的 dev loader 指向错误地址
      // - 明确配置 hmr.clientPort，让扩展页始终连到正确端口
      host: "localhost",
      port: 8080,
      strictPort: true,
      hmr: {
        overlay: false,
        protocol: "ws",
        host: "localhost",
        port: 8080,
        clientPort: 8080,
      },
    },
    // CRXJS 负责把 Vite 产物打包成 MV3 扩展（含 content script HMR/loader 等）
    plugins: [
      react(),
      createCrxPlugins(),
      createMv3CspSafeThirdPartyGlobalsPlugin(),
      mode === "development" && componentTagger(),
    ].filter(Boolean),
    resolve: {
      // 修复扩展多入口（sidepanel/offscreen/content-script）开发时潜在的 React 重复实例问题，
      // 避免出现 “Invalid hook call / Cannot read properties of null (reading 'useState')”
      // （通常会在 Radix 组件内部触发）
      dedupe: ["react", "react-dom"],
      alias: [
        {
          find: /^jszip$/,
          replacement: path.resolve(__dirname, "./node_modules/jszip/lib/index.js"),
        },
        {
          find: /^readable-stream$/,
          replacement: path.resolve(__dirname, "./src/lib/shims/readable-stream-browser-safe.cjs"),
        },
        {
          find: /^stream$/,
          replacement: path.resolve(__dirname, "./src/lib/shims/readable-stream-browser-safe.cjs"),
        },
        {
          find: /^setimmediate$/,
          replacement: path.resolve(__dirname, "./src/lib/shims/setimmediate-mv3-safe.js"),
        },
        {
          find: "@",
          replacement: path.resolve(__dirname, "./src"),
        },
      ],
    },
  };
});
