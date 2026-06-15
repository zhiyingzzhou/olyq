import { Divider, SectionEyebrow } from '../../shared.jsx'
import BenefitCard from './BenefitCard.jsx'
import BenefitsShowcaseCard from './BenefitsShowcaseCard.jsx'

function BenefitsSection({ content }) {
  return (
    <>
      <div className="max-w-7xl mx-auto border-divide relative overflow-hidden border-x px-4 py-20 md:px-8">
        <div className="relative flex flex-col items-center">
          <SectionEyebrow spread={16}>{content.eyebrow}</SectionEyebrow>
          <h2 className="text-charcoal-700 text-center text-2xl font-medium tracking-tight md:text-3xl lg:text-4xl dark:text-neutral-100 mt-4">
            {content.title}
          </h2>
          <p className="text-center text-sm font-medium tracking-tight text-gray-600 md:text-sm lg:text-base dark:text-gray-300 mx-auto mt-6 max-w-lg">
            {content.description}
          </p>
        </div>
        <div className="mt-20 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="grid grid-cols-1 gap-4">
            {content.items.slice(0, 3).map((item) => (
              <BenefitCard item={item} key={item.title} />
            ))}
          </div>
          <BenefitsShowcaseCard content={content.showcase} rotatingText={content.rotatingText} />
          <div className="grid grid-cols-1 gap-4">
            {content.items.slice(3).map((item) => (
              <BenefitCard item={item} key={item.title} />
            ))}
          </div>
        </div>
      </div>
      <Divider />
    </>
  )
}

export default BenefitsSection
