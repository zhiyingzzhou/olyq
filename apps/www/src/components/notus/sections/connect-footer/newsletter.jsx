import { SendIcon } from '../../icons.jsx'
import { primaryIconButtonSurfaceClassName } from '../../../site/interactionStyles.js'

function NewsletterSignup({ content }) {
  return (
    <div className="col-span-1 mb-4 flex flex-col items-start md:col-span-1 md:mb-0 lg:col-span-2">
      <p className="text-footer-link text-sm font-medium">{content.title}</p>
      <div className="mt-2 flex w-full items-center rounded-xl border border-gray-300 bg-gray-200 p-1 placeholder-gray-600 dark:border-neutral-700 dark:bg-neutral-800">
        <input
          className="flex-1 bg-transparent px-2 text-sm outline-none focus:outline-none"
          placeholder={content.placeholder}
          type="email"
        />
        <button
          className={primaryIconButtonSurfaceClassName}
          type="button"
        >
          <SendIcon />
        </button>
      </div>
      <p className="mt-4 text-left text-sm font-medium tracking-tight text-gray-600 dark:text-gray-300 md:text-sm lg:text-sm">
        {content.description}
      </p>
    </div>
  )
}

export default NewsletterSignup
