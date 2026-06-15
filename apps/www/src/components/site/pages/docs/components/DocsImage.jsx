function DocsImage({ image, rounded = 'rounded-lg' }) {
  if (!image) return null

  const className = `shadow-aceternity w-full ${rounded} border border-neutral-200 bg-white object-cover dark:border-neutral-800 dark:bg-neutral-950`

  return (
    <>
      <img alt={image.alt} className={`${className} dark:hidden`} loading="lazy" src={image.light} />
      <img alt={image.alt} className={`${className} hidden dark:block`} loading="lazy" src={image.dark} />
    </>
  )
}

export default DocsImage
