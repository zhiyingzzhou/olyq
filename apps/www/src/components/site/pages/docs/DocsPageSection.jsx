import { Divider, SectionEyebrow } from '../../../notus/shared.jsx'
import SiteLink from '../../SiteLink.jsx'
import DocsImage from './components/DocsImage.jsx'

function getGuideMap(guides) {
  return new Map(guides.map((guide) => [guide.slug, guide]))
}

function DocsPageSection({ basePath = '/docs', content }) {
  const guideMap = getGuideMap(content.guides)
  const startGuides = ['quick-start', 'model-platforms', 'browser-context']
    .map((slug) => guideMap.get(slug))
    .filter(Boolean)
  const indexGroups = content.groups
    .map((group) => ({
      ...group,
      guides: group.guides.filter((slug) => !startGuides.some((guide) => guide.slug === slug)),
    }))
    .filter((group) => group.guides.length > 0)

  return (
    <>
      <Divider />
      <section className="max-w-7xl mx-auto border-divide flex flex-col items-center border-x pt-10 md:pt-20 md:pb-10">
        <div className="px-4 pb-12 text-center md:px-8">
          <SectionEyebrow spread={20}>{content.hero.eyebrow}</SectionEyebrow>
          <h1 className="text-charcoal-700 mt-4 text-[42px] leading-[1.12] font-medium md:text-[60px] dark:text-neutral-100">
            {content.hero.title}
          </h1>
          <p className="mx-auto mt-4 max-w-xl px-4 text-sm leading-7 font-medium text-gray-600 md:text-base dark:text-gray-300">
            {content.hero.description}
          </p>
        </div>

        <div className="border-divide divide-divide mt-2 w-full border-y">
          <section className="divide-divide grid grid-cols-1 divide-y lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {startGuides.map((guide) => (
              <SiteLink
                className="group block p-4 transition duration-200 hover:bg-gray-50 md:p-8 dark:hover:bg-neutral-900"
                href={`${basePath}/${guide.slug}`}
                key={guide.slug}
              >
                <DocsImage image={guide.image} />
                <div className="mt-5">
                  <p className="text-brand text-sm font-medium">{content.labels.startHere}</p>
                  <h2 className="text-primary mt-2 text-lg font-medium tracking-tight">
                    {guide.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-neutral-400">
                    {guide.summary}
                  </p>
                </div>
              </SiteLink>
            ))}
          </section>

          <div className="divide-divide divide-y">
            {indexGroups.map((group) => (
              <section className="grid grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)]" key={group.title}>
                <div className="border-divide px-4 py-8 md:px-8 lg:border-r">
                  <h2 className="text-charcoal-700 text-xl font-medium dark:text-neutral-100">
                    {group.title}
                  </h2>
                </div>
                <div className="grid grid-cols-1 divide-y divide-divide md:grid-cols-2 md:divide-x md:divide-y-0">
                  {group.guides.map((slug) => {
                    const guide = guideMap.get(slug)
                    if (!guide) return null

                    return (
                      <SiteLink
                        className="block px-4 py-6 transition duration-200 hover:bg-gray-50 md:px-8 dark:hover:bg-neutral-900"
                        href={`${basePath}/${guide.slug}`}
                        key={guide.slug}
                      >
                        <h3 className="text-charcoal-700 mt-2 text-xl font-medium tracking-tight dark:text-neutral-100">
                          {guide.title}
                        </h3>
                        <p className="mt-3 text-sm leading-7 text-gray-600 dark:text-neutral-400">
                          {guide.summary}
                        </p>
                      </SiteLink>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>
      <Divider />
    </>
  )
}

export default DocsPageSection
