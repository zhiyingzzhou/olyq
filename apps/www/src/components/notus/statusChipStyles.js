import { joinClassNames } from './utils.js'

const STATUS_CHIP_TONE_CLASS_NAMES = {
  alert: 'border-orange-500 bg-red-50 text-orange-500 dark:bg-red-50/10 dark:text-red-500',
  default: 'border-blue-500 bg-blue-50 text-blue-500 dark:bg-blue-50/10 dark:text-blue-500',
  danger: 'border-orange-500 bg-red-50 text-orange-500 dark:bg-red-50/10 dark:text-red-500',
  neutral: 'border-neutral-500 bg-neutral-50 text-neutral-500 dark:bg-neutral-50/10 dark:text-neutral-500',
  success: 'border-emerald-500 bg-emerald-50 text-emerald-500 dark:bg-emerald-50/10 dark:text-emerald-500',
  warning: 'border-yellow-500 bg-yellow-50 text-yellow-500 dark:bg-yellow-50/10 dark:text-yellow-500',
}

export function getStatusChipClassName({ className = '', tone = 'default' } = {}) {
  return joinClassNames(
    'rounded-sm border px-2 py-0.5 text-xs',
    STATUS_CHIP_TONE_CLASS_NAMES[tone] ?? STATUS_CHIP_TONE_CLASS_NAMES.default,
    className,
  )
}
