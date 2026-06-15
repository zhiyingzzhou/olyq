import { useLocation } from 'react-router-dom'
import ConnectCtaSection from '../components/notus/sections/ConnectCtaSection.jsx'
import PageTitle from '../components/site/PageTitle.jsx'
import { InfoGrid, InfoHero } from '../components/olyq/InfoPageSections.jsx'
import { getContent, getLocale } from '../components/olyq/LocaleContent.jsx'
import { repoLinks } from '../content/siteContent.js'

function OpenSourcePrivacyPage() {
  const location = useLocation()
  const locale = getLocale(location.pathname)
  const { home } = getContent(locale)
  const isEn = locale === 'en'

  const items = isEn
    ? [
        {
          title: 'Open source extension',
          body: 'Olyq is an MIT-licensed browser extension. The public repository contains the source, releases, security notes, and third-party notices.',
          points: ['Source code is public', 'Builds are published through GitHub Releases', 'Release packages include SHA256SUMS'],
        },
        {
          title: 'Your workspace stays in the browser',
          body: 'Settings, topics, messages, attachments, memory, and backups are stored in the browser by default. Remote backup is something you set up yourself.',
          points: ['Topics and attachments stay local by default', 'WebDAV and S3-compatible backup are optional', 'You can export local state when needed'],
        },
        {
          title: 'Bring your own model services',
          body: 'Olyq does not host models. Add the model, search, MCP, or backup services you want to use, then work from the sidebar.',
          points: ['Model calls use your own API keys', 'Page content is used when you ask with page context, screenshots, or OCR', 'Search, MCP, and remote backup use the services you configure'],
        },
      ]
    : [
        {
          title: '开源浏览器扩展',
          body: 'Olyq 使用 MIT License。公开仓库提供源码、发布包、安全说明和第三方声明。',
          points: ['源码公开', '构建包通过 GitHub Releases 分发', 'Release 包提供 SHA256SUMS 校验'],
        },
        {
          title: '工作区默认留在浏览器',
          body: '设置、话题、消息、附件、记忆和备份默认保存在浏览器里。远程备份需要你自己配置。',
          points: ['话题和附件默认本地保存', 'WebDAV 和 S3-compatible 备份是可选项', '需要迁移时可以导出本地状态'],
        },
        {
          title: '模型服务自己添加',
          body: 'Olyq 不托管模型。你添加要用的模型、搜索、MCP 或备份服务，然后在侧边栏里工作。',
          points: ['模型调用使用你自己的 API Key', '使用页面上下文、截图或 OCR 时才会带上页面内容', '搜索、MCP 和远程备份使用你配置的服务'],
        },
      ]

  return (
    <main>
      <PageTitle
        description={isEn ? 'Open-source and privacy notes for Olyq: your model services, your browser workspace, and clear data paths.' : 'Olyq 的开源与隐私说明：模型服务自己添加，工作区默认留在浏览器里。'}
        image="/icons/olyq-512.png"
        lang={isEn ? 'en' : 'zh-CN'}
        title={isEn ? 'Open source and privacy | Olyq' : '开源与隐私 | Olyq'}
      />
      <InfoHero
        body={isEn ? 'Olyq is an open-source extension for working with the page in front of you. Add your own model services, keep topics in the browser, and choose when to use search, MCP, or remote backup.' : 'Olyq 是一个开源浏览器扩展。你自己添加模型服务，话题默认留在浏览器里，需要时再使用搜索、MCP 或远程备份。'}
        eyebrow={isEn ? 'Open source & privacy' : '开源与隐私'}
        primary={{ href: repoLinks.privacy, label: isEn ? 'Read PRIVACY.md' : '阅读 PRIVACY.md' }}
        secondary={{ href: repoLinks.security, label: isEn ? 'Read SECURITY.md' : '阅读 SECURITY.md' }}
        title={isEn ? 'Open source, browser-based, yours to configure.' : '开源、在浏览器里、由你自己配置。'}
      />
      <InfoGrid items={items} />
      <ConnectCtaSection content={home.footer.cta} locale={locale} />
    </main>
  )
}

export default OpenSourcePrivacyPage
