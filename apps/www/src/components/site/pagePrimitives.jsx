import { motion } from 'framer-motion'
import RollingNumber from '../notus/RollingNumber.jsx'
import { Divider, SectionEyebrow } from '../notus/shared.jsx'
import { joinClassNames } from '../notus/utils.js'
import SiteLink from './SiteLink.jsx'
import { primaryButtonClassName } from './interactionStyles.js'

export function BoxedSection({ children, className = '' }) {
  return (
    <section
      className={joinClassNames(
        'max-w-7xl mx-auto border-divide border-x px-4 md:px-8',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function BoxedDivider() {
  return <Divider />
}

export function PageSurface({
  children,
  className = '',
  innerClassName = '',
}) {
  return (
    <div
      className={joinClassNames(
        'rounded-[2rem] border border-neutral-200 bg-white shadow-[0_10px_40px_rgba(0,0,0,0.05)] dark:border-neutral-800 dark:bg-neutral-950',
        className,
      )}
    >
      <div className={joinClassNames('p-6 md:p-8 lg:p-10', innerClassName)}>{children}</div>
    </div>
  )
}

export function SectionHeading({
  align = 'left',
  description,
  eyebrow,
  title,
}) {
  return (
    <div
      className={joinClassNames(
        'flex flex-col gap-4',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
      )}
    >
      {eyebrow ? <SectionEyebrow spread={16}>{eyebrow}</SectionEyebrow> : null}
      <h2 className="text-charcoal-700 text-3xl font-medium tracking-tight md:text-4xl dark:text-neutral-100">
        {title}
      </h2>
      {description ? (
        <p className="max-w-2xl text-base leading-7 text-gray-600 dark:text-gray-300">
          {description}
        </p>
      ) : null}
    </div>
  )
}

export function MetricCard({ label, value }) {
  const numericValue = Number.parseFloat(value.replace(/[^\d.]/g, ''))
  const prefix = value.startsWith('$') ? '$' : ''
  const suffix = value.replace(/^[\d$.]+/, '')

  return (
    <motion.div
      className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_1px_20px_rgba(0,0,0,0.04)] dark:border-neutral-800 dark:bg-neutral-950"
      initial={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.35 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
    >
      <div className="text-brand text-3xl font-medium md:text-4xl">
        {Number.isNaN(numericValue) ? (
          value
        ) : (
          <RollingNumber prefix={prefix} suffix={suffix} value={numericValue} />
        )}
      </div>
      <p className="mt-3 text-sm font-medium text-gray-600 dark:text-neutral-400">{label}</p>
    </motion.div>
  )
}

export function InfoCard({ description, title }) {
  return (
    <motion.div
      className="rounded-2xl bg-gray-50 p-6 dark:bg-neutral-900"
      initial={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.35 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
    >
      <h3 className="text-charcoal-700 text-lg font-medium dark:text-neutral-100">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-gray-600 dark:text-neutral-400">{description}</p>
    </motion.div>
  )
}

export function PageCtaBanner({
  description,
  href,
  label,
  title,
}) {
  return (
    <>
      <BoxedSection className="py-12 md:py-16">
        <div className="rounded-3xl bg-gray-100 px-6 py-10 dark:bg-neutral-900 md:px-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-charcoal-700 text-3xl font-medium tracking-tight dark:text-neutral-100">
                {title}
              </h2>
              <p className="mt-4 text-base leading-7 text-gray-600 dark:text-neutral-400">
                {description}
              </p>
            </div>
            <SiteLink
              className={joinClassNames(
                'inline-flex rounded-xl px-6 py-3 text-sm font-medium transition duration-150 active:scale-[0.98]',
                primaryButtonClassName,
              )}
              href={href}
            >
              {label}
            </SiteLink>
          </div>
        </div>
      </BoxedSection>
      <BoxedDivider />
    </>
  )
}
