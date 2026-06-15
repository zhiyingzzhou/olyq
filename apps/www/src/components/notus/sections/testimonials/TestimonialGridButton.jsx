import { AnimatePresence, motion } from 'framer-motion'
import { PixelCanvasSurface } from '../../shared.jsx'
import { joinClassNames } from '../../utils.js'

function TestimonialGridButton({ index, isActive, item, onSelect }) {
  return (
    <button
      className={joinClassNames(
        'border-divide group relative overflow-hidden',
        'border-r md:border-r-0',
        index % 2 === 0 ? 'border-r' : '',
        index < 6 ? 'border-b md:border-b-0' : '',
        'md:border-r-0',
        index % 4 !== 3 ? 'md:border-r' : '',
        index < 4 ? 'md:border-b' : '',
      )}
      onClick={onSelect}
      type="button"
    >
      {isActive ? (
        <PixelCanvasSurface
          backgroundColor="var(--color-canvas-fill)"
          className="absolute inset-0 scale-[1.01] opacity-20"
          duration={2500}
          fillColor="var(--color-canvas)"
          isActive
          key={`${item.src}${index}canvas`}
          size={2.5}
        />
      ) : null}
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          animate={{ y: 0, opacity: 0.7 }}
          className="group flex min-h-32 items-center justify-center p-4 py-10 opacity-70 grayscale transition-all duration-500 hover:opacity-100"
          exit={{ opacity: 0 }}
          initial={{ y: 80, opacity: 0 }}
          key={`${item.src}${index}`}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
          whileHover={{ opacity: 1 }}
        >
          <img
            alt={item.company}
            className={joinClassNames(
              'h-8 w-auto object-contain transition-all duration-500 dark:invert dark:filter',
              item.logoClassName,
            )}
            draggable={false}
            src={item.src}
          />
        </motion.div>
      </AnimatePresence>
    </button>
  )
}

export default TestimonialGridButton
