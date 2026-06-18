# Podmonkey Roadmap

**Last updated:** 2026-06-18

## Shipped — v0.1.0

- Dual-model estimator (marginal .. node floor)
- 4 provider price sheets (AWS, GCP, Azure, Hetzner)
- Web demo + GitHub Pages deploy
- CLI `podmonkey estimate`
- GitHub Action (PR comments)
- Example manifest gallery

## Shipped — v0.2.0 (Tier 2)

- **`npx podmonkey`** — npm package (`podmonkey` on npm)
- **`--base` PR diff** — compare manifests vs base branch copy
- **Helm input** — `--helm-chart` or `helm template | podmonkey estimate -f -`
- **Policy gates** — `--max-monthly-usd`, `--min-confidence`, `--max-monthly-increase-usd` (exit 2)
- **Action policy inputs** — same gates in `action.yml`
- **Instance catalog** — node floor picks cheapest fitting VM per provider

## Tier 3 — accuracy + workflow

- Region / tier toggles in web UI
- CronJob real schedule → runs/month
- Storage class → rate mapping (all classes)
- Ingress cost (rough)
- `kubectl get … -o yaml` helper flag
- Export / shareable estimate links
- `estimate --diff` JSON schema stability for CI integrators

## Tier 4 — optional / monetization

- Calibrate mode (OpenCost / Kubecost effective rates)
- Custom enterprise price books
- Spot / reserved discount slider
- Team dashboard, saved projects
- ArgoCD / Flux pre-sync hook

## Build order rationale

1. **Distribution** (npm, Action) before cluster features — matches Infracost playbook
2. **Diff + policy** before calibrate — static YAML value prop for small teams
3. **Helm** before raw HPA simulation — matches how manifests are stored in git
