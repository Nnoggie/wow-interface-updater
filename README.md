# WoW TOC Interface Updater

Reusable GitHub Action for keeping World of Warcraft add-on TOC `## Interface:` values in sync with Warcraft Wiki's `Template:API_LatestInterface`.

## TOC marker

Add a marker comment immediately above each generated interface line:

```toc
# WOW_INTERFACE_TARGETS: mainline-beta, mainline-test, mainline, mists
## Interface: 120005, 120001, 50503
```

The action resolves every target, removes duplicate interface numbers, and sorts the final values numerically descending.

For embedded TOC strings in JavaScript files, use a `//` marker outside the string:

```js
// WOW_INTERFACE_TARGETS: mainline-test, mainline
export default `## Interface: 120005, 120001
## Title: Wago App Companion
`;
```

For embedded TOC strings in PowerShell files, use a `#` marker immediately above the interface string:

```powershell
$tocContent = @(
  # WOW_INTERFACE_TARGETS: mainline-test, mainline, mists, vanilla
  "## Interface: 120005, 120001, 50503, 11508"
  "## Title: SharedMedia_Template"
)
```

## Workflow

```yaml
name: Update WoW TOC Interface

on:
  workflow_dispatch:
  schedule:
    - cron: "37 4 * * 1"

permissions:
  contents: write
  pull-requests: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - id: toc
        uses: Nnoggie/wow-interface-updater@v1

      - uses: peter-evans/create-pull-request@v8
        if: steps.toc.outputs.changed == 'true'
        with:
          branch: automation/wow-interface
          delete-branch: true
          commit-message: Update WoW TOC interface versions
          title: Update WoW TOC interface versions
          body: ${{ steps.toc.outputs.pr-body }}
```

## Inputs

| Name | Default | Description |
| --- | --- | --- |
| `toc-glob` | `**/*.toc`, `**/*.toc.js`, `**/*.ps1` | Glob pattern for files to scan. |
| `marker` | `WOW_INTERFACE_TARGETS` | Comment marker that declares Warcraft Wiki targets. |

## Outputs

| Name | Description |
| --- | --- |
| `changed` | `true` when at least one `## Interface:` line changed. |
| `updated-files` | Comma-separated list of changed TOC files. |
| `pr-body` | Markdown summary suitable for `peter-evans/create-pull-request`. |

## Failure behavior

The action fails without writing a partial update when a marker is malformed, a marker is not immediately followed by `## Interface:`, Warcraft Wiki cannot be reached, or a target resolves to a non-numeric value.
