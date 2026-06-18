import { loadAll } from 'js-yaml';
import type {
  ContainerResources,
  ParseResult,
  ParsedIngress,
  ParsedPVC,
  ParsedService,
  ParsedWorkload,
  PriceSheet,
} from '../types';
import { cronRunsPerMonth } from './cron-schedule';
import { parseCpu, parseMemory } from '../units';

const WORKLOAD_KINDS = new Set([
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'Job',
  'CronJob',
  'Pod',
]);

function ns(doc: Record<string, unknown>): string {
  const meta = doc.metadata as Record<string, unknown> | undefined;
  return (meta?.namespace as string) ?? 'default';
}

function name(doc: Record<string, unknown>): string {
  const meta = doc.metadata as Record<string, unknown> | undefined;
  return (meta?.name as string) ?? 'unknown';
}

function containerResources(
  container: Record<string, unknown>,
  defaults: PriceSheet['defaults'],
): ContainerResources {
  const resources = (container.resources as Record<string, unknown>) ?? {};
  const requests = (resources.requests as Record<string, string>) ?? {};
  const limits = (resources.limits as Record<string, string>) ?? {};

  let cpu = parseCpu(requests.cpu);
  let memory = parseMemory(requests.memory);
  let usedLimitsAsProxy = false;
  let usedDefaults = false;

  if (cpu === null) {
    cpu = parseCpu(limits.cpu);
    if (cpu !== null) usedLimitsAsProxy = true;
  }
  if (memory === null) {
    memory = parseMemory(limits.memory);
    if (memory !== null) usedLimitsAsProxy = true;
  }
  if (cpu === null) {
    cpu = parseCpu(defaults.missing_cpu) ?? 0.1;
    usedDefaults = true;
  }
  if (memory === null) {
    memory = parseMemory(defaults.missing_memory) ?? 0.125;
    usedDefaults = true;
  }

  return {
    name: (container.name as string) ?? 'container',
    image: (container.image as string) ?? '',
    cpuCores: cpu,
    memoryGiB: memory,
    usedLimitsAsProxy,
    usedDefaults,
  };
}

function podTemplateContainers(
  spec: Record<string, unknown> | undefined,
  defaults: PriceSheet['defaults'],
): ContainerResources[] {
  if (!spec) return [];
  const containers = [
    ...((spec.containers as Record<string, unknown>[]) ?? []),
    ...((spec.initContainers as Record<string, unknown>[]) ?? []),
  ];
  return containers.map((c) => containerResources(c, defaults));
}

function replicasFor(
  kind: string,
  doc: Record<string, unknown>,
  defaults: PriceSheet['defaults'],
): number {
  const spec = doc.spec as Record<string, unknown> | undefined;
  if (kind === 'DaemonSet') return defaults.daemonset_node_count;
  if (kind === 'Pod') return 1;
  if (kind === 'Job') {
    const c = spec?.completions as number | undefined;
    const p = spec?.parallelism as number | undefined;
    return c ?? p ?? 1;
  }
  if (kind === 'CronJob') {
    const cronSpec = doc.spec as Record<string, unknown> | undefined;
    const schedule = cronSpec?.schedule as string | undefined;
    const timeZone = cronSpec?.timeZone as string | undefined;
    const jobSpec = (cronSpec?.jobTemplate as Record<string, unknown>)?.spec as
      | Record<string, unknown>
      | undefined;
    const parallelism = (jobSpec?.parallelism as number | undefined) ?? 1;
    const runs =
      schedule !== undefined
        ? cronRunsPerMonth(schedule, { timeZone })
        : 30;
    return runs * parallelism;
  }
  return (spec?.replicas as number) ?? 1;
}

function workloadFromDoc(
  doc: Record<string, unknown>,
  defaults: PriceSheet['defaults'],
): ParsedWorkload | null {
  const kind = doc.kind as string;
  if (!WORKLOAD_KINDS.has(kind)) return null;

  let spec = doc.spec as Record<string, unknown> | undefined;

  if (kind === 'Pod') {
    return {
      kind,
      name: name(doc),
      namespace: ns(doc),
      replicas: 1,
      containers: podTemplateContainers(spec, defaults),
    };
  }

  let template: Record<string, unknown> | undefined;

  if (kind === 'CronJob') {
    template = (
      (spec?.jobTemplate as Record<string, unknown>)?.spec as Record<string, unknown>
    )?.template as Record<string, unknown> | undefined;
    spec = (
      (spec?.jobTemplate as Record<string, unknown>)?.spec as Record<string, unknown>
    );
  } else {
    template = spec?.template as Record<string, unknown> | undefined;
  }

  const podSpec = template?.spec as Record<string, unknown> | undefined;

  return {
    kind,
    name: name(doc),
    namespace: ns(doc),
    replicas: replicasFor(kind, doc, defaults),
    containers: podTemplateContainers(podSpec, defaults),
  };
}

function pvcFromDoc(doc: Record<string, unknown>): ParsedPVC | null {
  if (doc.kind !== 'PersistentVolumeClaim') return null;
  const spec = doc.spec as Record<string, unknown> | undefined;
  const requests = (spec?.resources as Record<string, unknown>)?.requests as
    | Record<string, string>
    | undefined;
  const storage = requests?.storage;
  const storageGiB = parseMemory(storage);
  if (storageGiB === null) return null;

  return {
    name: name(doc),
    namespace: ns(doc),
    storageGiB,
    storageClass: spec?.storageClassName as string | undefined,
  };
}

function statefulSetTemplatePVCs(
  doc: Record<string, unknown>,
): ParsedPVC[] {
  if (doc.kind !== 'StatefulSet') return [];
  const spec = doc.spec as Record<string, unknown> | undefined;
  const templates = (spec?.volumeClaimTemplates as Record<string, unknown>[]) ?? [];
  const replicas = (spec?.replicas as number) ?? 1;
  const namespace = ns(doc);
  const stsName = name(doc);

  return templates.flatMap((tpl) => {
    const meta = tpl.metadata as Record<string, unknown> | undefined;
    const tplSpec = tpl.spec as Record<string, unknown> | undefined;
    const requests = (tplSpec?.resources as Record<string, unknown>)?.requests as
      | Record<string, string>
      | undefined;
    const storageGiB = parseMemory(requests?.storage);
    if (storageGiB === null) return [];

    return Array.from({ length: replicas }, (_, i) => ({
      name: `${meta?.name ?? 'data'}-${stsName}-${i}`,
      namespace,
      storageGiB,
      storageClass: tplSpec?.storageClassName as string | undefined,
    }));
  });
}

function serviceFromDoc(doc: Record<string, unknown>): ParsedService | null {
  if (doc.kind !== 'Service') return null;
  const spec = doc.spec as Record<string, unknown> | undefined;
  return {
    name: name(doc),
    namespace: ns(doc),
    type: (spec?.type as string) ?? 'ClusterIP',
  };
}

function ingressFromDoc(doc: Record<string, unknown>): ParsedIngress | null {
  if (doc.kind !== 'Ingress') return null;
  const spec = doc.spec as Record<string, unknown> | undefined;
  const meta = doc.metadata as Record<string, unknown> | undefined;
  const annotations = meta?.annotations as Record<string, string> | undefined;
  return {
    name: name(doc),
    namespace: ns(doc),
    ingressClass:
      (spec?.ingressClassName as string | undefined) ??
      annotations?.['kubernetes.io/ingress.class'],
  };
}

export function parseManifests(
  yaml: string,
  defaults: PriceSheet['defaults'],
): ParseResult {
  const docs = loadAll(yaml).filter(
    (d): d is Record<string, unknown> =>
      typeof d === 'object' && d !== null && 'kind' in d,
  );

  const workloads: ParsedWorkload[] = [];
  const pvcs: ParsedPVC[] = [];
  const services: ParsedService[] = [];
  const ingresses: ParsedIngress[] = [];

  for (const doc of docs) {
    const workload = workloadFromDoc(doc, defaults);
    if (workload) workloads.push(workload);

    const pvc = pvcFromDoc(doc);
    if (pvc) pvcs.push(pvc);

    pvcs.push(...statefulSetTemplatePVCs(doc));

    const svc = serviceFromDoc(doc);
    if (svc) services.push(svc);

    const ing = ingressFromDoc(doc);
    if (ing) ingresses.push(ing);
  }

  return { workloads, pvcs, services, ingresses };
}
