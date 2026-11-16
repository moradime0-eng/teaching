import { Schema, Model, Query } from 'mongoose';
// [MULTI-TENANT-DISABLED] - این بخش موقتاً غیرفعال شده
// import { tenantStorage } from '../utils/tenantContext';

export interface TenantPluginOptions {
  /** Field name for tenant reference (default: 'tenant') */
  tenantField?: string;
  /** Whether to require tenant field (default: true) */
  required?: boolean;
  /** Custom function to get tenant ID from context */
  getTenantId?: () => string | undefined;
}

declare global {
  namespace Express {
    interface Request {
      bypassTenant?: boolean;
    }
  }
}

// [MULTI-TENANT-DISABLED] - این بخش موقتاً غیرفعال شده
/**
 * Creates a Mongoose plugin for tenant isolation
 * DISABLED: All tenant filtering removed — queries run without tenant scope
 */
export function createTenantPlugin(options: TenantPluginOptions = {}) {
  return function tenantPlugin(schema: Schema) {
    // [MULTI-TENANT-DISABLED] - فیلد tenant را اختیاری می‌کند (جایگزین required: true در مدل‌ها)
    // This overrides the model's tenant field to be optional instead of required
    if (schema.path('tenant')) {
      schema.path('tenant').required(false);
    }

    // [MULTI-TENANT-DISABLED] - تمام query middleware ها غیرفعال شده
    // No-op: plugin does nothing for filtering — all models work without tenant filtering
  };
}

/**
 * Default tenant plugin with standard options
 */
export const tenantPlugin = createTenantPlugin();

// [MULTI-TENANT-DISABLED] - globalPlugin هم غیرفعال شده
/**
 * Plugin for models that should NOT be tenant-scoped (global models)
 */
export function createGlobalPlugin() {
  return function globalPlugin(schema: Schema) {
    schema.statics.isGlobalModel = function () {
      return true;
    };
  };
}

export const globalPlugin = createGlobalPlugin();
