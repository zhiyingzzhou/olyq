# Chrome Web Store 提交检查表

使用正式 GitHub Release 中的 `olyq-chrome-web-store-<label>.zip`。

禁止上传文件名带 `-pre.<run_number>` 的预览包。

## 上传前

- 确认 `Release` workflow 是从 `main` 完成的。
- 确认 `SHA256SUMS.txt` 覆盖 `olyq-chrome-web-store-<label>.zip`。
- 确认 zip 根目录包含 `manifest.json`。
- 确认发布文档包里的 `apps/extension/store-assets/chrome-web-store/listing.zh-CN.md` 或 `listing.en-US.md` 是本次商店 listing 文案来源。
- 确认发布文档包里的 `PRIVACY.md` 与商店 listing 隐私说明一致。
- 确认商店 listing 没有声明未验证的上架状态、评分、用户数或平台认证。

## 上传

1. 打开 Chrome Web Store Developer Dashboard。
2. 选择 Olyq 条目。
3. 上传 `olyq-chrome-web-store-<label>.zip`。
4. 检查 dashboard warnings 和权限摘要。
5. 使用 `listing.zh-CN.md` 或 `listing.en-US.md` 更新商店标题、摘要、详细说明、类别、隐私说明和审核测试说明。
6. 使用 GitHub Release 页面里的发布说明更新版本发布说明。
7. 确认 privacy practices 与 `PRIVACY.md` 一致。
8. 提交审核。

## Listing 文案

Chrome Web Store 产品详情文案真源在：

- `apps/extension/store-assets/chrome-web-store/listing.zh-CN.md`
- `apps/extension/store-assets/chrome-web-store/listing.en-US.md`

后台字段对应关系：

| Chrome Web Store 字段 | 使用内容 |
| --- | --- |
| 软件包中的标题 | `商店标题 / Store Title` |
| 软件包中的摘要 | `软件包摘要 / Manifest Description`，并应与 `_locales/*/messages.json` 的 `appDescription` 一致 |
| 说明 | `详细说明 / Detailed Description` |
| 类别 | `建议类别 / Suggested Category` |
| 隐私权惯例 | `隐私与权限说明 / Privacy And Permission Notes`，并与 `PRIVACY.md` 一致 |
| 审核说明 | `审核测试说明 / Reviewer Notes` |

## 延迟发布

如果 dashboard 提供 deferred publishing，并且这个版本需要审核通过后的最终人工 go/no-go，就启用延迟发布。

正式发布前再次确认：

- 提交包版本正确。
- 提交包文件名正确。
- GitHub Release URL 正确。
- 如果同版本也提交 Firefox，Firefox 附件使用同一个 `vX.Y.Z` label。

## 审核测试说明

可以从下面这段审核说明开始，再按当次版本补充必要信息：

```text
Olyq 是浏览器里的开源多模型 AI 工作台，不内置托管模型账号。

测试步骤：
1. 安装扩展。
2. 打开普通 http/https 网页。
3. 从工具栏打开 Olyq side panel。
4. 在 Settings 里添加受支持模型 provider 的测试 API key。
5. 围绕当前页面提问。
6. 测试划词、截图标注和 OCR 等 page tools。

数据默认本地优先。只有测试者配置模型、搜索、MCP 或备份 provider 并主动调用对应功能时，才会发生外部请求。
```
