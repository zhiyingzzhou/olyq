import { useEffect, useId, useRef, useState } from 'react'
import { motion, useMotionValue, useTransform } from 'framer-motion'
import {
  AnthropicBrandIcon,
  OpenAIBrandIcon,
} from '../../icons.jsx'
import { BrowserHeaderIcon } from '../../sectionPrimitives.jsx'
import { Divider, NotusMarkIcon, PatternSurface } from '../../shared.jsx'
import { joinClassNames } from '../../utils.js'
import WorkflowNodeCard from './WorkflowNodeCard.jsx'

function WorkflowLeftConnection() {
  const gradientId = useId().replaceAll(':', '')
  const maskId = useId().replaceAll(':', '')

  return (
    <motion.svg
      animate={{ opacity: 1 }}
      className="absolute top-12 -left-32"
      fill="none"
      height="97"
      initial={{ opacity: 0 }}
      transition={{ duration: 1 }}
      viewBox="0 0 128 97"
      width="128"
      xmlns="http://www.w3.org/2000/svg"
    >
      <mask id={maskId} fill="var(--color-line)">
        <path d="M127.457 0.0891113L127.576 95.9138L0.939007 96.0718L0.839368 16.2472C0.828338 7.41063 7.98283 0.238242 16.8194 0.227212L127.457 0.0891113Z" />
      </mask>
      <path
        d="M127.457 0.0891113L127.576 95.9138L127.457 0.0891113ZM-0.0609919 96.0731L-0.160632 16.2484C-0.172351 6.85959 7.4293 -0.761068 16.8181 -0.772787L16.8206 1.22721C8.53637 1.23755 1.82903 7.96166 1.83937 16.2459L1.93901 96.0706L-0.0609919 96.0731ZM-0.160632 16.2484C-0.172351 6.85959 7.4293 -0.761068 16.8181 -0.772787L127.455 -0.910888L127.458 1.08911L16.8206 1.22721C8.53637 1.23755 1.82903 7.96166 1.83937 16.2459L-0.160632 16.2484ZM127.576 95.9138L0.939007 96.0718L127.576 95.9138Z"
        fill="#EAEDF1"
        mask={`url(#${maskId})`}
      />
      <path
        d="M127.457 0.0891113L127.576 95.9138L127.457 0.0891113ZM-0.0609919 96.0731L-0.160632 16.2484C-0.172351 6.85959 7.4293 -0.761068 16.8181 -0.772787L16.8206 1.22721C8.53637 1.23755 1.82903 7.96166 1.83937 16.2459L1.93901 96.0706L-0.0609919 96.0731ZM-0.160632 16.2484C-0.172351 6.85959 7.4293 -0.761068 16.8181 -0.772787L127.455 -0.910888L127.458 1.08911L16.8206 1.22721C8.53637 1.23755 1.82903 7.96166 1.83937 16.2459L-0.160632 16.2484ZM127.576 95.9138L0.939007 96.0718L127.576 95.9138Z"
        fill={`url(#${gradientId})`}
        mask={`url(#${maskId})`}
      />
      <defs>
        <motion.linearGradient
          animate={{ x1: '20%', x2: '0%', y1: '90%', y2: '220%' }}
          gradientUnits="userSpaceOnUse"
          id={gradientId}
          initial={{ x1: '100%', x2: '90%', y1: '90%', y2: '80%' }}
          transition={{ duration: 5, repeat: Infinity, repeatDelay: 2 }}
        >
          <stop offset="0" stopColor="var(--color-line)" stopOpacity="0.5" />
          <stop offset="0.5" stopColor="#5787FF" stopOpacity="1" />
          <stop offset="1" stopColor="var(--color-line)" stopOpacity="0" />
        </motion.linearGradient>
      </defs>
    </motion.svg>
  )
}

function WorkflowRightConnection() {
  const gradientId = useId().replaceAll(':', '')
  const maskId = useId().replaceAll(':', '')

  return (
    <motion.svg
      animate={{ opacity: 1 }}
      className="absolute top-12 -right-32"
      fill="none"
      height="96"
      initial={{ opacity: 0 }}
      transition={{ duration: 1 }}
      viewBox="0 0 128 96"
      width="128"
      xmlns="http://www.w3.org/2000/svg"
    >
      <mask id={maskId} fill="var(--color-line)">
        <path d="M0.619629 0L0.500018 95.8247L127.137 95.9827L127.237 16.1581C127.248 7.32152 120.093 0.149131 111.257 0.138101L0.619629 0Z" />
      </mask>
      <path
        d="M0.619629 0L0.500018 95.8247L0.619629 0ZM128.137 95.984L128.237 16.1593C128.249 6.77047 120.647 -0.850179 111.258 -0.861898L111.256 1.1381C119.54 1.14844 126.247 7.87255 126.237 16.1568L126.137 95.9815L128.137 95.984ZM128.237 16.1593C128.249 6.77047 120.647 -0.850179 111.258 -0.861898L0.620877 -0.999999L0.618381 0.999999L111.256 1.1381C119.54 1.14844 126.247 7.87255 126.237 16.1568L128.237 16.1593ZM0.500018 95.8247L127.137 95.9827L0.500018 95.8247Z"
        fill="#EAEDF1"
        mask={`url(#${maskId})`}
      />
      <path
        d="M0.619629 0L0.500018 95.8247L0.619629 0ZM128.137 95.984L128.237 16.1593C128.249 6.77047 120.647 -0.850179 111.258 -0.861898L111.256 1.1381C119.54 1.14844 126.247 7.87255 126.237 16.1568L126.137 95.9815L128.137 95.984ZM128.237 16.1593C128.249 6.77047 120.647 -0.850179 111.258 -0.861898L0.620877 -0.999999L0.618381 0.999999L111.256 1.1381C119.54 1.14844 126.247 7.87255 126.237 16.1568L128.237 16.1593ZM0.500018 95.8247L127.137 95.9827L0.500018 95.8247Z"
        fill={`url(#${gradientId})`}
        mask={`url(#${maskId})`}
      />
      <defs>
        <motion.linearGradient
          animate={{ x1: '100%', x2: '110%', y1: '110%', y2: '140%' }}
          gradientUnits="userSpaceOnUse"
          id={gradientId}
          initial={{ x1: '-10%', x2: '0%', y1: '0%', y2: '0%' }}
          transition={{ duration: 5, repeat: Infinity, repeatDelay: 2 }}
        >
          <stop offset="0" stopColor="white" stopOpacity="0.5" />
          <stop offset="0.5" stopColor="#F17463" stopOpacity="1" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </motion.linearGradient>
      </defs>
    </motion.svg>
  )
}

function WorkflowVerticalConnection() {
  const gradientId = useId().replaceAll(':', '')

  return (
    <motion.svg
      animate={{ opacity: 1 }}
      className="absolute top-24 right-[107px]"
      fill="none"
      height="56"
      initial={{ opacity: 0 }}
      transition={{ duration: 1 }}
      viewBox="0 0 2 56"
      width="2"
      xmlns="http://www.w3.org/2000/svg"
    >
      <line stroke="var(--color-line)" strokeWidth="2" x1="1" x2="1" y1="56" />
      <line stroke={`url(#${gradientId})`} strokeWidth="1" x1="1" x2="1" y1="56" />
      <defs>
        <motion.linearGradient
          animate={{ x1: '0%', x2: '0%', y1: '90%', y2: '100%' }}
          gradientUnits="userSpaceOnUse"
          id={gradientId}
          initial={{ x1: '0%', x2: '0%', y1: '-100%', y2: '-90%' }}
          transition={{ duration: 5, repeat: Infinity, repeatDelay: 2 }}
        >
          <stop offset="0" stopColor="var(--color-line)" stopOpacity="1" />
          <stop offset="0.5" stopColor="#F17463" stopOpacity="0.5" />
          <stop offset="1" stopColor="#F17463" stopOpacity="0" />
        </motion.linearGradient>
      </defs>
    </motion.svg>
  )
}

function WorkflowGraphic({ content }) {
  return (
    <div className="mt-12 flex flex-col items-center">
      <div className="relative">
        <WorkflowNodeCard
          cta={content.primary.cta}
          logo={<NotusMarkIcon />}
          subtitle={content.primary.subtitle}
          title={content.primary.title}
        />
        <WorkflowLeftConnection />
        <WorkflowRightConnection />
        <WorkflowVerticalConnection />
      </div>

      <div className="mt-12 flex flex-row gap-4.5">
        <WorkflowNodeCard
          cta={content.models[0].cta}
          delay={0.2}
          logo={<AnthropicBrandIcon />}
          subtitle={content.models[0].subtitle}
          title={content.models[0].title}
          tone="danger"
        />
        <WorkflowNodeCard
          cta={content.models[1].cta}
          delay={0.4}
          logo={<NotusMarkIcon />}
          subtitle={content.models[1].subtitle}
          title={content.models[1].title}
        />
        <WorkflowNodeCard
          cta={content.models[2].cta}
          delay={0.6}
          logo={<OpenAIBrandIcon />}
          subtitle={content.models[2].subtitle}
          title={content.models[2].title}
          tone="success"
        />
      </div>
    </div>
  )
}

function ToolsGraphic({ content }) {
  const [metrics, setMetrics] = useState(null)

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setMetrics({
        taskBarWidth: 100 * Math.random(),
        integrationWidths: Array.from({ length: 3 }, () => ({
          from: 20 + 20 * Math.random(),
          to: 70 + 30 * Math.random(),
        })),
      })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [])

  if (!metrics) {
    return null
  }

  return (
    <div className="relative flex h-full w-full items-center justify-between">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="relative h-70 w-60 -translate-x-2 rounded-2xl border-t border-gray-300 bg-white p-4 shadow-2xl md:translate-x-0 dark:border-neutral-700 dark:bg-neutral-900"
        initial={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.5 }}
      >
        <div className="absolute -top-4 -right-4 flex h-14 w-14 items-center justify-center rounded-lg bg-white shadow-xl">
          <PatternSurface />
          <OpenAIBrandIcon className="relative z-20 h-8 w-8" />
        </div>
        <div className="mt-12 flex items-center gap-2">
          <BrowserHeaderIcon />
          <div className="text-charcoal-700 text-sm font-medium dark:text-neutral-200">{content.pageTitle}</div>
        </div>
        <Divider className="mt-2" />
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-charcoal-700 text-[10px] leading-loose font-normal md:text-xs dark:text-neutral-200">
              {content.prompt
                .split(/(\s+)/)
                .map((word, index) => (
                  <motion.span
                    animate={{ opacity: 1 }}
                    className="inline-block"
                    initial={{ opacity: 0 }}
                    key={`${word}-${index}`}
                    transition={{ duration: 0.2, delay: 0.02 * index, ease: 'linear' }}
                  >
                    {word === ' ' ? '\u00A0' : word}
                  </motion.span>
                ))}
            </span>
          </div>
        </div>
        <div className="mt-2 flex flex-col">
          {[0, 1].map((index) => (
            <motion.div
              animate={{ width: `${metrics.taskBarWidth}%` }}
              className="mt-2 h-4 w-full rounded-full bg-gray-200 dark:bg-neutral-800"
              initial={{ width: '0%' }}
              key={`task-bar-${index}`}
              transition={{
                duration: 4,
                delay: 0.2 * index,
                ease: 'easeInOut',
                repeat: Infinity,
                repeatType: 'reverse',
              }}
            />
          ))}
        </div>
      </motion.div>

      <motion.div
        animate={{ opacity: 1 }}
        className="absolute inset-x-0 z-30 hidden items-center justify-center md:flex"
        initial={{ opacity: 0 }}
        transition={{ duration: 1, delay: 1 }}
      >
        <div className="size-3 rounded-full border-2 border-blue-500 bg-white dark:bg-neutral-800" />
        <div className="h-[2px] w-38 bg-blue-500" />
        <div className="size-3 rounded-full border-2 border-blue-500 bg-white dark:bg-neutral-800" />
      </motion.div>

      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="relative h-70 w-60 translate-x-10 rounded-2xl border-t border-gray-300 bg-white p-4 shadow-2xl md:translate-x-0 dark:border-neutral-700 dark:bg-neutral-900"
        initial={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.5, delay: 1 }}
      >
        <div className="absolute -top-4 -left-4 flex h-14 w-14 items-center justify-center rounded-lg bg-white shadow-xl dark:bg-neutral-800">
          <PatternSurface />
          <NotusMarkIcon className="relative z-20 h-8 w-8" />
        </div>
        <div className="mt-12 flex items-center gap-2">
          <BrowserHeaderIcon className="dark:text-neutral-200" />
          <div className="text-charcoal-700 text-xs font-medium md:text-sm dark:text-neutral-200">
            {content.providersTitle}
          </div>
          <span className="text-charcoal-700 rounded-lg border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200">
            {content.providersBadge}
          </span>
        </div>
        <Divider className="mt-2" />
        {content.providers.map((item, index) => (
          <div className="mt-4 flex items-center justify-between gap-2" key={item.name}>
            <div className="flex items-center gap-2">
              {index === 0 ? <OpenAIBrandIcon className="h-4 w-4 shrink-0" /> : <AnthropicBrandIcon className="h-4 w-4 shrink-0" />}
              <span className="text-charcoal-700 text-xs font-medium md:text-sm dark:text-neutral-200">
                {item.name}
              </span>
            </div>
            <div className="rounded-sm border border-blue-500 bg-blue-50 px-2 py-0.5 text-xs text-blue-500">
              {item.status}
            </div>
          </div>
        ))}
        <div className="mt-2 flex flex-col">
          {metrics.integrationWidths.map((item, index) => (
            <motion.div
              animate={{ width: `${item.to}%` }}
              className="mt-2 h-4 w-full rounded-full bg-gray-200 dark:bg-neutral-800"
              initial={{ width: `${item.from}%` }}
              key={`integration-bar-${index}`}
              transition={{
                duration: 4,
                delay: 0.2 * index,
                ease: 'easeInOut',
                repeat: Infinity,
                repeatType: 'reverse',
              }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  )
}

function DeploymentEntry({ branch, subtitle, title, variant = 'default' }) {
  return (
    <div className="mx-auto flex w-full max-w-sm items-center justify-between rounded-lg p-3">
      <div className="flex items-center gap-2">
        <div
          className={joinClassNames(
            'flex h-6 w-6 items-center justify-center rounded-md',
            variant === 'success' ? 'bg-green-200' : '',
            variant === 'danger' ? 'bg-red-200' : '',
            variant === 'warning' ? 'bg-yellow-200' : '',
            variant === 'default' ? 'bg-gray-200' : '',
          )}
        >
          <DeployStatusIcon
            className={joinClassNames(
              'h-4 w-4',
              variant === 'success' ? 'text-green-500' : '',
              variant === 'danger' ? 'text-red-500' : '',
              variant === 'warning' ? 'text-yellow-500' : '',
              variant === 'default' ? 'text-gray-500' : '',
            )}
          />
        </div>
        <span className="text-charcoal-700 text-xs font-medium sm:text-sm">{title}</span>
      </div>
      <div className="ml-2 flex flex-row items-center gap-2">
        <span className="text-charcoal-700 text-xs font-normal">{subtitle}</span>
        <div className="size-1 rounded-full bg-gray-400" />
        <span className="text-charcoal-700 text-xs font-normal">{branch}</span>
      </div>
    </div>
  )
}

function DeployStatusIcon({ className = '' }) {
  return (
    <svg className={className} fill="none" height="14" viewBox="0 0 14 14" width="14" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10.2 11.8609C11.0698 11.8609 11.775 11.1558 11.775 10.2859C11.775 9.41609 11.0698 8.71094 10.2 8.71094C9.33015 8.71094 8.625 9.41609 8.625 10.2859C8.625 11.1558 9.33015 11.8609 10.2 11.8609Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.05"
      />
      <path
        d="M3.9002 5.56089C4.77004 5.56089 5.4752 4.85574 5.4752 3.98589C5.4752 3.11604 4.77004 2.41089 3.9002 2.41089C3.03035 2.41089 2.3252 3.11604 2.3252 3.98589C2.3252 4.85574 3.03035 5.56089 3.9002 5.56089Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.05"
      />
      <path
        d="M7.5752 3.98608H9.1502C9.42867 3.98608 9.69574 4.09671 9.89266 4.29362C10.0896 4.49053 10.2002 4.75761 10.2002 5.03608V8.71108"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.05"
      />
      <path
        d="M6.5249 10.286H4.9499C4.67142 10.286 4.40435 10.1754 4.20744 9.9785C4.01053 9.78158 3.8999 9.51451 3.8999 9.23603V5.56104"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.05"
      />
    </svg>
  )
}

function DeploymentCard({ center, index, item, scrollY }) {
  const scale = useTransform(
    scrollY,
    [
      center + -((index - 2) * 68),
      center + -((index - 1) * 68),
      center + -(68 * index),
      center + -((index + 1) * 68),
      center + -((index + 2) * 68),
    ],
    [0.85, 0.95, 1.1, 0.95, 0.85],
  )
  const background = useTransform(
    scrollY,
    [center + -((index - 1) * 68), center + -(68 * index), center + -((index + 1) * 68)],
    ['#FFFFFF', '#f17463', '#FFFFFF'],
  )
  const borderColor = useTransform(
    scrollY,
    [center + -((index - 1) * 68), center + -(68 * index), center + -((index + 1) * 68)],
    ['#FFFFFF', '#f17463', '#FFFFFF'],
  )

  return (
    <motion.div
      className="mx-auto mt-4 w-full max-w-sm shrink-0 rounded-2xl shadow-xl"
      style={{ background, borderColor, scale }}
    >
      <DeploymentEntry {...item} />
    </motion.div>
  )
}

function DeployGraphic({ content }) {
  const rootRef = useRef(null)
  const [height, setHeight] = useState(0)
  const scrollY = useMotionValue(0)
  const items = content.items
  const rollingItems = [...items, ...items, ...items]
  const center = (height - 64) / 2
  const totalHeight = 68 * rollingItems.length

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      setHeight(entries[0]?.contentRect.height ?? 0)
    })

    if (rootRef.current) {
      observer.observe(rootRef.current)
    }

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let frameId
    let previous = performance.now()

    const tick = (now) => {
      const delta = (now - previous) / 1000
      previous = now
      let next = scrollY.get() - 30 * delta

      // 这里用环形偏移包裹滚动值，避免在无限队列里重建 DOM，
      // 这样部署队列的流动感会更接近原站那种连续滚动的效果。
      if (Math.abs(next) >= totalHeight / 3) {
        next += totalHeight / 3
      }

      scrollY.set(next)
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [scrollY, totalHeight])

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      ref={rootRef}
      style={{
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
      }}
    >
      <motion.div
        className="absolute left-1/2 flex w-full -translate-x-1/2 flex-col items-center"
        style={{ y: scrollY }}
      >
        {rollingItems.map((item, index) => (
          <DeploymentCard
            center={center}
            index={index}
            item={item}
            key={`${index}-${item.title}`}
            scrollY={scrollY}
          />
        ))}
      </motion.div>
    </div>
  )
}

export { DeployGraphic, ToolsGraphic, WorkflowGraphic }
