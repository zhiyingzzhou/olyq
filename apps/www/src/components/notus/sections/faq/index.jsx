import { useState } from 'react'
import { Divider, SectionEyebrow } from '../../shared.jsx'
import FaqItem from './FaqItem.jsx'

function FaqSection({ content }) {
  const [openSet, setOpenSet] = useState(() => new Set())

  return (
    <>
      <div className="max-w-7xl mx-auto border-divide border-x">
        <div className="flex justify-center pt-10 pb-8">
          <SectionEyebrow spread={8}>{content.eyebrow}</SectionEyebrow>
        </div>
        <Divider />
        <div className="divide-divide w-full divide-y">
          {content.items.map((item, index) => (
            <FaqItem
              answer={item.answer}
              index={index}
              isOpen={openSet.has(index)}
              key={item.question}
              onToggle={() =>
                setOpenSet((current) => {
                  const next = new Set(current)
                  if (next.has(index)) {
                    next.delete(index)
                  } else {
                    next.add(index)
                  }
                  return next
                })
              }
              question={item.question}
            />
          ))}
        </div>
      </div>
      <Divider />
    </>
  )
}

export default FaqSection
