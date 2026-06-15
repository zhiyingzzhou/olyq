import { useEffect, useMemo, useState } from 'react'
import { Divider, SectionEyebrow } from '../../../notus/shared.jsx'
import { joinClassNames } from '../../../notus/utils.js'
import SiteLink from '../../SiteLink.jsx'
import DocsImage from './components/DocsImage.jsx'
import GuideBlock from './components/GuideBlock.jsx'

function slugifyHeading(value) {
  return value
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const docsAnchorTargetClassName = 'scroll-mt-28 md:scroll-mt-32'

function DocsSideNav({ basePath, content, currentSlug, guideMap }) {
  return (
    <aside className="border-divide hidden px-5 py-8 lg:block lg:border-r">
      <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-1">
        <p className="font-mono text-[11px] leading-4 font-medium tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400">
          {content.labels.nav}
        </p>
        <nav className="mt-5 space-y-5" aria-label={content.labels.nav}>
          {content.groups.map((group) => (
            <section key={group.title}>
              <p className="px-2 font-mono text-[10px] leading-4 tracking-[0.16em] text-neutral-400 uppercase dark:text-neutral-500">
                {group.title}
              </p>
              <div className="mt-2 space-y-1">
                {group.guides.map((slug) => {
                  const item = guideMap.get(slug)
                  if (!item) return null
                  const active = item.slug === currentSlug

                  return (
                    <SiteLink
                      aria-current={active ? 'page' : undefined}
                      className={joinClassNames(
                        'relative block rounded-md border-l-2 px-3 py-1.5 text-[13px] leading-5 transition duration-200',
                        active
                          ? 'border-brand bg-gray-100 text-neutral-950 font-medium dark:bg-neutral-900 dark:text-white'
                          : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:bg-gray-50 hover:text-neutral-950 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:bg-neutral-900 dark:hover:text-white',
                      )}
                      href={`${basePath}/${item.slug}`}
                      key={item.slug}
                    >
                      {item.title}
                    </SiteLink>
                  )
                })}
              </div>
            </section>
          ))}
        </nav>
      </div>
    </aside>
  )
}

function DocsTocNav({ activeId, items, label }) {
  return (
    <aside className="border-divide hidden px-5 py-8 xl:block xl:border-l">
      <div className="sticky top-24">
        <p className="font-mono text-[11px] leading-4 font-medium tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400">
          {label}
        </p>
        <nav className="border-divide mt-5 border-l" aria-label={label}>
          {items.map((item) => {
            const active = item.id === activeId

            return (
              <a
                aria-current={active ? 'location' : undefined}
                className={joinClassNames(
                  '-ml-px block border-l px-3 py-1.5 text-[13px] leading-5 transition duration-200',
                  active
                    ? 'border-brand text-neutral-950 font-medium dark:text-white'
                    : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-950 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:text-white',
                )}
                href={`#${item.id}`}
                key={item.id}
              >
                {item.title}
              </a>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}

function useActiveSection(sectionIds) {
  const [activeId, setActiveId] = useState(sectionIds[0] ?? '')

  useEffect(() => {
    if (!sectionIds.length) return undefined
    const visible = new Map()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.set(entry.target.id, entry.boundingClientRect.top)
          } else {
            visible.delete(entry.target.id)
          }
        }

        if (visible.size > 0) {
          const next = [...visible.entries()].sort((left, right) => left[1] - right[1])[0]?.[0]
          if (next) setActiveId(next)
        }
      },
      { rootMargin: '-18% 0px -68% 0px', threshold: [0, 0.1, 0.25, 0.5] },
    )

    for (const id of sectionIds) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }

    return () => observer.disconnect()
  }, [sectionIds])

  return activeId
}

function DocsGuideSection({ basePath = '/docs', content, guide }) {
  const guideMap = useMemo(() => new Map(content.guides.map((item) => [item.slug, item])), [content.guides])
  const sectionAnchors = useMemo(() => guide.sections.map((section) => ({
    id: slugifyHeading(section.title),
    title: section.title,
  })), [guide.sections])
  const tocItems = useMemo(() => [
    { id: 'before-start', title: content.labels.beforeStart },
    ...sectionAnchors,
    ...(guide.next?.length ? [{ id: 'next', title: content.labels.next }] : []),
  ], [content.labels.beforeStart, content.labels.next, guide.next?.length, sectionAnchors])
  const sectionIds = useMemo(() => tocItems.map((item) => item.id), [tocItems])
  const activeSectionId = useActiveSection(sectionIds)

  return (
    <>
      <Divider />
      <article className="max-w-7xl mx-auto border-divide border-x">
        <div className="px-4 pt-10 pb-8 md:px-8 md:pt-16">
          <div className="mx-auto max-w-[42rem] text-center">
            <SectionEyebrow spread={16}>{guide.group}</SectionEyebrow>
            <h1 className="text-charcoal-700 mt-4 text-[2.5rem] leading-[1.14] font-medium md:text-[3.75rem] dark:text-neutral-100">
              {guide.title}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-gray-600 dark:text-gray-300">
              {guide.summary}
            </p>
          </div>
          <div className="mx-auto mt-10 max-w-3xl">
            <DocsImage image={guide.image} />
          </div>
        </div>

        <div className="grid grid-cols-1 border-t border-divide lg:grid-cols-[15rem_minmax(0,44rem)] xl:grid-cols-[15rem_minmax(0,44rem)_13rem]">
          <DocsSideNav
            basePath={basePath}
            content={content}
            currentSlug={guide.slug}
            guideMap={guideMap}
          />

          <div className="px-4 py-10 md:px-8">
            <SiteLink className="mb-8 inline-flex text-sm font-medium text-neutral-500 hover:text-neutral-950 lg:hidden dark:text-neutral-400 dark:hover:text-white" href={basePath}>
              {content.labels.nav}
            </SiteLink>

            <section className={joinClassNames(docsAnchorTargetClassName, 'border-divide border-b pb-8')} id="before-start">
              <h2 className="text-charcoal-700 text-xl font-medium dark:text-neutral-100">
                {content.labels.beforeStart}
              </h2>
              <ul className="mt-5 space-y-3 text-base leading-8 text-neutral-600 dark:text-neutral-300">
                {guide.prerequisites.map((item) => (
                  <li className="border-divide border-l pl-4" key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <div className="pt-8">
              {guide.sections.map((section, index) => (
                <GuideBlock
                  anchorClassName={docsAnchorTargetClassName}
                  id={sectionAnchors[index].id}
                  isBoundary={section.title === content.labels.boundary}
                  key={section.title}
                  section={section}
                />
              ))}
            </div>

            {guide.next?.length ? (
              <section className={joinClassNames(docsAnchorTargetClassName, 'border-divide mt-4 border-t pt-8')} id="next">
                <h2 className="text-charcoal-700 text-xl font-medium dark:text-neutral-100">
                  {content.labels.next}
                </h2>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {guide.next.map((slug) => {
                    const nextGuide = guideMap.get(slug)
                    if (!nextGuide) return null

                    return (
                      <SiteLink
                        className="border-divide rounded-lg border p-4 transition duration-200 hover:bg-gray-50 dark:hover:bg-neutral-900"
                        href={`${basePath}/${nextGuide.slug}`}
                        key={slug}
                      >
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">{nextGuide.group}</p>
                        <p className="text-charcoal-700 mt-1 font-medium dark:text-neutral-100">{nextGuide.title}</p>
                      </SiteLink>
                    )
                  })}
                </div>
              </section>
            ) : null}
          </div>

          <DocsTocNav activeId={activeSectionId} items={tocItems} label={content.labels.tableOfContents} />
        </div>
      </article>
      <Divider />
    </>
  )
}

export default DocsGuideSection
