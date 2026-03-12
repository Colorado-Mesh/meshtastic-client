# CodeQL configuration

## Why there is no `codeql.yml` workflow

This repository uses **CodeQL default setup** (enabled under **Settings → Code security and analysis → Code scanning**). When default setup is on, GitHub **rejects SARIF uploads** from the CodeQL action to avoid duplicate/conflicting alerts. See:

- [Upload was rejected because CodeQL default setup is enabled](https://docs.github.com/en/code-security/code-scanning/troubleshooting-sarif-uploads/default-setup-enabled)

So the previous workflow that ran `github/codeql-action` with a custom `config-file` failed in CI with:

> CodeQL analyses from advanced configurations cannot be processed when the default setup is enabled

Default setup already runs JavaScript/TypeScript analysis on push/PR; no separate workflow is required for scanning to occur.

## Using the custom config (`codeql-config.yml`)

`codeql-config.yml` excludes the `js/http-to-file-access` query to avoid false positives in our log service (see comments in that file). That only applies when analysis is driven by **advanced setup** with this config.

If you need that exclusion in automated runs:

1. In the repo **Settings → Code security and analysis → Code scanning**, **disable** CodeQL default setup (switch to advanced / disable default).
2. Restore a CodeQL workflow that runs `github/codeql-action/init` with  
   `config-file: ./.github/codeql/codeql-config.yml`  
   and `analyze` as before (use `github/codeql-action@v4` when adding it back).

Do not run both default setup and a CodeQL workflow that uploads SARIF—GitHub will reject the upload.
