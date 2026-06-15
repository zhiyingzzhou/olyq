import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Divider } from '../shared.jsx'
import { joinClassNames } from '../utils.js'

function LogoCloudSection({ content }) {
  const items = content.items
  const [visibleIndices, setVisibleIndices] = useState(() => Array.from({ length: 8 }, (_, index) => index))

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const remaining = items.map((_, index) => index).filter((index) => !visibleIndices.includes(index))

      if (remaining.length === 0) {
        return
      }

      const slotIndex = Math.floor(Math.random() * visibleIndices.length)
      const nextLogoIndex = remaining[Math.floor(Math.random() * remaining.length)]

      setVisibleIndices((current) => {
        const next = [...current]
        next[slotIndex] = nextLogoIndex
        return next
      })
    }, 3000)

    return () => window.clearInterval(intervalId)
  }, [items, visibleIndices])

  return (
    <>
      <div className="max-w-7xl mx-auto border-divide border-x">
        <h2 className="py-8 text-center font-mono text-sm tracking-tight text-neutral-500 uppercase dark:text-gray-300">
          {content.title}
        </h2>
        <div className="border-divide grid grid-cols-2 border-t md:grid-cols-4">
          {visibleIndices.map((itemIndex, gridIndex) => {
            const item = items[itemIndex]

            return (
              <div
                className={joinClassNames(
                  'border-divide group relative overflow-hidden',
                  'border-r md:border-r-0',
                  gridIndex % 2 === 0 ? 'border-r' : '',
                  gridIndex < 6 ? 'border-b md:border-b-0' : '',
                  gridIndex % 4 !== 3 ? 'md:border-r' : '',
                  gridIndex < 4 ? 'md:border-b' : '',
                )}
                key={`logo-cell-${gridIndex}`}
              >
                <div className="animate-move-left-to-right bg-brand/5 absolute inset-x-0 bottom-0 h-full translate-y-full transition-all duration-200 group-hover:translate-y-0" />
                <AnimatePresence initial={false} mode="wait">
                  <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    className="group flex min-h-32 items-center justify-center p-4 py-10 grayscale"
                    exit={{ opacity: 0, y: -100 }}
                    initial={{ opacity: 0, y: 100 }}
                    key={item.src}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    whileHover={{ opacity: 1 }}
                  >
                    <img
                      alt={item.title}
                      className={joinClassNames(
                        'h-8 w-auto object-contain transition-all duration-500 dark:invert dark:filter',
                        item.className,
                      )}
                      src={item.src}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>
      <Divider />
    </>
  )
}

export default LogoCloudSection
