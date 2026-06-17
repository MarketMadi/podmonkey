# Competitor Landscape — Podmonkey

Side-by-side comparison of tools in the **Kubernetes cost estimation / monitoring** space. Last updated: 2026-06-15.

---

## 1. Category map

```
                    NEEDS RUNNING CLUSTER?
                    │
         NO         │         YES
    ┌───────────────┼───────────────┐
    │               │               │
    │  Podmonkey    │   Kubecost    │
    │  ReleaseRun   │   OpenCost    │
    │  DeepCost*    │   CAST AI     │
    │  Optiqor CLI  │   CloudZero   │
    │  kubectl-cost │   nOps, etc.  │
    │  (predict)    │               │
    │               │               │
    INPUT:          │   INPUT:      │
    YAML / sliders  │   metrics +   │
                   │   billing API │
    └───────────────┴───────────────┘

    * DeepCost: marketing calculator; enterprise upsell
```

---

## 2. Master comparison table

| Tool | Type | Input | YAML paste web UI | Multi-cloud compare | Hetzner / cheap VPS | Cluster agent | Open source | Price | Best for |
|------|------|-------|-------------------|---------------------|---------------------|---------------|-------------|-------|----------|
| **[Podmonkey](https://github.com/MarketMadi/podmonkey)** (planned) | Static estimator | Raw K8s YAML | **Yes** (core) | **Yes** (4 providers) | **Yes** | No | **MIT** | Free | Pre-deploy comparison, demos, tutorials |
| **[Kubecost](https://www.kubecost.com/)** | In-cluster FinOps | Live cluster + YAML predict | No (dashboard) | Yes (dashboard) | Custom pricing | **Yes** (Helm) | Core via OpenCost | Free tier + enterprise | Chargeback, allocation, enterprise |
| **[OpenCost](https://opencost.io/)** | CNCF spec + engine | Live cluster | No | Yes | Custom pricing | **Yes** | **Apache 2.0** | Free | Vendor-neutral standard, OSS monitoring |
| **[kubectl-cost predict](https://github.com/kubecost/kubectl-cost)** | CLI plugin | YAML file | No | Limited | Default AWS-ish rates | Optional Kubecost API | **Apache 2.0** | Free | CI/terminal, diff vs cluster |
| **[Kubecost GH Action](https://github.com/kubecost/cost-prediction-action)** | CI | YAML in repo | No | No | Default pricing | Optional | **Apache 2.0** | Free | PR cost comments |
| **[ReleaseRun K8s estimator](https://releaserun.com/tools/k8s-cost-estimator/)** | Web calculator | Cluster config sliders | No | **Yes** | Self-managed option | No | No | Free | Node sizing, addons, client-side |
| **[DeepCost calculator](https://deepcost.ai/tools/kubernetes-cost-calculator)** | Web + SaaS | Preset scenarios | No | **Yes** | On-prem mention | Optional platform | No | Enterprise SaaS | FinOps platform sales |
| **[Optiqor](https://optiqor.dev/)** / [CLI](https://github.com/optiqor/optiqor-cli) | Static analysis + SaaS | Helm / rendered YAML | Sandbox paste | AWS (Hetzner planned) | Planned | No (Prometheus in SaaS) | CLI OSS | SaaS + free CLI | PR waste detection, Helm-focused |
| **[Infracost](https://www.infracost.io/)** | IaC cost | Terraform, CFN, CDK | No | **Yes** | Via Terraform | No | **Apache 2.0** | Free tier + cloud | Infra provisioning cost |
| **[CAST AI](https://cast.ai/)** | Autonomous optimization | Cluster | No | Yes | Limited | **Yes** | No | Commercial | Auto spot, rightsizing |
| **[CloudZero](https://www.cloudzero.com/)** | FinOps platform | Billing + K8s | No | **Yes** | Via billing | Integrations | No | Enterprise | Unit economics, finance alignment |
| **[CloudBolt](https://www.cloudbolt.io/)** | Enterprise CMP | Cluster + CMDB | No | Yes | On-prem | **Yes** | No | Enterprise | Large org governance |
| **[nOps](https://www.nops.io/)** | AWS-focused | EKS + billing | No | AWS-primary | No | **Yes** | No | Commercial | AWS EKS savings |
| **[Goldilocks](https://github.com/FairwindsOps/goldilocks)** | Rightsizing recs | Cluster (VPA) | No | N/A | N/A | **Yes** | **Apache 2.0** | Free | Request/limit recommendations |
| **[PerfectScale](https://www.perfectscale.io/)** | Optimization | Cluster | No | Yes | Limited | **Yes** | No | Commercial | Automated rightsizing |
| **[Vantage](https://www.vantage.sh/)** | Multi-cloud FinOps | Billing | No | **Yes** | If in billing | Integrations | No | Freemium + paid | AWS/GCP/Azure bills |
| **[ClusterCost](https://clustercost.com/)** | Content + tools | Varies | Some blog tools | Partial | No | Varies | Partial | Freemium | EKS-focused content |

---

## 3. Direct competitors to Podmonkey v1 (static / pre-deploy)

These are the tools a user might reach for **instead of** pasting YAML into Podmonkey.

### 3.1 Kubecost `kubectl cost predict`

| Dimension | Kubecost predict | Podmonkey |
|-----------|------------------|-----------|
| **Input** | YAML via CLI | YAML via web paste |
| **Install** | `kubectl krew install cost` | Browser URL |
| **Accuracy w/o cluster** | Default public pricing | Versioned `pricing/*.json` |
| **Accuracy w/ cluster** | Historical $/resource-hour | N/A in v1 |
| **Multi-provider table** | No native compare | **Core feature** |
| **Policy warnings** | No | **Yes** |
| **Open formulas** | Partial (API-backed) | **Full methodology doc** |

**Verdict:** Same math family; Podmonkey wins on **UX, comparison, warnings, Hetzner, demo link**.

Sources: [kubectl-cost README](https://github.com/kubecost/kubectl-cost), [Apptio Predict blog](https://www.apptio.com/blog/resource-cost-prediction/)

---

### 3.2 ReleaseRun Kubernetes Cost Estimator

| Dimension | ReleaseRun | Podmonkey |
|-----------|------------|-----------|
| **Input** | Nodes, instance type, addons | **Your manifests** |
| **Client-side** | Yes | Yes (target) |
| **Multi-provider** | Yes | Yes |
| **Per-workload breakdown** | No (cluster-level) | **Yes** |
| **Storage from PVCs** | 50 GB/node assumption | **From YAML** |

**Verdict:** Complementary — ReleaseRun sizes clusters; Podmonkey prices **workloads**.

Source: [ReleaseRun K8s estimator](https://releaserun.com/tools/k8s-cost-estimator/)

---

### 3.3 DeepCost Kubernetes Calculator

| Dimension | DeepCost | Podmonkey |
|-----------|----------|-----------|
| **Input** | Fixed scenarios (50 pods, 100 CPU…) | **User YAML** |
| **Goal** | Lead gen for SaaS platform | Open tool + education |
| **Optimization claims** | Up to 60% savings (marketing) | Warnings only in v1 |
| **Transparency** | Opaque | Open source methodology |

**Verdict:** Different product motion; Podmonkey is **developer-first**, not enterprise funnel.

Source: [DeepCost K8s calculator](https://deepcost.ai/tools/kubernetes-cost-calculator)

---

### 3.4 Optiqor

| Dimension | Optiqor | Podmonkey |
|-----------|---------|-----------|
| **Input** | Helm charts / values.yaml | **Raw K8s YAML** |
| **Focus** | Waste rules + fix PRs + receipts | Cost compare + warnings |
| **Offline** | CLI yes | Web + future CLI |
| **Honesty** | ±40% disclosure | Similar disclosure |
| **Hetzner** | Planned Q3 2026 | **v1 target** |

**Verdict:** Closest philosophical peer; Podmonkey differentiates on **multi-cloud compare table** and **non-Helm YAML**.

Source: [optiqor-cli](https://github.com/optiqor/optiqor-cli)

---

### 3.5 Infracost

| Dimension | Infracost | Podmonkey |
|-----------|-----------|-----------|
| **Input** | Terraform, CDK, CloudFormation | **K8s manifests only** |
| **K8s workloads** | Only if in IaC | **Core** |
| **CI integration** | Mature | Roadmap (GH Action) |

**Verdict:** Use both in a pipeline: Infracost for **cluster infra**, Podmonkey for **manifests**.

Source: [Infracost](https://github.com/infracost/infracost)

---

## 4. Indirect competitors (in-cluster / enterprise)

These solve **different** problems but appear in the same Google searches and buyer shortlists.

| Tool | Why teams pick it | Why it's not Podmonkey |
|------|-------------------|------------------------|
| **Kubecost / OpenCost** | Real allocation, idle cost, labels | Needs cluster + metrics |
| **CAST AI / ScaleOps** | Autonomous savings | Agent + $$$; not pre-deploy |
| **CloudZero / Finout** | Finance-grade showback | Billing integration |
| **CloudBolt** | Enterprise CMP + rightsizing | Sales-led, not paste-YAML |
| **Goldilocks** | VPA-based request suggestions | No dollar compare |

---

## 5. Feature matrix (detailed)

| Feature | Podmonkey | Kubecost | OpenCost | ReleaseRun | DeepCost | Optiqor | Infracost |
|---------|:---------:|:--------:|:--------:|:----------:|:--------:|:-------:|:---------:|
| Paste YAML in browser | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ sandbox | ❌ |
| Multi-doc YAML | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Deployment costing | ✅ | ✅ | ✅ | ❌ | ⚠️ | ✅ | ❌ |
| StatefulSet + PVC templates | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| LoadBalancer services | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Control plane fee | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| Side-by-side 4 providers | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ❌ | ✅ |
| Hetzner pricing | ✅ | custom | custom | self-managed | on-prem | planned | via TF |
| Missing request warnings | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ⚠️ |
| `:latest` warning | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ |
| Live usage metrics | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ SaaS | ❌ |
| Idle cost allocation | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Invoice reconciliation | ❌ | ✅ | ⚠️ | ❌ | ✅ | receipts | ❌ |
| CI / PR integration | roadmap | ✅ | ⚠️ | ❌ | ❌ | ✅ | ✅ |
| Open source | ✅ MIT | partial | ✅ | ❌ | ❌ | CLI | ✅ |
| No login demo | ✅ | ❌ | ❌ | ✅ | ⚠️ | ⚠️ | ⚠️ |

Legend: ✅ first-class | ⚠️ partial | ❌ no | roadmap = planned

---

## 6. Positioning statement

**For** platform engineers and SREs **who** need a quick cloud cost comparison before deploying,

**Podmonkey** is a **manifest-first cost estimator**

**that** parses Kubernetes YAML and compares monthly planning estimates across AWS, GCP, Azure, and Hetzner with transparent methodology.

**Unlike** Kubecost, we require **no cluster**.

**Unlike** ReleaseRun and DeepCost, we price **your actual manifests**, not slider scenarios.

**Unlike** Optiqor, we focus on **raw YAML multi-cloud comparison**, not Helm fix PRs.

---

## 7. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| “Kubecost already does predict” | Web UX, 4-way compare, Hetzner, warnings, open repo |
| “Numbers are wrong” | Methodology page, `as_of` pricing, ±band disclosure |
| “Crowded FinOps market” | Don’t compete on enterprise; compete on **demo + education** |
| Optiqor ships Hetzner first | Ship fast; dual license community tools |

---

## 8. Links

- [OpenCost](https://opencost.io/)
- [Kubecost](https://www.kubecost.com/)
- [kubectl-cost](https://github.com/kubecost/kubectl-cost)
- [ReleaseRun estimator](https://releaserun.com/tools/k8s-cost-estimator/)
- [DeepCost calculator](https://deepcost.ai/tools/kubernetes-cost-calculator)
- [Optiqor CLI](https://github.com/optiqor/optiqor-cli)
- [Infracost](https://www.infracost.io/)
- [CloudBolt K8s cost monitoring (guide)](https://www.cloudbolt.io/kubernetes-cost-optimization/kubernetes-cost-monitoring/)
- [Plural — best K8s cost tools 2025](https://www.plural.sh/blog/best-kubernetes-cost-management-tools/)
