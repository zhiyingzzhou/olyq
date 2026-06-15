import { localizedContent } from '../../content/siteContent.js'

export function getLocale(pathname) {
  return pathname.startsWith('/en') ? 'en' : 'zh'
}

export function getContent(locale) {
  return localizedContent[locale] ?? localizedContent.zh
}

export function withLocalePath(locale, path) {
  if (locale === 'en') {
    return `/en${path === '/' ? '' : path}`
  }

  return path
}

