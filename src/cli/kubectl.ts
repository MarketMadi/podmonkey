import { spawnSync } from 'node:child_process';

const DEFAULT_RESOURCES =
  'deployments,statefulsets,daemonsets,services,persistentvolumeclaims,cronjobs,jobs,ingresses';

export interface KubectlExportOptions {
  /** kubectl resource types (default: common workload kinds). */
  resources?: string;
  /** Namespace; omit for all namespaces (-A). */
  namespace?: string;
  /** Label selector passed to kubectl. */
  selector?: string;
}

export function fetchClusterYaml(options: KubectlExportOptions = {}): string {
  const resources = options.resources ?? DEFAULT_RESOURCES;
  const args = ['get', resources, '-o', 'yaml'];

  if (options.namespace) {
    args.push('-n', options.namespace);
  } else {
    args.push('-A');
  }

  if (options.selector) {
    args.push('-l', options.selector);
  }

  const result = spawnSync('kubectl', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        'kubectl not found in PATH — install kubectl and configure cluster access',
      );
    }
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      result.stderr?.trim() || `kubectl get failed with exit ${result.status}`,
    );
  }

  const yaml = result.stdout?.trim();
  if (!yaml) {
    throw new Error('kubectl returned no resources');
  }

  return yaml;
}
