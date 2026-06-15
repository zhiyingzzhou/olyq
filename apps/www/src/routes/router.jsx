import { createBrowserRouter } from 'react-router-dom'
import SiteLayout from '../layouts/SiteLayout.jsx'

function lazyPage(importer, exportName = 'default') {
  return async () => {
    const module = await importer()
    return { Component: module[exportName] ?? module.default }
  }
}

const localizedChildren = [
  {
    index: true,
    lazy: lazyPage(() => import('../pages/HomePage.jsx')),
  },
  {
    path: 'open-source-privacy',
    lazy: lazyPage(() => import('../pages/OpenSourcePrivacyPage.jsx')),
  },
  {
    path: 'docs',
    lazy: lazyPage(() => import('../pages/DocsPage.jsx')),
  },
  {
    path: 'docs/:slug',
    lazy: lazyPage(() => import('../pages/DocsGuidePage.jsx')),
  },
]

export const router = createBrowserRouter([
  {
    path: '/',
    Component: SiteLayout,
    children: [
      ...localizedChildren,
      {
        path: 'en',
        children: localizedChildren,
      },
      {
        path: '*',
        lazy: lazyPage(() => import('../pages/NotFoundPage.jsx')),
      },
    ],
  },
])
