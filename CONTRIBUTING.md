# 贡献指南

[English](./CONTRIBUTING.en.md)

感谢你愿意一起改进 Olyq。

## 本地开发

安装依赖：

```bash
pnpm install
```

启动 Chromium 扩展开发模式：

```bash
pnpm dev:extension:chromium
```

启动 Firefox 扩展开发模式：

```bash
pnpm dev:extension:firefox
```

## 验证

提交 pull request 前，请至少跑完相关检查：

```bash
pnpm lint:extension
pnpm typecheck:extension
pnpm test:extension
pnpm build:extension:chromium
pnpm build:extension:firefox
pnpm build:www
```

完整本地验证：

```bash
pnpm verify
```

`pnpm verify` 会先运行 `pnpm verify:github-workflows`。这个检查会阻止 GitHub Actions 使用未 pin 到完整 commit SHA、或缺少版本注释的 action 引用。

## 扩展打包

构建 Chromium 和 Firefox 目标后，可以生成本地 zip：

```bash
pnpm package:extension
```

zip 会写入 `apps/extension/artifacts/`，文件名按用途命名：

- `olyq-chrome-web-store-<label>.zip`：用于 Chrome Web Store 提交，也可用于 Chromium 系浏览器本地加载。
- `olyq-firefox-amo-addon-<label>.zip`：用于 Firefox Add-ons / AMO addon 上传，也可用于 Firefox 临时加载。
- `olyq-firefox-amo-source-<label>.zip`：用于 Firefox Add-ons / AMO source code 审核；它不是可安装包。

只需要单个目标时：

```bash
pnpm package:extension:chrome-web-store
pnpm package:extension:firefox-amo-addon
pnpm package:extension:firefox-amo-source
```

发布文档包由根级命令生成：

```bash
pnpm package:release-docs
```

## 发布流程

Olyq 使用 GitHub Actions 驱动发布。日常开发进入 `dev`，`main` 只承载已审核的发布状态。

1. 在 GitHub Actions 里运行 **Prepare Release**，输入 `X.Y.Z` 或 `X.Y.Z-prerelease` 版本号。
2. workflow 会从 `dev` 更新根 `package.json` 和 `apps/extension/package.json`，运行 `pnpm verify` 和 mock E2E，重新构建生产扩展，并上传 14 天保留的 preview artifacts：
   - `olyq-chrome-web-store-vX.Y.Z-pre.<run_number>.zip`
   - `olyq-firefox-amo-addon-vX.Y.Z-pre.<run_number>.zip`
   - `olyq-release-docs-vX.Y.Z-pre.<run_number>.zip`
3. 按 `docs/release/manual-qa.md` 下载并验收 preview artifacts；preview 包只用于人工验收，不上传商店，不进入 GitHub Release。
4. review 并合并 `release/vX.Y.Z` 到 `main` 后，在 `main` 上运行 **Release**，输入同一个版本号。
5. Release workflow 会重新从 `main` 干净构建、创建 `vX.Y.Z` tag，打包 Chrome、Firefox addon、Firefox source、release docs 四类 zip，生成完整 `SHA256SUMS.txt`，创建 GitHub artifact attestation，并发布 GitHub Release 页面和附件。

不要从本地手动推送发布 tag。GitHub Release 页面、release notes、zip 附件、checksum 和 provenance 都由 **Release** workflow 生成。

## 商店提交包

提交商店时只按文件名判断用途，不靠浏览器猜测：

- Chrome Web Store：上传 `apps/extension/artifacts/olyq-chrome-web-store-${tag}.zip`。
- Firefox Add-ons / AMO：上传 `apps/extension/artifacts/olyq-firefox-amo-addon-${tag}.zip` 作为 addon 包，同时上传 `apps/extension/artifacts/olyq-firefox-amo-source-${tag}.zip` 作为 source code 包。
- 发布交付说明：下载 `apps/extension/artifacts/olyq-release-docs-${tag}.zip`，按其中 `chrome-web-store.md`、`firefox-amo.md` 和 `manual-qa.md` 操作。

Firefox AMO source 包只服务 reviewer 复现构建，不是普通用户安装包。普通 Firefox 用户应使用 Mozilla 审核 / 签名后提供的 `.xpi`。不要把 Chrome Web Store 或 Firefox AMO 凭证放进 GitHub Release workflow；商店发布保持独立的账号、权限和凭证边界。

## 产品素材

产品图片以 `assets/product/` 为真源。`apps/www/public/product/` 只是官网构建前由脚本同步出来的静态副本，不要直接修改或提交那里。

README、官网首页 / 功能页、Blog 封面和 OG / Twitter 分享图只能使用真实扩展 UI 截图或 Olyq 官网语义图片。四格产品截图由 `apps/extension/scripts/generate-website-product-screenshots.mjs` 生成，固定使用 `1280×800` 视口和 `deviceScaleFactor: 2`，输出 `2560×1600` Retina PNG；禁止新增 `1280×800 @1x` 对外产品截图。

`olyq-store-*` 商店 poster 和 `olyq-promo-*` 宣传图块只服务 Chrome Web Store / Firefox Add-ons 等商店物料，不要作为 README、官网、Blog 或分享 meta 的产品截图引用。

公开文案统一按真实能力写成“浏览器里的开源多模型 AI 工作台”。不要把 Olyq 写成已上架商店产品、托管模型服务、知识库 RAG、桌面端、团队协作产品，或 Cherry Studio 的浏览器版 / 分支。

常用命令：

```bash
pnpm sync:product-assets
cd apps/extension && pnpm generate:store-posters
cd apps/extension && pnpm generate:store-promos
cd apps/extension && pnpm generate:website-product-screenshots
TINIFY_API_KEY=... pnpm optimize:product-assets
```

生成脚本会写入 `assets/product/`，并同步官网副本。官网 `dev` / `build` 也会自动同步一次，避免本地预览缺图。

`optimize:product-assets` 会调用 TinyPNG / Tinify API 压缩 `assets/product/*.png`，成功后再刷新官网副本。API Key 只通过 `TINIFY_API_KEY` 环境变量传入，不要写入仓库、脚本或 CI 日志。正式压缩前可以先跑：

```bash
pnpm optimize:product-assets -- --dry-run
pnpm optimize:product-assets -- --include=olyq-page-context --limit=2
```

压缩脚本不会进入默认 `verify`，避免本地验证或 CI 意外消耗 TinyPNG 额度。

## Pull Request 要求

保持改动聚焦。一个 pull request 通常只处理一个功能、修复或文档更新。

日常开发和集成进入 `dev`；准备发布时通过 **Prepare Release** 创建面向 `main` 的发布 PR。

请说明：

- 改了什么。
- 影响哪个浏览器或运行时区域。
- 是否影响权限、存储、隐私、provider 调用、MCP、备份 / 同步或 release 产物。
- 跑过哪些验证命令。

## 浏览器扩展边界

这些边界不要随意改：

- 工具栏按钮直接打开 side panel / sidebar，不恢复用户可见 popup launcher。
- side panel / sidebar 是主工作区。
- service worker 是路由和后台任务中心。
- content scripts 只面对网页。
- offscreen 只承载不适合放进 service worker 的能力。

没有明确用户价值和验证前，不要扩大安装期权限、host permissions 或 `web_accessible_resources`。

Olyq 处于活跃开发中，默认不保留隐藏 fallback、旧兼容分支或额外运行时探测；除非项目明确选择这些行为。

## 安全与隐私

不要在公开 issue 或 pull request 里放 API key、OAuth token、私有网页内容、隐藏截图、备份包或用户数据。

漏洞报告请看 [SECURITY.md](./SECURITY.md)。当前数据流说明见 [PRIVACY.md](./PRIVACY.md)。
