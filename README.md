# Podmonkey 🐒

**Paste Kubernetes YAML. Compare cloud bills. Spot waste before you deploy.**

Podmonkey is an open-source, manifest-first Kubernetes cost estimator. It parses your YAML and produces **planning-grade** monthly cost comparisons across **AWS EKS**, **Google GKE**, **Azure AKS**, and **Hetzner** — no cluster agent, no login, no enterprise sales call.

> Planning estimates only — not an invoice. See [docs/METHODOLOGY.md](docs/METHODOLOGY.md) for the exact math (aligned with [OpenCost](https://opencost.io/docs/specification/) and [Kubecost Predict](https://www.apptio.com/blog/resource-cost-prediction/)).

## Quick links

| Doc | Description |
|-----|-------------|
| [Product spec](docs/PRODUCT.md) | Vision, scope, roadmap, warnings |
| [Methodology](docs/METHODOLOGY.md) | Formulas, price sheet schema, worked example |
| [Competitors](docs/COMPETITORS.md) | Side-by-side vs Kubecost, ReleaseRun, Optiqor, etc. |

## Try it (coming soon)

```bash
cd apps/web
npm install
npm run dev
# → http://localhost:3002
```

## How it works

```
YAML manifests
    → parse (Deployment, StatefulSet, PVC, Service…)
    → aggregate CPU/RAM/storage/LB counts
    → multiply by pricing/aws-us-east-1.json (etc.)
    → compare providers + emit warnings
```

**Core formula (compute):**

```
monthly_cpu_cost = cpu_cores × replicas × 730 × $/vcpu-hour
monthly_mem_cost = memory_giB × replicas × 730 × $/gib-hour
```

Plus control plane, PVC storage, and LoadBalancer flat fees per provider.

## Project structure

```
podmonkey/
├── docs/           # Product, methodology, competitors
├── pricing/        # Versioned provider price sheets (JSON)
├── src/
│   ├── parser/     # YAML → normalized workloads
│   ├── estimator/  # Cost engine
│   └── warnings/   # Policy rules
└── apps/web/       # Next.js demo UI
```

## Development

```bash
# Root: shared engine tests
npm install
npm test

# Web app
cd apps/web && npm install && npm run dev
```

## Pricing data

Price sheets live in `pricing/` with `as_of` dates and source URLs. Example:

- `pricing/aws-us-east-1.json`
- `pricing/gcp-us-central1.json` (planned)
- `pricing/azure-eastus.json` (planned)
- `pricing/hetzner-fsn1.json` (planned)

## Differentiation

| vs Kubecost | vs ReleaseRun | vs DeepCost |
|-------------|---------------|-------------|
| No cluster install | Prices **your YAML**, not sliders | Open source, not SaaS funnel |
| Multi-cloud compare in one view | Per-workload breakdown | Transparent methodology |

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

Podmonkey is not affiliated with AWS, Google, Microsoft, Hetzner, Kubecost, or OpenCost. Estimates use public on-demand pricing and resource **requests** from your manifests. Actual bills depend on usage, discounts, networking, and bin-packing.
