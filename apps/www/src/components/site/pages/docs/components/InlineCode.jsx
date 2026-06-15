function InlineCode({ children }) {
  return (
    <code className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[0.95em] text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
      {children}
    </code>
  )
}

export default InlineCode
