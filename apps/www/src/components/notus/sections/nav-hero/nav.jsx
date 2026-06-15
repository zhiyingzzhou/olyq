import { useEffect } from 'react'
import {
  AnimatePresence,
  motion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { NotusMarkIcon } from '../../shared.jsx'
import { joinClassNames } from '../../utils.js'
import SiteLink from '../../../site/SiteLink.jsx'
import {
  navTextHoverClassName,
  primaryButtonClassName,
  secondarySurfaceClassName,
  themeToggleClassName,
} from '../../../site/interactionStyles.js'
import ThemeToggle from './theme.jsx'
import { useThemeToggle } from './useThemeToggle.js'
import { localizedContent } from '../../../../content/siteContent.js'

function getLocaleFromPath(pathname) {
  return pathname.startsWith('/en') ? 'en' : 'zh'
}

function NavLinks({ className = '', links }) {
  return (
    <div className={joinClassNames('flex items-center gap-10', className)}>
      {links.map((link) => (
        <SiteLink className={navTextHoverClassName} href={link.href} key={link.href}>
          {link.label}
        </SiteLink>
      ))}
    </div>
  )
}

export function PrimaryCtaLink({
  children = 'Get Olyq',
  className = '',
  ...props
}) {
  return (
    <SiteLink
      className={joinClassNames(
        'block rounded-xl px-6 py-2 text-center text-sm font-medium transition duration-150 active:scale-[0.98] sm:text-base',
        primaryButtonClassName,
        className,
      )}
      href="https://github.com/zzy/olyq/releases/latest"
      {...props}
    >
      {children}
    </SiteLink>
  )
}

export function SecondaryCtaLink(props) {
  const { children, href, ...rest } = props
  if (!href) return null

  return (
    <SiteLink
      className={joinClassNames(
        'block rounded-xl px-6 py-2 text-center text-sm font-medium active:scale-[0.98] sm:text-base',
        secondarySurfaceClassName,
      )}
      href={href}
      {...rest}
    >
      {children}
    </SiteLink>
  )
}

function NavBrand({ href = '/' }) {
  return (
    <SiteLink className="flex items-center gap-2" href={href}>
      <NotusMarkIcon />
      <span className="text-2xl font-medium">Olyq</span>
    </SiteLink>
  )
}

function LanguageToggleLink({ language }) {
  return (
    <SiteLink
      aria-label={language.ariaLabel}
      className={joinClassNames(
        themeToggleClassName,
        'h-9 min-w-9 px-2 text-xs font-semibold text-neutral-700 dark:text-neutral-200',
      )}
      href={language.href}
    >
      {language.shortLabel ?? language.label}
    </SiteLink>
  )
}

function MobileMenuButton({ onMobileMenuToggle }) {
  return (
    <button
      aria-label="Toggle menu"
      className="shadow-aceternity flex size-6 flex-col items-center justify-center rounded-md"
      onClick={onMobileMenuToggle}
      type="button"
    >
      <svg
        className="size-4 shrink-0 text-gray-600"
        fill="none"
        height="24"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M0 0h24v24H0z" fill="none" stroke="none" />
        <path d="M4 6l16 0" />
        <path d="M4 12l16 0" />
        <path d="M4 18l16 0" />
      </svg>
    </button>
  )
}

function CloseMenuButton({ onClick }) {
  return (
    <button
      aria-label="Close menu"
      className="shadow-aceternity flex size-6 flex-col items-center justify-center rounded-md"
      onClick={onClick}
      type="button"
    >
      <svg
        className="size-4 shrink-0 text-gray-600"
        fill="none"
        height="24"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M6 6l12 12" />
        <path d="M18 6l-12 12" />
      </svg>
    </button>
  )
}

function MobileNavOverlay({ nav, onClose, onThemeToggle, theme }) {
  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[60] h-full w-full bg-white shadow-lg dark:bg-neutral-900"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="absolute right-4 bottom-4">
        <ThemeToggle onToggle={onThemeToggle} theme={theme} />
      </div>
      <div className="flex items-center justify-between p-2">
        <NavBrand href={nav.brandHref} />
        <CloseMenuButton onClick={onClose} />
      </div>
      <div className="divide-divide border-divide mt-6 flex flex-col divide-y border-t">
        {nav.links.map((link, index) => (
          <SiteLink
            className={joinClassNames('px-4 py-2', navTextHoverClassName)}
            href={link.href}
            key={link.href}
            onClick={onClose}
          >
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2, delay: 0.1 * index }}
            >
              {link.label}
            </motion.div>
          </SiteLink>
        ))}
        <SiteLink className={joinClassNames('px-4 py-2', navTextHoverClassName)} href={nav.language.href} onClick={onClose}>
          {nav.language.label}
        </SiteLink>
        <div className="mt-4 p-4">
          <PrimaryCtaLink className="w-full" href={nav.cta.href} onClick={onClose}>
            {nav.cta.label}
          </PrimaryCtaLink>
        </div>
      </div>
    </motion.div>
  )
}

function SiteNav({ mobileMenuOpen, onMobileMenuToggle, onThemeToggle, theme }) {
  const location = useLocation()
  const locale = getLocaleFromPath(location.pathname)
  const nav = localizedContent[locale].nav
  const { scrollY } = useScroll()
  const navTranslateY = useSpring(
    useTransform(scrollY, [100, 120], [-100, 10]),
    { stiffness: 300, damping: 30 },
  )

  useEffect(() => {
    if (mobileMenuOpen) {
      onMobileMenuToggle()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  return (
    <nav className="max-w-7xl mx-auto">
      <motion.div
        className="shadow-aceternity fixed inset-x-0 top-0 z-50 mx-auto hidden max-w-[calc(80rem-4rem)] items-center justify-between bg-white/80 px-2 py-2 backdrop-blur-sm md:flex xl:rounded-2xl dark:bg-neutral-900/80 dark:shadow-[0px_2px_0px_0px_var(--color-neutral-800),0px_-2px_0px_0px_var(--color-neutral-800)]"
        style={{ y: navTranslateY }}
      >
        <NavBrand href={nav.brandHref} />
        <NavLinks links={nav.links} />
        <div className="flex items-center gap-2">
          <LanguageToggleLink language={nav.language} />
          <ThemeToggle onToggle={onThemeToggle} theme={theme} />
          <PrimaryCtaLink href={nav.cta.href}>{nav.cta.label}</PrimaryCtaLink>
        </div>
      </motion.div>

      <div className="hidden items-center justify-between px-4 py-4 md:flex">
        <NavBrand href={nav.brandHref} />
        <NavLinks links={nav.links} />
        <div className="flex items-center gap-2">
          <LanguageToggleLink language={nav.language} />
          <ThemeToggle onToggle={onThemeToggle} theme={theme} />
          <PrimaryCtaLink href={nav.cta.href}>{nav.cta.label}</PrimaryCtaLink>
        </div>
      </div>

      <div className="relative flex items-center justify-between p-2 md:hidden">
        <NavBrand href={nav.brandHref} />
        <MobileMenuButton onMobileMenuToggle={onMobileMenuToggle} />
      </div>

      <AnimatePresence>
        {mobileMenuOpen ? (
          <MobileNavOverlay
            nav={nav}
            onClose={onMobileMenuToggle}
            onThemeToggle={onThemeToggle}
            theme={theme}
          />
        ) : null}
      </AnimatePresence>
    </nav>
  )
}

export function SiteNavWithTheme(props) {
  const { onThemeToggle, theme } = useThemeToggle()

  return <SiteNav {...props} onThemeToggle={onThemeToggle} theme={theme} />
}
