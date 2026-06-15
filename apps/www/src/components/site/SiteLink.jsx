import { forwardRef } from 'react'
import { Link } from 'react-router-dom'

function isInternalDestination(destination = '') {
  return destination.startsWith('/') && !destination.startsWith('//')
}

const SiteLink = forwardRef(function SiteLink(
  { children, href = '', to, ...props },
  ref,
) {
  const destination = to ?? href

  if (isInternalDestination(destination)) {
    return (
      <Link ref={ref} to={destination} {...props}>
        {children}
      </Link>
    )
  }

  return (
    <a ref={ref} href={destination} {...props}>
      {children}
    </a>
  )
})

export default SiteLink
