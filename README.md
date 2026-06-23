# Podmonkey 🐒

**Paste Kubernetes YAML. Compare cloud bills before you deploy.**

Open-source cost estimator for Kubernetes manifests. Compare **AWS EKS**, **GKE**, **AKS**, and **Hetzner** from your YAML — no cluster agent, no login.

**[Try the live demo →](https://marketmadi.github.io/podmonkey/)**

> Planning estimates only — not an invoice. Based on resource **requests** and public on-demand list prices.

## Install

```bash
npx podmonkey estimate -f deployment.yaml
```

Or install globally:

```bash
npm install -g podmonkey
podmonkey estimate -f ./k8s/
```

Requires Node.js 20+.

## Common commands

```bash
# Single file or directory
podmonkey estimate -f examples/nginx-deployment.yaml
podmonkey estimate -f ./k8s/

# Compare a PR branch vs main (cost diff)
podmonkey estimate -f ./k8s --base ./k8s.main/ --markdown

# Helm chart
helm template myapp ./chart | podmonkey estimate -f -
podmonkey estimate --helm-chart ./chart --helm-values values.yaml

# Live cluster (kubectl must be configured)
podmonkey estimate --from-cluster

# JSON output
podmonkey estimate -f deploy.yaml --json
```

**Policy gates** (exit code 2 on failure):

```bash
podmonkey estimate -f ./k8s --max-monthly-usd 500 --min-confidence 60
```

## GitHub Action

Add cost comments on pull requests. Copy [`.github/workflows/podmonkey-estimate.example.yml`](.github/workflows/podmonkey-estimate.example.yml) to your repo:

```yaml
- uses: MarketMadi/podmonkey@v0.3.1
  with:
    path: ./k8s
    max-monthly-usd: '500'
    min-confidence: '60'
```

Optional: `base-path` for PR cost diff, `max-monthly-increase-usd` to block large increases.  
Details: [docs/GITHUB_ACTION.md](docs/GITHUB_ACTION.md)

## What it estimates

From your manifests Podmonkey reads:

- **Workloads** — Deployment, StatefulSet, DaemonSet, Job, CronJob, Pod
- **Storage** — PVCs and StatefulSet volume claims (by storage class)
- **Networking** — LoadBalancer Services and Ingress
- **Overhead** — control plane fees per provider

Output is a **monthly USD range** per cloud (resource requests vs cheapest fitting VM), plus a confidence score and warnings (missing requests, `:latest` images, etc.).

**Example:** nginx (3 replicas, 0.5 CPU / 512Mi each) + LoadBalancer on AWS EKS ≈ **$116–$121/mo** planning estimate.

Example manifests: [`examples/`](examples/)

## AI startup math (week 1)

Compare **managed APIs** (Groq, Together, OpenAI baseline) vs **GPU rental** (RunPod, Modal, etc.) before you self-host.

```yaml
apiVersion: podmonkey.io/v1
kind: InferenceEstimate
metadata:
  name: support-chatbot
spec:
  model: llama-3.1-8b
  requestsPerDay: 3000
  inputTokensPerRequest: 800    # prompt + context
  outputTokensPerRequest: 250   # model reply
  billing: serverless
```

Load examples from [`examples/inference-founder-*.yaml`](examples/). See [Model catalog](docs/MODEL_CATALOG.md).

> Planning estimate only (±40%). For Kubernetes cluster costs, use the **Kubernetes** tab or `podmonkey estimate -f deployment.yaml`.

## Documentation

| Doc | What it's for |
|-----|----------------|
| [GitHub Action](docs/GITHUB_ACTION.md) | CI setup, inputs, policy gates |
| [Pricing sources](docs/PRICING_SOURCES.md) | Where list prices come from |
| [Methodology](docs/METHODOLOGY.md) | Formulas and price sheet schema |
| [Roadmap](docs/ROADMAP.md) | What's shipped and what's next |

## Development

```bash
git clone https://github.com/MarketMadi/podmonkey.git
cd podmonkey
npm ci
npm test          # 41 tests
npm run build
npm run podmonkey -- estimate -f examples/nginx-deployment.yaml
```

## License

MIT — see [LICENSE](LICENSE).

Podmonkey is not affiliated with AWS, Google, Microsoft, Hetzner, Kubecost, or OpenCost.
