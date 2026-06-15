import { useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { Divider, PatternSurface } from '../../shared.jsx'
import { joinClassNames } from '../../utils.js'
import BrowserCardStatus from './BrowserCardStatus.jsx'
import { CARD_TILT_SPRING } from './constants.js'

function WorkflowNodeCard({
  title,
  subtitle,
  logo,
  cta,
  tone = 'default',
  className = '',
  delay = 0,
}) {
  const cardRef = useRef(null)
  const motionX = useMotionValue(0)
  const motionY = useMotionValue(0)
  const springX = useSpring(motionX, CARD_TILT_SPRING)
  const springY = useSpring(motionY, CARD_TILT_SPRING)
  const translateX = useTransform(springX, [-0.5, 0.5], [-20, 20])
  const translateY = useTransform(springY, [-0.5, 0.5], [-20, 20])

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={joinClassNames('relative h-full text-xs', className)}
      initial={{ opacity: 0, y: -20 }}
      ref={cardRef}
      transition={{ duration: 0.5, delay }}
    >
      <PatternSurface className="bg-fixed" />
      <div className="absolute inset-x-0 -top-1.5 mx-auto size-3 rounded-full border-2 border-gray-300 bg-white dark:border-neutral-700 dark:bg-neutral-900" />
      <motion.div
        className="shadow-aceternity relative z-20 flex w-54 shrink-0 flex-col items-start rounded-lg bg-white dark:bg-neutral-900"
        onMouseLeave={() => {
          motionX.set(0)
          motionY.set(0)
        }}
        onMouseMove={(event) => {
          if (!cardRef.current) {
            return
          }

          const bounds = cardRef.current.getBoundingClientRect()
          const centerX = bounds.left + bounds.width / 2
          const centerY = bounds.top + bounds.height / 2

          motionX.set((event.clientX - centerX) / bounds.width)
          motionY.set((event.clientY - centerY) / bounds.height)
        }}
        style={{ translateX, translateY }}
      >
        <div className="flex w-full items-center justify-between p-2 md:p-4">
          <div className="flex items-center gap-2 font-medium">
            {logo}
            {title}
          </div>
          <p className="font-mono text-gray-600">{subtitle}</p>
        </div>
        <Divider />
        <BrowserCardStatus className="m-4" tone={tone}>
          {cta}
        </BrowserCardStatus>
      </motion.div>
    </motion.div>
  )
}

export default WorkflowNodeCard
