import DocsImage from './DocsImage.jsx'
import InlineCode from './InlineCode.jsx'
import { joinClassNames } from '../../../../notus/utils.js'

function renderInlineCode(text) {
  return text.split(/(`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <InlineCode key={`${part}-${index}`}>{part.slice(1, -1)}</InlineCode>
    }

    return <span key={`${part}-${index}`}>{part}</span>
  })
}

function GuideBlock({ anchorClassName, id, isBoundary = false, section }) {
  return (
    <section className={joinClassNames(anchorClassName, 'border-divide border-t py-8 first:border-t-0 first:pt-0')} id={id}>
      <h2 className="text-charcoal-700 text-2xl leading-8 font-medium tracking-tight dark:text-neutral-100">
        {section.title}
      </h2>

      {section.body ? (
        <p className={isBoundary ? 'mt-4 rounded-lg border border-divide bg-gray-50 p-4 text-sm leading-7 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300' : 'mt-4 text-base leading-8 text-neutral-600 dark:text-neutral-300'}>
          {renderInlineCode(section.body)}
        </p>
      ) : null}

      {section.steps ? (
        <ol className="mt-5 list-decimal space-y-3 pl-5 text-base leading-8 text-neutral-600 marker:text-neutral-400 dark:text-neutral-300">
          {section.steps.map((step) => (
            <li key={step}>{renderInlineCode(step)}</li>
          ))}
        </ol>
      ) : null}

      {section.points ? (
        <ul className="mt-5 space-y-3 text-base leading-8 text-neutral-600 dark:text-neutral-300">
          {section.points.map((point) => (
            <li className="border-divide border-l pl-4" key={point}>
              {renderInlineCode(point)}
            </li>
          ))}
        </ul>
      ) : null}

      {section.image ? (
        <figure className="mt-6">
          <DocsImage image={section.image} />
          {section.image.caption ? (
            <figcaption className="mt-3 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
              {section.image.caption}
            </figcaption>
          ) : null}
        </figure>
      ) : null}
    </section>
  )
}

export default GuideBlock
