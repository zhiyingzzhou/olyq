import { useId } from 'react'
import { motion } from 'framer-motion'
import { joinClassNames } from '../../utils.js'

export function FeatureBlock({ children, className = '' }) {
  return <div className={joinClassNames('p-4 md:p-8', className)}>{children}</div>
}

export function FeatureHeading({ children, className = '' }) {
  return (
    <h3 className={joinClassNames('text-charcoal-700 text-lg font-medium dark:text-neutral-100', className)}>
      {children}
    </h3>
  )
}

export function FeatureDescription({ children, className = '' }) {
  return (
    <p className={joinClassNames('mt-2 text-base text-gray-600 dark:text-gray-300', className)}>
      {children}
    </p>
  )
}

export function FeatureNodeIconBox({ children, className = '', icon }) {
  return (
    <div
      className={joinClassNames(
        'relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-200 bg-white shadow-md dark:border-neutral-600 dark:bg-neutral-900',
        className,
      )}
    >
      {icon}
      {children}
    </div>
  )
}

export function FeatureToolLabel({ children, icon, text }) {
  return (
    <div className="relative flex items-center gap-2">
      {icon}
      <span className="text-charcoal-700 text-sm font-medium dark:text-neutral-200">{text}</span>
      {children}
    </div>
  )
}

function FeatureConnectorGradient({ animate, color, gradientId, initial }) {
  return (
    <motion.linearGradient
      animate={animate}
      gradientUnits="userSpaceOnUse"
      id={gradientId}
      initial={initial}
      transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, repeatType: 'loop', ease: 'easeInOut' }}
    >
      <stop stopColor="var(--color-line)" />
      <stop offset="0.33" stopColor={color} />
      <stop offset="0.66" stopColor={color} />
      <stop offset="1" stopColor="var(--color-line)" />
    </motion.linearGradient>
  )
}

export function FeatureAnimatedLineMeeting({ className = '' }) {
  const gradientId = useId()

  return (
    <svg className={className} fill="none" height="33" viewBox="0 0 312 33" width="312" xmlns="http://www.w3.org/2000/svg">
      <line stroke="var(--color-line)" strokeLinecap="round" x1="0.5" x2="311.5" y1="1" y2="1" />
      <line stroke="var(--color-line)" strokeLinecap="round" x1="311.5" x2="311.5" y1="1" y2="32" />
      <line stroke={`url(#${gradientId})`} strokeLinecap="round" x1="0.5" x2="311.5" y1="1" y2="1" />
      <defs>
        <FeatureConnectorGradient
          animate={{ x1: '105%', x2: '120%', y1: 1, y2: 0 }}
          color="#F17463"
          gradientId={gradientId}
          initial={{ x1: '-20%', x2: '0%', y1: 1, y2: 0 }}
        />
      </defs>
    </svg>
  )
}

export function FeatureAnimatedLineCode({ className = '' }) {
  const gradientId = useId()

  return (
    <svg className={className} fill="none" height="2" viewBox="0 0 323 2" width="323" xmlns="http://www.w3.org/2000/svg">
      <line stroke="var(--color-line)" strokeLinecap="round" x1="0.5" x2="322.5" y1="1" y2="1" />
      <line stroke={`url(#${gradientId})`} strokeLinecap="round" x1="0.5" x2="322.5" y1="1" y2="1" />
      <defs>
        <FeatureConnectorGradient
          animate={{ x1: '105%', x2: '120%', y1: 1, y2: 0 }}
          color="var(--color-blue-500)"
          gradientId={gradientId}
          initial={{ x1: '-20%', x2: '0%', y1: 1, y2: 0 }}
        />
      </defs>
    </svg>
  )
}

export function FeatureAnimatedLineSupport({ className = '' }) {
  const gradientId = useId()

  return (
    <svg className={className} fill="none" height="32" viewBox="0 0 326 32" width="326" xmlns="http://www.w3.org/2000/svg">
      <line stroke="var(--color-line)" x1="0" x2="325" y1="31" y2="31" />
      <line stroke="var(--color-line)" strokeLinecap="round" x1="325.5" x2="325.5" y1="31" y2="1" />
      <line stroke={`url(#${gradientId})`} x1="0" x2="325" y1="31" y2="31" />
      <defs>
        <FeatureConnectorGradient
          animate={{ x1: '105%', x2: '120%' }}
          color="var(--color-yellow-500)"
          gradientId={gradientId}
          initial={{ x1: '-20%', x2: '0%', y1: 1, y2: 0 }}
        />
      </defs>
    </svg>
  )
}
