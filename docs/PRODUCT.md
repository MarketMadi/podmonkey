# Podmonkey — Product Specification

**Version:** 0.1 (draft)  
**Status:** Pre-alpha  
**Tagline:** Paste Kubernetes YAML. Compare cloud bills. Spot waste before you deploy.

---

## 1. Problem statement

Teams deploying to Kubernetes routinely discover cost surprises **after** workloads are running:

- Resource **requests** are set too high (or missing), so schedulers reserve capacity that is never used.
- The same manifest costs different amounts on **AWS EKS**, **GKE**, **AKS**, or **Hetzner** — but comparison is tedious.
- Enterprise FinOps tools (**Kubecost**, **CloudZero**, **CAST AI**) require cluster install, billing integrations, and sales cycles.
- **Terraform** cost tools (**Infracost**) estimate infrastructure, not arbitrary pasted manifests.
- **Cluster sizing calculators** (**ReleaseRun**, **DeepCost**) use sliders, not your actual YAML.

Podmonkey fills the gap: **manifest-first, zero-install, multi-provider comparison** with honest planning-grade math and policy warnings.

---

## 2. Target users

| Persona | Job to be done |
|---------|----------------|
| **Platform engineer** | Compare provider cost before choosing a cluster; sanity-check a team's deployment YAML |
| **SRE / DevOps** | Paste a manifest in a PR review; get a ballpark $/month without kubectl plugins |
| **Hiring / portfolio reviewer** | Click a live demo; see credible FinOps + K8s literacy in 30 seconds |
| **Learner** | Follow open tutorials (Terraform → k3s → Helm) around a real tool |

**Not targeting (v1):** enterprise chargeback, invoice reconciliation, autonomous rightsizing, or multi-cluster fleet management.

---

## 3. Product principles

1. **YAML in, numbers out** — primary input is pasted Kubernetes manifests (multi-doc `---` supported).
2. **Planning-grade, not invoice-grade** — disclose uncertainty; cite methodology; version pricing files.
3. **No cluster required** — static analysis only for v1; optional cluster hook later.
4. **Transparent math** — every line item traceable to formula + price sheet + source link.
5. **Cost + policy together** — surface waste (`:latest`, missing limits, fat requests) alongside dollars.
6. **Open by default** — MIT license, public repo, reproducible `pricing/*.json`.

---

## 4. Core user flow (v1)

```
┌─────────────────────────────────────────────────────────────┐
│  Paste YAML (editor)          │  Example: nginx, redis…   │
├───────────────────────────────┴─────────────────────────────┤
│  [Estimate]                                                  │
├─────────────────────────────────────────────────────────────┤
│  Provider comparison table                                   │
│  AWS EKS │ GKE │ AKS │ Hetzner                               │
│  $XXX    │ $XX │ $XX │ $XX    /month (planning estimate)     │
├─────────────────────────────────────────────────────────────┤
│  Breakdown: control plane │ compute │ storage │ load balancers│
├─────────────────────────────────────────────────────────────┤
│  Warnings: missing requests, :latest, no limits, …          │
├─────────────────────────────────────────────────────────────┤
│  Per-workload table (namespace/kind/name → CPU/RAM/$)       │
└─────────────────────────────────────────────────────────────┘
```

**Non-goals for v1:** login, saved projects, AI chat, live billing API, Helm chart upload (raw YAML only).

---

## 5. Supported Kubernetes resources (v1)

| Kind | Parsed for | Notes |
|------|------------|-------|
| `Deployment` | replicas, pod template resources | Primary workload |
| `StatefulSet` | replicas, pod template, volumeClaimTemplates | Includes template PVCs |
| `DaemonSet` | pod template | Cost = per-node × assumed node count (default 3, user override) |
| `Job` / `CronJob` | completions, parallelism, schedule | CronJob: assume schedule frequency × job cost |
| `Pod` | standalone pod specs | Direct paste |
| `PersistentVolumeClaim` | storage requests | $/GiB-month by storage class mapping |
| `Service` | `type: LoadBalancer` | Flat LB fee per service |
| `Ingress` | (v1.1) | Optional; provider-specific |

**Ignored in v1:** `ConfigMap`, `Secret`, `NetworkPolicy`, `HPA` (no auto-scaling simulation), `PVC` bound to cloud-specific classes beyond default mapping.

---

## 6. Cost model summary

Podmonkey v1 uses **Model A: Request-rate estimation** (aligned with [Kubecost Predict](https://www.apptio.com/blog/resource-cost-prediction/) without a cluster and the [OpenCost workload allocation formula](https://opencost.io/docs/specification/)).

Full detail: [METHODOLOGY.md](./METHODOLOGY.md). Accuracy roadmap: [CALCULATION_PLAN.md](./CALCULATION_PLAN.md).

### Monthly total (per provider)

```
Total = ControlPlane
      + ComputeWorkloads
      + PersistentStorage
      + LoadBalancers
      + (optional) ClusterManagementOverhead
```

Where:

- **ComputeWorkloads** = Σ (CPU_request_cores × 730 × $/CPU-hr + RAM_request_GiB × 730 × $/GB-hr) × replicas
- **ControlPlane** = flat monthly fee from provider price sheet
- **PersistentStorage** = Σ PVC_GiB × $/GiB-month
- **LoadBalancers** = count(LoadBalancer services) × flat $/LB-month

**730 hours/month** is the industry convention (~24 × 30.42); used by Kubecost for monthly rate projections.

### What we cannot know from YAML alone

| Missing signal | Impact |
|----------------|--------|
| Actual CPU/memory **usage** | We use **requests** only (OpenCost uses `max(request, usage)` with live metrics) |
| **Node bin-packing** efficiency | May over- or under-estimate vs real node bills |
| **Spot / reserved / CUD** discounts | Default to on-demand list pricing |
| **Data transfer / egress** | Excluded in v1 (flagged in UI) |
| **Idle cluster capacity** | Not modeled in v1 (no “idle cost” without nodes) |
| **Regional variation** | User picks region; one price sheet per provider+region |

---

## 7. Warnings engine (v1)

Rule-based, deterministic (inspired by [Optiqor](https://github.com/optiqor/optiqor-cli)’s honesty about static analysis limits):

| Rule ID | Severity | Trigger |
|---------|----------|---------|
| `NO_CPU_REQUEST` | warning | Container has no `resources.requests.cpu` |
| `NO_MEM_REQUEST` | warning | Container has no `resources.requests.memory` |
| `NO_LIMITS` | info | No `resources.limits` set |
| `BESTEFFORT_QOS` | warning | No requests at all |
| `IMAGE_LATEST` | warning | `image: *:latest` or untagged |
| `HIGH_CPU_REQUEST` | info | Single container > 4 CPU requested |
| `HIGH_MEM_REQUEST` | info | Single container > 8 Gi requested |
| `LOADBALANCER_COUNT` | info | N LoadBalancer services → $ impact callout |
| `MISSING_REPLICAS` | info | Deployment without explicit replicas (assume 1) |

---

## 8. Differentiation

See [COMPETITORS.md](./COMPETITORS.md) for full matrix.

**Podmonkey wedge:**

| Dimension | Podmonkey | Typical alternative |
|-----------|-----------|---------------------|
| Input | Raw multi-doc K8s YAML | Cluster sliders or Helm values |
| Install | Web URL, no agent | Helm + Prometheus + billing API |
| Compare | 4 providers in one view | Single provider or CLI |
| Hetzner | First-class price sheet | Often omitted |
| Open methodology | Public formulas + JSON | Black box SaaS |
| Tutorial arc | Platform engineering in public | Product docs only |

---

## 9. Roadmap

### Phase 0 — Docs + engine (current)
- [x] Product spec, methodology, competitor analysis
- [ ] YAML parser + resource aggregator
- [ ] Estimator with AWS price sheet
- [ ] Unit tests on sample manifests

### Phase 1 — Clicky demo
- [ ] Next.js UI: paste → estimate → compare table
- [ ] GCP, Azure, Hetzner price sheets
- [ ] Deploy to Fly.io or Render
- [ ] Example manifests gallery

### Phase 2 — Credibility
- [ ] **Model B:** bin-packing node estimator (optional toggle)
- [ ] GitHub Action: comment cost on PR (like Kubecost action)
- [ ] `pricing/` changelog with source URLs and fetch date

### Phase 3 — Platform engineering story
- [ ] Terraform module for demo hosting
- [ ] Ansible role for k3s lab
- [ ] Helm chart for self-hosted Podmonkey
- [ ] Blog/chapter series linked from README

### Phase 4 — Optional
- [ ] Cluster mode: OpenCost-compatible export if user provides metrics
- [ ] Helm `helm template` input
- [ ] EU GDPR note / client-side-only mode

---

## 10. Success metrics

| Metric | Target (3 months) |
|--------|-------------------|
| Live demo URL | 1 public deployment |
| GitHub stars | 50+ (aspirational) |
| Estimate latency | < 500ms for 50-resource manifest |
| Methodology page | Linked from every estimate |
| Hiring signal | README + demo link in CV |

---

## 11. Legal / trust

- **Disclaimer:** “Planning estimates only. Not a quote from AWS, Google, Microsoft, or Hetzner.”
- **Pricing data:** Static JSON, manually or script-updated; `as_of` date on each file.
- **Privacy:** v1 processes YAML in-browser or ephemeral server memory; no persistence unless user opts in later.
- **License:** MIT.

---

## 12. Glossary

| Term | Definition |
|------|------------|
| **Allocation** | Assigning asset cost to a workload (OpenCost: `max(request, usage)` for CPU/GPU) |
| **Control plane** | Managed K8s API/etcd/controllers (EKS/GKE charge ~$0.10/hr/cluster) |
| **Request-rate model** | Multiply resource requests × hourly unit rates |
| **Planning-grade** | ±30–50% of real bill typical; suitable for comparison, not finance close |

---

## References

- [OpenCost Specification v0.1](https://github.com/opencost/opencost/blob/develop/spec/opencost-specv01.md)
- [Kubecost cost model FAQ](https://kubecost.github.io/cost-analyzer/)
- [Kubecost Predict blog](https://www.apptio.com/blog/resource-cost-prediction/)
- [Kubernetes resource requests and limits](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [AWS EKS pricing](https://aws.amazon.com/eks/pricing/)
