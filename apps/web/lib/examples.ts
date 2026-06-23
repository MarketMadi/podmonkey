import nginxYaml from '../../../examples/nginx-deployment.yaml';
import redisYaml from '../../../examples/redis-statefulset.yaml';
import fatYaml from '../../../examples/fat-deployment.yaml';
import postgresYaml from '../../../examples/postgres-ha.yaml';
import saasYaml from '../../../examples/saas-stack.yaml';
import monitoringYaml from '../../../examples/monitoring-stack.yaml';
import etlYaml from '../../../examples/nightly-etl-cronjob.yaml';
import ghostYaml from '../../../examples/ghost-blog.yaml';
import vllmGpuYaml from '../../../examples/vllm-gpu-deployment.yaml';
import founderChatbotYaml from '../../../examples/inference-founder-chatbot.yaml';
import founderRagYaml from '../../../examples/inference-founder-rag.yaml';
import founderScaleYaml from '../../../examples/inference-founder-scale.yaml';
import inferenceModel70bYaml from '../../../examples/inference-model-llama70b.yaml';

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
    id: 'founder-chatbot',
    label: 'Week 1 — support chatbot (3k req/day)',
    yaml: founderChatbotYaml,
  },
  {
    id: 'founder-rag',
    label: 'Week 1 — RAG prototype (low traffic)',
    yaml: founderRagYaml,
  },
  {
    id: 'founder-scale',
    label: 'Scaling — 50k req/day (GPU vs API?)',
    yaml: founderScaleYaml,
  },
  {
    id: 'model-llama70b',
    label: 'Bigger model — Llama 70B',
    yaml: inferenceModel70bYaml,
  },
] as const;

export const DEFAULT_K8S_EXAMPLE = K8S_EXAMPLES[0];
export const DEFAULT_INFERENCE_EXAMPLE = INFERENCE_EXAMPLES[0];

/** @deprecated use K8S_EXAMPLES */
export const EXAMPLES = K8S_EXAMPLES;
export const DEFAULT_EXAMPLE = DEFAULT_K8S_EXAMPLE;
