# Model catalog

**As of:** 2026-06-23  
**Data file:** [`catalog/models.json`](../catalog/models.json)

The model catalog maps **open-weight LLMs** to **VRAM requirements** and **recommended GPU tiers**. It powers model-first inference estimates, VRAM fit warnings, and GPU tier auto-selection.

Unlike cloud **pricing** (which changes weekly), model **VRAM** changes only when:

- A new model or quantization is added
- Published benchmarks revise KV-cache assumptions

Review quarterly or when adding models. **GPU $/hr rates** still come from `pricing/marketplace/` and refresh on the 3-day pricing cron.

---

## Schema (`catalog/models.json`)

| Field | Purpose |
|-------|---------|
| `schema_version` | Bump on breaking schema changes |
| `as_of` | Date catalog was last verified |
| `fetched_at` | ISO timestamp of last refresh run |
| `defaults.system_overhead_gib` | CUDA + runtime overhead (default 2 GiB) |
| `defaults.kv_cache_reference_context_tokens` | KV cache rates are per-user at this context (4096) |
| `models[].id` | Short id used in YAML: `llama-3.1-8b` |
| `models[].hf_id` | HuggingFace model id for verification |
| `models[].quantizations` | Weights GiB per quant level — **each entry has `source` URL** |
| `models[].kv_cache_gib_per_user_at_4k` | KV cache GiB per concurrent user at 4K context |
| `models[].default_tokens_per_second` | For $/1M token derivation |
| `models[].recommended_gpu_tiers` | Smallest tiers that fit weights alone |
| `gpu_tier_vram_gib` | VRAM per normalized GPU tier id |

### VRAM formula

```
weights     = quantizations[quant].weights_gib
kv_cache    = kv_cache_gib_per_user_at_4k × (contextLength / 4096) × concurrentUsers
total_vram  = weights + kv_cache + system_overhead_gib
```

**Minimum GPU tier:** smallest `gpu_tier_vram_gib` entry where `vram >= total_vram`.

---

## Sources (per model)

| Model | Weights source | KV cache source |
|-------|----------------|-----------------|
| Llama 3.1 8B | [GIGAGPU inference VRAM](https://gigagpu.com/gpu-memory-utilization-inference/) | Same — 3.2 GiB / 10 users @ 4K |
| Llama 3.3 70B | [LLMHardware Q4_K_M](https://llmhardware.io/guides/llama33-hardware-requirements) | [GIGAGPU](https://gigagpu.com/gpu-memory-utilization-inference/) — 2 GiB/user @ 4K |
| Qwen 2.5 72B | [DeployBase VRAM table](https://deploybase.ai/articles/llm-vram-requirements) | Scaled from Llama 70B |
| Mistral 7B | DeployBase | Scaled from 8B |
| Qwen 2.5 7B | [llmrun Q4_K_M](https://llmrun.dev/model/qwen-qwen2-5-7b) | Scaled from Llama 8B |
| Mistral Nemo 12B | [CanItRun weights table](https://canitrun.dev/models/mistral-nemo-12b/) | Scaled from 8K KV row |
| Phi-3.5 Mini | [RunThisModel Q4](https://runthismodel.com/models/phi-3.5-mini-instruct) | Scaled from Llama 3.2 3B |
| Gemma 2 9B | [llmrun Q4_K_M](https://llmrun.dev/model/google-gemma-2-9b-it) | Scaled from Llama 8B |
| DeepSeek V3 | [CanItRun Q4_K_M](https://canitrun.dev/models/deepseek-v3/) | MLA — cluster only (~378 GiB weights) |

No LLM-generated numbers. Every `weights_gib` cites a published benchmark or calculator.

---

## Update mechanism

### Validate (every CI)

```bash
npm run validate-catalog
```

Checks:

- Schema version present
- Every model has ≥1 quantization with `source`
- `weights_gib > 0`, KV rates > 0
- `recommended_gpu_tiers` reference valid tier ids
- Spot checks: Llama 3.3 70B Q4 = 43 GiB, Llama 8B Q4 = 5 GiB

### Refresh (manual / quarterly)

```bash
npm run refresh-catalog
```

- Sets `as_of` and `fetched_at` to today
- Re-runs validation
- Writes `catalog/models.json` (no auto-fetch of VRAM from HF — weights are benchmark-sourced)

Optional future: fetch `config.json` from HuggingFace to verify `parameters_b` only.

### Pricing vs catalog

| Asset | Update cadence | Mechanism |
|-------|------------------|-----------|
| `pricing/marketplace/*.json` | Every 3 days | `npm run refresh-pricing -- --strict` + GitHub cron |
| `catalog/models.json` | Quarterly / on new model | `npm run refresh-catalog` + PR review |

When **GPU prices** change, inference $/mo updates automatically via pricing refresh. When **new models** ship, add an entry to `catalog/models.json` with cited sources.

---

## YAML usage

### Model-first (recommended)

```yaml
apiVersion: podmonkey.io/v1
kind: InferenceEstimate
metadata:
  name: rag-chatbot
spec:
  model: llama-3.1-8b
  requestsPerDay: 3000
  inputTokensPerRequest: 800
  outputTokensPerRequest: 250
  billing: serverless
```

`inputTokensPerRequest` / `outputTokensPerRequest` are the founder-friendly inputs (prompt+context vs reply). GPU seconds are derived from the model catalog.

### GPU tier (manual)

```yaml
spec:
  gpu: a100-80gb
  billing: serverless
  ...
```

### Kubernetes annotations

```yaml
metadata:
  annotations:
    podmonkey.io/model: llama-3.3-70b
    podmonkey.io/quantization: Q4_K_M
    podmonkey.io/context-length: "4096"
    podmonkey.io/concurrent-users: "3"
```
