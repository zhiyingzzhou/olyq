import { getStatusChipClassName } from '../../statusChipStyles.js'

function BrowserCardStatus({ children, tone = 'default', className = '' }) {
  const resolvedTone = tone === 'success' ? 'neutral' : tone

  return <div className={getStatusChipClassName({ className, tone: resolvedTone })}>{children}</div>
}

export default BrowserCardStatus
