import { motion } from 'framer-motion'
import {
  AnthropicBrandIcon,
  MetaBrandIcon,
  OpenAIBrandIcon,
} from '../../../icons.jsx'
import { BrowserHeaderIcon, StatusChip } from '../../../sectionPrimitives.jsx'
import { Divider } from '../../../shared.jsx'
import { FEATURE_MODEL_SCAN_PARTICLES } from '../data.js'

const providerIcons = {
  anthropic: AnthropicBrandIcon,
  local: MetaBrandIcon,
  openai: OpenAIBrandIcon,
}

function FeatureModelRow({ model, modelIndex }) {
  const Logo = providerIcons[model.icon]

  return (
    <div className="relative" key={model.name}>
      <motion.div
        className="mt-4 flex items-center justify-between gap-2"
        initial={{ clipPath: 'inset(0 100% 0 0)', filter: 'blur(10px)' }}
        transition={{ duration: 1, delay: modelIndex, ease: 'easeInOut' }}
        viewport={{ once: true }}
        whileInView={{ clipPath: 'inset(0 0% 0 0)', filter: 'blur(0px)' }}
      >
        <div className="flex items-center gap-2">
          <Logo className="h-4 w-4 shrink-0" />
          <span className="text-charcoal-700 text-sm font-medium dark:text-neutral-200">
            {model.name}
          </span>
        </div>
        <StatusChip tone={model.tone}>{model.status}</StatusChip>
      </motion.div>
      <motion.div
        className="absolute inset-y-0 left-0 h-full w-[2px] bg-gradient-to-t from-transparent via-blue-500 to-transparent"
        initial={{ left: 0, opacity: 0 }}
        transition={{
          left: { duration: 1, delay: modelIndex, ease: 'easeInOut' },
          opacity: { duration: 1, delay: modelIndex, ease: 'easeInOut' },
        }}
        viewport={{ once: true }}
        whileInView={{ left: '100%', opacity: [0, 1, 1, 1, 0] }}
      >
        {FEATURE_MODEL_SCAN_PARTICLES[modelIndex].map((particle, particleIndex) => (
          <motion.div
            className="absolute top-1/2 left-1/2 h-1 w-1 text-xs text-blue-400"
            initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
            key={`${model.name}-particle-${particleIndex}`}
            transition={{
              duration: particle.duration,
              delay: modelIndex + particle.delay,
              ease: 'easeOut',
            }}
            viewport={{ once: true }}
            whileInView={{
              opacity: [0, 1, 0],
              scale: [0, particle.scale, 0],
              x: particle.x,
              y: particle.y,
              rotate: [0, 360],
            }}
          >
            ✨
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}

function FeatureModelsPanel({ content }) {
  return (
    <motion.div className="relative mx-auto mt-20 h-full max-h-70 min-h-40 w-[85%] rounded-2xl border-t border-gray-300 bg-white p-4 shadow-2xl dark:border-neutral-700 dark:bg-neutral-800">
      <motion.div
        className="shadow-aceternity absolute -top-10 -right-10 z-20 flex w-40 shrink-0 flex-col items-start rounded-lg bg-white text-xs dark:bg-neutral-900"
        initial={{ opacity: 0 }}
        transition={{ duration: 1, delay: 1.5 }}
        viewport={{ once: true }}
        whileInView={{ opacity: 1 }}
      >
        <div className="flex w-full items-center justify-between p-2">
          <div className="flex items-center gap-2 font-medium">
            <OpenAIBrandIcon />
            {content.apiCard.provider}
          </div>
          <p className="font-mono text-gray-600">{content.apiCard.keyLabel}</p>
        </div>
        <Divider />
        <StatusChip className="m-2" tone="default">
          {content.apiCard.status}
        </StatusChip>
      </motion.div>

      <div className="mb-4 flex gap-2">
        <div className="h-3 w-3 rounded-full bg-red-500" />
        <div className="h-3 w-3 rounded-full bg-yellow-500" />
        <div className="h-3 w-3 rounded-full bg-green-500" />
      </div>

      <div className="mt-12 flex items-center gap-2">
        <BrowserHeaderIcon />
        <span className="text-charcoal-700 text-sm font-medium dark:text-neutral-200">{content.title}</span>
        <span className="text-charcoal-700 rounded-lg border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200">
          {content.badge}
        </span>
      </div>
      <Divider className="mt-2" />

      {content.models.map((model, modelIndex) => (
        <FeatureModelRow key={model.name} model={model} modelIndex={modelIndex} />
      ))}
    </motion.div>
  )
}

export default FeatureModelsPanel
