import { useState } from 'react'
import { Divider, SectionEyebrow } from '../../shared.jsx'
import UseCaseCard from './UseCaseCard.jsx'

function UseCasesSection({ content }) {
  const [hoveredIndex, setHoveredIndex] = useState(null)

  return (
    <>
      <div className="max-w-7xl mx-auto border-divide relative overflow-hidden border-x px-4 md:px-8">
        <div className="relative flex flex-col items-center py-20">
          <SectionEyebrow spread={18}>{content.eyebrow}</SectionEyebrow>
          <h2 className="text-charcoal-700 text-center text-2xl font-medium tracking-tight md:text-3xl lg:text-4xl dark:text-neutral-100 mt-4">
            {content.title}
          </h2>
          <p className="text-center text-sm font-medium tracking-tight text-gray-600 md:text-sm lg:text-base dark:text-gray-300 mx-auto mt-6 max-w-lg">
            {content.description}
          </p>
          <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3">
            {content.items.map((item, index) => (
              <UseCaseCard
                index={index}
                isHovered={hoveredIndex === index}
                item={item}
                key={item.title}
                onHover={setHoveredIndex}
              />
            ))}
          </div>
        </div>
      </div>
      <Divider />
    </>
  )
}

export default UseCasesSection
