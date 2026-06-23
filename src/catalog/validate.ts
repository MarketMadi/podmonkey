import type { GpuTierId } from '../types';
import type { ModelCatalog } from './types';

const GPU_TIER_ORDER: GpuTierId[] = [
  't4-16gb',
  'l4-24gb',
  'a10g-24gb',
  'rtx4090-24gb',
  'a100-40gb',
  'a100-80gb',
  'h100-80gb',
];

export interface CatalogValidationError {
  path: string;
  message: string;
}

export function validateModelCatalog(catalog: ModelCatalog): CatalogValidationError[] {
  const errors: CatalogValidationError[] = [];

  if (!catalog.schema_version) {
    errors.push({ path: 'schema_version', message: 'required' });
  }
  if (!catalog.as_of) {
    errors.push({ path: 'as_of', message: 'required' });
  }
  if (!catalog.fetched_at) {
    errors.push({ path: 'fetched_at', message: 'required' });
  }
  if (!catalog.defaults?.system_overhead_gib) {
    errors.push({ path: 'defaults.system_overhead_gib', message: 'required' });
  }
  if (!catalog.defaults?.prefill_vs_decode_speed_ratio) {
    errors.push({
      path: 'defaults.prefill_vs_decode_speed_ratio',
      message: 'required',
    });
  }

  const tierVram = catalog.gpu_tier_vram_gib ?? {};
  for (const tier of GPU_TIER_ORDER) {
    if (tierVram[tier] == null || tierVram[tier] <= 0) {
      errors.push({
        path: `gpu_tier_vram_gib.${tier}`,
        message: 'missing or invalid',
      });
    }
  }

  const ids = new Set<string>();
  for (const model of catalog.models ?? []) {
    const prefix = `models.${model.id}`;

    if (!model.id) {
      errors.push({ path: 'models[].id', message: 'required' });
      continue;
    }
    if (ids.has(model.id)) {
      errors.push({ path: prefix, message: 'duplicate id' });
    }
    ids.add(model.id);

    if (!model.hf_id) {
      errors.push({ path: `${prefix}.hf_id`, message: 'required' });
    }

    const quants = Object.entries(model.quantizations ?? {});
    if (quants.length === 0) {
      errors.push({ path: `${prefix}.quantizations`, message: 'at least one required' });
    }
    for (const [q, entry] of quants) {
      if (!entry.weights_gib || entry.weights_gib <= 0) {
        errors.push({
          path: `${prefix}.quantizations.${q}.weights_gib`,
          message: 'must be > 0',
        });
      }
      if (!entry.source?.trim()) {
        errors.push({
          path: `${prefix}.quantizations.${q}.source`,
          message: 'source URL required',
        });
      }
    }

    if (!model.kv_cache_gib_per_user_at_4k || model.kv_cache_gib_per_user_at_4k <= 0) {
      errors.push({
        path: `${prefix}.kv_cache_gib_per_user_at_4k`,
        message: 'must be > 0',
      });
    }

    for (const tier of model.recommended_gpu_tiers ?? []) {
      if (!GPU_TIER_ORDER.includes(tier)) {
        errors.push({
          path: `${prefix}.recommended_gpu_tiers`,
          message: `unknown tier ${tier}`,
        });
      }
    }
  }

  // Spot checks on published benchmark values
  const llama8 = catalog.models.find((m) => m.id === 'llama-3.1-8b');
  const q4 = llama8?.quantizations?.Q4_K_M?.weights_gib;
  if (q4 !== 5) {
    errors.push({
      path: 'models.llama-3.1-8b.quantizations.Q4_K_M',
      message: `expected weights_gib 5 (GIGAGPU), got ${q4}`,
    });
  }

  const llama70 = catalog.models.find((m) => m.id === 'llama-3.3-70b');
  const q4_70 = llama70?.quantizations?.Q4_K_M?.weights_gib;
  if (q4_70 !== 43) {
    errors.push({
      path: 'models.llama-3.3-70b.quantizations.Q4_K_M',
      message: `expected weights_gib 43 (LLMHardware), got ${q4_70}`,
    });
  }

  return errors;
}

export function assertValidModelCatalog(catalog: ModelCatalog): void {
  const errors = validateModelCatalog(catalog);
  if (errors.length > 0) {
    throw new Error(
      `Invalid model catalog:\n${errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`,
    );
  }
}
