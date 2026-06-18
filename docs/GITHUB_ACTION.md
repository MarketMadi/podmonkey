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
        with:
          fetch-depth: 0

      - name: Cost estimate
        uses: MarketMadi/podmonkey@v0.2.0
        with:
          path: ./k8s
```

## Policy gates (fail the job)

```yaml
- uses: MarketMadi/podmonkey@v0.2.0
  with:
    path: ./k8s
    max-monthly-usd: '500'
    min-confidence: '60'
```

Exit code **2** when a policy is violated (after still posting the PR comment).

## PR cost diff

Compare PR manifests against a base copy (e.g. main branch layout):

```yaml
- uses: actions/checkout@v4
  with:
    ref: ${{ github.base_ref }}
    path: base

- uses: actions/checkout@v4

- uses: MarketMadi/podmonkey@v0.2.0
  with:
    path: ./k8s
    base-path: ./base/k8s
    max-monthly-increase-usd: '100'
```

The PR comment includes a **Cost change vs base** table.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `path` | Yes | — | YAML file or directory (recursive `*.yaml` / `*.yml`) relative to repo root |
| `base-path` | No | `''` | Base manifests for diff (file or directory) |
| `github-token` | No | `github.token` | Token for PR comments |
| `comment-on-pr` | No | `true` | Create/update a PR comment |
| `providers` | No | `''` | Comma-separated: `aws,gcp,azure,hetzner` |
| `max-monthly-usd` | No | `''` | Fail if any provider max total exceeds this (USD) |
| `min-confidence` | No | `''` | Fail if confidence score is below this (0–100) |
| `max-monthly-increase-usd` | No | `''` | Fail if max increase vs `base-path` exceeds this (requires base-path) |

## Outputs

| Output | Description |
|--------|-------------|
| `markdown-path` | Runner path to Markdown summary |
| `json-path` | Runner path to full JSON result (includes `diff` when `base-path` set) |

## CLI equivalent

```bash
podmonkey estimate -f ./k8s --markdown
podmonkey estimate -f ./k8s --base ./k8s.main/ --max-monthly-increase-usd 100
podmonkey estimate --helm-chart ./chart --helm-values prod.yaml
npx podmonkey estimate -f deploy.yaml
```

## Disclaimer

Planning estimates only — not an invoice. See [CALCULATION_PLAN.md](./CALCULATION_PLAN.md).
