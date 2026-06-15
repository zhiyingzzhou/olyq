import {
  ToolsTabIcon,
  WorkflowTabIcon,
} from '../../sectionPrimitives.jsx'
import { Divider, SectionEyebrow } from '../../shared.jsx'
import FeatureModelsPanel from './panels/FeatureModelsPanel.jsx'
import FeatureWorkflowBuilderPanel from './panels/FeatureWorkflowBuilderPanel.jsx'
import NativeToolsGraphic from './panels/NativeToolsGraphic.jsx'
import {
  CustomConnectorSdkIcon,
  OneClickAuthIcon,
  NativeToolsIntegrationIcon,
  RealtimeSyncIcon,
} from './icons.jsx'
import {
  FeatureBlock,
  FeatureDescription,
  FeatureHeading,
} from './primitives.jsx'

function FeatureLead({ description, icon, title }) {
  return (
    <>
      <div className="flex items-center gap-2">
        {icon}
        <FeatureHeading>{title}</FeatureHeading>
      </div>
      <FeatureDescription>{description}</FeatureDescription>
    </>
  )
}

function FeatureCapabilityCard({ description, icon: IconComponent, title }) {
  return (
    <FeatureBlock>
      <FeatureLead
        description={description}
        icon={<IconComponent />}
        title={title}
      />
    </FeatureBlock>
  )
}

const capabilityIcons = {
  'custom-connector-sdk': CustomConnectorSdkIcon,
  'one-click-auth': OneClickAuthIcon,
  'realtime-sync': RealtimeSyncIcon,
}

function FeatureSection({ content }) {
  return (
    <>
      <div className="max-w-7xl mx-auto border-divide border-x">
        <div className="flex flex-col items-center py-16">
          <SectionEyebrow spread={16}>{content.eyebrow}</SectionEyebrow>
          <h2 className="text-charcoal-700 mt-4 text-center text-2xl font-medium tracking-tight md:text-3xl lg:text-4xl dark:text-neutral-100">
            {content.title}
          </h2>
          <p className="mx-auto mt-6 max-w-lg px-2 text-center text-sm font-medium tracking-tight text-gray-600 md:text-sm lg:text-base dark:text-gray-300">
            {content.description}
          </p>

          <div className="border-divide divide-divide mt-16 grid grid-cols-1 divide-y border-y md:grid-cols-2 md:divide-x">
            <FeatureBlock className="overflow-hidden mask-b-from-80%">
              <FeatureLead
                description={content.lead[0].description}
                icon={<ToolsTabIcon />}
                title={content.lead[0].title}
              />
              <FeatureModelsPanel content={content.modelsPanel} />
            </FeatureBlock>

            <FeatureBlock className="overflow-hidden mask-b-from-80%">
              <FeatureLead
                description={content.lead[1].description}
                icon={<WorkflowTabIcon />}
                title={content.lead[1].title}
              />
              <FeatureWorkflowBuilderPanel content={content.workflowPanel} key={content.workflowPanel.placeholder} />
            </FeatureBlock>
          </div>

          <div className="w-full">
            <FeatureBlock className="relative w-full max-w-none overflow-hidden">
              <div className="pointer-events-none absolute inset-0 h-full w-full bg-[radial-gradient(var(--color-dots)_1px,transparent_1px)] mask-radial-from-10% [background-size:10px_10px]" />
              <FeatureLead
                description={content.lead[2].description}
                icon={<NativeToolsIntegrationIcon />}
                title={content.lead[2].title}
              />
              <NativeToolsGraphic content={content.nativeToolsPanel} />
            </FeatureBlock>
          </div>

          <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
            {content.capabilities.map((item) => (
              <FeatureCapabilityCard
                description={item.description}
                icon={capabilityIcons[item.icon]}
                key={item.title}
                title={item.title}
              />
            ))}
          </div>
        </div>
      </div>
      <Divider />
    </>
  )
}

export default FeatureSection
