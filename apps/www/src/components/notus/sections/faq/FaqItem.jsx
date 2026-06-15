import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import useMeasure from 'react-use-measure'
import FaqChevronIcon from './icons.jsx'

function FaqItem({ answer, index, isOpen, onToggle, question }) {
  const [measureRef, bounds] = useMeasure()
  const height = useMemo(() => (isOpen ? bounds.height : 0), [bounds.height, isOpen])

  return (
    <div className="group">
      <button
        aria-controls={`faq-panel-${index}`}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 px-8 py-6 text-left"
        onClick={onToggle}
        type="button"
      >
        <span className="text-charcoal-700 text-base font-medium dark:text-neutral-100">
          {question}
        </span>
        <motion.span
          animate={{ rotate: 180 * Number(Boolean(isOpen)) }}
          className="text-charcoal-700 shadow-aceternity inline-flex size-6 items-center justify-center rounded-md bg-white transition-transform duration-200 dark:bg-neutral-950 dark:text-neutral-100"
          initial={false}
          transition={{ duration: 0.25 }}
        >
          <FaqChevronIcon />
        </motion.span>
      </button>
      <motion.div
        animate={{ height, opacity: Number(Boolean(isOpen)) }}
        aria-hidden={!isOpen}
        className="overflow-hidden px-8"
        id={`faq-panel-${index}`}
        initial={false}
        onClick={onToggle}
        role="region"
        transition={{ height: { duration: 0.35 }, opacity: { duration: 0.2 } }}
      >
        <div className="pr-2 pb-5 pl-2 sm:pr-0 sm:pl-0" ref={measureRef}>
          <AnimatePresence mode="popLayout">
            {isOpen ? (
              <motion.p
                animate={{ opacity: 1, y: 0 }}
                className="text-gray-600 dark:text-neutral-400"
                exit={{ opacity: 0, y: -6 }}
                initial={{ opacity: 0, y: -6 }}
                key="content"
                transition={{ duration: 0.25 }}
              >
                {answer}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}

export default FaqItem
