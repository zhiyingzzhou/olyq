import { useLocation } from 'react-router-dom'
import NotFoundSection from '../components/site/pages/not-found/NotFoundSection.jsx'
import PageTitle from '../components/site/PageTitle.jsx'
import { getContent, getLocale } from '../components/olyq/LocaleContent.jsx'

function NotFoundPage() {
  const location = useLocation()
  const locale = getLocale(location.pathname)
  const { notFound } = getContent(locale)

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

export default NotFoundPage
