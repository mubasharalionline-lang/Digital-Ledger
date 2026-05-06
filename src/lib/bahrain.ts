import { getDataCountry } from './auth';

/**
 * Unified system config — all countries now use the same Bahrain-style architecture.
 * This file is kept for backward compatibility but isBahrainMode() always returns true.
 */

/** Always returns true — the unified system uses Bahrain-style UI for all countries. */
export function isBahrainMode(_country?: string | null): boolean {
  return true;
}

/** Default task statuses (used as fallback if DB statuses table is empty) */
export const DEFAULT_STATUSES = [
  'Not Started',
  'In Progress',
  'Under Review',
  'Query Raised',
  'Ready to File',
  'Filed',
  'Closed',
];

/** Legacy alias — kept for imports that reference BAHRAIN_STATUSES */
export const BAHRAIN_STATUSES = DEFAULT_STATUSES;

/** Default priority levels */
export const DEFAULT_PRIORITIES = ['Urgent', 'High', 'Medium', 'Low'];

/** Legacy alias */
export const BAHRAIN_PRIORITIES = DEFAULT_PRIORITIES;

/** Task type categories */
export const TASK_TYPE_CATEGORIES = [
  'Tax Filing',
  'Compliance',
  'Audit',
  'Legal',
  'Advisory',
  'Other',
];

/** Default jurisdictions list */
export const DEFAULT_JURISDICTIONS = [
  'All',
  'India',
  'Bahrain',
  'UAE',
  'Saudi Arabia',
  'New Zealand',
  'UK',
];

/** Legacy alias */
export const BAHRAIN_JURISDICTIONS = DEFAULT_JURISDICTIONS;
