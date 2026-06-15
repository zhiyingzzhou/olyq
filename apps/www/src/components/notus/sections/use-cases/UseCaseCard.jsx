import { motion } from 'framer-motion'
import { PatternSurface } from '../../shared.jsx'
import { softCardClassName } from '../../../site/interactionStyles.js'
import { UseCaseIcon } from './icons.jsx'

function UseCaseCard({ index, isHovered, item, onHover }) {
  return (
    <div className="relative" onMouseEnter={() => onHover(index)}>
      {isHovered ? (
        <motion.div
          animate={{ opacity: 0.5 }}
          className="absolute inset-0 z-0"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          layoutId="scale"
        >
          <PatternSurface />
        </motion.div>
      ) : null}
      <div className={`relative z-10 p-4 md:p-5 ${softCardClassName}`}>
        <div className="flex items-center gap-2">
          <UseCaseIcon type={item.icon} />
        </div>
        <h3 className="mt-4 mb-2 text-lg font-medium">{item.title}</h3>
        <p className="text-gray-600">{item.description}</p>
      </div>
    </div>
  )
}

export default UseCaseCard
