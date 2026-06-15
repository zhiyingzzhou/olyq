# Olyq 发布交付包说明

这个目录是正式 GitHub Release 附件 `olyq-release-docs-<label>.zip` 的源文件。

GitHub Release 是 Olyq 扩展构建产物的唯一可追溯交付真源。商店提交只使用正式 Release 附件；不要从本地工作区重新打包，也不要使用 workflow 预览附件。

## 正式附件

- `olyq-chrome-web-store-<label>.zip`：Chrome Web Store 上传包。
- `olyq-firefox-amo-addon-<label>.zip`：Firefox AMO addon 上传包。
- `olyq-firefox-amo-source-<label>.zip`：Firefox AMO 审核源码包。
- `olyq-release-docs-<label>.zip`：发布说明、隐私材料、README、发布说明来源标记和校验和摘要。
- `SHA256SUMS.txt`：覆盖所有正式 zip 附件的 SHA-256 校验和。

发布文档包还包含 Chrome Web Store listing 文案真源：`apps/extension/store-assets/chrome-web-store/listing.zh-CN.md` 和 `apps/extension/store-assets/chrome-web-store/listing.en-US.md`。提交商店时使用这些文件填写产品详情，不要临时改写旧口径。

## 预览附件

`Prepare Release` 会生成带 `-pre.<run_number>` 后缀的人工验收包。预览附件是临时 workflow 附件，保留 14 天，只用于发布前 QA，禁止上传商店。

正式 `Release` workflow 必须在 release PR 合并后，从 `main` 重新构建和打包，不复用预览附件。

## 人工检查入口

1. 从 `Prepare Release` workflow run 下载预览附件。
2. 按 `manual-qa.md` 验收。
3. 预览包通过后再合并 release PR。
4. 从 `main` 运行 `Release` workflow。
5. 校验 `SHA256SUMS.txt`。
6. 使用正式 GitHub Release 附件提交 Chrome Web Store 和 Firefox AMO。
