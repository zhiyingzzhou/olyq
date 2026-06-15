# Security Policy

## Supported Versions

Olyq is in active early development. Security fixes target the current `main` branch and the latest GitHub Release.

## Reporting A Vulnerability

Please do not open a public issue for security vulnerabilities.

Before publishing this repository, maintainers must enable GitHub Private Vulnerability Reporting:

1. Open the repository on GitHub.
2. Go to **Settings -> Code security and analysis**.
3. Enable **Private vulnerability reporting**.

After it is enabled, report vulnerabilities through the repository's **Security** tab. This creates a private report that maintainers can triage without exposing sensitive details.

Include:

- A short summary of the issue.
- Steps to reproduce it.
- The affected browser and Olyq version or commit.
- Whether the issue exposes page content, API keys, OAuth tokens, backups, screenshots, or other private data.

Do not include real API keys, OAuth tokens, private page content, or user data unless the private report specifically requires a minimal redacted example.

## Response Target

Maintainers aim to send an initial response within 14 days. Critical issues that expose user data, credentials, extension permissions, or release artifacts should be handled before normal feature work.

## Security Boundaries

Olyq is a browser extension. Sensitive areas include:

- Extension permissions, including install-time host permissions.
- Page content, selected text, element references, and hidden page screenshots used as AI context.
- API keys, OAuth tokens, remote MCP configuration, and provider endpoints.
- Backup, restore, sync, and local IndexedDB / browser storage data.
- GitHub Release extension zip artifacts.

Changes that touch these areas should explain the user benefit, the data flow, and the validation performed.

## Release Integrity

GitHub Releases are the only automated public release channel in this repository. Release tags must match the root and extension package versions, and each release includes `olyq-chrome-web-store-${tag}.zip`, `olyq-firefox-amo-addon-${tag}.zip`, `olyq-firefox-amo-source-${tag}.zip`, `olyq-release-docs-${tag}.zip`, `SHA256SUMS.txt`, and GitHub artifact attestations.

`olyq-chrome-web-store-${tag}.zip` is the Chrome Web Store upload package and may also be locally loaded in Chromium-based browsers. `olyq-firefox-amo-addon-${tag}.zip` is the unsigned AMO addon upload package and may also be temporarily loaded in Firefox for local testing. `olyq-firefox-amo-source-${tag}.zip` is only for Mozilla reviewer rebuilds; it is not an install package. Regular Firefox installs should come from the AMO-signed `.xpi` produced by Mozilla's review / signing flow.

Chrome Web Store and Firefox Add-ons publishing require separate account ownership, extension IDs, API secrets, and review policy; those credentials must not be introduced into the GitHub Release workflow.
