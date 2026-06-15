import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

export function joinClassNames(...values) {
  return twMerge(clsx(values))
}
