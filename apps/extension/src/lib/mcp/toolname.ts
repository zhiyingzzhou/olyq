/**
 * 说明：`toolname` 基础能力模块。
 *
 * 职责：
 * - 承载 `toolname` 相关的当前文件实现与模块边界；
 * - 对外暴露 `McpToolNameOptions`、`toCamelCase`、`buildMcpToolName` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：MCP 工具命名工具（Browser Studio）
 *
 * 目标：
 * - 为“工具调用”生成稳定、可读、且一定是合法 JavaScript 标识符的名称
 * - 名称格式默认使用：`mcp__{server}__{tool}`
 *
 * 注意：
 * - 输出仅包含 ASCII 字母/数字/下划线，避免在不同运行时/SDK 中出现编码差异。
 * - 若首字符不是 [A-Za-z_]，会自动用 "_" 前缀修正。
 */

export type McpToolNameOptions = {
  /** 前缀（例如 "mcp__"）。调用方保证其本身已是 JavaScript 标识符安全片段。 */
  prefix?: string;
  /** server/tool 之间的分隔符（例如 "_" 或 "__"）。调用方保证其本身已是安全片段。 */
  delimiter?: string;
  /** 最大长度（包含冲突后缀数字）。 */
  maxLength?: number;
  /** 用于冲突检测的可变集合：若提供，会把最终名字写入该集合。 */
  existingNames?: Set<string>;
};

/**
 * 判断字符码是否为 ASCII 字母。
 *
 * 说明：
 * - 工具名规范化只允许 ASCII 安全字符，避免不同运行时对 Unicode 标识符支持不一致；
 * - 该辅助函数供 camelCase 转换与合法性校验复用。
 */
function isAsciiLetter(code: number) {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/** 判断字符码是否为 ASCII 数字。 */
function isAsciiDigit(code: number) {
  return code >= 48 && code <= 57;
}

/** 判断字符码是否为 ASCII 字母或数字。 */
function isAsciiAlphaNum(code: number) {
  return isAsciiLetter(code) || isAsciiDigit(code);
}

/** 若首字符不是合法标识符起始字符，则自动补 `_`。 */
function ensureIdentifierStart(name: string) {
  if (!name) return '';
  const c = name.charCodeAt(0);
  const ok = isAsciiLetter(c) || name[0] === '_';
  return ok ? name : `_${name}`;
}

/**
 * 将任意字符串压缩为"驼峰风格"的 ASCII 标识符片段。
 *
 * 规则：
 * - 只保留 ASCII 字母/数字；其它字符视为分词边界
 * - 首段默认小写；遇到边界后，下一段首字符转大写（与数字无关）
 * - 输入若以分隔符开头，则第一个字母会被大写（与旧行为保持一致）
 * - 若结果首字符非法，则前置 "_" 修正为合法标识符
 */
export function toCamelCase(input: string): string {
  const s = String(input ?? '').trim();
  if (!s) return '';

  let out = '';
  // 是否把下一段的首字符大写（包括开头遇到分隔符的情况）
  let upperNext = false;

  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (!isAsciiAlphaNum(code)) {
      // 连续分隔符：只需要把 upperNext 打开即可
      upperNext = true;
      continue;
    }

    const ch = s[i]!;
    const lower = isAsciiLetter(code) ? ch.toLowerCase() : ch;
    const nextChar =
      upperNext
        ? (isAsciiLetter(code) ? lower.toUpperCase() : lower)
        : lower;

    // 第一段的第一个字符：保持 lower；但如果输入前面有分隔符（upperNext=true），则会被大写
    out += out.length === 0 && !upperNext ? lower : nextChar;
    upperNext = false;
  }

  return ensureIdentifierStart(out);
}

/** 按最大长度裁剪名称，并顺手清理尾部多余下划线。 */
function trimToMax(name: string, maxLength: number) {
  if (!Number.isFinite(maxLength) || maxLength <= 0) return '';
  if (name.length <= maxLength) return name;
  // 末尾裁切后如果以 "_" 结尾会显得很奇怪；顺手去掉尾部多余下划线
  return name.slice(0, maxLength).replace(/_+$/, '');
}

/**
 * 在名称冲突时追加递增数字后缀，直到得到唯一值。
 *
 * 说明：
 * - 若设置了 `maxLength`，会先为后缀预留空间再裁剪主体；
 * - 该函数不负责把最终结果写入 `existingNames`，由调用方决定何时占坑。
 */
function withCollisionSuffix(
  base: string,
  existingNames: Set<string>,
  maxLength?: number,
): string {
  // 先尝试不带后缀
  let candidate = typeof maxLength === 'number' ? trimToMax(base, maxLength) : base;
  if (!existingNames.has(candidate)) return candidate;

  // 发生冲突：追加递增数字后缀；必要时截断 base
  let n = 1;
  while (true) {
    const suffix = String(n);
    const headMax = typeof maxLength === 'number' ? Math.max(0, maxLength - suffix.length) : undefined;
    const head = typeof headMax === 'number' ? trimToMax(base, headMax) : base;
    candidate = `${head}${suffix}`;
    if (!existingNames.has(candidate)) return candidate;
    n++;
  }
}

/**
 * 生成 MCP tool 的函数名（JavaScript 标识符）。
 *
 * 默认规则：
 * - serverName 与 toolName 分别走 toCamelCase
 * - 拼接：`{prefix}{server}{delimiter}{tool}`（server 为空则省略 server + delimiter）
 * - 支持 maxLength 截断与 existingNames 冲突消解
 */
export function buildMcpToolName(
  serverName: string | undefined,
  toolName: string,
  options: McpToolNameOptions = {},
): string {
  const prefix = String(options.prefix ?? '');
  const delimiter = String(options.delimiter ?? '_');
  const maxLength = options.maxLength;
  const existing = options.existingNames;

  const tool = toCamelCase(toolName);
  const server = serverName ? toCamelCase(serverName) : '';
  const base = server ? `${prefix}${server}${delimiter}${tool}` : `${prefix}${tool}`;

  if (!existing) {
    return typeof maxLength === 'number' ? trimToMax(base, maxLength) : base;
  }

  const unique = withCollisionSuffix(base, existing, maxLength);
  existing.add(unique);
  return unique;
}

/**
 * 说明：工具调用的默认命名格式为 `mcp__{server}__{tool}`（最长 63）。
 */
export function buildFunctionCallToolName(serverName: string, toolName: string): string {
  return buildMcpToolName(serverName, toolName, { prefix: 'mcp__', delimiter: '__', maxLength: 63 });
}

/**
 * 判断工具名是否符合当前 MCP 注入命名规范。
 *
 * 规则：
 * - 仅认 `mcp__` 前缀；
 * - 不把 memory、builtin web search 或其它工具混入 MCP 判定。
 */
export function isMcpFunctionCallToolName(toolName: string): boolean {
  return String(toolName || '').trim().startsWith('mcp__');
}

/**
 * 判断当前工具集合里是否真正注入了 MCP 工具。
 *
 * @param tools - 最终将传给 AI SDK 的工具集合。
 * @returns 只要存在一个 `mcp__*` 工具名就返回 `true`。
 */
export function hasInjectedMcpTools(tools?: Record<string, unknown>): boolean {
  if (!tools) return false;
  return Object.keys(tools).some((toolName) => isMcpFunctionCallToolName(toolName));
}
