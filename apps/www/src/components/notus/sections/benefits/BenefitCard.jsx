import { softCardClassName } from '../../../site/interactionStyles.js'
import { BenefitIcon } from './icons.jsx'

function BenefitCard({ item }) {
  return (
    <div className={`relative z-10 p-4 md:p-5 ${softCardClassName}`}>
      <div className="flex items-center gap-2">
        <BenefitIcon type={item.icon} />
      </div>
      <h3 className="mt-4 mb-2 text-lg font-medium">{item.title}</h3>
      <p className="text-gray-600">{item.description}</p>
    </div>
  )
}

export default BenefitCard
