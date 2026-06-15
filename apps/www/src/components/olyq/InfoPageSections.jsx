import { Divider, SectionEyebrow } from '../notus/shared.jsx'
import { primaryButtonClassName, secondarySurfaceClassName } from '../site/interactionStyles.js'
import SiteLink from '../site/SiteLink.jsx'
import { joinClassNames } from '../notus/utils.js'

function InfoHero({ eyebrow, primary, secondary, title, body }) {
  return (
    <>
      <Divider />
      <section className="max-w-7xl mx-auto border-divide flex flex-col items-center border-x px-4 py-16 text-center md:py-24">
        <SectionEyebrow spread={28}>{eyebrow}</SectionEyebrow>
        <h1 className="text-charcoal-700 mt-4 max-w-3xl text-3xl font-medium tracking-tight md:text-5xl dark:text-neutral-100">
          {title}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-sm leading-7 text-gray-600 md:text-base dark:text-gray-300">
          {body}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {primary ? (
            <SiteLink className={joinClassNames('rounded-xl px-6 py-2 text-sm font-medium sm:text-base', primaryButtonClassName)} href={primary.href}>
              {primary.label}
            </SiteLink>
          ) : null}
          {secondary ? (
            <SiteLink className={joinClassNames('rounded-xl px-6 py-2 text-sm font-medium sm:text-base', secondarySurfaceClassName)} href={secondary.href}>
              {secondary.label}
            </SiteLink>
          ) : null}
        </div>
      </section>
      <Divider />
    </>
  )
}

function InfoGrid({ items }) {
  return (
    <>
      <section className="max-w-7xl mx-auto border-divide border-x">
        <div className="border-divide divide-divide grid grid-cols-1 divide-y border-y md:grid-cols-3 md:divide-x md:divide-y-0">
          {items.map((item) => (
            <article className="p-6 md:p-8" key={item.title}>
              <h2 className="text-charcoal-700 text-xl font-medium dark:text-neutral-100">{item.title}</h2>
              <p className="mt-3 text-sm leading-7 text-gray-600 dark:text-neutral-300">{item.body}</p>
              {item.points ? (
                <ul className="mt-5 space-y-3 text-sm leading-6 text-gray-600 dark:text-neutral-300">
                  {item.points.map((point) => (
                    <li className="border-divide border-l pl-3" key={point}>{point}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      </section>
      <Divider />
    </>
  )
}

function StepsSection({ title, steps }) {
  return (
    <>
      <section className="max-w-7xl mx-auto border-divide border-x px-4 py-16 md:px-8">
        <h2 className="text-charcoal-700 text-center text-2xl font-medium tracking-tight md:text-4xl dark:text-neutral-100">
          {title}
        </h2>
        <div className="border-divide divide-divide mt-10 grid grid-cols-1 divide-y border-y md:grid-cols-2 md:divide-x md:divide-y-0">
          {steps.map((group) => (
            <article className="p-6 md:p-8" key={group.title}>
              <h3 className="text-primary text-lg font-medium">{group.title}</h3>
              <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm leading-7 text-gray-600 dark:text-neutral-300">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>
      <Divider />
    </>
  )
}

export { InfoGrid, InfoHero, StepsSection }

