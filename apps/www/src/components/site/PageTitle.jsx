import { useEffect } from 'react'

const setMetaContent = (selector, content) => {
  const element = document.head.querySelector(selector)

  if (element && content) {
    element.setAttribute('content', content)
  }
}

function PageTitle({
  description,
  image = '/product/olyq-page-context-zh-light.png',
  lang = 'zh-CN',
  title,
}) {
  useEffect(() => {
    document.title = title
    document.documentElement.lang = lang

    setMetaContent('meta[name="description"]', description)
    setMetaContent('meta[property="og:title"]', title)
    setMetaContent('meta[property="og:description"]', description)
    setMetaContent('meta[property="og:image"]', image)
    setMetaContent('meta[name="twitter:title"]', title)
    setMetaContent('meta[name="twitter:description"]', description)
    setMetaContent('meta[name="twitter:image"]', image)
  }, [description, image, lang, title])

  return null
}

export default PageTitle
