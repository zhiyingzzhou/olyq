import { useEffect, useState } from 'react'
import { Divider } from '../../shared.jsx'
import TestimonialGridButton from './TestimonialGridButton.jsx'
import TestimonialPanel from './TestimonialPanel.jsx'

function TestimonialsSection({ content }) {
  const items = content.items
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.min(content.initialIndex ?? 0, Math.max(items.length - 1, 0)),
  )
  const activeItem = items[activeIndex]
  const testimonialsCount = items.length

  useEffect(() => {
    if (testimonialsCount === 0) {
      return undefined
    }

    // 源站会在每次 panel 变化后重建自动轮播计时，这样手动切换后的 10s 节奏才一致。
    const intervalId = window.setInterval(() => {
      setActiveIndex((value) => (value + 1) % testimonialsCount)
    }, 10000)

    return () => window.clearInterval(intervalId)
  }, [activeIndex, testimonialsCount])

  const handleSelect = (index) => {
    setActiveIndex(index)
  }

  return (
    <>
      <div className="max-w-7xl mx-auto border-divide border-x">
        <h2 className="pt-20 pb-10 text-center font-mono text-sm tracking-tight text-neutral-500 uppercase dark:text-neutral-400">
          {content.title}
        </h2>
      </div>
      <Divider />
      <div className="max-w-7xl mx-auto border-divide relative border-x">
        <TestimonialPanel activeItem={activeItem} />
        <div className="border-divide grid grid-cols-2 border-t md:grid-cols-4">
          {items.slice(0, 8).map((item, index) => (
            <TestimonialGridButton
              index={index}
              isActive={activeItem.src === item.src}
              item={item}
              key={`${item.src}-${index}`}
              onSelect={() => handleSelect(index)}
            />
          ))}
        </div>
      </div>
      <Divider />
    </>
  )
}

export default TestimonialsSection
