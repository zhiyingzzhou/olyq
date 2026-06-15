import { Outlet, useLocation } from 'react-router-dom'
import { useState } from 'react'
import ConnectFooterSection from '../components/notus/sections/ConnectFooterSection.jsx'
import {
  SiteNavWithTheme,
} from '../components/notus/sections/NavHeroSection.jsx'
import ScrollToTop from '../components/site/ScrollToTop.jsx'
import { localizedContent } from '../content/siteContent.js'
import { getLocale } from '../components/olyq/LocaleContent.jsx'

function SiteLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()
  const locale = getLocale(location.pathname)
  const { footer } = localizedContent[locale].home

  return (
    <main className="h-full bg-white antialiased dark:bg-black">
      <ScrollToTop />
      <SiteNavWithTheme
        mobileMenuOpen={mobileMenuOpen}
        onMobileMenuToggle={() => setMobileMenuOpen((value) => !value)}
      />
      <ScrollLayoutContent />
      <ConnectFooterSection content={footer} />
    </main>
  )
}

function ScrollLayoutContent() {
  return <Outlet />
}

export default SiteLayout
