import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { SendIcon } from '../../../icons.jsx'
import { NotusMarkIcon } from '../../../shared.jsx'
import { AttachmentIcon } from '../icons.jsx'
import { useTypewriterText } from '../hooks/useTypewriterText.js'

function FeatureUserMessage({ content, isActive, label, onComplete }) {
  const { displayText, isComplete } = useTypewriterText(content)

  useEffect(() => {
    if (isComplete && isActive) {
      onComplete()
    }
  }, [isActive, isComplete, onComplete])

  return (
    <div className="flex justify-end gap-3">
      <div className="flex max-w-xs flex-col gap-1">
        <div className="rounded-2xl rounded-br-md bg-blue-500 px-4 py-2 text-sm text-white">
          {isActive ? displayText : content}
          {isActive && !isComplete ? <span className="animate-pulse">|</span> : null}
        </div>
      </div>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-xs font-medium text-white">
        <span>{label}</span>
      </div>
    </div>
  )
}

function FeatureAssistantMessage({ content, isActive, onComplete }) {
  const { displayText, isComplete } = useTypewriterText(content)

  useEffect(() => {
    if (isComplete && isActive) {
      onComplete()
    }
  }, [isActive, isComplete, onComplete])

  return (
    <div className="flex gap-3 px-1">
      <div className="shadow-aceternity flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-medium text-white dark:bg-neutral-900">
        <NotusMarkIcon className="size-4 text-black dark:text-white" />
      </div>
      <div className="flex max-w-xs flex-col gap-1">
        <div className="text-charcoal-700 rounded-2xl rounded-bl-md bg-gray-100 px-4 py-2 text-sm">
          {isActive ? displayText : content}
          {isActive && !isComplete ? <span className="animate-pulse">|</span> : null}
        </div>
      </div>
    </div>
  )
}

function FeatureWorkflowBuilderPanel({ content }) {
  const [messages, setMessages] = useState(content.initialMessages)
  const [input, setInput] = useState('')
  const [visibleCount, setVisibleCount] = useState(0)
  const [canAdvance, setCanAdvance] = useState(false)
  const scrollRef = useRef(null)

  const visibleMessages = messages.slice(0, visibleCount)

  const submitMessage = () => {
    const trimmedInput = input.trim()

    if (!trimmedInput) {
      return
    }

    const nextMessages = [
      ...messages,
      { role: 'user', content: trimmedInput },
      {
        role: 'assistant',
        content:
          content.replies[
            Math.floor(Math.random() * content.replies.length)
          ],
      },
    ]

    setMessages(nextMessages)
    setVisibleCount(nextMessages.length)
    setInput('')
    setCanAdvance(false)
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setVisibleCount(1)
    }, 200)

    return () => window.clearTimeout(timeoutId)
  }, [content.initialMessages])

  useEffect(() => {
    if (!canAdvance || visibleCount >= messages.length) {
      return undefined
    }

    // 这里按源站节奏保持“当前气泡打字结束 -> 轻微停顿 -> 揭示下一条消息”。
    const timeoutId = window.setTimeout(() => {
      setVisibleCount((value) => value + 1)
      setCanAdvance(false)
    }, 400)

    return () => window.clearTimeout(timeoutId)
  }, [canAdvance, messages.length, visibleCount])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [visibleCount])

  return (
    <motion.div className="relative mx-auto mt-2 h-full max-h-70 min-h-40 w-[85%] p-4">
      <div className="absolute inset-x-0 -bottom-4 mx-auto flex w-[85%] items-center justify-between rounded-lg border border-gray-300 bg-white shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border-neutral-700 dark:bg-neutral-800">
        <input
          className="flex-1 border-none px-4 py-4 text-xs placeholder-neutral-600 focus:outline-none"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              submitMessage()
            }
          }}
          placeholder={content.placeholder}
          type="text"
          value={input}
        />
        <div className="mr-4 flex items-center gap-2">
          <AttachmentIcon />
          <button
            className="cursor-pointer"
            onClick={submitMessage}
            type="button"
          >
            <SendIcon />
          </button>
        </div>
      </div>

      <div
        className="mask-bg-gradient-to-b flex max-h-[calc(100%-1rem)] flex-col gap-4 overflow-y-auto from-white to-transparent mask-t-from-70% mask-b-from-70% pt-4 pb-16 dark:from-neutral-900 dark:to-transparent"
        ref={scrollRef}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {visibleMessages.map((message, index) => (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            key={`${message.role}-${index}`}
            transition={{ duration: 0.3 }}
            viewport={{ once: true }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            {message.role === 'user' ? (
              <FeatureUserMessage
                content={message.content}
                isActive={index === visibleCount - 1}
                label={content.userLabel}
                onComplete={() => setCanAdvance(true)}
              />
            ) : (
              <FeatureAssistantMessage
                content={message.content}
                isActive={index === visibleCount - 1}
                onComplete={() => setCanAdvance(true)}
              />
            )}
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

export default FeatureWorkflowBuilderPanel
