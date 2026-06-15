import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  DeployTabIcon,
  ToolsTabIcon,
  WorkflowTabIcon,
} from '../../sectionPrimitives.jsx'
import { Divider, SectionActiveSurface, SectionEyebrow } from '../../shared.jsx'
import { joinClassNames } from '../../utils.js'
import { strongListRowHoverClassName } from '../../../site/interactionStyles.js'
import { DeployGraphic, ToolsGraphic, WorkflowGraphic } from './graphics.jsx'
import { HOW_IT_WORKS_ROTATE_MS } from './constants.js'

function HowItWorksPanel({ activeTab }) {
  const { graphic, id } = activeTab

  if (id === 'tools') {
    return <ToolsGraphic content={graphic} />
  }

  if (id === 'deploy') {
    return <DeployGraphic content={graphic} />
  }

  return <WorkflowGraphic content={graphic} />
}

function TabIcon({ id }) {
  if (id === 'workflow') {
    return <WorkflowTabIcon className="shrink-0" />
  }

  if (id === 'tools') {
    return <ToolsTabIcon className="shrink-0" />
  }

  return <DeployTabIcon className="shrink-0" />
}

function HowItWorksSection({ content }) {
  const tabs = content.tabs
  const [activeTabId, setActiveTabId] = useState(tabs[0].id)
  const activeTab = tabs.find((item) => item.id === activeTabId) ?? tabs[0]

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const currentIndex = tabs.findIndex((item) => item.id === activeTabId)
      setActiveTabId(tabs[(currentIndex + 1) % tabs.length].id)
    }, HOW_IT_WORKS_ROTATE_MS)

    return () => window.clearInterval(intervalId)
  }, [activeTabId, tabs])

  return (
    <>
      <div className="max-w-7xl mx-auto border-divide border-x">
        <div className="flex flex-col items-center pt-16">
          <SectionEyebrow spread={24}>{content.eyebrow}</SectionEyebrow>
          <h2 className="text-charcoal-700 text-center text-2xl font-medium tracking-tight md:text-3xl lg:text-4xl dark:text-neutral-100 mt-4">
            {content.title}
          </h2>
          <p className="text-center text-sm font-medium tracking-tight text-gray-600 md:text-sm lg:text-base dark:text-gray-300 mx-auto mt-6 max-w-lg">
            {content.description}
          </p>

          <div className="border-divide divide-divide mt-16 hidden w-full grid-cols-2 divide-x border-t lg:grid">
            <div className="divide-divide divide-y">
              {tabs.map((tab) => {
                const isActive = tab.id === activeTabId

                return (
                  <button
                    className={joinClassNames(
                      'group relative flex w-full flex-col items-start overflow-hidden px-12 py-8',
                      strongListRowHoverClassName,
                    )}
                    key={tab.id}
                    onClick={() => setActiveTabId(tab.id)}
                    type="button"
                  >
                    {isActive ? <SectionActiveSurface activeTabId={tab.id} duration={2500} /> : null}
                    {isActive ? (
                      <motion.div
                        animate={{ width: '100%' }}
                        className="bg-brand absolute inset-x-0 bottom-0 z-30 h-0.5 w-full rounded-full"
                        initial={{ width: 0 }}
                        transition={{ duration: HOW_IT_WORKS_ROTATE_MS / 1000 }}
                      />
                    ) : null}
                    <div
                      className={joinClassNames(
                        'text-charcoal-700 relative z-20 flex items-center gap-2 font-medium dark:text-neutral-100',
                        isActive ? '' : 'group-hover:text-brand',
                      )}
                    >
                      <TabIcon id={tab.id} />
                      {tab.title}
                    </div>
                    <p
                      className={joinClassNames(
                        'relative z-20 mt-2 text-left text-sm text-gray-600 dark:text-neutral-300',
                        isActive ? 'text-charcoal-700' : '',
                      )}
                    >
                      {tab.description}
                    </p>
                  </button>
                )
              })}
            </div>

            <div className="relative h-full max-h-[370px] overflow-hidden bg-[radial-gradient(var(--color-dots)_1px,transparent_1px)] mask-r-from-90% mask-l-from-90% mask-radial-from-20% [background-size:10px_10px]">
              <AnimatePresence mode="wait">
                <motion.div
                  animate={{ filter: 'blur(0px)', opacity: 1 }}
                  className="absolute inset-0"
                  exit={{ filter: 'blur(10px)', opacity: 0 }}
                  initial={{ filter: 'blur(10px)', opacity: 0 }}
                  key={activeTab.id}
                  transition={{ duration: 0.5 }}
                >
                  <HowItWorksPanel activeTab={activeTab} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="divide-divide border-divide mt-16 flex w-full flex-col divide-y overflow-hidden border-t lg:hidden">
            {tabs.map((tab) => (
              <div
                className="group relative flex w-full flex-col items-start overflow-hidden px-4 py-4 md:px-12 md:py-8"
                key={`${tab.id}-mobile`}
              >
                <div className="text-charcoal-700 relative z-20 flex items-center gap-2 font-medium dark:text-neutral-100">
                  <TabIcon id={tab.id} />
                  {tab.title}
                </div>
                <p className="relative z-20 mt-2 text-left text-sm text-gray-600 dark:text-neutral-300">
                  {tab.description}
                </p>
                <div className="relative mx-auto h-80 w-full overflow-hidden mask-t-from-90% mask-r-from-90% mask-b-from-90% mask-l-from-90% sm:h-80 sm:w-160">
                  <HowItWorksPanel activeTab={tab} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Divider />
    </>
  )
}

export default HowItWorksSection
