# Pricing sources

**As of:** 2026-06-18  
**Convention:** On-demand Linux unless noted. **730 h/mo** for compute.

Podmonkey uses **list prices** from public provider pages — not enterprise discounts, Spot, or reserved capacity.

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

## Validation

CI runs `src/pricing/benchmark.test.ts`:

- OpenCost rate normalization per sheet
- Published list-price spot checks (EKS $73, gp3 $0.08, etc.)
- Storage class mapping (`gp2`, `premium-rwo`, `io2`)

Update `as_of` and re-run `npm test` when refreshing sheets.
