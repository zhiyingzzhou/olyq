# 第三方声明 / Third-Party Notices

本文件包含 `olyq` 中使用到的第三方资源与许可声明（含 NPM 直接依赖清单与部分资源类引用）。

## Lobe Icons（MIT）

本项目在 `apps/extension/src/components/icons/webSearchProviders.tsx` 中使用了以下品牌图标的路径数据，来源于 LobeHub 的 `lobe-icons` 仓库：

- Google（Mono）
- Bing（Mono）
- Baidu（Mono）
- Exa（Mono）
- Tavily（Mono）
- Zhipu（Mono）

来源仓库：`https://github.com/lobehub/lobe-icons`（分支：`master`）

此外，本项目在 `apps/extension/src/lib/ai/lobe-icon-list.ts` / `apps/extension/src/lib/ai/provider-icons.ts` 中会从 unpkg 拉取并展示
`@lobehub/icons-static-webp` 的静态图标资源（同仓库发布包，许可同为 MIT）。

### License

MIT License

Copyright (c) 2023 LobeHub

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Simple Icons（CC0）

本项目在 `apps/extension/src/components/icons/webSearchProviders.tsx` 中使用了 SearXNG 的 SVG 路径数据，来源于 Simple Icons：

- SearXNG

来源：`https://github.com/simple-icons/simple-icons`（branch：`develop`）

Simple Icons 的图标集合采用 CC0 1.0（Public Domain Dedication）发布。

## 技术栈图标固定版本 SVG 来源

技术栈图标由 `apps/extension/scripts/generate-technology-icons.mjs` 人工生成 `apps/extension/public/data/technology-icons/catalog.compact.json`。生成期可以联网读取固定版本开源 SVG 目录并校验最终 URL；运行时只读取本地 compact catalog，将短 source id 与 SVG path 拼成 `https://cdn.jsdelivr.net/...` 静态图片 URL，不读取上游 catalog、不请求 Iconify API、不执行远程 JavaScript/WASM，也不依赖 `olyq-tech-icons` 外部仓库。品牌/技术图标未命中时使用 Tabler outline generic 分类图标，明确不冒充品牌 logo；商标仍归各自权利人所有。

当前 fixed sources：

- theSVG `gh/glincker/thesvg@v2.3.0/public/icons/`，来源仓库：`https://github.com/GLINCKER/thesvg`，license: MIT。
- Simple Icons `npm/simple-icons@16.18.1/icons/`，来源仓库：`https://github.com/simple-icons/simple-icons`，license: CC0-1.0；品牌名称与商标仍归各自权利人所有，使用图标不代表品牌认可。
- Devicon `npm/devicon@2.17.0/icons/`，来源仓库：`https://github.com/devicons/devicon`，license: MIT。
- Material Icon Theme `npm/material-icon-theme@5.34.0/icons/`，来源仓库：`https://github.com/material-extensions/vscode-material-icon-theme`，license: MIT。
- skill-icons `gh/tandpfun/skill-icons@7f7e691e71aec64e8354bf697835e009d1ad80f8/icons/`，来源仓库：`https://github.com/tandpfun/skill-icons`，license: MIT。
- Tabler Icons `npm/@tabler/icons@3.44.0/icons/outline/`，来源仓库：`https://github.com/tabler/tabler-icons`，license: MIT；仅用于 generic 分类图标，不表示品牌 logo。

## 本地开源技术指纹快照数据（GPL-3.0）

公开仓库根目录保留一份本地开源扩展快照，manifest 版本为 `6.12.2`。该快照仅作为技术 JSON、分类 JSON 与分组 JSON 的本地来源数据读取，并由 `apps/extension/scripts/generate-technology-fingerprint-bundle.mjs` 转换为 Olyq 自有中性 `FingerprintRuleBundle`。运行时代码、UI 文案、prompt 文案、dist 产物、生成包和扩展发布相关文本资产不得出现上游品牌词，也不得复制该快照中的 JS 源码、图标、UI、遥测、账号、导出、CRM、安装或升级页面。

本地快照目录本身不包含 LICENSE 文件；许可证边界按公开仓库的 `GPL-3.0` 记录。发布包含转换后规则数据的源码或发行包时，必须随源码/随附声明保留本声明并同步满足 GPL-3.0 对应的源码、许可和声明义务；扩展运行时产物不内联本文件。

### License

GNU General Public License v3.0

---

## JavaScript 依赖（直接依赖）

下表由脚本从 `apps/extension/package.json` 与 workspace 安装结果读取生成（仅列出直接依赖；传递依赖请参考 `pnpm-lock.yaml`）。

<!-- BEGIN GENERATED NPM LICENSES -->

| Package | Version | License | Repository |
|---|---:|---|---|
| @ai-sdk/amazon-bedrock | 4.0.94 | Apache-2.0 | https://github.com/vercel/ai |
| @ai-sdk/anthropic | 3.0.70 | Apache-2.0 | https://github.com/vercel/ai |
| @ai-sdk/cohere | 3.0.30 | Apache-2.0 | https://github.com/vercel/ai |
| @ai-sdk/deepseek | 2.0.29 | Apache-2.0 | https://github.com/vercel/ai |
| @ai-sdk/gateway | 3.0.102 | Apache-2.0 | https://github.com/vercel/ai |
| @ai-sdk/google | 3.0.64 | Apache-2.0 | https://github.com/vercel/ai |
| @ai-sdk/google-vertex | 4.0.111 | Apache-2.0 | https://github.com/vercel/ai |
| @ai-sdk/groq | 3.0.35 | Apache-2.0 | https://github.com/vercel/ai |
| @ai-sdk/mistral | 3.0.30 | Apache-2.0 | https://github.com/vercel/ai |
| @ai-sdk/openai | 3.0.53 | Apache-2.0 | https://github.com/vercel/ai |
| @ai-sdk/openai-compatible | 2.0.41 | Apache-2.0 | https://github.com/vercel/ai |
| @ai-sdk/provider | 3.0.8 | Apache-2.0 | https://github.com/vercel/ai |
| @ai-sdk/provider-utils | 4.0.23 | Apache-2.0 | https://github.com/vercel/ai |
| @ai-sdk/xai | 3.0.83 | Apache-2.0 | https://github.com/vercel/ai |
| @crxjs/vite-plugin | 2.4.0 | MIT | https://github.com/crxjs/chrome-extension-tools |
| @dnd-kit/collision | 0.4.0 | MIT | https://github.com/clauderic/dnd-kit |
| @dnd-kit/dom | 0.4.0 | MIT | https://github.com/clauderic/dnd-kit |
| @dnd-kit/react | 0.4.0 | MIT | https://github.com/clauderic/dnd-kit |
| @eslint/js | 9.39.4 | MIT | https://github.com/eslint/eslint |
| @mozilla/readability | 0.6.0 | Apache-2.0 | https://github.com/mozilla/readability |
| @playwright/test | 1.58.2 | Apache-2.0 | https://github.com/microsoft/playwright |
| @radix-ui/react-accordion | 1.2.12 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-alert-dialog | 1.1.15 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-checkbox | 1.3.3 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-collapsible | 1.1.12 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-context-menu | 2.2.16 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-dialog | 1.1.15 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-dismissable-layer | 1.1.11 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-dropdown-menu | 2.1.16 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-label | 2.1.8 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-popover | 1.1.15 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-progress | 1.1.8 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-radio-group | 1.3.8 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-select | 2.2.6 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-separator | 1.1.8 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-slider | 1.3.6 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-slot | 1.2.4 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-switch | 1.2.6 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-tabs | 1.1.13 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-toast | 1.2.15 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-toggle | 1.1.10 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-toggle-group | 1.1.11 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-tooltip | 1.2.8 | MIT | https://github.com/radix-ui/primitives |
| @tailwindcss/typography | 0.5.19 | MIT | https://github.com/tailwindlabs/tailwindcss-typography |
| @tanstack/react-virtual | 3.13.21 | MIT | https://github.com/TanStack/virtual |
| @testing-library/jest-dom | 6.9.1 | MIT | https://github.com/testing-library/jest-dom |
| @testing-library/react | 16.3.2 | MIT | https://github.com/testing-library/react-testing-library |
| @testing-library/user-event | 14.6.1 | MIT | https://github.com/testing-library/user-event |
| @types/chrome | 0.0.280 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/css-tree | 2.3.11 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/jszip | 3.4.1 | MIT | https://github.com/Stuk/jszip |
| @types/node | 22.19.15 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/react | 18.3.28 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/react-dom | 18.3.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/react-syntax-highlighter | 15.5.13 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/ws | 8.18.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @vitejs/plugin-react-swc | 3.11.0 | MIT | https://github.com/vitejs/vite-plugin-react |
| ai | 6.0.165 | Apache-2.0 | https://github.com/vercel/ai |
| autoprefixer | 10.4.27 | MIT | postcss/autoprefixer |
| class-variance-authority | 0.7.1 | Apache-2.0 | https://github.com/joe-bell/cva |
| clsx | 2.1.1 | MIT | lukeed/clsx |
| cross-env | 7.0.3 | MIT | https://github.com/kentcdodds/cross-env |
| css-tree | 3.2.1 | MIT | csstree/csstree |
| eslint | 9.39.4 | MIT | eslint/eslint |
| eslint-plugin-react-hooks | 5.2.0 | MIT | https://github.com/facebook/react |
| eslint-plugin-react-refresh | 0.4.26 | MIT | github:ArnaudBarre/eslint-plugin-react-refresh |
| eslint-plugin-tsdoc | 0.5.2 | MIT | https://github.com/microsoft/tsdoc |
| globals | 15.15.0 | MIT | sindresorhus/globals |
| i18next | 25.8.18 | MIT | https://github.com/i18next/i18next |
| jsdom | 24.1.3 | MIT | https://github.com/jsdom/jsdom |
| jszip | 3.10.1 | (MIT OR GPL-3.0-or-later) | https://github.com/Stuk/jszip |
| katex | 0.16.38 | MIT | https://github.com/KaTeX/KaTeX |
| lovable-tagger | 1.1.13 | MIT |  |
| lucide-react | 0.462.0 | ISC | https://github.com/lucide-icons/lucide |
| mermaid | 11.14.0 | MIT | https://github.com/mermaid-js/mermaid |
| postcss | 8.5.10 | MIT | postcss/postcss |
| react | 18.3.1 | MIT | https://github.com/facebook/react |
| react-dom | 18.3.1 | MIT | https://github.com/facebook/react |
| react-i18next | 16.5.8 | MIT | https://github.com/i18next/react-i18next |
| react-markdown | 10.1.0 | MIT | remarkjs/react-markdown |
| react-resizable-panels | 2.1.9 | MIT | https://github.com/bvaughn/react-resizable-panels |
| react-router-dom | 6.30.3 | MIT | https://github.com/remix-run/react-router |
| react-syntax-highlighter | 16.1.1 | MIT | https://github.com/react-syntax-highlighter/react-syntax-highlighter |
| rehype-katex | 7.0.1 | MIT | https://github.com/remarkjs/remark-math/tree/main/packages/rehype-katex |
| remark-gfm | 4.0.1 | MIT | remarkjs/remark-gfm |
| remark-math | 6.0.0 | MIT | https://github.com/remarkjs/remark-math/tree/main/packages/remark-math |
| tailwind-merge | 2.6.1 | MIT | https://github.com/dcastil/tailwind-merge |
| tailwindcss | 3.4.19 | MIT | https://github.com/tailwindlabs/tailwindcss |
| tailwindcss-animate | 1.0.7 | MIT |  |
| tokenx | 1.3.0 | MIT | https://github.com/johannschopplich/tokenx |
| typescript | 5.9.3 | Apache-2.0 | https://github.com/microsoft/TypeScript |
| typescript-eslint | 8.57.0 | MIT | https://github.com/typescript-eslint/typescript-eslint |
| vite | 6.4.2 | MIT | https://github.com/vitejs/vite |
| vite-node | 3.2.4 | MIT | https://github.com/vitest-dev/vitest |
| vitepress | 1.6.4 | MIT | github:vuejs/vitepress |
| vitepress-plugin-mermaid | 2.0.17 | MIT | https://github.com/emersonbottero/vitepress-plugin-mermaid |
| vitest | 3.2.4 | MIT | https://github.com/vitest-dev/vitest |
| ws | 8.20.0 | MIT | https://github.com/websockets/ws |
| zod | 3.25.76 | MIT | https://github.com/colinhacks/zod |
| zustand | 5.0.11 | MIT | https://github.com/pmndrs/zustand |

<!-- END GENERATED NPM LICENSES -->
