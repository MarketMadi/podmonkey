# Podmonkey GitHub Action

Post Kubernetes cost estimates on pull requests — same engine as the CLI and web demo.

## Quick start

```yaml
name: Podmonkey

on:
  pull_request:
    paths:
      - '**.yaml'
      - '**.yml'
      - 'k8s/**'

permissions:
  contents: read
  pull-requests: write

jobs:
  estimate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Cost estimate
        uses: MarketMadi/podmonkey@v0.1.0   # or ./ while developing locally
        with:
          path: ./k8s                       # file or directory
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `path` | Yes | — | YAML file or directory (recursive `*.yaml` / `*.yml`) relative to repo root |
| `github-token` | No | `github.token` | Token for PR comments |
| `comment-on-pr` | No | `true` | Create/update a PR comment |
| `providers` | No | `''` | Comma-separated: `aws,gcp,azure,hetzner` |

## Outputs

| Output | Description |
|--------|-------------|
| `markdown-path` | Runner path to Markdown summary |
| `json-path` | Runner path to full JSON `EstimateResult` |

Read outputs in later steps:

```yaml
- name: Cost estimate
  id: podmonkey
  uses: MarketMadi/podmonkey@v0.1.0
  with:
    path: ./manifests

- name: Use JSON result
  shell: bash
  run: cat "${{ steps.podmonkey.outputs.json-path }}"
```

## PR comment

The action posts a comment like:

> ## 🐒 Podmonkey cost estimate  
> **Confidence:** high (100/100)  
> | Provider | Region | Total/mo |  
> | AWS EKS | us-east-1 | $121 – $161 |

Existing comments with the `<!-- podmonkey-cost-estimate -->` marker are updated in place.

## Permissions

```yaml
permissions:
  pull-requests: write   # required when comment-on-pr is true
```

## Local development

From this repository:

```yaml
- uses: ./
  with:
    path: examples
```

## CLI equivalent

```bash
podmonkey estimate -f ./k8s --markdown
podmonkey estimate -f ./k8s --json
```

## Disclaimer

Planning estimates only — not an invoice. See [CALCULATION_PLAN.md](./CALCULATION_PLAN.md).
