import { NotusMarkIcon } from '../../shared.jsx'
import SiteLink from '../../../site/SiteLink.jsx'
import {
  primaryButtonSurfaceClassName,
} from '../../../site/interactionStyles.js'

function FooterSection({ content }) {
  return (
    <div className="grid grid-cols-1 px-4 py-20 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
      <div className="mb-6 sm:col-span-2 md:col-span-4 lg:col-span-3">
        <SiteLink className="flex items-center gap-2" href="/">
          <NotusMarkIcon />
          <span className="text-2xl font-medium">{content.brand.title}</span>
        </SiteLink>
        <p className="mt-4 max-w-lg text-left text-sm font-medium tracking-tight text-gray-600 md:text-sm lg:text-base dark:text-gray-300">
          {content.brand.tagline}
        </p>
        <SiteLink className={`${primaryButtonSurfaceClassName} mt-4 mb-8 inline-flex rounded-xl px-4 py-2 text-sm font-medium lg:mb-0`} href={content.brand.cta.href}>
          {content.brand.cta.label}
        </SiteLink>
      </div>

      {content.linkGroups.map((group, index) => (
        <div
          className={`col-span-1 mb-4 flex flex-col gap-2 md:col-span-1 md:mb-0${index === content.linkGroups.length - 1 ? ' lg:col-span-1' : ''}`}
          key={group.title}
        >
          <p className="text-sm font-medium text-gray-600">{group.title}</p>
          {group.links.map((link) => (
            <SiteLink className="text-footer-link my-2 text-sm font-medium" href={link.href} key={link.label}>
              {link.label}
            </SiteLink>
          ))}
        </div>
      ))}
    </div>
  )
}

export default FooterSection
