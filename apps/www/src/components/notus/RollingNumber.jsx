import { useEffect, useId } from 'react'
import { motion, useSpring, useTransform } from 'framer-motion'
import useMeasure from 'react-use-measure'

const DIGIT_SPRING = {
  stiffness: 280,
  damping: 18,
  mass: 0.3,
}

function RollingDigit({ number, value }) {
  const layoutId = useId()
  // 这里保留 react-use-measure，是为了让每个数字位都按真实行高滚动，
  // 避免字体、字号或响应式变化时出现位移不准的问题。
  const [measureRef, bounds] = useMeasure()
  const y = useTransform(value, (latest) => {
    if (!bounds.height) {
      return 0
    }

    const offset = (10 + number - (latest % 10)) % 10
    let distance = offset * bounds.height

    if (offset > 5) {
      distance -= 10 * bounds.height
    }

    return distance
  })

  if (!bounds.height) {
    return (
      <span className="invisible absolute" ref={measureRef}>
        {number}
      </span>
    )
  }

  return (
    <motion.span
      className="absolute inset-0 flex items-center justify-center"
      layoutId={`${layoutId}-${number}`}
      ref={measureRef}
      style={{ y }}
      transition={{ type: 'spring', ...DIGIT_SPRING }}
    >
      {number}
    </motion.span>
  )
}

function RollingPlace({ place, value }) {
  const currentDigit = Math.floor(value / place) % 10
  const motionValue = useSpring(currentDigit, DIGIT_SPRING)

  useEffect(() => {
    motionValue.set(currentDigit)
  }, [currentDigit, motionValue])

  return (
    <div className="relative inline-block w-[1ch] overflow-x-visible overflow-y-clip leading-none tabular-nums">
      <div className="invisible">0</div>
      {Array.from({ length: 10 }).map((_, digit) => (
        <RollingDigit key={digit} number={digit} value={motionValue} />
      ))}
    </div>
  )
}

function RollingInteger({ padStart, value }) {
  const integer = Math.abs(value)
  const digits = `${padStart && integer < 10 ? `0${integer}` : integer}`.split('')
  const places = digits.map((_, index) => Math.pow(10, digits.length - index - 1))

  return places.map((place) => (
    <RollingPlace key={`place-${place}`} place={place} value={integer} />
  ))
}

export default function RollingNumber({
  className = '',
  decimalSeparator = '.',
  padStart = false,
  prefix = '',
  suffix = '',
  value,
}) {
  const [integerPart, decimalPart] = Math.abs(value).toString().split('.')
  const integerValue = Number.parseInt(integerPart, 10)
  const decimalValue = decimalPart ? Number.parseInt(decimalPart, 10) : null

  return (
    <div className={`flex items-center ${className}`.trim()}>
      {value < 0 ? '-' : null}
      {prefix}
      <RollingInteger padStart={padStart} value={integerValue} />
      {decimalPart ? (
        <>
          <span>{decimalSeparator}</span>
          {decimalPart.split('').map((_, index) => (
            <RollingPlace
              key={`decimal-${index}`}
              place={Math.pow(10, decimalPart.length - index - 1)}
              value={decimalValue}
            />
          ))}
        </>
      ) : null}
      {suffix}
    </div>
  )
}
