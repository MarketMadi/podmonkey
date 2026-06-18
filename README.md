# Podmonkey 🐒

**Paste Kubernetes YAML. Compare cloud bills. Spot waste before you deploy.**

Podmonkey is an open-source, manifest-first Kubernetes cost estimator. It parses your YAML and produces **planning-grade** monthly cost **ranges** across **AWS EKS**, **Google GKE**, **Azure AKS**, and **Hetzner** — no cluster agent, no login, no enterprise sales call.

> Planning estimates only — not an invoice. See [docs/CALCULATION_PLAN.md](docs/CALCULATION_PLAN.md) for how we make numbers decision-grade, and [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) for what the code does today.

## Quick links

| Doc | Description |
|-----|-------------|
| [Current state](docs/CURRENT_STATE.md) | Audit: claims vs code, gaps, extension points |
| [Calculation plan](docs/CALCULATION_PLAN.md) | Dual models, rate derivation, validation |
| [Product spec](docs/PRODUCT.md) | Vision, scope, roadmap, warnings |
| [Methodology](docs/METHODOLOGY.md) | Formulas, price sheet schema |
| [Competitors](docs/COMPETITORS.md) | Side-by-side vs Kubecost, ReleaseRun, Optiqor, etc. |
| [GitHub Action](docs/GITHUB_ACTION.md) | PR cost comments, diff, policy gates in CI |
| [Roadmap](docs/ROADMAP.md) | Tier 2+ feature plan |

## Try it

**[Live demo →](https://marketmadi.github.io/podmonkey/)** — paste YAML, compare AWS / GCP / Azure / Hetzner in one view. Load examples from the dropdown (nginx, Postgres HA, SaaS stack, monitoring, and more in [`examples/`](examples/)).

Or run locally:

```bash
cd apps/web
npm install
npm run dev
# → http://localhost:3002
```

Deploy your own copy: [Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FMarketMadi%2Fpodmonkey&root-directory=apps%2Fweb) (set root to `apps/web`) or enable **GitHub Pages** in repo settings (workflow `.github/workflows/deploy-web.yml` publishes on push to `main`).

## Add to your repo

Copy [`.github/workflows/podmonkey-estimate.example.yml`](.github/workflows/podmonkey-estimate.example.yml) to `.github/workflows/podmonkey.yml` and point `path` at your manifests:

```yaml
- uses: MarketMadi/podmonkey@v0.2.0
  with:
    path: ./k8s
    base-path: ./k8s   # optional: compare vs main branch copy for PR diff
    max-monthly-usd: '500'
    min-confidence: '60'
```

Podmonkey posts (or updates) a PR comment with per-provider monthly ranges and optional cost diff. See [docs/GITHUB_ACTION.md](docs/GITHUB_ACTION.md).

## Install (CLI)

```bash
npm install -g podmonkey
# or without installing:
npx podmonkey estimate -f examples/nginx-deployment.yaml
```

**Helm charts:**

```bash
podmonkey estimate --helm-chart ./chart --helm-values values.yaml
helm template myapp ./chart | podmonkey estimate -f -
```

**PR cost diff:**

```bash
podmonkey estimate -f k8s/ --base k8s.main/ --markdown
```

## How it works

```
YAML manifests
    → parse (Deployment, StatefulSet, PVC, Service…)
    → aggregate CPU/RAM/storage/LB counts
    → derive rates from reference_instance (OpenCost Appendix A)
    → compute marginal .. node-floor range per provider
    → compare providers + confidence score + warnings
```

**Compute (two models, shown as a range):**

```
Model A (marginal):  Σ(requests) × 730h × derived $/vcpu-hr and $/gib-hr
Model B (node floor): cheapest catalog VM that fits workload × hourly × 730h
```

Plus control plane, PVC storage ($/GiB-month), and LoadBalancer flat fees per provider.

Rates are **derived at runtime** from each sheet's `reference_instance` — not the legacy `rates` fields in JSON.

**Example (nginx on AWS EKS):** ~$103/mo without a LoadBalancer; ~$121/mo with one (on-demand, planning estimate).

## Project structure

```
podmonkey/
├── docs/           # Product, methodology, audit
├── pricing/        # Versioned provider price sheets (JSON)
├── src/
│   ├── cli/        # CLI entry (estimate command)
│   ├── parser/     # YAML → normalized workloads
│   ├── pricing/    # Rate derivation, node floor, confidence
│   ├── estimator/  # Cost engine
│   └── warnings/   # Policy rules
└── apps/web/       # Next.js demo UI
```

## Development

```bash
# Root: shared engine tests (27 tests)
npm install
npm test
npm run build

# CLI (also: npm install -g podmonkey)
npm run podmonkey -- estimate -f examples/nginx-deployment.yaml
npm run podmonkey -- estimate -f k8s/ --base k8s.main/ --max-monthly-increase-usd 50
npx podmonkey estimate -f examples/nginx-deployment.yaml
kubectl get deploy,svc -o yaml | npx podmonkey estimate -f - --json

# GitHub Action (PR comments + policy gates) — see docs/GITHUB_ACTION.md
# uses: MarketMadi/podmonkey@v0.2.0

# Web app
cd apps/web && npm install && npm run dev
```

## Pricing data

Price sheets live in `pricing/` with `as_of` dates, `reference_instance`, and source URLs:

- `pricing/aws-us-east-1.json`
- `pricing/gcp-us-central1.json`
- `pricing/azure-eastus.json`
- `pricing/hetzner-fsn1.json` (`compute_model: node_only`)

Rate derivation: [docs/CALCULATION_PLAN.md](docs/CALCULATION_PLAN.md). CI asserts every sheet normalizes to its reference VM hourly price.

## Differentiation

| vs Kubecost | vs ReleaseRun | vs DeepCost |
|-------------|---------------|-------------|
| No cluster install | Prices **your YAML**, not sliders | Open source, not SaaS funnel |
| Multi-cloud compare in one view | Per-workload breakdown | Transparent methodology |
| Honest **range** (marginal .. node floor) | — | — |

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

Podmonkey is not affiliated with AWS, Google, Microsoft, Hetzner, Kubecost, or OpenCost. Estimates use public on-demand pricing and resource **requests** from your manifests. Excludes egress, NAT, Spot/reserved discounts, and idle node capacity. Actual bills depend on usage, discounts, networking, and bin-packing.
