import { Divider, SectionEyebrow } from '../../shared.jsx'
import { joinClassNames } from '../../utils.js'
import SiteLink from '../../../site/SiteLink.jsx'
import {
  primaryButtonClassName,
  secondarySurfaceClassName,
} from '../../../site/interactionStyles.js'

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="mt-0.5 h-4 w-4 shrink-0 text-brand"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function GetOlyqPathCard({ path }) {
  return (
    <article className="flex min-h-full flex-col p-6 md:p-8">
      <div className="md:min-h-[6.5rem]">
        <h3 className="text-charcoal-700 text-xl font-medium dark:text-neutral-100">{path.title}</h3>
        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-neutral-300">{path.description}</p>
      </div>

      <SiteLink
        className={joinClassNames(
          'mt-6 w-full rounded-xl px-6 py-2 text-center text-sm font-medium transition duration-150 active:scale-[0.98] sm:text-base md:mt-0',
          secondarySurfaceClassName,
        )}
        href={path.ctaLink}
      >
        {path.ctaText}
      </SiteLink>

      <ol className="mt-6 space-y-3 text-sm leading-6 text-gray-600 dark:text-neutral-300">
        {path.steps.map((step) => (
          <li className="flex gap-3" key={step}>
            <CheckIcon />
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </article>
  )
}

function GetOlyqPathsSection({ content }) {
  return (
    <section>
      <div className="max-w-7xl mx-auto border-divide flex flex-col items-center justify-center border-x px-4 pt-10 pb-10 text-center md:pt-16 md:pb-14">
        <SectionEyebrow spread={14}>{content.eyebrow}</SectionEyebrow>
        <h2 className="text-charcoal-700 mt-4 max-w-3xl text-center text-2xl font-medium tracking-tight md:text-3xl lg:text-4xl dark:text-neutral-100">
          {content.title}
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-gray-600 md:text-base dark:text-gray-300">
          {content.description}
        </p>
        <SiteLink
          className={joinClassNames(
            'mt-7 rounded-xl px-6 py-2 text-center text-sm font-medium transition duration-150 active:scale-[0.98] sm:text-base',
            primaryButtonClassName,
          )}
          href={content.primaryAction.href}
        >
          {content.primaryAction.label}
        </SiteLink>
      </div>
      <Divider />
      <div className="max-w-7xl mx-auto border-divide border-x">
        <div className="divide-divide grid grid-cols-1 divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
          {content.paths.map((path) => (
            <GetOlyqPathCard key={path.title} path={path} />
          ))}
        </div>
      </div>
      <Divider />
    </section>
  )
}

function GetOlyqSection({ content }) {
  return <GetOlyqPathsSection content={content} />
}

export default GetOlyqSection
