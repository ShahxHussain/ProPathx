import { supabase } from '../config/database.js';

export const MAINTENANCE_DEFAULTS = {
  enabled: false,
  scope: 'all',
  message: '',
  expectedResumeAt: null,
  allowRoles: ['SuperAdmin'],
};

export async function getSystemSetting(key, defaultValue = null) {
  const { data, error } = await supabase
    .from('SystemSettings')
    .select('Value')
    .eq('Key', key)
    .single();

  if (error || !data) {
    return defaultValue;
  }
  return data.Value ?? defaultValue;
}

export async function upsertSystemSetting(key, value, userId) {
  const payload = {
    Key: key,
    Value: value,
    UpdatedAt: new Date().toISOString(),
    UpdatedBy: userId || null,
  };

  const { error } = await supabase.from('SystemSettings').upsert(payload, { onConflict: 'Key' });

  if (error) {
    throw error;
  }
}

/** Public maintenance config (no auth) — used by login flows and org auth. */
export async function getPublicMaintenanceSettings() {
  const stored = await getSystemSetting('maintenance_settings', null);
  if (!stored) {
    return { ...MAINTENANCE_DEFAULTS };
  }
  return {
    ...MAINTENANCE_DEFAULTS,
    ...stored,
  };
}
