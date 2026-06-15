import { useLocation } from 'react-router-dom'
import ConnectCtaSection from '../components/notus/sections/ConnectCtaSection.jsx'
import DocsPageSection from '../components/site/pages/docs/DocsPageSection.jsx'
import PageTitle from '../components/site/PageTitle.jsx'
import { getContent, getLocale } from '../components/olyq/LocaleContent.jsx'

function DocsPage() {
  const location = useLocation()
  const locale = getLocale(location.pathname)
  const { docs, home } = getContent(locale)
  const firstImage = docs.guides[0]?.image

  return (
    <main>
      <PageTitle
        description={docs.meta.description}
        image={firstImage?.light}
        lang={locale === 'en' ? 'en' : 'zh-CN'}
        title={docs.meta.title}
      />
      <DocsPageSection basePath={locale === 'en' ? '/en/docs' : '/docs'} content={docs} />
      <ConnectCtaSection content={home.footer.cta} locale={locale} />
    </main>
  )
}

export default DocsPage
