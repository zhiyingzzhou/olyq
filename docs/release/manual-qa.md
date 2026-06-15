# Release 预览包人工验收

合并 release PR 前，必须对 `Prepare Release` 生成的预览附件执行这份检查表。

预览附件文件名带 `-pre.<run_number>`，它们不是商店提交包。

## 包完整性

- 从 workflow run 下载全部预览附件。
- 确认 Chrome 预览 zip 根目录包含 `manifest.json`。
- 确认 Firefox 预览 zip 根目录包含 `manifest.json`。
- 确认发布文档预览 zip 包含这个 `docs/release/` 目录。
- 确认没有任何预览附件被附加到 GitHub Release。

## Chromium 冒烟

1. 解压 `olyq-chrome-web-store-vX.Y.Z-pre.<run_number>.zip`。
2. 打开 `chrome://extensions`。
3. 启用 Developer mode。
4. 加载解压后的扩展目录。
5. 打开普通 `https://` 页面。
6. 从工具栏打开 Olyq。
7. 确认 side panel 可以加载。
8. 打开 Settings，确认 provider settings 可进入。
9. 使用测试 provider 发送一次 page-context prompt。
10. 测试一个 page tool：划词、截图或 OCR。

## Firefox 冒烟

1. 解压 `olyq-firefox-amo-addon-vX.Y.Z-pre.<run_number>.zip`。
2. 打开 `about:debugging#/runtime/this-firefox`。
3. 作为 temporary add-on 加载 `manifest.json`。
4. 打开普通 `https://` 页面。
5. 打开 Olyq sidebar。
6. 确认 sidebar 可以加载，Settings 可进入。
7. 使用测试 provider 发送一次基础 prompt。

## Release PR 合并门禁

只有同时满足以下条件，才合并 release PR：

- 自动化 CI 全绿。
- 预览包 QA 完成。
- 包版本正确。
- 商店 listing 文案和隐私文案仍与 release docs 一致。
