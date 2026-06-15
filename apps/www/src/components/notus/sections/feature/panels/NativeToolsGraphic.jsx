import { motion } from 'framer-motion'
import { Cpu, FileImage, MessageSquareText, PanelsTopLeft, Workflow } from 'lucide-react'
import { NotusMarkIcon } from '../../../shared.jsx'
import { ConnectingLineHorizontal, ConnectingLineVertical } from '../../../sectionPrimitives.jsx'
import {
  FeatureAnimatedLineCode,
  FeatureAnimatedLineMeeting,
  FeatureAnimatedLineSupport,
  FeatureNodeIconBox,
  FeatureToolLabel,
} from '../primitives.jsx'

function NativeToolsLucideIcon({ className = '', colorClassName, icon: Icon }) {
  return (
    <Icon aria-hidden="true" className={`${className} ${colorClassName}`} strokeWidth={2} />
  )
}

function PageContextIcon({ className = '' }) {
  return <NativeToolsLucideIcon className={className} colorClassName="text-blue-500" icon={PanelsTopLeft} />
}

function AttachmentIcon({ className = '' }) {
  return <NativeToolsLucideIcon className={className} colorClassName="text-cyan-400" icon={FileImage} />
}

function ToolInvocationIcon({ className = '' }) {
  return <NativeToolsLucideIcon className={className} colorClassName="text-brand" icon={Workflow} />
}

function ModelRuntimeIcon({ className = '' }) {
  return <NativeToolsLucideIcon className={className} colorClassName="text-blue-500" icon={Cpu} />
}

function ConversationResultIcon({ className = '' }) {
  return <NativeToolsLucideIcon className={className} colorClassName="text-cyan-400" icon={MessageSquareText} />
}

function WebMaterialLabelIcon() {
  return <PageContextIcon className="size-4.5 shrink-0" />
}

function ModelServiceLabelIcon() {
  return <ModelRuntimeIcon className="size-4.5 shrink-0" />
}

function BrowserToolsLabelIcon() {
  return <ToolInvocationIcon className="size-4.5 shrink-0" />
}

function NativeToolsGraphic({ content }) {
  return (
    <>
      <div className="relative mx-auto my-24 h-full w-full scale-[2] sm:scale-[1.5] md:scale-[1.2] lg:hidden">
        <img
          alt="Native Tools Integration"
          className="dark:invert dark:filter"
          height="1200"
          src="/illustrations/native-tools-integration.svg"
          width="1200"
        />
      </div>

      <motion.div className="relative mx-auto my-12 hidden h-full max-h-70 min-h-80 max-w-[67rem] grid-cols-2 p-4 lg:grid">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-10">
            <FeatureToolLabel icon={<ModelServiceLabelIcon />} text={content.tools[0]}>
              <FeatureAnimatedLineMeeting className="absolute top-2 -right-84" />
            </FeatureToolLabel>
            <FeatureToolLabel icon={<WebMaterialLabelIcon />} text={content.tools[1]}>
              <FeatureAnimatedLineCode className="absolute top-2 -right-84" />
            </FeatureToolLabel>
            <FeatureToolLabel icon={<BrowserToolsLabelIcon />} text={content.tools[2]}>
              <FeatureAnimatedLineSupport className="absolute -right-84 bottom-2" />
            </FeatureToolLabel>
          </div>

          <div className="relative h-16 w-16 overflow-hidden rounded-md bg-gray-200 p-px shadow-xl dark:bg-neutral-700">
            <div className="absolute inset-0 scale-[1.4] animate-spin rounded-full bg-conic [background-image:conic-gradient(at_center,transparent,var(--color-blue-500)_20%,transparent_30%)] [animation-duration:2s]" />
            <div className="absolute inset-0 scale-[1.4] animate-spin rounded-full [background-image:conic-gradient(at_center,transparent,var(--color-brand)_20%,transparent_30%)] [animation-delay:1s] [animation-duration:2s]" />
            <div className="relative z-20 flex h-full w-full items-center justify-center rounded-[5px] bg-white dark:bg-neutral-900">
              <NotusMarkIcon className="size-6" />
            </div>
          </div>
        </div>

        <div className="relative flex h-full w-full items-center justify-start">
          <ConnectingLineHorizontal />
          <div className="relative flex flex-col items-center gap-2">
            <span className="relative z-20 rounded-sm border border-blue-500 bg-blue-50 px-2 py-0.5 text-xs whitespace-nowrap text-blue-500 dark:bg-blue-900 dark:text-white">
              {content.topicBadge}
            </span>
            <div className="absolute inset-x-0 -top-30 flex h-full flex-col items-center">
              <FeatureNodeIconBox icon={<PageContextIcon className="size-6" />} />
              <ConnectingLineVertical />
              <ConnectingLineVertical />
              <FeatureNodeIconBox icon={<ToolInvocationIcon className="size-6" />} />
            </div>
          </div>
          <div className="absolute -top-4 right-30 flex h-full flex-col items-center">
            <FeatureNodeIconBox icon={<AttachmentIcon className="size-6" />} />
              <ConnectingLineVertical />
              <FeatureNodeIconBox icon={<ModelRuntimeIcon className="size-6" />} />
            </div>
          <ConnectingLineHorizontal />
          <FeatureNodeIconBox icon={<ConversationResultIcon className="size-6" />} />
        </div>
      </motion.div>
    </>
  )
}

export default NativeToolsGraphic
