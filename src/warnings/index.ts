import type { ParseResult, Warning } from '../types';

export function collectWarnings(parse: ParseResult): Warning[] {
  const warnings: Warning[] = [];

  for (const w of parse.workloads) {
    const ref = `${w.namespace}/${w.kind}/${w.name}`;

    for (const c of w.containers) {
      const cref = `${ref}/${c.name}`;
      if (c.usedDefaults) {
        warnings.push({
          id: 'BESTEFFORT_QOS',
          severity: 'warning',
          message:
            'No CPU/memory requests; using default minimum for cost estimate.',
          resource: cref,
        });
      } else if (c.usedLimitsAsProxy) {
        warnings.push({
          id: 'USED_LIMITS_AS_PROXY',
          severity: 'warning',
          message: 'Missing requests; using limits as cost proxy.',
          resource: cref,
        });
      }
      if (c.cpuCores > 4) {
        warnings.push({
          id: 'HIGH_CPU_REQUEST',
          severity: 'info',
          message: `High CPU request: ${c.cpuCores} cores.`,
          resource: cref,
        });
      }
      if (c.memoryGiB > 8) {
        warnings.push({
          id: 'HIGH_MEM_REQUEST',
          severity: 'info',
          message: `High memory request: ${c.memoryGiB.toFixed(2)} GiB.`,
          resource: cref,
        });
      }
      if (c.image.endsWith(':latest') || !c.image.includes(':')) {
        warnings.push({
          id: 'IMAGE_LATEST',
          severity: 'warning',
          message: `Unpinned image tag: ${c.image || '(empty)'}`,
          resource: cref,
        });
      }
    }

    if (
      (w.kind === 'Deployment' || w.kind === 'StatefulSet') &&
      w.replicas === 1
    ) {
      warnings.push({
        id: 'SINGLE_REPLICA',
        severity: 'info',
        message: 'Single replica — no HA.',
        resource: ref,
      });
    }
  }

  const lbCount = parse.services.filter((s) => s.type === 'LoadBalancer').length;
  if (lbCount > 0) {
    warnings.push({
      id: 'LOADBALANCER_COUNT',
      severity: 'info',
      message: `${lbCount} LoadBalancer service(s) add flat monthly fees.`,
    });
  }

  return warnings;
}
