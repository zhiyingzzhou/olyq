import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { joinClassNames } from './utils.js'

export function Divider({ className = '' }) {
  return <div className={joinClassNames('bg-divide h-[1px] w-full', className)} />
}

export function SectionEyebrow({ children, spread = 18, className = '' }) {
  return (
    <motion.p
      animate={{ backgroundPosition: '0% center' }}
      className={joinClassNames(
        'relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent',
        '[background-repeat:no-repeat,padding-box]',
        '[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))]',
        'dark:[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))]',
        'text-sm font-normal [--base-color:var(--color-brand)] [--base-gradient-color:var(--color-white)]',
        'dark:[--base-color:var(--color-brand)] dark:[--base-gradient-color:var(--color-white)]',
        className,
      )}
      initial={{ backgroundPosition: '100% center' }}
      style={{
        '--spread': `${spread}px`,
        backgroundImage: 'var(--bg), linear-gradient(var(--base-color), var(--base-color))',
      }}
      transition={{ duration: 1.2, ease: 'linear', repeat: Infinity, repeatDelay: 2 }}
    >
      {children}
    </motion.p>
  )
}

export function NotusMarkIcon({ className = '' }) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={joinClassNames('size-6 rounded-md', className)}
      height="24"
      src="/icons/olyq-48.png"
      width="24"
    />
  )
}

export function CornerMarker({ bottom = false, left = false, right = false, top = false }) {
  const markerRef = useRef(null)
  const [cursor, setCursor] = useState({ x: 0, y: 0 })
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    const handleMouseMove = (event) => {
      setCursor({ x: event.clientX, y: event.clientY })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  useEffect(() => {
    if (!markerRef.current) {
      return
    }

    const bounds = markerRef.current.getBoundingClientRect()
    const centerX = bounds.left + bounds.width / 2
    const centerY = bounds.top + bounds.height / 2
    const distance = Math.sqrt(Math.pow(cursor.x - centerX, 2) + Math.pow(cursor.y - centerY, 2))
    setIsActive(distance <= 100)
  }, [cursor])

  return (
    <motion.div
      animate={{
        backgroundColor: isActive ? 'var(--color-brand)' : 'var(--color-primary)',
        borderRadius: isActive ? '50%' : '0%',
        boxShadow: isActive ? '0 0 20px var(--color-brand), 0 0 40px var(--color-brand)' : 'none',
        scale: isActive ? 1.5 : 1,
      }}
      className={joinClassNames(
        'absolute z-10 h-2 w-2',
        top ? 'top-0 xl:-top-1' : '',
        left ? 'left-0 xl:-left-2' : '',
        right ? 'right-0 xl:-right-2' : '',
        bottom ? 'bottom-0 xl:-bottom-1' : '',
      )}
      ref={markerRef}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    />
  )
}

export function PatternSurface({ className = '' }) {
  return (
    <div
      className={joinClassNames(
        'absolute inset-0 z-10 m-auto h-full w-full rounded-lg border border-(--pattern-fg) bg-white',
        'bg-[image:repeating-linear-gradient(315deg,_var(--pattern-fg)_0,_var(--pattern-fg)_1px,_transparent_0,_transparent_50%)] bg-[size:10px_10px]',
        'dark:bg-neutral-900',
        className,
      )}
    />
  )
}

export function PixelCanvasSurface({
  backgroundColor = 'var(--color-canvas-fill)',
  className = '',
  duration = 2500,
  fillColor = 'var(--color-canvas)',
  isActive,
  size = 2.5,
}) {
  const canvasRef = useRef(null)
  const [visibleCells, setVisibleCells] = useState(() => new Set())
  const [dimensions, setDimensions] = useState({ height: 0, width: 0 })

  const resolveColor = (value) => {
    if (!canvasRef.current) {
      return value
    }

    const probe = document.createElement('div')
    probe.style.color = value
    document.body.appendChild(probe)
    const resolved = window.getComputedStyle(probe).color
    document.body.removeChild(probe)
    return resolved
  }

  useEffect(() => {
    const measure = () => {
      if (!canvasRef.current?.parentElement) {
        return
      }

      setDimensions({
        width: canvasRef.current.parentElement.clientWidth,
        height: canvasRef.current.parentElement.clientHeight,
      })
    }

    measure()
    window.addEventListener('resize', measure)

    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    let frameId

    if (!isActive) {
      return undefined
    }

    if (!canvasRef.current || dimensions.width === 0 || dimensions.height === 0) {
      return undefined
    }

    const totalCells = Math.floor(dimensions.width / size) * Math.floor(dimensions.height / size)

    if (totalCells === 0) {
      return undefined
    }

    // 这里保留原稿那种“随机块状填充”的感觉，而不是线性扫描，
    // 这样 active surface 在切换时才会更接近源站的颗粒化闪现节奏。
    const randomized = Array.from({ length: totalCells }, (_, index) => index).sort(() => Math.random() - 0.5)
    const startedAt = Date.now()

    const tick = () => {
      const progress = Math.min((Date.now() - startedAt) / duration, 1)
      const nextCount = Math.floor(progress * randomized.length)
      const nextVisible = new Set()

      for (let index = 0; index < nextCount; index += 1) {
        nextVisible.add(randomized[index])
      }

      setVisibleCells(nextVisible)

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick)
      }
    }

    frameId = window.requestAnimationFrame(tick)

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [duration, dimensions, isActive, size])

  useEffect(() => {
    const canvas = canvasRef.current
    const cellsToPaint = isActive ? visibleCells : new Set()

    if (!canvas || dimensions.width === 0 || dimensions.height === 0) {
      return
    }

    const context = canvas.getContext('2d')

    if (!context) {
      return
    }

    if (canvas.width !== dimensions.width || canvas.height !== dimensions.height) {
      canvas.width = dimensions.width
      canvas.height = dimensions.height
    }

    const columns = Math.floor(dimensions.width / size)
    const rows = Math.floor(dimensions.height / size)

    context.fillStyle = resolveColor(backgroundColor)
    context.fillRect(0, 0, dimensions.width, dimensions.height)
    context.fillStyle = resolveColor(fillColor)

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const cellIndex = row * columns + column

        if (!cellsToPaint.has(cellIndex)) {
          continue
        }

        context.fillRect(column * size, row * size, size, size)
      }
    }
  }, [backgroundColor, dimensions, fillColor, isActive, size, visibleCells])

  return (
    <canvas
      className={joinClassNames('h-full w-full', className)}
      ref={canvasRef}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}

export function SectionActiveSurface({ activeTabId, duration = 2500 }) {
  return (
    <>
      <div className="absolute inset-x-0 z-20 h-full w-full bg-white mask-t-from-50% dark:bg-neutral-900" />
      <PixelCanvasSurface
        backgroundColor="var(--color-canvas-fill)"
        className="absolute inset-0 scale-[1.01] opacity-20"
        duration={duration}
        fillColor="var(--color-canvas)"
        isActive
        key={activeTabId}
        size={2.5}
      />
    </>
  )
}
