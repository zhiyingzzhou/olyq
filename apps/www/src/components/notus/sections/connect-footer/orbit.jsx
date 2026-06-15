import { joinClassNames } from '../../utils.js'

const CONNECT_RING_PROVIDERS = [
  { id: 'openai', label: 'OpenAI', tone: 'mono' },
  { id: 'anthropic', label: 'Anthropic', tone: 'mono' },
  { id: 'google', label: 'Gemini', tone: 'color' },
  { id: 'deepseek', label: 'DeepSeek', tone: 'color' },
  { id: 'mistral', label: 'Mistral AI', tone: 'color' },
  { id: 'groq', label: 'Groq', tone: 'mono' },
  { id: 'xai', label: 'xAI', tone: 'mono' },
  { id: 'cohere', label: 'Cohere', tone: 'color' },
  { id: 'moonshot', label: 'Moonshot AI', tone: 'mono' },
  { id: 'qwen', label: 'Qwen', tone: 'color' },
  { id: 'siliconflow', label: 'SiliconFlow', tone: 'color' },
  { id: 'zhipu', label: 'Zhipu AI', tone: 'color' },
  { id: 'together', label: 'Together AI', tone: 'color' },
  { id: 'perplexity', label: 'Perplexity', tone: 'color' },
  { id: 'fireworks', label: 'Fireworks AI', tone: 'color' },
  { id: 'minimax', label: 'MiniMax', tone: 'color' },
  { id: 'baichuan', label: 'Baichuan', tone: 'color' },
  { id: 'openrouter', label: 'OpenRouter', tone: 'mono' },
  { id: 'vercel-ai-gateway', label: 'Vercel AI Gateway', tone: 'mono' },
  { id: 'azure-openai', label: 'Azure OpenAI', tone: 'color' },
  { id: 'aws-bedrock', label: 'AWS Bedrock', tone: 'color' },
  { id: 'vertexai', label: 'Vertex AI', tone: 'color' },
  { id: 'new-api', label: 'NewAPI', tone: 'color' },
  { id: 'ollama', label: 'Ollama', tone: 'mono' },
  { id: 'lmstudio', label: 'LM Studio', tone: 'mono' },
]

function ProviderLogoIcon({ className = '', id, label, tone }) {
  return (
    <img
      alt={label}
      className={joinClassNames(className, tone === 'mono' ? 'dark:invert' : '')}
      decoding="async"
      draggable={false}
      height="32"
      loading="lazy"
      src={`/provider-icons/${id}.webp`}
      width="32"
    />
  )
}

function ConnectOrbitRings({
  className = '',
  numRings = 3,
  ringDurationsSec,
  showRings = true,
  size = 800,
}) {
  const totalIcons = CONNECT_RING_PROVIDERS.length
  const ringIndexes = Array.from({ length: numRings }, (_, index) => index + 1)
  const weightSum = ringIndexes.reduce((sum, value) => sum + value, 0)
  const baseCounts = ringIndexes.map((value) => Math.floor((totalIcons * value) / weightSum))
  let remaining = totalIcons - baseCounts.reduce((sum, value) => sum + value, 0)

  for (let index = numRings - 1; index >= 0 && remaining > 0; index -= 1) {
    baseCounts[index] += 1
    remaining -= 1
  }

  let cursor = 0
  const groupedProviders = baseCounts.map((count) => {
    const providers = CONNECT_RING_PROVIDERS.slice(cursor, cursor + count)
    cursor += count
    return providers
  })

  const ringScales =
    numRings <= 1
      ? [(0.42 + 0.94) / 2]
      : Array.from({ length: numRings }, (_, index) => 0.42 + (0.52 * index) / (numRings - 1))

  return (
    <div
      className={joinClassNames('relative mx-auto flex items-center justify-center', className)}
      style={{ height: size, width: size }}
    >
      {showRings ? (
        <div className="pointer-events-none absolute inset-0 z-0">
          {Array.from({ length: numRings }, (_, index) => numRings - 1 - index).map((ringIndex) => {
            const ringSize = Math.round(size * ringScales[ringIndex])

            return (
              <div
                className={joinClassNames(
                  'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-inner',
                  ringIndex === 0 ? 'bg-neutral-300 dark:bg-neutral-500' : '',
                  ringIndex === 1 ? 'bg-neutral-200 dark:bg-neutral-600' : '',
                  ringIndex === 2 ? 'bg-neutral-100 dark:bg-neutral-700' : '',
                  ringIndex === 3 ? 'bg-neutral-50 dark:bg-neutral-800' : '',
                )}
                key={`bg-ring-${ringIndex}`}
                style={{ height: ringSize, width: ringSize }}
              />
            )
          })}
        </div>
      ) : null}
      {Array.from({ length: numRings }, (_, index) => numRings - 1 - index).map((ringIndex) => {
        const providers = groupedProviders[ringIndex]
        const iconCount = providers.length

        if (!iconCount) {
          return null
        }

        const ringSize = Math.round(size * ringScales[ringIndex])
        const translateRadius = ringSize / 2
        const duration = ringDurationsSec?.[ringIndex] ?? 18 + 8 * ringIndex
        const isReverse = ringIndex % 2 === 1

        return (
          <div
            className={joinClassNames(
              'absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full',
              isReverse ? 'animate-counter-orbit' : 'animate-orbit',
            )}
            key={`ring-${ringIndex}`}
            style={{ '--duration': `${duration}s`, height: ringSize, width: ringSize }}
          >
            <div className="relative h-full w-full">
              {providers.map((provider, iconIndex) => {
                const angle = (360 / iconCount) * iconIndex

                return (
                  <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                    key={`ring-${ringIndex}-icon-${iconIndex}`}
                    style={{ transform: `rotate(${angle}deg) translateX(${translateRadius}px)` }}
                  >
                    <div style={{ transform: `rotate(${-angle}deg)` }}>
                      <div
                        className={joinClassNames(
                          'shadow-aceternity flex size-14 items-center justify-center rounded-md bg-white dark:bg-neutral-950',
                          isReverse ? 'animate-orbit' : 'animate-counter-orbit',
                        )}
                        style={{ '--duration': `${duration}s` }}
                      >
                        <ProviderLogoIcon
                          className="size-8 shrink-0 object-contain"
                          id={provider.id}
                          label={provider.label}
                          tone={provider.tone}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ConnectOrbitRings
