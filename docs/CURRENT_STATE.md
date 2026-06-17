# Podmonkey — Current State Audit

**Purpose:** Answer “does the code do what we say it does?” before building GitHub Action, calibrate mode, or kubectl export.

**Last reviewed:** 2026-06-17  
**Tests:** 22 passing (`npm test`)

---

## 1. What we claim vs what the code does

| Claim | Code path | Verdict |
|-------|-----------|---------|
| Paste multi-doc Kubernetes YAML | `parseManifests()` → `js-yaml` `loadAll` | ✅ Works |
| Compare AWS, GCP, Azure, Hetzner | `apps/web/lib/engine.ts` loads 4 sheets | ✅ Works |
| No cluster / agent required | Static parser + JSON pricing only | ✅ True |
| Estimates from resource **requests** | `parser/containerResources()` uses requests first | ✅ Works |
| Fallback: limits → defaults with warnings | Same function + `collectWarnings()` | ✅ Works |
| Marginal compute (OpenCost-style) | `computeMarginalMonthly()` + `deriveRatesFromReference()` | ✅ Works, tested |
| Node floor compute (whole VMs) | `computeNodeFloorMonthly()` + `nodesNeeded()` | ✅ Works, tested |
| Show **range** when models differ | `totalMonthlyUsdRange`, UI `formatUsdRange` | ✅ Works |
| Hetzner = node-only (VPS model) | `compute_model: "node_only"` in hetzner sheet | ✅ Works, tested |
| Control plane fees | `controlPlaneMonthly()` per provider | ✅ Works |
| GKE free zonal / AKS free tier | `EstimateOptions` in web `runEstimate()` | ✅ Wired in UI |
| PVC storage from YAML | `pvcFromDoc`, StatefulSet `volumeClaimTemplates` | ✅ Works, parser tests |
| LoadBalancer flat fee | `services` where `type === LoadBalancer` | ✅ Works, tested |
| Per-workload breakdown | `EstimateResult.workloads[]` | ✅ Works |
| Policy warnings | `collectWarnings()` | ✅ Partial (see gaps) |
| Manifest confidence score | `assessConfidence()` | ✅ Works, tested |
| Planning-grade, not invoice | UI disclaimer + range display | ✅ Honest |

---

## 2. Data flow (as built)

```
YAML string
  └─ parseManifests(yaml, defaults)
       ├─ workloads[]   (Deployment, StatefulSet, DaemonSet, Job, CronJob, Pod)
       ├─ pvcs[]        (PVC + StatefulSet templates)
       └─ services[]    (LoadBalancer counting)

  └─ estimate(parse, sheets[], options)
       ├─ resolveRates(sheet)           ← derived from reference_instance (NOT json.rates)
       ├─ computeMarginalMonthly()      ← Model A
       ├─ computeNodeFloorMonthly()     ← Model B
       ├─ controlPlane + storage + LB
       ├─ collectWarnings()
       └─ assessConfidence()

  └─ UI (apps/web) renders ranges + confidence
```

**Entry point for integrators:** `parseManifests` + `estimate` from `src/index.ts`.

---

## 3. Verified worked example (golden tests)

**nginx Deployment** — 3 replicas, 500m CPU, 512Mi RAM, AWS `m6i.large` reference:

| Line item | Model A (min) | Model B (max) |
|-----------|---------------|---------------|
| Compute | ~$30/mo | ~$70/mo (1 node) |
| EKS control plane | $73 | $73 |
| **Total** | **~$103/mo** | **~$143/mo** |

**+ LoadBalancer Service:** **~$121–$161/mo** (adds $18 flat LB fee).

Source: `src/estimator/estimator.test.ts`

---

## 4. Gaps — what we say vs what we don’t do yet

### Documentation drift
- ~~`README.md` still shows a single marginal formula~~ — updated
- `METHODOLOGY.md` worked example may still use pre-fix numbers (check before citing externally).
- `pricing/*.json` `rates` fields are **ignored** at runtime; rates come from `reference_instance` only.

### Parser limitations
| Item | Current behavior | Documented? |
|------|------------------|-------------|
| CronJob schedule | `parallelism × 30` guess | ⚠️ Partial |
| Init containers | Full monthly cost (conservative) | In METHODOLOGY |
| HPA / autoscaling | Not modeled | Yes (excluded) |
| Ingress | Not parsed | Yes (v1.1) |
| GPU | Not parsed | Yes (v1.1) |

### Estimator limitations
| Item | Current behavior |
|------|------------------|
| Node floor VM | Only `reference_instance` (one size per provider), not cheapest catalog VM |
| Idle cluster cost | Not modeled |
| Network egress / NAT | Not modeled (UI mentions exclusion) |
| Spot / reserved / EDP | Not modeled |
| LCU / LB usage charges | Flat monthly only |
| Multi-cluster | Assumes 1 cluster |

### Warnings vs PRODUCT.md spec
Implemented: `BESTEFFORT_QOS`, `USED_LIMITS_AS_PROXY`, `HIGH_CPU_REQUEST`, `HIGH_MEM_REQUEST`, `IMAGE_LATEST`, `SINGLE_REPLICA`, `LOADBALANCER_COUNT`

Not implemented as separate IDs: `NO_CPU_REQUEST`, `NO_MEM_REQUEST`, `NO_LIMITS`, `MISSING_REPLICAS` (partially covered by other rules)

### Test coverage
- ✅ Units, parser, AWS golden examples, rate normalization (all 4 sheets), Hetzner node-only
- ✅ `redis-statefulset.yaml` — 30 GiB PVC storage at gp3 ($2.40/mo) + compute range
- ✅ CLI `runEstimate` + text/JSON formatters
- ❌ No cross-provider ranking integration test
- ❌ GCP/Azure line items not individually asserted

---

## 5. Extension points (where future features plug in)

| Future feature | Plugs into | Why it fits |
|----------------|------------|-------------|
| **GitHub Action** | `parseManifests` + `estimate` CLI wrapper | Engine is pure TS; **CLI now exists** (`podmonkey estimate`) |
| **Calibrate mode** | `resolveRates(sheet)` | Today derives from `reference_instance`; calibrate = override with cluster’s $/CPU-hr and $/GiB-hr from OpenCost/Kubecost API |
| **kubectl export** | Input layer before `parseManifests` | `kubectl get deploy,sts,svc,pvc -o yaml` produces same YAML shape we already parse |
| **Custom price book** | `PriceSheet` or `EstimateOptions` | Override `reference_instance.hourly_usd` or injected rates |
| **Instance catalog** | `computeNodeFloorMonthly` | Pick cheapest VM from `instance_catalog[]` instead of single reference |

---

## 6. Are the next steps logical?

### GitHub Action — ✅ Logical, low risk
- **Depends on:** stable `estimate()` API ← we have it
- **Delivers:** Distribution + CI workflow (Infracost playbook)
- **Does not require:** cluster, new math, or UI
- **Build:** `npx podmonkey estimate -f ./manifests/` or action.yml calling the same engine

### Calibrate mode — ✅ Logical, medium effort
- **Depends on:** `resolveRates()` abstraction ← already isolated in `derive-rates.ts`
- **Delivers:** “Real world” rates without building full Kubecost
- **Input:** OpenCost/Kubecost API URL → fetch effective $/resource-hour for your cluster
- **Does not replace:** YAML parsing; replaces only the rate source
- **Honest label:** “Calibrated estimate” not “invoice”

### kubectl export input — ✅ Logical, low effort
- **Depends on:** `parseManifests(string)` ← already accepts any valid K8s YAML
- **Delivers:** Estimate what’s **running**, not just what you paste from git
- **Build:** CLI flag `--from-cluster` runs `kubectl get ... -o yaml` then pipes to existing parser
- **Caveat:** Cluster YAML often lacks full Deployment spec (stripped fields); document limitations

### Order recommendation
1. **Stabilize & document current state** (this file + fix README drift)
2. **CLI** (`podmonkey estimate -f file.yaml`) — prerequisite for Action
3. **GitHub Action** — distribution
4. **kubectl export** — better input, still static rates
5. **Calibrate mode** — first paid-tier differentiator

---

## 7. Honest one-liner

**Today Podmonkey truthfully:** parses Kubernetes YAML, derives OpenCost-normalized rates from reference VMs, returns a marginal-to-node-floor monthly **range** across four providers, with confidence and warnings — **without a cluster**.

**Today Podmonkey does not:** know your actual usage, discounts, egress, or exact VM SKU mix.

That is sufficient for **pre-deploy provider comparison**. It is not sufficient for **finance close** — and the code + UI now say so.
