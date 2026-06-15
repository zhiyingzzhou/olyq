# Chrome Web Store Listing - en-US

## Store Title

Olyq

## Package Summary / Manifest Description

Open-source multi-model AI workspace for the browser: page context, Paint, search, remote MCP, and topics in one sidebar.

## Suggested Category

Productivity

If an existing Chrome Web Store item must temporarily keep its current category, Developer Tools is acceptable, but the public copy should still describe Olyq as a browser multi-model AI workspace.

## Detailed Description

Olyq is an open-source multi-model AI workspace for the browser. It brings the current page, multi-model chat, assistants and topics, Paint, search, remote MCP, screenshots / OCR, and local backups into one sidebar.

You can use Olyq beside the page you are working on to:

- Ask models with the current page, selected text, page elements, and screenshots
- Compare several configured models with the same question
- Capture, annotate, and mask screenshots, then continue with OCR results in the same topic
- Use your configured image models in the Paint workspace, with prompts, input images, parameters, and result history
- Connect web search, model-hosted search, and remote MCP tools when a task needs them
- Keep assistants, topics, messages, attachments, memory, and backups so the same work can continue later

Olyq does not include hosted model accounts, free model credits, or a default model provider. Add your own model service and API key in settings, such as OpenAI, Anthropic, Gemini, OpenRouter, Ollama, or another compatible service. Actual model availability depends on your account, region, API key, and model permissions.

Data and permission notes:

- Settings, assistants, topics, messages, attachments, memory, and backups are stored in the browser by default
- Data leaves the browser only when you configure and use model services, search, remote MCP, WebDAV, or S3-compatible backups
- Current-page content, selections, page elements, and screenshots are used only when page context, page tools, screenshot, or OCR features need them
- The extension declares ordinary web-page access for page context, page tools, screenshots, element references, link previews, and related browser-extension capabilities; this does not mean Olyq sends every page to a model by default

Olyq is an independent open-source project. Source code, privacy notes, security notes, and release package checksums are available from the project home and GitHub Releases.

## Privacy And Permission Notes

Chrome Web Store privacy practices should stay aligned with `PRIVACY.md`:

- Olyq does not host model accounts, sell user data, run advertising tracking, or send page content to an Olyq-owned analytics service.
- Model requests, image generation, OCR, and memory embeddings are sent to the model service configured by the user.
- Web search, model-hosted search, remote MCP, OAuth, WebDAV, and S3-compatible backups contact external services only when configured and invoked by the user.
- API keys, OAuth tokens, provider headers, MCP configuration, WebDAV settings, and S3-compatible backup settings are stored in the browser profile.
- Install-time ordinary web-page access supports page context, page tools, screenshots, element references, and link previews. Page content is used only when the related feature needs it.

## Reviewer Notes

Olyq is an open-source multi-model AI workspace for the browser. It does not include a hosted model account.

Test steps:

1. Install the extension.
2. Open a regular `http` / `https` web page.
3. Open the Olyq side panel from the toolbar.
4. Add a test API key for a supported model provider in Settings.
5. Create or choose an assistant and topic, then ask about the current page.
6. Test selected text, screenshot markup, OCR, model comparison, Paint, or remote MCP as needed.

Data is stored in the browser by default. External requests occur only when the tester configures a model, search, remote MCP, or backup provider and actively invokes the related feature.
