import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseManifests } from '../parser/index';
import { estimate } from '../estimator/index';
import {
  assertSheetsValid,
  loadAllPriceSheets,
  PRICING_BENCHMARKS,
} from './validate-sheets';
import { storageRateGiBMonth, resolveStorageTierKey } from './storage-rate';
import type { PriceSheet } from '../types';

const sheets = loadAllPriceSheets();

describe('price sheet validation', () => {
  it('all sheets pass structural validation', () => {
    expect(assertSheetsValid(sheets)).toEqual([]);
  });

  it('every sheet normalizes OpenCost rates to reference VM', () => {
    for (const sheet of sheets) {
      const h = sheet.hours_per_month;
      const inst = sheet.reference_instance;
      const monthly = inst.hourly_usd * h;
      const catalog = sheet.instance_catalog ?? [];
      const refInCatalog = catalog.find((c) => c.type === inst.type);
      expect(refInCatalog?.hourly_usd).toBeCloseTo(inst.hourly_usd, 4);
      expect(monthly).toBeGreaterThan(0);
    }
  });
});

describe('published rate benchmarks (us-east-1 / equivalents)', () => {
  const aws = sheets.find((s) => s.provider === 'aws')!;

  it('EKS control plane ~$73/mo', () => {
    const monthly = aws.control_plane.hourly_usd * aws.hours_per_month;
    expect(monthly).toBeCloseTo(PRICING_BENCHMARKS.aws.eks_control_plane_monthly, 0);
  });

  it('t4g.medium node floor ~$24.53/mo', () => {
    const t4g = aws.instance_catalog!.find((i) => i.type === 't4g.medium')!;
    expect(t4g.hourly_usd * aws.hours_per_month).toBeCloseTo(
      PRICING_BENCHMARKS.aws.t4g_medium_monthly,
      1,
    );
  });

  it('gp3 storage $0.08/GiB-mo', () => {
    expect(storageRateGiBMonth(aws, 'gp3')).toBe(
      PRICING_BENCHMARKS.aws.gp3_per_gib_month,
    );
  });

  it('gp2 storage $0.10/GiB-mo', () => {
    expect(storageRateGiBMonth(aws, 'gp2')).toBe(
      PRICING_BENCHMARKS.aws.gp2_per_gib_month,
    );
  });

  it('maps GKE premium-rwo to pd-ssd tier', () => {
    const gcp = sheets.find((s) => s.provider === 'gcp')!;
    expect(resolveStorageTierKey(gcp, 'premium-rwo')).toBe('pd_ssd_per_gib_month_usd');
    expect(storageRateGiBMonth(gcp, 'premium-rwo')).toBe(
      PRICING_BENCHMARKS.gcp.pd_ssd_per_gib_month,
    );
  });
});

describe('ingress and storage in estimates', () => {
  const aws = sheets.find((s) => s.provider === 'aws')!;

  it('charges ingress LB fee on AWS', () => {
    const yaml = `
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: alb
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
`;
    const parsed = parseManifests(yaml, aws.defaults);
    const result = estimate(parsed, [aws]);
    expect(result.totals.ingressCount).toBe(1);
    const ingressItem = result.providers[0].lineItems.find(
      (i) => i.category === 'ingress',
    );
    expect(ingressItem?.monthlyUsd).toBe(PRICING_BENCHMARKS.aws.alb_monthly_base);
  });

  it('uses io2 rate for high-performance PVCs', () => {
    const yaml = `
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: db
spec:
  storageClassName: io2
  resources:
    requests:
      storage: 100Gi
`;
    const parsed = parseManifests(yaml, aws.defaults);
    const result = estimate(parsed, [aws]);
    expect(result.totals.storageGiB).toBe(100);
    const storageItem = result.providers[0].lineItems.find(
      (i) => i.category === 'storage',
    );
    expect(storageItem?.monthlyUsd).toBeCloseTo(100 * 0.125, 2);
  });
});
