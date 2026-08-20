export type TaskColumnId =
  | 'pl'
  | 'company'
  | 'cr_number'
  | 'task_type'
  | 'description'
  | 'desc_updated'
  | 'priority'
  | 'deadline'
  | 'status'
  | 'auditor'
  | 'assigned_to'
  | 'actions';

export interface TaskColumnConfig {
  id: TaskColumnId;
  label: string;
  shortLabel: string;
  description: string;
  align: 'left' | 'center' | 'right';
  visible: boolean;
  minWidth?: string;
}

export const DEFAULT_TASK_COLUMNS: TaskColumnConfig[] = [
  {
    id: 'pl',
    label: 'PL Status',
    shortLabel: 'PL',
    description: 'Uploaded PL status badge (Yes / No)',
    align: 'center',
    visible: true,
    minWidth: '48px'
  },
  {
    id: 'company',
    label: 'Company Name',
    shortLabel: 'Company',
    description: 'Registered company name',
    align: 'left',
    visible: true,
    minWidth: '130px'
  },
  {
    id: 'cr_number',
    label: 'CR Number & Link',
    shortLabel: 'CR Number',
    description: 'Commercial registration number and verification link',
    align: 'left',
    visible: true,
    minWidth: '100px'
  },
  {
    id: 'task_type',
    label: 'Task Type',
    shortLabel: 'Task Type',
    description: 'Audit & task classification categories',
    align: 'left',
    visible: true,
    minWidth: '110px'
  },
  {
    id: 'description',
    label: 'Description',
    shortLabel: 'Description',
    description: 'Detailed task notes & inline edit',
    align: 'left',
    visible: true,
    minWidth: '130px'
  },
  {
    id: 'desc_updated',
    label: 'Description Updated',
    shortLabel: 'Desc Updated',
    description: 'Timestamp of the latest description change',
    align: 'left',
    visible: true,
    minWidth: '100px'
  },
  {
    id: 'priority',
    label: 'Priority',
    shortLabel: 'Priority',
    description: 'Urgency level (Urgent, High, Medium, Low)',
    align: 'left',
    visible: true,
    minWidth: '90px'
  },
  {
    id: 'deadline',
    label: 'Due Date',
    shortLabel: 'Due Date',
    description: 'Scheduled completion deadline',
    align: 'left',
    visible: true,
    minWidth: '95px'
  },
  {
    id: 'status',
    label: 'Status',
    shortLabel: 'Status',
    description: 'Current workflow stage dropdown & indicator',
    align: 'left',
    visible: true,
    minWidth: '115px'
  },
  {
    id: 'auditor',
    label: 'Auditor',
    shortLabel: 'Auditor',
    description: 'Assigned audit controller',
    align: 'left',
    visible: true,
    minWidth: '105px'
  },
  {
    id: 'assigned_to',
    label: 'Assigned To',
    shortLabel: 'Assigned To',
    description: 'Assigned partners and team members',
    align: 'left',
    visible: true,
    minWidth: '115px'
  },
  {
    id: 'actions',
    label: 'Actions',
    shortLabel: '',
    description: 'Quick actions (View Details, Edit, WhatsApp, Delete)',
    align: 'center',
    visible: true,
    minWidth: '36px'
  }
];

const STORAGE_PREFIX = 'dl_task_columns_';

export function normalizeCountryKey(country?: string | null): string {
  if (!country || country.trim() === '' || country === 'null' || country === 'undefined') {
    return 'Bahrain';
  }
  return country.trim();
}

/**
 * Retrieves the customized task column configuration for a specific country.
 * Falls back to DEFAULT_TASK_COLUMNS if none stored.
 */
export function getTaskColumns(country?: string | null): TaskColumnConfig[] {
  if (typeof window === 'undefined') return [...DEFAULT_TASK_COLUMNS];

  const countryKey = normalizeCountryKey(country);
  const stored = localStorage.getItem(`${STORAGE_PREFIX}${countryKey}`);

  if (!stored) {
    // Check if there is a general fallback
    const generalStored = localStorage.getItem(`${STORAGE_PREFIX}default`);
    if (generalStored) {
      try {
        return mergeWithDefaults(JSON.parse(generalStored));
      } catch {
        return [...DEFAULT_TASK_COLUMNS];
      }
    }
    return [...DEFAULT_TASK_COLUMNS];
  }

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [...DEFAULT_TASK_COLUMNS];
    }
    return mergeWithDefaults(parsed);
  } catch (err) {
    console.error('Failed to parse column settings for', countryKey, err);
    return [...DEFAULT_TASK_COLUMNS];
  }
}

/**
 * Ensures any newly introduced columns are preserved even if user has an older saved configuration.
 */
function mergeWithDefaults(saved: Partial<TaskColumnConfig>[]): TaskColumnConfig[] {
  const result: TaskColumnConfig[] = [];
  const handledIds = new Set<string>();

  for (const item of saved) {
    if (!item || !item.id) continue;
    const def = DEFAULT_TASK_COLUMNS.find(d => d.id === item.id);
    if (def) {
      result.push({
        ...def,
        visible: typeof item.visible === 'boolean' ? item.visible : def.visible
      });
      handledIds.add(item.id);
    }
  }

  // Append any missing default columns at the end
  for (const def of DEFAULT_TASK_COLUMNS) {
    if (!handledIds.has(def.id)) {
      result.push({ ...def });
    }
  }

  return result;
}

/**
 * Saves column settings for a specific country and broadcasts the change.
 */
export function saveTaskColumns(country: string | null | undefined, columns: TaskColumnConfig[]): void {
  if (typeof window === 'undefined') return;

  const countryKey = normalizeCountryKey(country);
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${countryKey}`, JSON.stringify(columns));
    window.dispatchEvent(new CustomEvent('task-columns-changed', {
      detail: { country: countryKey, columns }
    }));
  } catch (err) {
    console.error('Error saving column settings:', err);
  }
}

/**
 * Resets column configuration for a specific country back to defaults.
 */
export function resetTaskColumns(country?: string | null): TaskColumnConfig[] {
  if (typeof window === 'undefined') return [...DEFAULT_TASK_COLUMNS];

  const countryKey = normalizeCountryKey(country);
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${countryKey}`);
    const defaults = [...DEFAULT_TASK_COLUMNS];
    window.dispatchEvent(new CustomEvent('task-columns-changed', {
      detail: { country: countryKey, columns: defaults }
    }));
    return defaults;
  } catch (err) {
    console.error('Error resetting column settings:', err);
    return [...DEFAULT_TASK_COLUMNS];
  }
}

/**
 * Applies the given column configuration across all available countries.
 */
export function applyColumnsToAllCountries(columns: TaskColumnConfig[], countries: string[]): void {
  if (typeof window === 'undefined') return;

  try {
    const list = countries.length > 0 ? countries : ['Bahrain', 'UAE', 'Saudi Arabia', 'Oman', 'Kuwait', 'Qatar', 'New Zealand', 'Pakistan', 'USA', 'UK'];
    for (const c of list) {
      const key = normalizeCountryKey(c);
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(columns));
    }
    // Also save as global default
    localStorage.setItem(`${STORAGE_PREFIX}default`, JSON.stringify(columns));

    window.dispatchEvent(new CustomEvent('task-columns-changed', {
      detail: { country: 'ALL', columns }
    }));
  } catch (err) {
    console.error('Error applying columns to all countries:', err);
  }
}
