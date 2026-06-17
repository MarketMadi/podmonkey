# Podmonkey Cost Methodology

This document defines **exactly** how Podmonkey turns Kubernetes YAML into monthly dollar estimates. It is aligned with industry-standard approaches from the [OpenCost Specification](https://opencost.io/docs/specification/) and [Kubecost](https://kubecost.github.io/cost-analyzer/), adapted for **static manifest analysis** (no running cluster, no Prometheus, no billing API).

> **Roadmap for making numbers decision-grade:** See [CALCULATION_PLAN.md](./CALCULATION_PLAN.md) — dual compute models (marginal + node floor), rate normalization fixes, confidence scoring, and CI validation. This methodology doc describes the **current** engine; the calculation plan describes what we are building toward.

---

## 1. Design constraints

Podmonkey v1 operates in **offline / static mode**:

| OpenCost/Kubecost (live cluster) | Podmonkey v1 (YAML only) |
|----------------------------------|--------------------------|
| `max(request, usage)` from cAdvisor | **requests only** (usage unknown) |
| Node hourly rate from cloud billing API | **Reference on-demand rates** from `pricing/*.json` |
| Idle cost = cluster assets − allocated | **Not modeled** (no node inventory) |
| PV cost from actual bound volumes | PVC **requested** capacity |
| Network egress from metrics | **Excluded** (disclosed) |

We label output **planning-grade**. Kubecost’s own GitHub Action states that without a Kubecost API, predictions use [default public cloud pricing](https://github.com/kubecost/cost-prediction-action) — the same class of estimate Podmonkey provides, with explicit formulas.

---

## 2. Foundational definitions (from OpenCost)

OpenCost partitions cluster spend as:

```
Total Cluster Costs = Workload Costs + Cluster Idle Costs + Cluster Overhead Costs
```

Where **Cluster Overhead** includes control plane / management fees, and **Cluster Assets** include nodes, PVs, load balancers, and network.

Source: [OpenCost Specification — Foundational definitions](https://github.com/opencost/opencost/blob/develop/spec/opencost-specv01.md#foundational-definitions)

Podmonkey v1 estimates:

```
Estimated Monthly Total ≈ Workload Compute + Persistent Storage + Load Balancers + Control Plane Overhead
```

We **do not** estimate idle node cost or egress in v1.

---

## 3. Workload allocation formula

### 3.1 OpenCost / Kubecost standard (with metrics)

For workloads with allocation-based resources:

> Workload Costs should be understood as **max(request, usage)** when Assets have Resource Allocation Costs, e.g. CPU or GPU.

Source: [OpenCost Spec — Workload Costs](https://github.com/opencost/opencost/blob/develop/spec/opencost-specv01.md#workload-costs)

Kubecost applies the same rule with time weighting:

> Resources are allocated based on the time-weighted maximum of resource requests and usage over the measured period.

Source: [Kubecost cost model FAQ](https://kubecost.github.io/cost-analyzer/)

### 3.2 Podmonkey static adaptation

Without metrics, Podmonkey uses:

```
allocated_cpu   = cpu_request   (cores)
allocated_memory = memory_request (GiB)
```

**Fallback order** when requests are missing:

1. Use `resources.limits` if present → emit `USED_LIMITS_AS_PROXY` warning
2. Else use provider default minimum (configurable, default 100m CPU / 128Mi RAM) → emit `BESTEFFORT_QOS` warning
3. Never silently assume zero

This follows Kubernetes scheduling reality: the kube-scheduler uses **requests** for placement ([K8s docs](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/#requests-and-limits)).

### 3.3 Replica multiplication

| Workload kind | Effective replica count |
|---------------|-------------------------|
| `Deployment`, `StatefulSet` | `spec.replicas` (default **1** if omitted) |
| `DaemonSet` | `node_count` (user setting, default **3**) |
| `Job` | `spec.completions` or `parallelism` (default 1) |
| `CronJob` | `parallelism × runs_per_month(schedule)` |
| Standalone `Pod` | 1 |

### 3.4 Init containers and sidecars

Sum **all containers** in the pod template (app + sidecar + init). Init containers run to completion — v1 treats them as full monthly cost (conservative); v1.1 may prorate.

---

## 4. Compute cost formula

### 4.1 Core equation

For each container `c`, replica count `r`, month length `H = 730` hours:

```
CPU_cost_c    = allocated_cpu_c × r × H × rate_cpu
Memory_cost_c = allocated_mem_GiB_c × r × H × rate_mem
```

```
ComputeWorkloads = Σ_containers (CPU_cost_c + Memory_cost_c)
```

**730 hours** = standard monthly hours used in Kubecost “monthly rate” projections (24 × 30.42).

### 4.2 Kubecost Predict equivalence

Kubecost Predict (with cluster data) computes:

> monthly resource-hours of your workload × cost per resource-hour

Source: [Apptio — Predicting Resource Cost Before Deployment](https://www.apptio.com/blog/resource-cost-prediction/)

Podmonkey uses the same multiplication with **static** `rate_cpu` and `rate_mem` from price sheets.

### 4.3 Deriving $/CPU-hr and $/GB-hr (OpenCost Appendix A)

Cloud VMs are sold as **instances**, not per-core. OpenCost recommends:

> When explicit RAM, CPU or GPU prices are not provided … use a scalable ratio of CPU, GPU, RAM … normalized so the sum equals the total price of the node.

Example from the spec: node costs $35/mo with 1 GPU, 1 CPU, 1 GB RAM → normalize to $15 GPU + $15 CPU + $5 RAM (CPU and GPU each **3×** RAM GB price).

Source: [OpenCost Spec — Appendix A](https://github.com/opencost/opencost/blob/develop/spec/opencost-specv01.md#appendix-a)

**Podmonkey procedure** for each provider/region price sheet:

1. Pick a **reference instance** (e.g. AWS `m6i.large`: 2 vCPU, 8 GiB)
2. Read **on-demand hourly** price from provider pricing page
3. Set marginal rates:
   - `base_cpu_hr = hourly_price × (cpu_ratio / (cpu_ratio + ram_ratio/3))`  
   - `base_ram_GiB_hr = hourly_price × (ram_ratio / (cpu_ratio + ram_ratio/3)) / ram_GiB`
4. Normalize so `cpu_cores × base_cpu_hr + ram_GiB × base_ram_GiB_hr = hourly_price`

Default ratio: **1 vCPU : 4 GiB RAM** (general-purpose family shape).

### 4.4 GPU (v1.1)

OpenCost treats GPU as allocation cost with `max(request, usage)`. Podmonkey will use:

```
GPU_cost = gpu_count × r × H × rate_gpu_hr
```

Rates derived from `g4dn.xlarge` or provider equivalent.

---

## 5. Control plane overhead

Flat monthly management fee per cluster (one cluster assumed unless user overrides).

| Provider | Standard tier | Source |
|----------|---------------|--------|
| **AWS EKS** | $0.10/cluster/hr ≈ **$73/mo** | [AWS EKS pricing](https://aws.amazon.com/eks/pricing/) |
| **Google GKE** | $0.10/cluster/hr; **one zonal cluster free** per billing account | [GKE pricing](https://cloud.google.com/kubernetes-engine/pricing) |
| **Azure AKS** | **Free tier** $0 control plane; Standard **$0.10/hr** | [AKS pricing](https://azure.microsoft.com/en-us/pricing/details/kubernetes-service/) |
| **Hetzner** | **$0** managed control plane (self-managed k3s on VPS) | [Hetzner Cloud](https://www.hetzner.com/cloud) |

Podmonkey exposes a **tier toggle** (e.g. AKS free vs standard) in advanced settings.

Extended support pricing (EKS $0.60/hr) is documented but not default.

---

## 6. Persistent storage

OpenCost PVC allocation:

> Storage Volume — The storage capacity of Persistent Volume Claim (PVC) requests measured in bytes or gigabytes.

```
Storage_cost = Σ pvc_GiB × rate_storage_GiB_month
```

Rates by **storage class mapping** in price sheet:

| Abstract class | AWS example | Rate basis |
|----------------|-------------|------------|
| `default` / `gp3` | EBS gp3 | $/GiB-month [EBS pricing](https://aws.amazon.com/ebs/pricing/) |
| `ssd` / `io2` | Provisioned IOPS | Higher tier |
| `standard` / `hdd` | st1 | Lower tier |

PVCs embedded in `StatefulSet.volumeClaimTemplates` are counted per replica:

```
statefulset_storage = template_GiB × replicas × rate
```

---

## 7. Load balancers

OpenCost lists load balancers under assets with allocation + usage costs.

Podmonkey v1 uses a **flat monthly fee per `Service` with `type: LoadBalancer`**:

```
LB_cost = count(services where spec.type == LoadBalancer) × rate_lb_month
```

Reference rates (us-east-1, approximate):

| Provider | Component | ~Monthly |
|----------|-----------|----------|
| AWS | Network LB | ~$16–22 + LCU (LCU excluded v1) |
| GCP | Forwarding rule | ~$18 |
| Azure | Standard LB | ~$18 |
| Hetzner | LB11 | ~€5.39 |

We use conservative flat constants documented in each `pricing/*.json` with `as_of` date.

---

## 8. What is excluded (v1)

| Component | Reason |
|-----------|--------|
| **Network egress / ingress** | Bytes not in YAML |
| **NAT gateway** | Not derivable from manifests |
| **Cross-AZ traffic** | Not derivable |
| **Observability stack** | Unless deployed in pasted YAML |
| **Fargate / serverless pods** | Different billing model (v2) |
| **Cluster idle cost** | Requires node inventory |
| **Reserved / Spot / CUD** | Use on-demand unless user applies discount factor |
| **Taxes** | — |

---

## 9. Optional Model B: Bin-packing node estimate (Phase 2)

A second estimate mode fits total CPU/RAM requests onto the **cheapest instance type** that satisfies bin-packing:

```
nodes = ceil(max(total_cpu / cpu_per_node, total_ram / ram_per_node))
Node_cost = nodes × reference_instance_hourly × 730
```

Compare Model A vs B in UI; show spread as “scheduling uncertainty band.”

This better approximates **whole-node billing** but still ignores utilization and fragmentation.

---

## 10. Uncertainty and disclosure

| Factor | Typical impact |
|--------|----------------|
| No usage metrics | 20–50% vs allocated-only bills |
| On-demand vs Spot | Up to 70–90% swing |
| Missing network | 5–30% on web-facing apps |
| Region | ±15% |

Podmonkey displays:

> **Planning estimate** — not an invoice. Based on resource **requests**, on-demand rates as of `{as_of}`, 730 h/mo. See [methodology](METHODOLOGY.md).

Optiqor uses ±40% disclosure for static Helm analysis; Podmonkey adopts similar honesty.

---

## 11. Worked example

**Input:** Deployment `nginx`, 3 replicas, 1 container:

```yaml
resources:
  requests:
    cpu: "500m"
    memory: "512Mi"
```

**Assumptions:** AWS us-east-1, rates from `pricing/aws-us-east-1.json`:
- `rate_cpu` = $0.0416 / vCPU-hour (derived from m6i.large)
- `rate_mem` = $0.0052 / GiB-hour

**Compute:**

```
CPU:    0.5 × 3 × 730 × 0.0416 = $45.55
Memory: 0.5 × 3 × 730 × 0.0052 = $ 5.69
Subtotal compute: $51.24
```

**Control plane (EKS):** $73.00

**Estimated total:** **~$124.24 / month** (workload + one EKS cluster)

---

## 12. Price sheet schema (`pricing/*.json`)

```json
{
  "provider": "aws",
  "service": "eks",
  "region": "us-east-1",
  "as_of": "2026-06-15",
  "sources": ["https://aws.amazon.com/eks/pricing/", "https://aws.amazon.com/ec2/pricing/on-demand/"],
  "hours_per_month": 730,
  "control_plane": { "hourly_usd": 0.10, "tier": "standard" },
  "reference_instance": { "type": "m6i.large", "vcpu": 2, "memory_gib": 8, "hourly_usd": 0.096 },
  "rates": {
    "cpu_per_vcpu_hour_usd": 0.0416,
    "memory_per_gib_hour_usd": 0.0052,
    "gpu_per_hour_usd": null
  },
  "storage": {
    "gp3_per_gib_month_usd": 0.08
  },
  "load_balancer_monthly_usd": 18.0
}
```

---

## 13. Implementation checklist

- [ ] `parseManifests(yaml)` → normalized `Workload[]`
- [ ] `aggregateResources(workloads)` → totals
- [ ] `estimateCompute(totals, priceSheet)` → line items
- [ ] `estimateStorage(pvcs, priceSheet)`
- [ ] `estimateLoadBalancers(services, priceSheet)`
- [ ] `estimateControlPlane(priceSheet, options)`
- [ ] `runWarnings(workloads)` → `Warning[]`
- [ ] Golden tests against hand-calculated examples

---

## Primary references

1. [OpenCost Specification v0.1 (CNCF)](https://github.com/opencost/opencost/blob/develop/spec/opencost-specv01.md)
2. [OpenCost docs — Specification summary](https://opencost.io/docs/specification/)
3. [Kubecost — cost model FAQ](https://kubecost.github.io/cost-analyzer/)
4. [Kubecost — Predicting Resource Cost (Apptio)](https://www.apptio.com/blog/resource-cost-prediction/)
5. [Kubecost cost-prediction-action — default pricing mode](https://github.com/kubecost/cost-prediction-action)
6. [Kubernetes — Resource requests and limits](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
7. [AWS EKS pricing](https://aws.amazon.com/eks/pricing/)
8. [Google GKE pricing](https://cloud.google.com/kubernetes-engine/pricing)
9. [Azure AKS pricing](https://azure.microsoft.com/en-us/pricing/details/kubernetes-service/)
