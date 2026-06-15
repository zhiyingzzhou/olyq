import { Divider } from '../../shared.jsx'
import { joinClassNames } from '../../utils.js'
import {
  footerSocialLinkClassName,
  primaryButtonClassName,
} from '../../../site/interactionStyles.js'
import SiteLink from '../../../site/SiteLink.jsx'
import ConnectOrbitRings from './orbit.jsx'
import FooterSection from './footerLinks.jsx'

function GitHubIcon() {
  return (
    <svg aria-hidden="true" className="size-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 .5C5.73.5.75 5.61.75 12.01c0 5.1 3.22 9.43 7.69 10.96.56.1.77-.25.77-.55v-2.15c-3.13.69-3.79-1.36-3.79-1.36-.51-1.33-1.25-1.68-1.25-1.68-1.02-.71.08-.7.08-.7 1.13.08 1.73 1.19 1.73 1.19 1 .1.63 2.67 1.46 3.23.2-.74.59-1.25 1.07-1.54-2.5-.29-5.13-1.27-5.13-5.66 0-1.25.44-2.27 1.16-3.07-.12-.29-.5-1.46.11-3.04 0 0 .95-.31 3.1 1.17A10.54 10.54 0 0 1 12 6.92c.96 0 1.92.13 2.82.38 2.15-1.48 3.09-1.17 3.09-1.17.62 1.58.24 2.75.12 3.04.72.8 1.16 1.82 1.16 3.07 0 4.4-2.64 5.36-5.15 5.65.61.54 1.15 1.6 1.15 3.22v4.78c0 .3.2.66.78.55 4.46-1.53 7.68-5.86 7.68-10.96C23.25 5.61 18.27.5 12 .5Z" />
    </svg>
  )
}

function getConnectCtaTitleClassName(locale) {
  const base = 'text-charcoal-700 relative z-10 text-center text-2xl font-medium md:text-3xl lg:text-6xl dark:text-neutral-100'

  if (locale === 'en') {
    return `${base} tracking-tight leading-[1.06] lg:leading-[1.02]`
  }

  return `${base} leading-[1.18] md:leading-[1.14] lg:leading-[1.10]`
}

function ConnectCtaSection({ content, locale }) {
  return (
    <>
      <div className="max-w-7xl mx-auto border-divide relative flex min-h-60 flex-col items-center justify-center overflow-hidden border-x px-4 py-4 md:min-h-120">
        <ConnectOrbitRings
          className="absolute inset-x-0 -top-120 mask-b-from-30%"
          size={800}
        />
        <h2 className={getConnectCtaTitleClassName(locale)}>
          <span className="block">{content.titleLines[0]}</span>
          <span className="block">{content.titleLines[1]}</span>
        </h2>
        <SiteLink
          className={joinClassNames(
            'block rounded-xl px-6 py-2 text-center text-sm font-medium transition duration-150 active:scale-[0.98] sm:text-base',
            primaryButtonClassName,
            'relative z-20 mt-4',
          )}
          href={content.href}
        >
          {content.label}
        </SiteLink>
      </div>
      <Divider />
    </>
  )
}

function FooterSocialBar({ content }) {
  const platformIcons = {
    github: GitHubIcon,
  }

  return (
    <div className="my-4 flex flex-col items-center justify-between px-4 pt-8 md:flex-row">
      <p className="text-footer-link text-sm">{content.copyright}</p>
      <div className="mt-4 flex items-center gap-4 md:mt-0">
        {content.socialLinks.map((link) => {
          const Icon = platformIcons[link.platform]

          return (
            <a
              aria-label={link.platform}
              className={footerSocialLinkClassName}
              href={link.href}
              key={link.platform}
              rel="noreferrer"
              target="_blank"
            >
              <Icon />
            </a>
          )
        })}
      </div>
    </div>
  )
}

function ConnectFooterSection({ content }) {
  return (
    <div className="max-w-7xl mx-auto">
      <FooterSection content={content} />
      <FooterSocialBar content={content} />
    </div>
  )
}

export { ConnectCtaSection }
export default ConnectFooterSection
