import { useEffect, useState } from 'react'
import { TYPEWRITER_MS } from '../constants.js'

export function useTypewriterText(text, delay = TYPEWRITER_MS) {
  const [displayText, setDisplayText] = useState(() => (text.length === 0 ? text : ''))
  const [isComplete, setIsComplete] = useState(() => text.length === 0)

  useEffect(() => {
    let startTimeoutId

    if (text.length === 0) {
      startTimeoutId = window.setTimeout(() => {
        setDisplayText(text)
        setIsComplete(true)
      }, 0)

      return () => window.clearTimeout(startTimeoutId)
    }

    startTimeoutId = window.setTimeout(() => {
      setDisplayText('')
      setIsComplete(false)
    }, 0)

    let index = 0
    const intervalId = window.setInterval(() => {
      index += 1
      setDisplayText(text.slice(0, index))

      if (index === text.length) {
        setIsComplete(true)
        window.clearInterval(intervalId)
      }
    }, delay)

    return () => {
      window.clearTimeout(startTimeoutId)
      window.clearInterval(intervalId)
    }
  }, [delay, text])

  return { displayText, isComplete }
}
