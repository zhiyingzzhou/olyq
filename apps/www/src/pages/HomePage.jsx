import { useLocation } from 'react-router-dom'
import BenefitsSection from '../components/notus/sections/BenefitsSection.jsx'
import ConnectCtaSection from '../components/notus/sections/ConnectCtaSection.jsx'
import FaqSection from '../components/notus/sections/FaqSection.jsx'
import FeatureSection from '../components/notus/sections/FeatureSection.jsx'
import GetOlyqSection from '../components/notus/sections/get-olyq/index.jsx'
import { HeroSection } from '../components/notus/sections/NavHeroSection.jsx'
import HowItWorksSection from '../components/notus/sections/HowItWorksSection.jsx'
import PageTitle from '../components/site/PageTitle.jsx'
import ProductScreensSection from '../components/olyq/ProductScreensSection.jsx'
import PrinciplesSection from '../components/olyq/PrinciplesSection.jsx'
import { getContent, getLocale } from '../components/olyq/LocaleContent.jsx'

function HomePage() {
  const location = useLocation()
  const locale = getLocale(location.pathname)
  const { home } = getContent(locale)

  return (
    <main>
      <PageTitle
        description={home.meta.description}
        image={home.hero.image}
        lang={locale === 'en' ? 'en' : 'zh-CN'}
        title={home.meta.title}
      />
      <HeroSection content={home.hero} locale={locale} />
      <PrinciplesSection content={home.principles} />
      <HowItWorksSection content={home.howItWorks} />
      <FeatureSection content={home.feature} />
      <ProductScreensSection content={home.useCases} />
      <BenefitsSection content={home.benefits} />
      <GetOlyqSection content={home.getOlyq} />
      <FaqSection content={home.faq} />
      <ConnectCtaSection content={home.footer.cta} locale={locale} />
    </main>
  )
}

export default HomePage
