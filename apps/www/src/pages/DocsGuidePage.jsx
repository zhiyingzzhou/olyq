import { useLocation, useParams } from 'react-router-dom'
import ConnectCtaSection from '../components/notus/sections/ConnectCtaSection.jsx'
import { getContent, getLocale } from '../components/olyq/LocaleContent.jsx'
import PageTitle from '../components/site/PageTitle.jsx'
import DocsGuideSection from '../components/site/pages/docs/DocsGuideSection.jsx'
import NotFoundSection from '../components/site/pages/not-found/NotFoundSection.jsx'

function DocsGuidePage() {
  const location = useLocation()
  const { slug } = useParams()
  const locale = getLocale(location.pathname)
  const { docs, home, notFound } = getContent(locale)
  const guide = docs.guides.find((item) => item.slug === slug)

  if (!guide) {
    return (
      <>
        <PageTitle
          description={notFound.description}
          lang={locale === 'en' ? 'en' : 'zh-CN'}
          title={notFound.meta.title}
        />
        <NotFoundSection content={notFound} />
      </>
    )
  }

  return (
    <main>
      <PageTitle
        description={guide.summary}
        image={guide.image?.light}
        lang={locale === 'en' ? 'en' : 'zh-CN'}
        title={`${guide.title} | Olyq`}
      />
      <DocsGuideSection
        basePath={locale === 'en' ? '/en/docs' : '/docs'}
        content={docs}
        guide={guide}
      />
      <ConnectCtaSection content={home.footer.cta} locale={locale} />
    </main>
  )
}

export default DocsGuidePage
