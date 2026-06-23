import nginxYaml from '../../../examples/nginx-deployment.yaml';
import redisYaml from '../../../examples/redis-statefulset.yaml';
import fatYaml from '../../../examples/fat-deployment.yaml';
import postgresYaml from '../../../examples/postgres-ha.yaml';
import saasYaml from '../../../examples/saas-stack.yaml';
import monitoringYaml from '../../../examples/monitoring-stack.yaml';
import etlYaml from '../../../examples/nightly-etl-cronjob.yaml';
import ghostYaml from '../../../examples/ghost-blog.yaml';
import vllmGpuYaml from '../../../examples/vllm-gpu-deployment.yaml';
import inferenceServerlessYaml from '../../../examples/inference-serverless-a100.yaml';
import inferencePodYaml from '../../../examples/inference-pod-a100.yaml';
import inferenceModel8bYaml from '../../../examples/inference-model-llama8b.yaml';
import inferenceModel70bYaml from '../../../examples/inference-model-llama70b.yaml';
import inferenceModelQwen7bYaml from '../../../examples/inference-model-qwen7b.yaml';

export const K8S_EXAMPLES = [
  { id: 'nginx', label: 'nginx + LoadBalancer', yaml: nginxYaml },
  { id: 'redis', label: 'Redis StatefulSet + PVCs', yaml: redisYaml },
  { id: 'postgres', label: 'Postgres HA (3× 100 GiB)', yaml: postgresYaml },
  { id: 'saas', label: 'SaaS stack (API + workers)', yaml: saasYaml },
  { id: 'monitoring', label: 'Monitoring (DaemonSet + PVC)', yaml: monitoringYaml },
  { id: 'etl', label: 'Nightly ETL CronJob', yaml: etlYaml },
  { id: 'ghost', label: 'Ghost blog + PVC + LB', yaml: ghostYaml },
  { id: 'vllm', label: 'vLLM GPU deployment (1× GPU)', yaml: vllmGpuYaml },
  { id: 'fat', label: 'Fat deployment (warnings)', yaml: fatYaml },
] as const;

export const INFERENCE_EXAMPLES = [
  {
    id: 'model-qwen7b',
    label: 'Qwen 2.5 7B Q4 — coding / multilingual',
    yaml: inferenceModelQwen7bYaml,
  },
  {
    id: 'model-llama8b',
    label: 'Llama 3.1 8B Q4 — model picker (auto GPU)',
    yaml: inferenceModel8bYaml,
  },
  {
    id: 'model-llama70b',
    label: 'Llama 3.3 70B Q4 — pod billing',
    yaml: inferenceModel70bYaml,
  },
  {
    id: 'serverless-a100',
    label: 'Serverless A100 — 10k req/day × 2s',
    yaml: inferenceServerlessYaml,
  },
  {
    id: 'pod-a100',
    label: 'Always-on A100 pod',
    yaml: inferencePodYaml,
  },
] as const;

export const DEFAULT_K8S_EXAMPLE = K8S_EXAMPLES[0];
export const DEFAULT_INFERENCE_EXAMPLE = INFERENCE_EXAMPLES[0];

/** @deprecated use K8S_EXAMPLES */
export const EXAMPLES = K8S_EXAMPLES;
export const DEFAULT_EXAMPLE = DEFAULT_K8S_EXAMPLE;
