# Podmonkey Roadmap

**Last updated:** 2026-06-18

## Shipped — v0.1.0

- Dual-model estimator (marginal .. node floor)
- 4 provider price sheets (AWS, GCP, Azure, Hetzner)
- Web demo + GitHub Pages deploy
- CLI `podmonkey estimate`
- GitHub Action (PR comments)
- Example manifest gallery

## Shipped — v0.2.0

- **`npx podmonkey`** — npm package (run `npm publish --access public` to release)
- **`--base` PR diff** — compare manifests vs base branch copy
- **Helm input** — `--helm-chart` or `helm template | podmonkey estimate -f -`
- **Policy gates** — `--max-monthly-usd`, `--min-confidence`, `--max-monthly-increase-usd`
- **Action policy inputs** — same gates in `action.yml`
- **Instance catalog** — node floor picks cheapest fitting VM per provider

## Shipped — v0.3.0 (Tier 3)

- **Verified pricing** — refreshed sheets, [PRICING_SOURCES.md](./PRICING_SOURCES.md), benchmark tests
- **CronJob schedules** — real runs/month via `cron-parser` (not `× 30` guess)
- **Storage class mapping** — gp2/io2, `premium-rwo`, managed disks, etc.
- **Ingress costing** — LB-backed ingress fees per provider
- **`--from-cluster`** — `kubectl get … -o yaml` input
- **Web UI toggles** — GKE free tier, AKS tier, DaemonSet node count
- **Export** — copy markdown, shareable URL hash

## Tier 4 — optional / monetization

- Calibrate mode (OpenCost / Kubecost effective rates)
- Custom enterprise price books
- Spot / reserved discount slider
- Region picker (multi-region sheets)
- Team dashboard, saved projects

## Manual checklist (Tier 2 npm)

```bash
npm login
npm publish --access public
```
