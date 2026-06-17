# Example manifests

Realistic Kubernetes YAML for trying Podmonkey locally or on the [live demo](https://marketmadi.github.io/podmonkey/).

| File | Pattern | What to notice |
|------|---------|----------------|
| [nginx-deployment.yaml](nginx-deployment.yaml) | Web tier + LB | Baseline 3-replica app, high confidence |
| [redis-statefulset.yaml](redis-statefulset.yaml) | Cache cluster | `volumeClaimTemplates` → storage × replicas |
| [postgres-ha.yaml](postgres-ha.yaml) | HA database | Large CPU/RAM requests + 100 GiB PVCs |
| [saas-stack.yaml](saas-stack.yaml) | Multi-tier SaaS | API, workers, frontend, one LoadBalancer |
| [monitoring-stack.yaml](monitoring-stack.yaml) | Observability | DaemonSet (per-node) + Prometheus PVC |
| [nightly-etl-cronjob.yaml](nightly-etl-cronjob.yaml) | Batch job | CronJob parallelism → monthly run estimate |
| [ghost-blog.yaml](ghost-blog.yaml) | Side project | Small footprint, PVC + LB |
| [fat-deployment.yaml](fat-deployment.yaml) | Anti-pattern | Missing sidecar requests, `:latest` image |

## CLI

```bash
# One file
npm run podmonkey -- estimate -f examples/postgres-ha.yaml

# Whole directory
npm run podmonkey -- estimate -f examples/ --markdown

# JSON for scripting
npm run podmonkey -- estimate -f examples/saas-stack.yaml --json
```

## Directory estimate

```bash
npm run podmonkey -- estimate -f examples/
```

Summarizes every `*.yaml` / `*.yml` in the folder.
