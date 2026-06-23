# Founder math methodology

Week-1 cost estimates for **managed APIs** vs **GPU rental**. Planning only — not an invoice.

## Inputs

| Field | Example | Meaning |
|-------|---------|---------|
| `requestsPerDay` | 3000 | API calls or chat turns |
| `inputTokensPerRequest` | 800 | Prompt + retrieved context |
| `outputTokensPerRequest` | 250 | Model reply |
| `model` | `llama-3.1-8b` | Open-weight model for GPU tier + throughput |
| `billing` | `auto` (default) | GPU: pick cheaper of serverless vs pod per host |

## API cost (exact list pricing)

```
requests_per_month = requestsPerDay × 30
input_tokens  = inputTokensPerRequest  × requests_per_month
output_tokens = outputTokensPerRequest × requests_per_month

monthly_usd = input_tokens  / 1e6 × $/M_input
            + output_tokens / 1e6 × $/M_output
```

### Worked example — Groq Llama 3.1 8B, founder chatbot

- 3,000 req/day → 90,000 req/month  
- 800 in / 250 out per request  
- Groq: $0.05/M input, $0.08/M output  

```
input:  72M × $0.05/M  = $3.60
output: 22.5M × $0.08/M = $1.80
total  ≈ $5.40/mo
```

Confidence: **±10%** (published per-token rates).

## GPU time (prefill + decode + cold start)

Prompt tokens are **prefilled** faster than output tokens are **decoded**:

```
prefill_sec = input_tokens_per_request  / prefill_tokens_per_second
decode_sec  = output_tokens_per_request / decode_tokens_per_second
cold_start  = 0.3s (serverless only)

seconds_per_request = prefill_sec + decode_sec + cold_start
```

Throughput from [`catalog/models.json`](../catalog/models.json):

- `default_tokens_per_second` — decode speed (e.g. 45 tok/s for Llama 8B)  
- `prefill_tokens_per_second` — optional override  
- else `prefill = decode × 8` (catalog default ratio)

### Worked example — same chatbot on RunPod T4 serverless

- Decode: 45 tok/s  
- Prefill: 45 × 8 = 360 tok/s  

```
prefill: 800/360 = 2.22s
decode:  250/45  = 5.56s
cold:            0.30s
total:           8.08s per request
```

```
monthly = 90,000 × 8.08s × $0.00016/s ≈ $116/mo
```

Confidence: **±25%** (throughput varies by batching, quantization, host load).

**Old bug:** using `(input+output)/decode_tps` gave ~23s/request → ~$330/mo (wrong).

## GPU billing — auto mode

For each host we compute **both**:

| Mode | Formula |
|------|---------|
| Serverless | `requests_per_month × seconds_per_request × $/second` |
| Pod | `$pod_per_hour × 730 × workers` |

`billing: auto` picks the **lower** monthly cost per provider.

**Pod utilization** (busy % if you paid for always-on):

```
utilization = (requests_per_month × seconds_per_request) / (730h × 3600s) × 100
```

If utilization &lt; 15%, we warn: pods waste money at this volume — use API or serverless.

### Same chatbot — pod vs serverless on RunPod T4

| Mode | Cost |
|------|------|
| Serverless | ~$116/mo |
| Pod (always on) | ~$285/mo (730 × $0.39/hr) |
| Utilization | ~3% |

**Auto picks serverless.**

## Verdict

1. Compare cheapest **comparable API** (Groq, Together — not OpenAI quality baseline) vs cheapest **GPU host** (auto billing).  
2. Recommend API in week 1 unless GPU is clearly cheaper **and** traffic justifies ops work.

## What we exclude

- Engineering time to deploy vLLM  
- Egress, storage, fine-tuning  
- API rate limits, batching discounts  
- Multi-region, HA, monitoring
