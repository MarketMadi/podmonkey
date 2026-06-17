import type { ConfidenceLevel, ConfidenceResult, ParseResult } from '../types';

export function assessConfidence(parse: ParseResult): ConfidenceResult {
  let score = 0;
  const factors: string[] = [];

  const containers = parse.workloads.flatMap((w) => w.containers);
  const hasContainers = containers.length > 0;

  if (hasContainers) {
    const allHaveRequests = containers.every(
      (c) => !c.usedDefaults && !c.usedLimitsAsProxy,
    );
    if (allHaveRequests) {
      score += 40;
      factors.push('All containers have CPU and memory requests');
    } else if (containers.some((c) => !c.usedDefaults)) {
      score += 20;
      factors.push('Some containers missing resource requests');
    } else {
      factors.push('Containers using default resource guesses');
    }

    const unpinned = containers.filter(
      (c) => c.image.endsWith(':latest') || !c.image.includes(':'),
    );
    if (unpinned.length === 0) {
      score += 20;
      factors.push('Images use pinned tags');
    } else {
      factors.push(`${unpinned.length} container(s) with unpinned images`);
    }

    const limitsProxy = containers.filter((c) => c.usedLimitsAsProxy);
    if (limitsProxy.length === 0) {
      score += 15;
    } else {
      factors.push('Some costs based on limits, not requests');
    }
  }

  if (parse.pvcs.length > 0) {
    const withClass = parse.pvcs.filter((p) => p.storageClass);
    if (withClass.length === parse.pvcs.length) {
      score += 15;
      factors.push('PVC storage classes specified');
    } else {
      factors.push('PVCs missing storage class — using default tier');
    }
  } else {
    score += 15;
  }

  const deployReplicas = parse.workloads.filter(
    (w) => w.kind === 'Deployment' || w.kind === 'StatefulSet',
  );
  if (deployReplicas.length === 0 || deployReplicas.every((w) => w.replicas >= 1)) {
    score += 10;
  }

  score = Math.min(100, score);

  let level: ConfidenceLevel = 'low';
  if (score >= 80) level = 'high';
  else if (score >= 50) level = 'medium';

  return { score, level, factors };
}
