# Pricing sources

**As of:** refreshed via `npm run refresh-pricing` (see [Pricing refresh](#pricing-refresh))

Podmonkey uses **list prices** from public provider APIs — not enterprise discounts, Spot, or reserved capacity. Every rate in `pricing/` and `pricing/gpu/` is fetched from a provider API; nothing is estimated or LLM-generated.

## Pricing refresh

```bash
# Refresh what you can (AWS + Azure work without credentials)
npm run refresh-pricing

# Full refresh — required for CI cron and before merge
export GCP_API_KEY=...          # Cloud Billing API enabled
export HETZNER_API_TOKEN=...    # Hetzner Cloud read-only token
npm run refresh-pricing -- --strict
npm test
```

**GitHub Actions** (`.github/workflows/refresh-pricing.yml`) runs every **3 days** with `--strict`, opens a PR when prices change. Add repository secrets:

| Secret | Purpose |
|--------|---------|
| `GCP_API_KEY` | [Cloud Billing Catalog API](https://cloud.google.com/billing/docs/reference/pricing-api) |
| `HETZNER_API_TOKEN` | [Hetzner Cloud API](https://docs.hetzner.com/cloud/api/getting-started/generating-api-token/) (read-only) |

**APIs used (no auth unless noted):**

| Provider | Endpoint |
|----------|----------|
| AWS | [EC2 Price List API](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/index.json) |
| Azure | [Retail Prices API](https://prices.azure.com/api/retail/prices) |
| GCP | Cloud Billing Catalog API (`GCP_API_KEY`) |
| Hetzner | `GET /pricing` (`HETZNER_API_TOKEN`) + [EUR→USD](https://open.er-api.com/v6/latest/EUR) |

Sheets include `as_of` (date) and `fetched_at` (ISO timestamp). CI fails if sheets are older than 4 days.

---

## AWS EKS (`pricing/aws-us-east-1.json`)

| Component | Rate | Source |
|-----------|------|--------|
| Control plane | $0.10/hr ($73/mo) | [EKS pricing](https://aws.amazon.com/eks/pricing/) |
| t4g.medium | $0.0336/hr | [EC2 on-demand](https://aws.amazon.com/ec2/pricing/on-demand/) |
| t3.medium | $0.0416/hr | EC2 on-demand |
| m6i.large (reference) | $0.096/hr | EC2 on-demand |
| gp3 | $0.08/GiB-mo | [EBS pricing](https://aws.amazon.com/ebs/pricing/) |
| gp2 | $0.10/GiB-mo | EBS pricing |
| io1/io2 | $0.125/GiB-mo | EBS pricing (provisioned; IOPS extra not modeled) |
| ALB / Ingress | ~$18/mo base | [ELB pricing](https://aws.amazon.com/elasticloadbalancing/pricing/) |

Marginal CPU/RAM rates are **derived** from `m6i.large` per [OpenCost Appendix A](https://opencost.io/docs/specification/).

## Google GKE (`pricing/gcp-us-central1.json`)

| Component | Rate | Source |
|-----------|------|--------|
| Control plane | $0.10/hr (1 free zonal cluster) | [GKE pricing](https://cloud.google.com/kubernetes-engine/pricing) |
| e2-medium | ~$0.0335/hr | [GCE pricing](https://cloud.google.com/compute/vm-instance-pricing) |
| e2-standard-2 (reference) | $0.067/hr | GCE pricing |
| pd-standard | $0.04/GiB-mo | [Persistent disk](https://cloud.google.com/compute/disks-pricing) |
| pd-balanced | $0.10/GiB-mo | Persistent disk |
| pd-ssd | $0.17/GiB-mo | Persistent disk |

## Azure AKS (`pricing/azure-eastus.json`)

| Component | Rate | Source |
|-----------|------|--------|
| Control plane | Free tier / $0.10/hr standard | [AKS pricing](https://azure.microsoft.com/en-us/pricing/details/kubernetes-service/) |
| Standard_B2s | ~$0.042/hr | [Linux VMs](https://azure.microsoft.com/en-us/pricing/details/virtual-machines/linux/) |
| Standard_D2s_v5 (reference) | $0.096/hr | Linux VMs |
| Managed Standard | $0.04/GiB-mo | [Managed disks](https://azure.microsoft.com/en-us/pricing/details/managed-disks/) |
| Managed Premium | $0.15/GiB-mo | Managed disks |

## Hetzner k3s (`pricing/hetzner-fsn1.json`)

| Component | Rate | Source |
|-----------|------|--------|
| Control plane | $0 (self-managed k3s) | — |
| cx22 | ~$0.0077/hr | [Hetzner Cloud](https://www.hetzner.com/cloud) |
| cx32 (reference) | $0.0118/hr | Hetzner Cloud |
| Volume | €0.0477/GiB-mo → ~$0.052 | [Volumes](https://www.hetzner.com/cloud) |
| Load balancer | ~$5.90/mo | Hetzner LB |
| Ingress | $0 (no separate LB fee modeled) | — |

## GPU inference (`pricing/gpu/`)

| File | Instances | Source |
|------|-----------|--------|
| `aws-us-east-1.json` | g4dn, g5, p4d | AWS Price List API |
| `azure-eastus.json` | NCas T4, NCads A100 | Azure Retail Prices API |
| `gcp-us-central1.json` | g2 (L4), a2 (A100) | GCP Cloud Billing Catalog API |
| `hetzner-fsn1.json` | GEX44, GEX130 | Hetzner Cloud API |

## Validation

CI runs:

- `src/pricing/benchmark.test.ts` — CPU sheet structure and spot checks
- `src/pricing/gpu-benchmark.test.ts` — GPU sheets, freshness, API provenance

Update pricing:

```bash
npm run refresh-pricing -- --strict && npm test
```
