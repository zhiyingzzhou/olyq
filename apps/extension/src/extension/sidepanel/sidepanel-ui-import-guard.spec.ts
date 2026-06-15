/**
 * 说明：`sidepanel-ui-import-guard.spec` Side Panel 模块。
 *
 * 职责：
 * - 承载 `sidepanel-ui-import-guard.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(THIS_DIR, '../..');

type GuardedFile = {
  relativePath: string;
  allowedDynamicImports: string[];
  allowLazy?: boolean;
};

const guardedFiles: GuardedFile[] = [
  {
    relativePath: 'extension/sidepanel/SidePanelApp.tsx',
    allowedDynamicImports: ['@/pages/Paint'],
    allowLazy: true,
  },
  { relativePath: 'pages/index-page/IndexPageView.tsx', allowedDynamicImports: [] },
  { relativePath: 'pages/index-page/IndexPageOverlays.tsx', allowedDynamicImports: [] },
  { relativePath: 'components/chat/ExtensionSettings.tsx', allowedDynamicImports: [] },
  { relativePath: 'components/chat/settings/CloudSyncPanel.tsx', allowedDynamicImports: [] },
  { relativePath: 'components/chat/settings/model-manager/panel/ModelManagerPanelDialogs.tsx', allowedDynamicImports: [] },
];

/**
 * 测试辅助函数：`inspectSource`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function inspectSource(relativePath: string) {
  const filePath = path.join(SRC_ROOT, relativePath);
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const dynamicImports: string[] = [];
  const lazyOffsets: number[] = [];

    /**
   * 测试辅助函数：`visit`。
   *
   * @remarks
   * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
   */
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const [firstArgument] = node.arguments;
        dynamicImports.push(ts.isStringLiteralLike(firstArgument) ? firstArgument.text : '<non-literal>');
      }

      const expression = node.expression;
      const isLazyCall = (ts.isIdentifier(expression) && expression.text === 'lazy')
        || (ts.isPropertyAccessExpression(expression) && expression.name.text === 'lazy');

      if (isLazyCall) lazyOffsets.push(node.getStart(sourceFile));
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    dynamicImports: [...dynamicImports].sort(),
    lazyOffsets,
  };
}

/**
 * 测试辅助函数：`stripBlockComments`。
 *
 * @remarks
 * 启动层动画 guard 只扫描真实 CSS/TSX 源码，不把解释性注释里的禁用词当成运行时代码。
 */
function stripBlockComments(text: string) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('sidepanel ui import guard', () => {
  it('只允许白名单内的 sidepanel 懒加载边界，首页 overlay 必须静态导入', () => {
    const offenders = guardedFiles
      .map(({ relativePath, allowedDynamicImports, allowLazy = false }) => {
        const inspection = inspectSource(relativePath);
        const expectedDynamicImports = [...allowedDynamicImports].sort();
        const hasUnexpectedDynamicImports = JSON.stringify(inspection.dynamicImports) !== JSON.stringify(expectedDynamicImports);
        const hasUnexpectedLazyCalls = !allowLazy && inspection.lazyOffsets.length > 0;
        if (!hasUnexpectedDynamicImports && !hasUnexpectedLazyCalls) return null;

        return {
          relativePath,
          dynamicImports: inspection.dynamicImports,
          lazyOffsets: inspection.lazyOffsets,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    expect(offenders).toEqual([]);
  });

  it('Side Panel 启动根节点只允许 visibility reveal，不引入滑入动画', () => {
    const guardedStartupFiles = [
      path.resolve(SRC_ROOT, '../public/extension-page-boot.css'),
      path.resolve(SRC_ROOT, 'extension/sidepanel/SidePanelApp.tsx'),
    ];
    const forbiddenPattern = /\b(?:animate-|slide-in|slide-out|translate-x|translateX|transition|transform|animation|@keyframes)\b/;
    const offenders = guardedStartupFiles
      .map((filePath) => {
        const text = stripBlockComments(fs.readFileSync(filePath, 'utf8'));
        const matched = text.match(forbiddenPattern)?.[0] ?? null;
        return matched ? { file: path.relative(path.resolve(SRC_ROOT, '..'), filePath), matched } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    expect(offenders).toEqual([]);
  });
});
