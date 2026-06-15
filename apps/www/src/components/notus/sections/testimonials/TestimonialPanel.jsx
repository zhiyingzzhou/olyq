import { AnimatePresence, motion } from 'framer-motion'
import { joinClassNames } from '../../utils.js'

function TestimonialPanel({ activeItem }) {
  return (
    <>
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className="divide-divide grid grid-cols-1 items-stretch divide-x bg-gray-100 md:h-[28rem] md:grid-cols-4 dark:bg-neutral-800"
          exit={{ opacity: 0, scale: 0.98 }}
          initial={{ opacity: 0, scale: 0.98 }}
          key={activeItem.src}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
        >
          <div className="col-span-4 flex flex-col gap-10 px-4 py-10 md:flex-row md:py-0 lg:col-span-3">
            <img
              alt={activeItem.name}
              className="m-4 hidden aspect-square rounded-xl object-cover md:block"
              draggable={false}
              height="400"
              src={activeItem.avatar}
              width="400"
            />
            <div className="flex flex-col items-start justify-between gap-4 py-4 pr-8">
              <div>
                <img
                  alt={activeItem.company}
                  className={joinClassNames(
                    'object-contain dark:invert dark:filter',
                    activeItem.logoClassName,
                  )}
                  draggable={false}
                  height="200"
                  src={activeItem.src}
                  width="200"
                />
                <blockquote className="text-charcoal-900 mt-6 text-xl leading-relaxed dark:text-neutral-100">
                  "{activeItem.quote}"
                </blockquote>
              </div>
              <div className="flex items-end justify-between gap-4">
                <img
                  alt={activeItem.name}
                  className="aspect-square w-10 rounded-xl object-cover md:hidden"
                  draggable={false}
                  height="400"
                  src={activeItem.avatar}
                  width="400"
                />
                <div>
                  <p className="text-charcoal-900 font-semibold dark:text-neutral-100">
                    {activeItem.name}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-neutral-400">
                    {activeItem.position}, {activeItem.company}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="hidden flex-col justify-end px-4 pb-4 lg:col-span-1 lg:flex">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <p className="text-charcoal-700 text-7xl font-semibold dark:text-neutral-100">
                  {activeItem.sideText}
                </p>
                <p className="text-sm text-gray-700 dark:text-neutral-400">
                  {activeItem.sideSubText}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  )
}

export default TestimonialPanel
