import { Request, Response, NextFunction } from 'express';
import config from './index';

/**
 * TenantConfig type - extend as needed for tenant-specific overrides
 */
export type TenantConfig = {
  id: string;
  // For now, tenant config mirrors AppConfig; can add per-tenant overrides here
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
};

/**
 * Placeholder for tenant configuration retrieval.
 * In a real implementation, fetch these from your database (e.g., a tenants table)
 */
export async function getTenantConfig(tenantId: string): Promise<TenantConfig> {
  // TODO: replace with dynamic lookup
  return {
    id: tenantId,
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseAnonKey,
    supabaseServiceRoleKey: config.supabaseServiceRoleKey,
  };
}

/**
 * Express middleware to inject tenant config into the request
 */
export async function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const tenantId = req.headers['x-tenant-id'] as string;
  if (!tenantId) {
    return res.status(400).json({ error: 'Missing X-Tenant-ID header' });
  }

  try {
    const tenantConfig = await getTenantConfig(tenantId);
    // Attach to request object
    (req as any).tenantConfig = tenantConfig;
    next();
  } catch (err) {
    next(err);
  }
}
