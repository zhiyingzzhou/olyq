import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MessagesSquare, PanelsTopLeft } from 'lucide-react'
import {
  ConnectingLineHorizontal,
  ConnectingLineVertical,
  NotificationBellIcon,
} from '../../sectionPrimitives.jsx'
import { Divider, NotusMarkIcon } from '../../shared.jsx'

function BenefitsShowcaseCard({ content, rotatingText }) {
  const [textIndex, setTextIndex] = useState(0)

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTextIndex((value) => (value + 1) % rotatingText.length)
    }, 4000)

    return () => window.clearInterval(intervalId)
  }, [rotatingText])

  return (
    <div className="relative flex min-h-40 flex-col justify-end overflow-hidden rounded-lg bg-gray-50 p-4 md:p-5 dark:bg-neutral-900">
      <div className="absolute inset-0 bg-[radial-gradient(var(--color-dots)_1px,transparent_1px)] mask-radial-from-10% [background-size:10px_10px] shadow-xl" />
      <div className="flex items-center justify-center">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-200 bg-white shadow-md dark:border-neutral-600 dark:bg-neutral-900">
          <PanelsTopLeft className="size-6 text-blue-500" strokeWidth={2} />
        </div>
        <ConnectingLineHorizontal />
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-gray-200 p-px shadow-xl dark:bg-neutral-700">
          <div className="absolute inset-0 scale-[1.4] animate-spin rounded-full bg-conic [background-image:conic-gradient(at_center,transparent,var(--color-blue-500)_20%,transparent_30%)] [animation-duration:2s]" />
          <div className="via-brand absolute inset-0 scale-[1.4] animate-spin rounded-full bg-conic [background-image:conic-gradient(at_center,transparent,var(--color-brand)_20%,transparent_30%)] [animation-delay:1s] [animation-duration:2s]" />
          <div className="relative z-20 flex h-full w-full items-center justify-center rounded-[5px] bg-white dark:bg-neutral-900">
            <NotusMarkIcon className="size-6" />
          </div>
        </div>
        <ConnectingLineHorizontal />
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-200 bg-white shadow-md dark:border-neutral-600 dark:bg-neutral-900">
          <MessagesSquare className="size-6 text-cyan-400" strokeWidth={2} />
        </div>
      </div>
      <div className="relative z-20 flex flex-col items-center justify-center">
        <ConnectingLineVertical />
        <div className="rounded-sm border border-blue-500 bg-blue-50 px-2 py-0.5 text-xs text-blue-500 dark:bg-blue-900 dark:text-white">
          {content.badge}
        </div>
      </div>
      <div className="h-60 w-full translate-x-10 translate-y-10 overflow-hidden rounded-md bg-gray-200 p-px shadow-xl dark:bg-neutral-700">
        <div className="absolute inset-0 scale-[1.4] animate-spin rounded-full bg-conic from-transparent via-blue-500 via-20% to-transparent to-30% blur-2xl [animation-duration:4s]" />
        <div className="via-brand absolute inset-0 scale-[1.4] animate-spin rounded-full bg-conic from-transparent via-20% to-transparent to-30% blur-2xl [animation-delay:2s] [animation-duration:4s]" />
        <div className="relative z-20 h-full w-full rounded-[5px] bg-white dark:bg-neutral-900">
          <div className="flex items-center justify-between p-4">
            <div className="flex gap-1">
              <div className="size-2 rounded-full bg-red-400" />
              <div className="size-2 rounded-full bg-yellow-400" />
              <div className="size-2 rounded-full bg-green-400" />
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="shadow-aceternity mr-2 flex items-center gap-1 rounded-sm bg-white px-2 py-1 text-xs text-neutral-500 dark:bg-neutral-700 dark:text-white"
                exit={{ opacity: 0, y: 10 }}
                initial={{ opacity: 0, y: -10 }}
                key={rotatingText[textIndex]}
                transition={{ duration: 0.3 }}
              >
                <NotificationBellIcon className="size-3" />
                <span>{rotatingText[textIndex]}</span>
              </motion.div>
            </AnimatePresence>
          </div>
          <Divider />
          <div className="flex h-full flex-row">
            <div className="h-full w-14 bg-gray-200 dark:bg-neutral-800" />
            <div className="w-full gap-y-4 p-4">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-neutral-300">{content.title}</h2>
              <div className="mt-4 flex flex-col gap-y-3 mask-b-from-50%">
                {content.items.map((item, index) => (
                  <div className="space-y-1" key={item.label}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">{item.label}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-neutral-700">
                      <motion.div
                        animate={{ width: `${item.width}%` }}
                        className="h-full rounded-full bg-neutral-300 dark:bg-neutral-400"
                        initial={{ width: 0 }}
                        transition={{
                          duration: 1.2,
                          delay: 0.4 + 0.1 * index,
                          ease: 'easeOut',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BenefitsShowcaseCard
