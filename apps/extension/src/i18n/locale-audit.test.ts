/**
 * 说明：`locale-audit.test` 国际化模块。
 *
 * 职责：
 * - 承载 `locale-audit.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  createLocaleResourceRecord,
  safeDeepMergeLocaleResources,
  type LocaleResourceRecord,
} from '@/lib/i18n/locale-merge'

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))
const SRC_ROOT = path.resolve(CURRENT_DIR, '..')
const LOCALES_ROOT = path.join(CURRENT_DIR, 'locales')
const SOURCE_FILE_EXTENSIONS = new Set(['.ts', '.tsx'])
const USER_VISIBLE_ATTRS = new Set(['placeholder', 'aria-label', 'title', 'alt', 'data-olyq-tooltip'])
const TOAST_TEXT_PROPS = new Set(['title', 'description'])

/**
 * 测试辅助函数：`isPlainObject`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 测试辅助函数：`loadLocale`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function loadLocale(language: 'zh-CN' | 'en-US'): Record<string, unknown> {
  const localeDir = path.join(LOCALES_ROOT, language)
  const out = createLocaleResourceRecord()
  for (const fileName of readdirSync(localeDir).sort()) {
    if (!fileName.endsWith('.json')) continue
    const fullPath = path.join(localeDir, fileName)
    const json = JSON.parse(readFileSync(fullPath, 'utf8')) as Record<string, unknown>
    safeDeepMergeLocaleResources(out, json as LocaleResourceRecord)
  }
  return out
}

const zhCNLocale = loadLocale('zh-CN')
const enUSLocale = loadLocale('en-US')
const LOCALE_NAMESPACES = new Set([...Object.keys(zhCNLocale), ...Object.keys(enUSLocale)])

/**
 * 测试辅助函数：`getByDottedPath`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function getByDottedPath(object: Record<string, unknown>, dottedPath: string): unknown {
  return dottedPath.split('.').reduce<unknown>((acc, segment) => {
    if (!isPlainObject(acc) || !(segment in acc)) return undefined
    return acc[segment]
  }, object)
}

/**
 * 测试辅助函数：`flattenLocaleKeys`。
 *
 * @remarks
 * 把嵌套 locale 对象压平成 dotted key，方便比较双语资源结构。
 */
function flattenLocaleKeys(object: Record<string, unknown>, prefix = ''): Map<string, unknown> {
  const out = new Map<string, unknown>()
  for (const [key, value] of Object.entries(object)) {
    const nextKey = prefix ? `${prefix}.${key}` : key
    if (isPlainObject(value)) {
      for (const [childKey, childValue] of flattenLocaleKeys(value, nextKey).entries()) {
        out.set(childKey, childValue)
      }
    } else {
      out.set(nextKey, value)
    }
  }
  return out
}

/**
 * 测试辅助函数：`extractInterpolationParams`。
 *
 * @remarks
 * 提取 `{{param}}` 形式的插值参数，用于保证双语模板变量一致。
 */
function extractInterpolationParams(value: unknown): string[] {
  if (typeof value !== 'string') return []
  return Array.from(value.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g))
    .map((match) => match[1])
    .filter(Boolean)
    .sort()
}

/**
 * 测试辅助函数：`listSourceFiles`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function listSourceFiles(dir: string): string[] {
  const result: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      if (fullPath.startsWith(LOCALES_ROOT)) continue
      if (fullPath.endsWith(`${path.sep}test`)) continue
      result.push(...listSourceFiles(fullPath))
      continue
    }

    const ext = path.extname(fullPath)
    if (!SOURCE_FILE_EXTENSIONS.has(ext)) continue
    if (fullPath.endsWith('.test.ts') || fullPath.endsWith('.test.tsx') || fullPath.endsWith('.spec.ts') || fullPath.endsWith('.spec.tsx')) continue
    result.push(fullPath)
  }
  return result
}

/**
 * 测试辅助函数：`lineOf`。
 *
 * @remarks
 * 将 TypeScript AST 节点位置转成 1-based 行号，便于输出可定位的 guard 失败信息。
 */
function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
}

/**
 * 测试辅助函数：`isMachineString`。
 *
 * @remarks
 * 识别 URL、单位、代码 token、协议名和产品名等无需翻译的字符串。
 */
function isMachineString(value: string): boolean {
  const text = value.trim()
  if (!text) return true
  if (/^[-+*/=<>()[\]{}|.,:;'"`~!?@#$%^&_\\\s]+$/.test(text)) return true
  if (/^\d+(\.\d+)?(%|px|rem|em|ms|s|MB|KB|B|x\d+)?$/i.test(text)) return true
  if (/^\d+:\d+$/.test(text)) return true
  if (/^(https?:|chrome:|moz-extension:|data:|blob:|file:)/i.test(text)) return true
  if (/^[A-Z][A-Z0-9_./+-]{1,}$/.test(text)) return true
  if (/^[a-z0-9_./:#?&=%{}@+-]+$/i.test(text) && !/\s/.test(text)) return true
  if (/^(Olyq|OpenAI|OpenRouter|Gemini|Claude|MCP|API|URL|JSON|HTTP|S3|WebDAV|OAuth|Esc|Enter|Shift|Ctrl|Cmd|Alt|Meta)$/i.test(text)) return true
  return false
}

/**
 * 测试辅助函数：`isUserVisibleLiteral`。
 *
 * @remarks
 * 保守判定运行时代码里可能会直接展示给用户的自然语言字符串。
 */
function isUserVisibleLiteral(value: string): boolean {
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text || isMachineString(text)) return false
  if (/[\u4e00-\u9fff]/.test(text)) return true
  return /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(text)
}

/**
 * 测试辅助函数：`jsxAttributeName`。
 *
 * @remarks
 * 读取 JSX attribute 名称，统一处理普通属性与带短横线的属性。
 */
function jsxAttributeName(node: ts.JsxAttribute): string {
  if (ts.isIdentifier(node.name)) return node.name.text
  return `${node.name.namespace.text}:${node.name.name.text}`
}

/**
 * 测试辅助函数：`getStringLiteralExpression`。
 *
 * @remarks
 * 只接受纯字符串字面量，表达式形式交由正常 `t(...)` 或变量来源负责。
 */
function getStringLiteralExpression(node: ts.Expression | undefined): string | null {
  if (!node) return null
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return null
}

/**
 * 测试辅助函数：`collectHardcodedUserTextViolations`。
 *
 * @remarks
 * 用 TypeScript AST 拦截 JSX 文本、用户可见属性、DOM 文案写入和 toast 文案硬编码。
 */
function collectHardcodedUserTextViolations(): string[] {
  const violations: string[] = []

  for (const filePath of listSourceFiles(SRC_ROOT)) {
    const source = readFileSync(filePath, 'utf8')
    const relativePath = path.relative(SRC_ROOT, filePath)
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      false,
      filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )

    /**
     * 内部函数变量：`visit`。
     *
     * @remarks
     * 深度遍历当前源码 AST，并把命中的用户文案硬编码追加到 violations。
     */
    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node)) {
        const text = node.getText(sourceFile).replace(/\s+/g, ' ').trim()
        if (isUserVisibleLiteral(text)) violations.push(`${relativePath}:${lineOf(sourceFile, node)} JSX text: ${JSON.stringify(text)}`)
      }

      if (ts.isJsxAttribute(node) && USER_VISIBLE_ATTRS.has(jsxAttributeName(node))) {
        const value = node.initializer
        if (value && ts.isStringLiteral(value) && isUserVisibleLiteral(value.text)) {
          violations.push(`${relativePath}:${lineOf(sourceFile, node)} ${jsxAttributeName(node)}: ${JSON.stringify(value.text)}`)
        }
      }

      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const left = node.left
        if (
          ts.isPropertyAccessExpression(left)
          && (left.name.text === 'textContent' || left.name.text === 'innerText')
        ) {
          const literal = getStringLiteralExpression(node.right)
          if (literal !== null && isUserVisibleLiteral(literal)) {
            violations.push(`${relativePath}:${lineOf(sourceFile, node)} ${left.name.text}: ${JSON.stringify(literal)}`)
          }
        }
      }

      if (ts.isCallExpression(node) && node.expression.getText(sourceFile) === 'toast') {
        const firstArg = node.arguments[0]
        if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
          for (const prop of firstArg.properties) {
            if (!ts.isPropertyAssignment(prop)) continue
            const name = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : ''
            if (!TOAST_TEXT_PROPS.has(name)) continue
            const literal = getStringLiteralExpression(prop.initializer)
            if (literal !== null && isUserVisibleLiteral(literal)) {
              violations.push(`${relativePath}:${lineOf(sourceFile, prop)} toast.${name}: ${JSON.stringify(literal)}`)
            }
          }
        }
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  return violations.sort()
}

const ELEMENT_CONTEXT_RUNTIME_FILES = [
  'lib/element-context-draft.ts',
  'lib/chat/message-context-references.ts',
  'components/chat/chat-input/element-draft-markdown.ts',
  'components/chat/chat-input/ChatInputElementDraftCards.tsx',
  'components/chat/message-bubble/MessageContextReferenceCards.tsx',
  'extension/content-script/element-picker-extract.ts',
  'extension/content-script/element-picker.ts',
]

const ELEMENT_CONTEXT_BANNED_CHINESE_PATTERNS = [
  /页面元素引用/,
  /来源：/,
  /选择器：/,
  /图片/,
  /表格/,
  /文本/,
  /代码/,
  /视觉区域/,
]

/**
 * 测试辅助函数：`collectElementContextChineseLiteralViolations`。
 *
 * @remarks
 * 元素引用链路以前会在 helper 里提前拼中文 Markdown；这里专门扫描运行时代码
 * 的字符串字面量，允许注释继续使用中文说明，但不允许产品文案重新进代码。
 */
function collectElementContextChineseLiteralViolations(): string[] {
  const violations: string[] = []

  for (const relativePath of ELEMENT_CONTEXT_RUNTIME_FILES) {
    const filePath = path.join(SRC_ROOT, relativePath)
    const source = readFileSync(filePath, 'utf8')
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )

    /**
     * 内部函数变量：`visit`。
     *
     * @remarks
     * 深度遍历元素引用链路源码 AST，只检查字符串字面量，不把中文注释误判为产品文案。
     */
    const visit = (node: ts.Node) => {
      const text = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
        ? node.text
        : ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
          ? node.text
          : ''
      if (text && ELEMENT_CONTEXT_BANNED_CHINESE_PATTERNS.some((pattern) => pattern.test(text))) {
        violations.push(`${relativePath}:${lineOf(sourceFile, node)} ${JSON.stringify(text)}`)
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  return violations.sort()
}

type MatchPattern = {
  label: string
  regex: RegExp
}

const MATCH_PATTERNS: MatchPattern[] = [
  { label: 't', regex: /\bt\(\s*['"`]([A-Za-z0-9_-]+\.[^'"`]+)['"`]/g },
  { label: 'I18nError', regex: /\bI18nError\(\s*['"`]([A-Za-z0-9_-]+\.[^'"`]+)['"`]/g },
  { label: 'i18nText', regex: /\bi18nText\(\s*['"`]([A-Za-z0-9_-]+\.[^'"`]+)['"`]/g },
  { label: 'object-key', regex: /key:\s*['"`]([A-Za-z0-9_-]+\.[^'"`]+)['"`]/g },
]

/**
 * 测试辅助函数：`collectReferencedKeys`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function collectReferencedKeys(): Map<string, string[]> {
  const collected = new Map<string, string[]>()

  for (const filePath of listSourceFiles(SRC_ROOT)) {
    const source = readFileSync(filePath, 'utf8')
    const relativePath = path.relative(SRC_ROOT, filePath)

    for (const pattern of MATCH_PATTERNS) {
      const matches = source.matchAll(new RegExp(pattern.regex))
      for (const match of matches) {
        const key = match[1]?.trim()
        if (!key || key.includes('${')) continue
        const namespace = key.split('.')[0]
        if (!namespace || !LOCALE_NAMESPACES.has(namespace)) continue
        const refs = collected.get(key) ?? []
        refs.push(`${relativePath}:${pattern.label}`)
        collected.set(key, refs)
      }
    }
  }

  return collected
}

describe('locale-audit', () => {
  const zhCN = zhCNLocale
  const enUS = enUSLocale
  const zhCNKeys = flattenLocaleKeys(zhCN)
  const enUSKeys = flattenLocaleKeys(enUS)
  const referencedKeys = collectReferencedKeys()
  const bannedLiteDescKeys = [
    'cloudSyncPanel.s3.liteBackupDesc',
  ]
  const bannedSyncNamingKeys = [
    'cloudSyncPanel.s3.actions.backupActions',
    'cloudSyncPanel.s3.actions.backupNow',
    'cloudSyncPanel.s3.actions.manage',
    'cloudSyncPanel.webdav.backupTo',
    'cloudSyncPanel.webdav.restoreFrom',
    'cloudSyncPanel.webdav.autoBackup',
    'cloudSyncPanel.localBackup.backupNow',
    'cloudSyncPanel.localBackup.manage',
  ]
  const backupMeaningPattern = /备份同步|同步备份|云备份|自动备份|backup sync|sync backup|cloud backup|auto backup/i

  it('源码引用到的国际化 key 在 zh-CN 与 en-US 中都存在', () => {
    const missing: string[] = []

    for (const [key, refs] of referencedKeys.entries()) {
      if (getByDottedPath(zhCN, key) === undefined || getByDottedPath(enUS, key) === undefined) {
        missing.push(`${key} <- ${refs.join(', ')}`)
      }
    }

    expect(missing.sort()).toEqual([])
  })

  it('zh-CN 与 en-US 的 locale key 集必须完全一致', () => {
    expect([...zhCNKeys.keys()].sort()).toEqual([...enUSKeys.keys()].sort())
  })

  it('zh-CN 与 en-US 的 locale 插值参数必须完全一致', () => {
    const mismatches: string[] = []
    for (const key of zhCNKeys.keys()) {
      const zhParams = extractInterpolationParams(zhCNKeys.get(key))
      const enParams = extractInterpolationParams(enUSKeys.get(key))
      if (JSON.stringify(zhParams) !== JSON.stringify(enParams)) {
        mismatches.push(`${key}: zh-CN=${JSON.stringify(zhParams)} en-US=${JSON.stringify(enParams)}`)
      }
    }
    expect(mismatches).toEqual([])
  })

  it('运行时代码不得直接写扩展自有用户可见硬编码文案', () => {
    expect(collectHardcodedUserTextViolations()).toEqual([])
  }, 30_000)

  it('元素引用链路不得重新硬编码中文产品文案', () => {
    expect(collectElementContextChineseLiteralViolations()).toEqual([])
  })

  it('高风险回归 key 必须在双语 locale 中同时存在', () => {
    const requiredKeys = [
      'common.yes',
      'common.no',
      'cloudSyncPanel.nav.sections.backup',
      'cloudSyncPanel.snapshotBackup.title',
      'cloudSyncPanel.snapshotBackup.desc',
      'cloudSyncPanel.snapshotBackup.autoTitle',
      'cloudSyncPanel.liteBackup.desc',
      'cloudSyncPanel.autoSync.title',
      'cloudSyncPanel.sync.title',
      'cloudSyncPanel.sync.desc',
      'cloudSyncPanel.sync.runLabel',
      'cloudSyncPanel.sync.fileLabel',
      'cloudSyncPanel.sync.syncNow',
      'mcpBridgePanel.title',
      'webSearch.results.searching',
      'modelRegistry.manifestEditor.validate',
      'assistant.builtinDefault.name',
      'errors.imageInputModelNotRecognized',
      'errors.fileInputNotSupportedByProvider',
      'topicSettings.modelParamsLabel',
      'mcpSelection.modelParamsLabel',
      'assistant.tagsHint',
      'securityPanel.permissions.typeLabels.permissions',
      'securityPanel.permissions.sourceLabels.manifest',
    ]

    const missing = requiredKeys.filter((key) => getByDottedPath(zhCN, key) === undefined || getByDottedPath(enUS, key) === undefined)
    expect(missing).toEqual([])
  })

  it('精简备份描述只允许保留共享 key，不允许重新出现 provider-specific 文案分叉', () => {
    const lingeringLocaleKeys = bannedLiteDescKeys.filter((key) => getByDottedPath(zhCN, key) !== undefined || getByDottedPath(enUS, key) !== undefined)
    const lingeringSourceRefs = bannedLiteDescKeys.filter((key) => referencedKeys.has(key))

    expect(lingeringLocaleKeys).toEqual([])
    expect(lingeringSourceRefs).toEqual([])
  })

  it('多设备同步 / 备份与恢复契约在双语 locale 中必须保持同一份语义', () => {
    expect(getByDottedPath(zhCN, 'cloudSyncPanel.nav.sections.backup')).toBe('云同步与备份')
    expect(getByDottedPath(enUS, 'cloudSyncPanel.nav.sections.backup')).toBe('Cloud sync & backup')

    expect(getByDottedPath(zhCN, 'cloudSyncPanel.snapshotBackup.title')).toBe('备份与恢复')
    expect(getByDottedPath(enUS, 'cloudSyncPanel.snapshotBackup.title')).toBe('Backup & restore')

    expect(getByDottedPath(zhCN, 'cloudSyncPanel.snapshotBackup.desc')).toBe('创建可恢复的 ZIP 快照，用于恢复、迁移、回滚；这是唯一的备份入口。')
    expect(getByDottedPath(enUS, 'cloudSyncPanel.snapshotBackup.desc')).toBe('Create a restorable ZIP snapshot for recovery, migration, or rollback. This is the only backup entry point.')

    expect(getByDottedPath(zhCN, 'cloudSyncPanel.sync.title')).toBe('多设备同步')
    expect(getByDottedPath(enUS, 'cloudSyncPanel.sync.title')).toBe('Multi-device sync')

    expect(getByDottedPath(zhCN, 'cloudSyncPanel.sync.desc')).toBe('合并多设备上的助手、话题、消息等当前状态；不创建备份，也不能用于回滚恢复。')
    expect(getByDottedPath(enUS, 'cloudSyncPanel.sync.desc')).toBe('Merge current state such as assistants, topics, and messages across devices. It does not create backups and cannot be used for rollback recovery.')

    expect(getByDottedPath(zhCN, 'cloudSyncPanel.sync.syncNow')).toBe('同步当前状态')
    expect(getByDottedPath(enUS, 'cloudSyncPanel.sync.syncNow')).toBe('Sync current state')

    expect(getByDottedPath(zhCN, 'cloudSyncPanel.sync.lastSuccess')).toBe('最近成功：{{time}}，已合并 {{merged}} 个话题；此操作不会创建备份')
    expect(getByDottedPath(enUS, 'cloudSyncPanel.sync.lastSuccess')).toBe('Last success: {{time}}, merged {{merged}} topics; this does not create a backup')
  })

  it('多设备同步文案不能重新混入第二个备份入口语义', () => {
    const syncValues = [
      getByDottedPath(zhCN, 'cloudSyncPanel.sync.title'),
      getByDottedPath(zhCN, 'cloudSyncPanel.sync.runLabel'),
      getByDottedPath(zhCN, 'cloudSyncPanel.sync.syncNow'),
      getByDottedPath(zhCN, 'cloudSyncPanel.autoSync.title'),
      getByDottedPath(enUS, 'cloudSyncPanel.sync.title'),
      getByDottedPath(enUS, 'cloudSyncPanel.sync.runLabel'),
      getByDottedPath(enUS, 'cloudSyncPanel.sync.syncNow'),
      getByDottedPath(enUS, 'cloudSyncPanel.autoSync.title'),
    ].map(String)

    expect(syncValues.filter((value) => backupMeaningPattern.test(value))).toEqual([])
  })

  it('多设备同步 / 备份与恢复只允许复用共享命名，不允许重新引入 provider-specific 别名 key', () => {
    const lingeringLocaleKeys = bannedSyncNamingKeys.filter((key) => getByDottedPath(zhCN, key) !== undefined || getByDottedPath(enUS, key) !== undefined)
    const lingeringSourceRefs = bannedSyncNamingKeys.filter((key) => referencedKeys.has(key))

    expect(lingeringLocaleKeys).toEqual([])
    expect(lingeringSourceRefs).toEqual([])
  })
})
