import { useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { useTheme } from 'next-themes'
import {
  CornerMarker,
  Divider,
  SectionEyebrow,
} from '../../shared.jsx'
import { HERO_SPRING_TRANSITION } from './constants.js'
import { PrimaryCtaLink, SecondaryCtaLink } from './nav.jsx'

function HeroImageSection({ content }) {
  const { resolvedTheme } = useTheme()
  const containerRef = useRef(null)
  const motionX = useMotionValue(0)
  const motionY = useMotionValue(0)
  const springX = useSpring(motionX, HERO_SPRING_TRANSITION)
  const springY = useSpring(motionY, HERO_SPRING_TRANSITION)
  const translateX = useTransform(springX, [-0.5, 0.5], [-40, 40])
  const translateY = useTransform(springY, [-0.5, 0.5], [-40, 40])
  const imageSrc = resolvedTheme === 'dark'
    ? (content.imageDark ?? content.image)
    : (content.imageLight ?? content.image)

  return (
    <>
      <div className="max-w-7xl mx-auto border-divide relative flex items-start justify-start border-x bg-gray-100 p-2 perspective-distant md:p-4 lg:p-8 dark:bg-neutral-800">
        <CornerMarker left top />
        <CornerMarker right top />
        <CornerMarker bottom left />
        <CornerMarker bottom right />
        <div className="relative w-full">
          <motion.div
            animate={{ opacity: 1 }}
            className="relative z-10 h-full w-full cursor-pointer overflow-hidden rounded-lg border border-gray-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.12),0_1px_2px_rgba(15,23,42,0.06)] dark:border-neutral-700 dark:bg-neutral-950 dark:shadow-[0_24px_90px_rgba(0,0,0,0.55)]"
            initial={{ opacity: 0 }}
            ref={containerRef}
            onMouseLeave={() => {
              motionX.set(0)
              motionY.set(0)
            }}
            onMouseMove={(event) => {
              if (!containerRef.current) {
                return
              }

              const bounds = containerRef.current.getBoundingClientRect()
              const centerX = bounds.left + bounds.width / 2
              const centerY = bounds.top + bounds.height / 2
              motionX.set((event.clientX - centerX) / bounds.width)
              motionY.set((event.clientY - centerY) / bounds.height)
            }}
            style={{ translateX, translateY }}
            transition={{ opacity: { duration: 0.3, delay: 1 } }}
          >
            <img
              alt={content.imageAlt}
              className="block w-full"
              data-nimg="1"
              decoding="async"
              draggable={false}
              height="1860"
              fetchPriority="high"
              src={imageSrc}
              style={{ color: 'transparent' }}
              width="3312"
            />
          </motion.div>
          <div className="absolute inset-0 z-0 m-auto h-[90%] w-[95%] rounded-lg border border-(--pattern-fg) bg-[image:repeating-linear-gradient(315deg,_var(--pattern-fg)_0,_var(--pattern-fg)_1px,_transparent_0,_transparent_50%)] bg-[size:10px_10px] bg-fixed" />
        </div>
      </div>
      <Divider />
    </>
  )
}

function getHeroTitleClassName(locale) {
  const base = 'mt-4 max-w-5xl text-center text-3xl font-medium text-black md:text-4xl lg:text-6xl dark:text-white'

  if (locale === 'en') {
    return `${base} tracking-tight leading-[1.05] lg:leading-[1.02]`
  }

  return `${base} leading-[1.18] md:leading-[1.16] lg:leading-[1.12]`
}

export function HeroSection({ content, locale }) {
  const isEn = locale === 'en'
  const primaryAction = content.actions[0]
  const secondaryAction = content.actions[1]

  return (
    <>
      <Divider />
      <div className="max-w-7xl mx-auto border-divide flex flex-col items-center justify-center border-x px-4 pt-10 pb-10 md:pt-32 md:pb-20">
        <SectionEyebrow spread={68}>{content.eyebrow}</SectionEyebrow>
        <h1 className={getHeroTitleClassName(locale)}>
          <span className="block">{content.titleLines[0]}</span>
          <span className="block">
            {content.titleSecondLead}
            {isEn ? ' ' : ''}
            <span className="text-brand">{content.titleAccent}</span>
          </span>
        </h1>
        <h2 className="mx-auto mt-6 max-w-lg text-center text-sm font-medium tracking-tight text-gray-600 md:text-sm lg:text-base dark:text-gray-300">
          {content.description}
        </h2>
        <div className="mt-6 flex items-center gap-4">
          <PrimaryCtaLink href={primaryAction.href}>{primaryAction.label}</PrimaryCtaLink>
          {secondaryAction ? (
            <SecondaryCtaLink href={secondaryAction.href}>{secondaryAction.label}</SecondaryCtaLink>
          ) : null}
        </div>
      </div>
      <Divider />
      <HeroImageSection content={content} />
    </>
  )
}
