# Firefox AMO 提交检查表

使用正式 GitHub Release 中的这些附件：

- `olyq-firefox-amo-addon-<label>.zip`
- `olyq-firefox-amo-source-<label>.zip`
- `olyq-release-docs-<label>.zip`
- `SHA256SUMS.txt`

禁止上传文件名带 `-pre.<run_number>` 的预览包。

## Addon 包

- 确认 addon zip 根目录包含 `manifest.json`。
- 确认版本与 `package.json`、`apps/extension/package.json` 一致。
- 确认 addon 包来自正式 `Release` workflow，而不是本地构建。

## Source 包

source 包包含 Mozilla reviewer 复现 Firefox addon 包所需的源码和构建文件。它排除生成产物和本机状态。

source 包根目录包含 `AMO_SOURCE_REBUILD.md`。重建命令是：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @olyq/extension build:firefox
pnpm --filter @olyq/extension package:firefox
```

重建后的 addon 包会写入：

```text
apps/extension/artifacts/olyq-firefox-amo-addon-<label>.zip
```

## AMO 审核说明

可以从下面这段审核说明开始，再按当次版本补充必要信息：

```text
Olyq 是浏览器里的开源多模型 AI 工作台。

提交的 addon 包可以用随附 source 包、pnpm 以及 AMO_SOURCE_REBUILD.md 中的命令复现构建。扩展不内置托管 AI 账号。审核人员可以在扩展设置中配置自己的模型 provider API key，打开普通 http/https 网页，然后从 sidebar 围绕页面提问。

生成的构建产物、node_modules、artifacts 和本地测试结果已从 source 包中排除。
```
