import { describe, expect, it } from 'vitest';
import { parseManifests } from './index';
import { loadPriceSheet } from '../pricing/load-sheets';

const defaults = loadPriceSheet('aws').defaults;

describe('GPU parsing', () => {
  it('parses nvidia.com/gpu requests', () => {
    const yaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vllm
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: vllm
          image: vllm/vllm-openai:v1
          resources:
            requests:
              cpu: "4"
              memory: 32Gi
              nvidia.com/gpu: "1"
`;
    const result = parseManifests(yaml, defaults);
    expect(result.workloads[0].containers[0].gpuCount).toBe(1);
    expect(result.workloads[0].replicas).toBe(2);
  });
});
