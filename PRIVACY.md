# Privacy

Olyq is an open-source multi-model AI workspace for the browser. By default, settings, assistants, topics, messages, attachments, memory, backups, and provider configuration stay in the browser profile unless you explicitly export, back up, restore, or send data to a configured service.

## What Olyq May Read

Depending on the feature you use, Olyq may read:

- The current tab URL, title, favicon, and basic page metadata.
- Selected text, readable page content, picked page elements, and page style signals.
- Screenshots used as hidden context when style mode and a vision-capable model are both enabled.
- Messages, attachments, assistant settings, model settings, memory records, and backup metadata.
- Provider API keys, OAuth tokens, custom provider headers, MCP server configuration, WebDAV settings, and S3-compatible backup settings.

The current extension builds declare install-time `<all_urls>` host permissions. Those permissions support ordinary web-page context, page tools, screenshots, element references, link previews, and related browser-extension capabilities. They do not mean Olyq sends every page to a model. Page content is used only when a page-context, page-tool, screenshot, OCR, search, MCP, backup, or model request path needs that material.

## Where Data Is Stored

Olyq uses browser-local storage layers:

- `chrome.storage.local` for shared extension settings and configuration.
- IndexedDB for content-heavy data such as messages, attachments, memory, and backup-related records.
- Local UI storage for local-only interface preferences.

Backups are created only when you use backup or restore features. Remote backup data is sent only to the WebDAV or S3-compatible endpoint you configure.

## When Data Leaves Your Browser

Data leaves your browser only when a feature requires it:

- Chat and generation requests send the current prompt and selected context to the model provider you configured.
- Web search, remote MCP, OAuth, WebDAV, S3-compatible backup, or custom provider features contact the services you configure.
- GitHub issues, pull requests, and security reports contain only the information you choose to submit.

Olyq does not host model accounts, sell user data, run advertising tracking, or send page content to an Olyq-owned analytics service.

## API Keys And OAuth Tokens

API keys and OAuth tokens are stored locally in the browser profile so the extension can call your configured services. Treat browser profile access as sensitive. Do not paste real keys or tokens into public issues, logs, screenshots, or pull requests.

## Hidden Screenshots

When style mode is enabled and the selected model supports vision input, Olyq may create hidden page screenshots as context for that conversation. These screenshots are not shown as normal user message attachments, but they are still private context data. Deleting the related conversation, attachments, or browser profile data removes the local copies.

## Deleting Data

You can remove Olyq data by:

- Deleting conversations, assistants, memories, attachments, provider settings, and backup settings inside the extension.
- Removing remote backup files from the WebDAV or S3-compatible storage you configured.
- Removing the extension data from the browser profile.
- Uninstalling the extension and choosing browser data removal where the browser offers that option.

Provider-side deletion depends on the provider, MCP server, WebDAV service, or S3-compatible storage service you configured. Check those services' own policies for retained request logs or uploaded data.

## Security Reports

If you believe private data can be exposed, bypassed, or sent unexpectedly, do not open a public issue. Use the private vulnerability reporting path described in [SECURITY.md](./SECURITY.md).
