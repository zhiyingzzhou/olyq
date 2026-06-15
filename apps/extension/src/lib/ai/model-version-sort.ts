/**
 * 说明：`model-version-sort` AI 能力模块。
 *
 * 职责：
 * - 承载“同一家族模型按版本数字升序”的共享排序规则；
 * - 对外暴露 `sortModelsByVersionSemantics` 等公开能力，供模型选择器、设置页和模型管理复用；
 * - 只负责家族内排序，不负责 provider / group 维度的外层排序。
 *
 * 边界：
 * - 本文件不决定不同 provider 或不同模型家族之间的产品顺序；
 * - 不做兼容迁移，也不改动持久化结构，只提供稳定的纯排序逻辑。
 */

/** 版本感知排序所需的最小模型身份。 */
export type VersionSortableModelIdentity = {
  /** 原始模型 ID，可带 provider 前缀。 */
  modelId: string
  /** 可选展示名，仅用于极端兜底。 */
  displayName?: string
  /** 可选基础模型键，必要时用于补充识别。 */
  baseModelKey?: string
}

type ParsedVersionSortableModel = {
  normalizedId: string
  familyKey: string
  versionNumbers: number[]
  hasVersion: boolean
  isBaseVariant: boolean
  variantKey: string
  canParticipateInSort: boolean
}

type DecoratedSortableModel<T> = {
  item: T
  index: number
  parsed: ParsedVersionSortableModel
}

/**
 * 生成供版本排序复用的稳定 identity key。
 *
 * 规则：
 * - 优先使用 registry 已派生好的 `baseModelKey`，避免 UI 层再猜 provider/path 包装；
 * - 若当前调用面尚未拿到 `baseModelKey`，则退回到原始 `modelId` 的叶子片段；
 * - 返回值统一 lower-case，保证不同入口比较前提一致。
 */
export function deriveVersionSortKey(
  identity: Pick<VersionSortableModelIdentity, 'modelId' | 'baseModelKey'>,
): string {
  const baseModelKey = String(identity.baseModelKey || '').trim().toLowerCase()
  if (baseModelKey) return baseModelKey

  const rawModelId = String(identity.modelId || '').trim()
  if (!rawModelId) return ''
  return ((rawModelId.split('/').pop() || rawModelId).trim().toLowerCase())
}

/**
 * 将原始排序身份归一成“适合版本解析”的核心 ID。
 *
 * 规则：
 * - 优先使用调用方显式下沉的 `deriveVersionSortKey()` 结果；
 * - 若调用方尚未下沉该字段，则仍按 `baseModelKey -> modelId 叶子片段` 兜底；
 * - `displayName` 只作为最终兜底，不参与 provider/path 级语义判断。
 */
function resolveSortableCoreId(identity: VersionSortableModelIdentity): string {
  const versionSortKey = deriveVersionSortKey(identity)
  if (versionSortKey) return versionSortKey

  return String(identity.displayName || '').trim().toLowerCase()
}

/**
 * 解析单个 token 是否为可参与版本比较的片段。
 *
 * 说明：
 * - 兼容 `5`、`5b`、`v3`、`v3.1` 拆分后的 `v3` / `1` 这种常见 provider 命名；
 * - 不把 `qwen3` 这类“产品名自带数字”的 token 误识别成版本起点，只有纯数字或 `v`+数字才算。
 */
function matchVersionToken(token: string): RegExpMatchArray | null {
  return token.match(/^v?(\d+)([a-z]*)$/i)
}

/**
 * 解析模型身份，提取可用于版本比较的家族键、版本号和后缀变体。
 *
 * 规则：
 * - 优先走 `baseModelKey`，保证不同 UI 入口都基于同一模型身份排序；
 * - 去掉 provider 前缀后，取第一个“纯数字或 v+数字”片段之前的稳定前缀作为家族键；
 * - 同一家族里只比较数字片段和“是否基础款”，不同家族不在这里做主观重排。
 */
function parseVersionSortableModel(identity: VersionSortableModelIdentity): ParsedVersionSortableModel {
  const coreId = resolveSortableCoreId(identity)
  if (!coreId) {
    return {
      normalizedId: '',
      familyKey: '',
      versionNumbers: [],
      hasVersion: false,
      isBaseVariant: true,
      variantKey: '',
      canParticipateInSort: false,
    }
  }

  const tokens = coreId.split(/[-_.]+/).filter(Boolean)
  const familyTokens: string[] = []
  const versionNumbers: number[] = []
  const variantTokens: string[] = []
  let versionStarted = false
  let variantStarted = false

  for (const token of tokens) {
    const versionMatch = matchVersionToken(token)
    if (!versionStarted) {
      if (!versionMatch) {
        familyTokens.push(token)
        continue
      }
      versionStarted = true
    }

    if (!variantStarted && versionMatch) {
      versionNumbers.push(Number(versionMatch[1]))
      const remainder = String(versionMatch[2] || '').trim().toLowerCase()
      if (remainder) {
        variantStarted = true
        variantTokens.push(remainder)
      }
      continue
    }

    variantStarted = true
    variantTokens.push(token)
  }

  const familyKey = familyTokens.join('-')
  const hasVersion = versionNumbers.length > 0
  return {
    normalizedId: coreId,
    familyKey,
    versionNumbers,
    hasVersion,
    isBaseVariant: variantTokens.length === 0,
    variantKey: variantTokens.join('-'),
    canParticipateInSort: Boolean(familyKey && hasVersion),
  }
}

/**
 * 仅比较“同一家族模型”内部的版本先后。
 *
 * 返回规则：
 * - 只要不是同一家族，或无法稳定提取版本号，就返回 `0`，交由外层保持原顺序；
 * - 版本号按数字升序；
 * - 同版本下基础款优先，再比较后缀字典序。
 */
export function compareModelsByVersionSemantics(
  left: VersionSortableModelIdentity,
  right: VersionSortableModelIdentity,
): number {
  const parsedLeft = parseVersionSortableModel(left)
  const parsedRight = parseVersionSortableModel(right)
  if (!parsedLeft.canParticipateInSort || !parsedRight.canParticipateInSort) return 0
  if (parsedLeft.familyKey !== parsedRight.familyKey) return 0

  const maxLength = Math.max(parsedLeft.versionNumbers.length, parsedRight.versionNumbers.length)
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = parsedLeft.versionNumbers[index]
    const rightValue = parsedRight.versionNumbers[index]
    if (leftValue === rightValue) continue
    if (leftValue === undefined) return -1
    if (rightValue === undefined) return 1
    return leftValue - rightValue
  }

  if (parsedLeft.isBaseVariant !== parsedRight.isBaseVariant) {
    return parsedLeft.isBaseVariant ? -1 : 1
  }

  return parsedLeft.variantKey.localeCompare(parsedRight.variantKey)
    || parsedLeft.normalizedId.localeCompare(parsedRight.normalizedId)
}

/**
 * 对模型列表执行“家族内版本感知”的稳定重排。
 *
 * 设计约束：
 * - 不同家族保持原有相对位置，避免把产品线顺序一起打散；
 * - 只有同一家族的多个版本会被替换成升序结果；
 * - 最终结果稳定，不依赖 JS `sort()` 对相等项的实现细节。
 */
export function sortModelsByVersionSemantics<T>(
  items: ReadonlyArray<T>,
  pickIdentity: (item: T) => VersionSortableModelIdentity,
): T[] {
  const decorated = items.map<DecoratedSortableModel<T>>((item, index) => ({
    item,
    index,
    parsed: parseVersionSortableModel(pickIdentity(item)),
  }))

  const familyBuckets = new Map<string, DecoratedSortableModel<T>[]>()
  for (const entry of decorated) {
    if (!entry.parsed.canParticipateInSort) continue
    const bucket = familyBuckets.get(entry.parsed.familyKey)
    if (bucket) bucket.push(entry)
    else familyBuckets.set(entry.parsed.familyKey, [entry])
  }

  const sortedBuckets = new Map<string, DecoratedSortableModel<T>[]>()
  const bucketOffsets = new Map<string, number>()
  for (const [familyKey, bucket] of familyBuckets.entries()) {
    if (bucket.length < 2) continue
    sortedBuckets.set(
      familyKey,
      [...bucket].sort((left, right) => {
        const diff = compareModelsByVersionSemantics(
          { modelId: left.parsed.normalizedId },
          { modelId: right.parsed.normalizedId },
        )
        if (diff !== 0) return diff
        return left.index - right.index
      }),
    )
    bucketOffsets.set(familyKey, 0)
  }

  return decorated.map((entry) => {
    if (!entry.parsed.canParticipateInSort) return entry.item
    const queue = sortedBuckets.get(entry.parsed.familyKey)
    if (!queue) return entry.item
    const offset = bucketOffsets.get(entry.parsed.familyKey) ?? 0
    const next = queue[offset]
    bucketOffsets.set(entry.parsed.familyKey, offset + 1)
    return next?.item ?? entry.item
  })
}
