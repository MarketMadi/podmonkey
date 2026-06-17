import nginxYaml from '../../../examples/nginx-deployment.yaml';
import redisYaml from '../../../examples/redis-statefulset.yaml';
import fatYaml from '../../../examples/fat-deployment.yaml';
import postgresYaml from '../../../examples/postgres-ha.yaml';
import saasYaml from '../../../examples/saas-stack.yaml';
import monitoringYaml from '../../../examples/monitoring-stack.yaml';
import etlYaml from '../../../examples/nightly-etl-cronjob.yaml';
import ghostYaml from '../../../examples/ghost-blog.yaml';

export const EXAMPLES = [
  { id: 'nginx', label: 'nginx + LoadBalancer', yaml: nginxYaml },
  { id: 'redis', label: 'Redis StatefulSet + PVCs', yaml: redisYaml },
  { id: 'postgres', label: 'Postgres HA (3× 100 GiB)', yaml: postgresYaml },
  { id: 'saas', label: 'SaaS stack (API + workers)', yaml: saasYaml },
  { id: 'monitoring', label: 'Monitoring (DaemonSet + PVC)', yaml: monitoringYaml },
  { id: 'etl', label: 'Nightly ETL CronJob', yaml: etlYaml },
  { id: 'ghost', label: 'Ghost blog + PVC + LB', yaml: ghostYaml },
  { id: 'fat', label: 'Fat deployment (warnings)', yaml: fatYaml },
] as const;

export type ExampleId = (typeof EXAMPLES)[number]['id'];

export const DEFAULT_EXAMPLE = EXAMPLES[0];
