import { motion } from 'framer-motion'
import { useTheme } from 'next-themes'
import { Divider, SectionEyebrow } from '../notus/shared.jsx'

function ProductScreenImage({ item }) {
  const { resolvedTheme } = useTheme()
  const imageSrc = resolvedTheme === 'dark' ? item.imageDark : item.imageLight

  return (
    <img
      alt={item.title}
      className="shadow-aceternity aspect-[16/10] w-full rounded-lg object-cover"
      height="1600"
      loading="lazy"
      src={imageSrc}
      width="2560"
    />
  )
}

function ProductScreensSection({ content }) {
  return (
    <>
      <section className="max-w-7xl mx-auto border-divide border-x">
        <div className="flex flex-col items-center py-16">
          <SectionEyebrow spread={18}>{content.eyebrow}</SectionEyebrow>
          <h2 className="text-charcoal-700 mt-4 text-center text-2xl font-medium tracking-tight md:text-3xl lg:text-4xl dark:text-neutral-100">
            {content.title}
          </h2>
          <p className="mx-auto mt-6 max-w-lg px-4 text-center text-sm font-medium tracking-tight text-gray-600 md:text-sm lg:text-base dark:text-gray-300">
            {content.description}
          </p>
          <div className="border-divide divide-divide mt-16 grid w-full grid-cols-1 divide-y border-y md:grid-cols-2 md:divide-x">
            {content.items.map((item, index) => (
              <motion.article
                className="p-4 md:p-8"
                initial={{ opacity: 0, y: 18 }}
                key={item.title}
                transition={{ delay: index * 0.06, duration: 0.35 }}
                viewport={{ once: true, margin: '-10%' }}
                whileInView={{ opacity: 1, y: 0 }}
              >
                <ProductScreenImage item={item} />
                <h3 className="text-primary mt-5 text-lg font-medium tracking-tight">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-neutral-400">{item.description}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>
      <Divider />
    </>
  )
}

export default ProductScreensSection
