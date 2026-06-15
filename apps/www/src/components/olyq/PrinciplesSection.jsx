import { Divider, SectionEyebrow } from '../notus/shared.jsx'

function PrinciplesSection({ content }) {
  return (
    <>
      <section className="max-w-7xl mx-auto border-divide border-x">
        <h2 className="py-8 text-center font-mono text-sm tracking-tight text-neutral-500 uppercase dark:text-gray-300">
          {content.title}
        </h2>
        <div className="border-divide divide-divide grid grid-cols-1 divide-y border-t md:grid-cols-4 md:divide-x md:divide-y-0">
          {content.items.map((item) => (
            <article className="p-6 md:p-8" key={item.title}>
              <SectionEyebrow spread={10}>{item.title}</SectionEyebrow>
              <p className="mt-4 text-sm leading-6 text-gray-600 dark:text-neutral-300">{item.body}</p>
            </article>
          ))}
        </div>
      </section>
      <Divider />
    </>
  )
}

export default PrinciplesSection

