# Podmonkey Calculation Plan

**Status:** Active — source of truth for making estimates defensible  
**Audience:** Contributors, reviewers, and anyone asking “are these numbers real?”  
**Companion docs:** [METHODOLOGY.md](./METHODOLOGY.md) (current formulas), [PRODUCT.md](./PRODUCT.md) (scope)

---

## 1. Why this document exists

Podmonkey is only useful if the numbers **help someone decide something**:

- *“Is this manifest too expensive before I deploy?”*
- *“Which provider is cheapest for **my** YAML?”*
- *“What’s the ballpark monthly run cost?”*

A single dollar figure that is wrong by 50% is worse than no figure. Our goal is not invoice precision — it is **decision-grade accuracy**: correct enough to rank providers, size clusters, and catch obvious waste, with honest bounds when certainty is low.

This plan defines:

1. **What** we calculate (and what we never claim to know)
2. **How** each line item is derived, with references to OpenCost and provider pricing
3. **Two compute models** so totals bracket reality instead of misleading with one number
4. **How we validate** the math before shipping

---

## 2. Design principle: helpful numbers

| A helpful number… | An unhelpful number… |
|-------------------|----------------------|
| Shows a **range** when billing model is ambiguous | Pretends ±0% precision |
| Traces to a **formula + price source + date** | Comes from a black box |
| Ranks providers **correctly** for the same YAML | Looks precise but uses inconsistent rates |
| Says **“low confidence”** when YAML lacks requests | Silently guesses and looks authoritative |
| Separates **compute, control plane, storage, LB** | Hides that a $73 EKS fee dominates a tiny app |

**Product rule:** Every estimate must answer *“what decision does this support?”* If it only supports “rough order of magnitude,” say so.

---

## 3. Industry foundation

Podmonkey aligns with the [OpenCost Specification v0.1](https://github.com/opencost/opencost/blob/develop/spec/opencost-specv01.md) (CNCF) and [Kubecost’s cost model](https://kubecost.github.io/cost-analyzer/).

### 3.1 Total cluster cost (OpenCost)

From [OpenCost — Foundational definitions](https://opencost.io/docs/specification/):

```
Total Cluster Costs = Workload Costs + Cluster Idle Costs + Cluster Overhead Costs
```

| Term | Meaning | Podmonkey static mode |
|------|---------|----------------------|
| **Workload costs** | Cost attributed to pods/containers | ✅ From YAML requests |
| **Cluster idle costs** | Node capacity not allocated to workloads | ❌ v1 — requires live nodes |
| **Cluster overhead** | Control plane, management fees | ✅ Flat fee per provider |

### 3.2 Workload allocation (OpenCost)

With a running cluster, OpenCost allocates compute as [**max(request, usage)**](https://github.com/opencost/opencost/blob/develop/spec/opencost-specv01.md#workload-costs) per container. Kubecost applies the same rule with [time-weighted max](https://kubecost.github.io/cost-analyzer/).

Without metrics (YAML only), Podmonkey uses **requests only** and discloses the gap. This matches the approach of [Kubecost’s cost-prediction-action](https://github.com/kubecost/cost-prediction-action), which uses default public cloud pricing when no live Kubecost API is available.

### 3.3 Monthly hours

Industry convention: **730 hours/month** (24 × 30.42). Used by Kubecost for monthly rate projections and referenced in [Kubecost Predict](https://www.apptio.com/blog/resource-cost-prediction/).

---

## 4. What Podmonkey estimates (line items)

```
Estimated Monthly Total ≈ Compute + Persistent Storage + Load Balancers + Control Plane
```

| Line item | Formula | Source |
|-----------|---------|--------|
| **Compute** | See §5 (two models) | Derived from reference VM on-demand rates |
| **Control plane** | `hourly_fee × 730` | [EKS](https://aws.amazon.com/eks/pricing/), [GKE](https://cloud.google.com/kubernetes-engine/pricing), [AKS](https://azure.microsoft.com/en-us/pricing/details/kubernetes-service/), [Hetzner](https://www.hetzner.com/cloud) (self-managed: $0) |
| **Persistent storage** | `Σ pvc_GiB × $/GiB-month` | [EBS](https://aws.amazon.com/ebs/pricing/), [GCE PD](https://cloud.google.com/compute/disks-image-pricing), [Azure Managed Disks](https://azure.microsoft.com/en-us/pricing/details/managed-disks/), [Hetzner Volumes](https://www.hetzner.com/cloud) |
| **Load balancers** | `count(type=LoadBalancer) × flat_monthly` | Provider LB pricing pages (LCU/usage excluded v1) |

### 4.1 Explicitly excluded (v1)

Disclosed in UI — never silently assumed zero:

| Component | Why excluded | Typical impact |
|-----------|--------------|----------------|
| Network egress / ingress | Bytes not in YAML | 5–30% for public web apps |
| NAT gateway | Not in manifests | Common on AWS EKS |
| Cross-AZ traffic | Not in manifests | Multi-AZ deployments |
| Spot / Reserved / CUD | User discounts unknown | Up to 70–90% swing |
| Cluster idle capacity | No node inventory | Dominates small clusters |
| LCU / connection charges on LBs | Usage not in YAML | Variable above flat fee |

References: [OpenCost — Cluster Asset Costs](https://opencost.io/docs/specification/), [AWS data transfer pricing](https://aws.amazon.com/ec2/pricing/on-demand/#Data_Transfer).

---

## 5. Compute: two models (critical for helpful totals)

Cloud providers bill **whole virtual machines**, not fractional cores. A deployment requesting 0.5 CPU still runs on a node you pay for hourly. A single marginal-rate number cannot capture both “allocated cost” and “minimum infrastructure cost.”

Podmonkey will show **both** as a range.

### 5.1 Model A — Marginal allocation (OpenCost static)

**Question it answers:** *“What is the cost of the resources this YAML **requests**, at published per-unit rates?”*

**Good for:** Comparing workloads, ranking providers on relative efficiency, FinOps allocation thinking.

For each container `c`, replica count `r`, month length `H = 730`:

```
CPU_cost_c    = allocated_cpu_c × r × H × rate_cpu
Memory_cost_c = allocated_mem_GiB_c × r × H × rate_mem

Compute_A = Σ_containers (CPU_cost_c + Memory_cost_c)
```

**Allocation rules** (from [Kubernetes resource requests](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/#requests-and-limits)):

1. Use `resources.requests` when present
2. Else use `resources.limits` → warning `USED_LIMITS_AS_PROXY`
3. Else use sheet defaults (100m CPU, 128Mi RAM) → warning `BESTEFFORT_QOS`
4. Never assume zero

**Replica rules:**

| Kind | Effective replicas |
|------|-------------------|
| `Deployment`, `StatefulSet` | `spec.replicas` (default 1) |
| `DaemonSet` | `node_count` (default 3, user override) |
| `Job` | `completions` or `parallelism` (default 1) |
| `CronJob` | `parallelism × runs_per_month(schedule)` |
| `Pod` | 1 |

Init containers: v1 treats as full monthly cost (conservative). v1.1 may prorate by expected runtime.

### 5.2 Model B — Node floor (bin-packing)

**Question it answers:** *“What is the **minimum** I pay if I must rent whole VMs to fit this workload?”*

**Good for:** Small clusters, “local dev → where do I host in prod?”, avoiding fake $12/mo totals.

```
total_cpu = Σ (container_cpu × replicas)
total_mem = Σ (container_mem_GiB × replicas)

nodes_by_cpu = ceil(total_cpu / vcpu_per_node)
nodes_by_mem = ceil(total_mem / gib_per_node)
nodes_needed = max(nodes_by_cpu, nodes_by_mem, min_nodes)

Compute_B = nodes_needed × reference_instance.hourly_usd × 730
```

Pick `reference_instance` (or cheapest catalog instance) that satisfies per-node CPU/RAM. For **Hetzner**, Model B is the **primary** model — you rent VPS instances, not per-core marginal rates ([Hetzner Cloud pricing](https://www.hetzner.com/cloud)).

Optional: `min_nodes = 2` toggle for HA (“practical production minimum”).

### 5.3 Display rule

```
Provider total = Compute_[A..B] + ControlPlane + Storage + LoadBalancers
```

Show as a **range** when `Compute_A ≠ Compute_B`:

```
AWS EKS:  $121 – $161 /mo
          ↑ Model A    ↑ Model B
```

When models converge (large workload filling exact node multiples), show a single figure.

---

## 6. Rate derivation (must be mathematically consistent)

Cloud VMs are sold as **instances**, not per-core. OpenCost [Appendix A](https://github.com/opencost/opencost/blob/develop/spec/opencost-specv01.md#appendix-a) recommends deriving CPU/RAM hourly rates from a reference node so component costs **sum to the node hourly price**.

### 6.1 Procedure (per provider/region price sheet)

1. Choose a **reference on-demand instance** (e.g. AWS `m6i.large` in us-east-1)
2. Record `vcpu`, `memory_gib`, `hourly_usd` from [provider pricing](https://aws.amazon.com/ec2/pricing/on-demand/)
3. Apply OpenCost **3:1 CPU-to-RAM unit weighting** (CPU core counts as 3 units, each GiB RAM as 1 unit):

```
total_units     = (vcpu × 3) + memory_gib
cpu_share       = (vcpu × 3) / total_units
mem_share       = memory_gib / total_units

cpu_per_vcpu_hour  = (hourly_usd × cpu_share) / vcpu
mem_per_gib_hour   = (hourly_usd × mem_share) / memory_gib
```

4. **Validate** (required in CI):

```
vcpu × cpu_per_vcpu_hour + memory_gib × mem_per_gib_hour ≈ hourly_usd
```

### 6.2 Known issue in current price sheets

As of the initial release, pre-computed rates in `pricing/*.json` were **not** re-validated against this normalization. Example — AWS `m6i.large` ($0.096/hr, 2 vCPU, 8 GiB):

| | Current sheet | Corrected (OpenCost Appendix A) |
|--|---------------|--------------------------------|
| `cpu_per_vcpu_hour` | $0.0416 | **$0.0206** |
| `mem_per_gib_hour` | $0.0052 | **$0.0069** |
| Sum for full node | $0.125/hr (**+30%** over actual) | **$0.096/hr** ✓ |

**Action:** Implement `deriveRatesFromReferenceInstance()` and regenerate all sheets. See [Implementation roadmap](#10-implementation-roadmap).

### 6.3 Worked example — nginx on AWS EKS

**Input:** [examples/nginx-deployment.yaml](../examples/nginx-deployment.yaml) — 3 replicas, 500m CPU, 512Mi RAM each, plus one LoadBalancer Service.

**Aggregated requests:**

```
total_cpu = 0.5 × 3 = 1.5 vCPU
total_mem = 0.5 × 3 = 1.5 GiB
```

**Rates:** `m6i.large` on-demand us-east-1 ≈ $0.096/hr ([EC2 on-demand pricing](https://aws.amazon.com/ec2/pricing/on-demand/)).

**Model A (corrected marginal):**

```
CPU:    1.5 × 730 × 0.0206 = $22.56
Memory: 1.5 × 730 × 0.0069 = $ 7.55
Compute_A ≈ $30.11
```

**Model B (node floor):**

Workload fits on one `m6i.large` (2 vCPU, 8 GiB):

```
Compute_B = 1 × 0.096 × 730 = $70.08
```

**Non-compute (same in both models):**

| Item | Calculation | Monthly |
|------|-------------|---------|
| EKS control plane | $0.10/hr × 730 ([EKS pricing](https://aws.amazon.com/eks/pricing/)) | $73.00 |
| Load balancer | 1 × $18 flat (NLB baseline, LCU excluded) | $18.00 |
| Storage | No PVCs | $0.00 |

**Totals:**

| Model | Compute | + Overhead | **Total** |
|-------|---------|------------|-----------|
| A (marginal) | $30 | $91 | **~$121/mo** |
| B (node floor) | $70 | $91 | **~$161/mo** |

**What a user should conclude:** This tiny nginx deployment costs **~$120–160/mo on EKS**, dominated by control plane + minimum node — not by pod CPU requests. Comparing providers on the same YAML is still valid; absolute dollars need the range.

> **Note:** The current engine (pre-fix) reports ~$51 compute and ~$142 total for this example — overstating marginal compute vs corrected Model A, but **understating** Model B. Implementing both models fixes the helpfulness problem.

---

## 7. Provider-specific notes

### 7.1 AWS EKS

| Item | Value | Reference |
|------|-------|-----------|
| Control plane | $0.10/cluster/hr | [EKS pricing](https://aws.amazon.com/eks/pricing/) |
| Worker nodes | EC2 on-demand (Model B) | [EC2 pricing](https://aws.amazon.com/ec2/pricing/on-demand/) |
| EBS gp3 | ~$0.08/GiB-mo | [EBS pricing](https://aws.amazon.com/ebs/pricing/) |
| Network LB | ~$16–22/mo + LCU | [ELB pricing](https://aws.amazon.com/elasticloadbalancing/pricing/); v1 uses ~$18 flat |

Extended support ($0.60/hr) documented but not default.

### 7.2 Google GKE

| Item | Value | Reference |
|------|-------|-----------|
| Control plane | $0.10/cluster/hr; one zonal cluster free per billing account | [GKE pricing](https://cloud.google.com/kubernetes-engine/pricing) |
| Worker nodes | GCE on-demand (Model B) | [GCE VM pricing](https://cloud.google.com/compute/vm-instance-pricing) |
| PD storage | pd-ssd ~$0.17/GiB-mo, pd-standard ~$0.04/GiB-mo | [Disk pricing](https://cloud.google.com/compute/disks-image-pricing) |

### 7.3 Azure AKS

| Item | Value | Reference |
|------|-------|-----------|
| Control plane | Free tier $0; Standard SLA $0.10/hr | [AKS pricing](https://azure.microsoft.com/en-us/pricing/details/kubernetes-service/) |
| Worker nodes | VM on-demand (Model B) | [Linux VM pricing](https://azure.microsoft.com/en-us/pricing/details/virtual-machines/linux/) |
| Managed disks | Premium ~$0.15/GiB-mo; Standard ~$0.04/GiB-mo | [Managed disk pricing](https://azure.microsoft.com/en-us/pricing/details/managed-disks/) |

### 7.4 Hetzner (k3s on VPS)

| Item | Value | Reference |
|------|-------|-----------|
| Control plane | $0 (self-managed k3s) | [Hetzner Cloud](https://www.hetzner.com/cloud) |
| Compute | **Model B primary** — cheapest CX/CAX instance that fits | [Server pricing](https://www.hetzner.com/cloud#pricing) |
| Volumes | ~€0.044/GiB-mo | [Volume pricing](https://www.hetzner.com/cloud) |
| Load balancer | LB11 ~€5.39/mo | [LB pricing](https://www.hetzner.com/cloud/load-balancer) |

Do **not** use marginal per-core rates for Hetzner — users rent whole servers.

---

## 8. Manifest confidence (when to trust the number)

YAML quality determines estimate quality. Podmonkey assigns a **confidence score** (planned) from deterministic rules:

| Signal | Weight | Rationale |
|--------|--------|-----------|
| All containers have CPU + memory requests | +40 | Core input to allocation ([K8s docs](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)) |
| No unpinned images (`:latest` or untagged) | +20 | Proxy for prod-readiness, not cost directly |
| PVC storage class specified | +15 | Maps to correct $/GiB tier |
| Explicit replica counts on Deployments | +10 | Avoids silent default of 1 |
| No limits-as-proxy fallbacks | +15 | Limits ≠ scheduling requests |

| Score | Label | UI behavior |
|-------|-------|-------------|
| 80–100 | **High** | Show range; suitable for provider comparison |
| 50–79 | **Medium** | Show range + warnings prominently |
| 0–49 | **Low** | Banner: “Estimate may differ ±50%+ from actual bill” |

Inspired by static-analysis honesty in tools like [Optiqor](https://github.com/optiqor/optiqor-cli).

---

## 9. Validation strategy

Numbers are only helpful if we **prove the math** before shipping.

### 9.1 Golden file tests (CI)

Hand-calculate expected outputs for each file in `examples/`:

| Fixture | Asserts |
|---------|---------|
| `nginx-deployment.yaml` | Model A compute, Model B node count, EKS control plane, LB fee |
| `redis-statefulset.yaml` | StatefulSet PVCs: 10 GiB × 3 replicas × storage rate |
| `fat-deployment.yaml` | Warnings fire; higher CPU/mem totals |

### 9.2 Price sheet tests (CI)

For every `pricing/*.json`:

```typescript
assert(ratesNormalizeToReferenceInstance(sheet))  // §6.1 step 4
assert(controlPlaneMonthly === sheet.control_plane.hourly_usd * 730)
assert(sheet.as_of is valid ISO date)
assert(sheet.sources is non-empty)
```

### 9.3 Cross-checks (manual, quarterly)

| Provider | Tool |
|----------|------|
| AWS | [EC2 pricing page](https://aws.amazon.com/ec2/pricing/on-demand/) for reference instance |
| GCP | [Google Cloud Pricing Calculator](https://cloud.google.com/products/calculator) |
| Azure | [Azure Pricing Calculator](https://azure.microsoft.com/en-us/pricing/calculator/) |
| Hetzner | [hetzner.com/cloud](https://www.hetzner.com/cloud) |

### 9.4 External benchmark (optional)

Compare compute line items against [Kubecost cost-prediction-action](https://github.com/kubecost/cost-prediction-action) on identical YAML. Target: within **±15%** on allocation model after rate fix.

---

## 10. Implementation roadmap

Ordered by impact on estimate helpfulness:

### Phase A — Fix rate math *(highest priority)*

- [ ] `deriveRatesFromReferenceInstance()` per OpenCost Appendix A (§6.1)
- [ ] Regenerate `pricing/*.json` rates; keep `reference_instance` as source of truth
- [ ] CI: normalization assertion on every sheet
- [ ] Update golden tests and [METHODOLOGY.md](./METHODOLOGY.md) worked example

### Phase B — Model B node floor

- [ ] `estimateNodeFloor(parse, sheet)` (§5.2)
- [ ] Add `instance_catalog` to price sheets (3–5 smallest instances per provider)
- [ ] Return `{ marginal, nodeFloor }` range per provider
- [ ] UI: range display instead of single total

### Phase C — Provider accuracy

- [ ] Hetzner: node-only model (§7.4)
- [ ] PVC storage class → rate mapping (not just default tier)
- [ ] CronJob: parse `spec.schedule` → real runs/month
- [ ] Optional `min_nodes = 2` for HA floor

### Phase D — Trust layer

- [ ] Manifest confidence score (§8)
- [ ] Expandable “show math” per line item
- [ ] Exclusions panel (egress, Spot, idle)
- [ ] Spot/reserved discount slider (0–90%)

### Phase E — Live cluster mode *(future)*

- [ ] Accept OpenCost / Prometheus metrics export
- [ ] Switch to `max(request, usage)` per [OpenCost workload costs](https://opencost.io/docs/specification/)
- [ ] Model cluster idle cost

---

## 11. What we promise users

> **Podmonkey provides defensible planning estimates — not invoices.**

| We will | We won’t |
|---------|----------|
| Show formula, inputs, and pricing `as_of` date | Claim ±5% accuracy from YAML alone |
| Show a range when models diverge | Hide the $73/mo EKS fee behind pod costs |
| Warn when YAML lacks requests | Guess zero resources |
| Rank providers on the same manifest fairly | Account for your enterprise discount without input |

When someone asks *“where should I host this?”* — the answer is **lowest range endpoint on the comparison table**, plus caveats in §7. When they ask *“what will I pay?”* — the answer is **Model B (node floor) through Model A (marginal)**, plus overhead, excluding network.

---

## 12. Primary references

1. [OpenCost Specification v0.1](https://github.com/opencost/opencost/blob/develop/spec/opencost-specv01.md) — foundational cost model, Appendix A rate derivation
2. [OpenCost docs — Specification summary](https://opencost.io/docs/specification/)
3. [Kubecost — cost model FAQ](https://kubecost.github.io/cost-analyzer/)
4. [Kubecost — Predicting Resource Cost Before Deployment](https://www.apptio.com/blog/resource-cost-prediction/)
5. [Kubecost cost-prediction-action](https://github.com/kubecost/cost-prediction-action) — static YAML + default pricing
6. [Kubernetes — Resource requests and limits](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
7. [AWS EKS pricing](https://aws.amazon.com/eks/pricing/)
8. [AWS EC2 on-demand pricing](https://aws.amazon.com/ec2/pricing/on-demand/)
9. [AWS EBS pricing](https://aws.amazon.com/ebs/pricing/)
10. [Google GKE pricing](https://cloud.google.com/kubernetes-engine/pricing)
11. [Google Compute Engine VM pricing](https://cloud.google.com/compute/vm-instance-pricing)
12. [Azure AKS pricing](https://azure.microsoft.com/en-us/pricing/details/kubernetes-service/)
13. [Azure Linux VM pricing](https://azure.microsoft.com/en-us/pricing/details/virtual-machines/linux/)
14. [Hetzner Cloud](https://www.hetzner.com/cloud)

---

## 13. Glossary

| Term | Definition |
|------|------------|
| **Model A (marginal)** | Request × hourly unit rate × 730h — allocation view |
| **Model B (node floor)** | Whole VMs required to fit requests — infrastructure view |
| **Planning-grade** | Suitable for comparison and sizing; typically ±30–50% of invoice |
| **Reference instance** | On-demand VM used to derive CPU/RAM hourly rates |
| **Normalization** | Adjusting derived rates so they sum to the reference instance hourly price |
| **Confidence score** | 0–100 measure of how much YAML quality supports the estimate |
