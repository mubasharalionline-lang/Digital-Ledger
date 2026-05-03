import { getDataCountry } from './auth';

/**
 * Returns true if the current session is viewing Bahrain data.
 */
export function isBahrainMode(country?: string | null): boolean {
  const resolved = country ?? getDataCountry();
  return resolved === 'Bahrain';
}

/** Bahrain-specific task statuses (default set) */
export const BAHRAIN_STATUSES = [
  'Not Started',
  'In Progress',
  'Under Review',
  'Query Raised',
  'Ready to File',
  'Filed',
  'Closed',
];

/** Bahrain-specific priority levels */
export const BAHRAIN_PRIORITIES = ['Urgent', 'High', 'Medium', 'Low'];

/** Task type categories */
export const TASK_TYPE_CATEGORIES = [
  'Tax Filing',
  'Compliance',
  'Audit',
  'Legal',
  'Advisory',
  'Other',
];

/** Bahrain jurisdictions */
export const BAHRAIN_JURISDICTIONS = [
  'All',
  'India',
  'Bahrain',
  'UAE',
  'Saudi Arabia',
  'New Zealand',
  'UK',
];
