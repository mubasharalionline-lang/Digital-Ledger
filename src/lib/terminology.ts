import { getSession } from './auth';

/**
 * Country-specific terminology mapping.
 * For Bahrain: "Staff" → "Partner"
 * For New Zealand (and others): keep "Staff"
 */
interface Terminology {
  /** Singular: "Staff" or "Partner" */
  staffSingular: string;
  /** Plural: "Staff" or "Partners" */
  staffPlural: string;
  /** Page title: "Staff Management" or "Partner Management" */
  staffPageTitle: string;
  /** "Assigned Staff" or "Assigned Partners" */
  assignedStaff: string;
  /** "Assign Staff" or "Assign Partner" */
  assignStaff: string;
  /** "Select a staff member..." or "Select a partner..." */
  selectStaffMember: string;
  /** "Add Staff" or "Add Partner" */
  addStaff: string;
  /** "team members" or "partners" */
  teamMembers: string;
  /** "No users yet" or "No partners yet" */
  noUsersYet: string;
  /** "Add First User" or "Add First Partner" */
  addFirstUser: string;
}

const BAHRAIN_TERMS: Terminology = {
  staffSingular: 'Partner',
  staffPlural: 'Partners',
  staffPageTitle: 'Partner Management',
  assignedStaff: 'Assigned Partners',
  assignStaff: 'Assign Partner',
  selectStaffMember: 'Select a partner...',
  addStaff: 'Add Partner',
  teamMembers: 'partners',
  noUsersYet: 'No partners yet',
  addFirstUser: 'Add First Partner',
};

const DEFAULT_TERMS: Terminology = {
  staffSingular: 'Staff',
  staffPlural: 'Staff',
  staffPageTitle: 'Staff Management',
  assignedStaff: 'Assigned Staff',
  assignStaff: 'Assign Staff',
  selectStaffMember: 'Select a staff member...',
  addStaff: 'Add User',
  teamMembers: 'team members',
  noUsersYet: 'No users yet',
  addFirstUser: 'Add First User',
};

/**
 * Returns the correct terminology based on the currently selected country.
 * Bahrain → "Partner" terminology
 * Everything else → "Staff" terminology (default)
 */
export function getTerminology(country?: string | null): Terminology {
  const resolvedCountry = country ?? getSession().country;
  if (resolvedCountry === 'Bahrain') {
    return BAHRAIN_TERMS;
  }
  return DEFAULT_TERMS;
}

/**
 * Returns the nav label for the Staff/Partner sidebar item.
 */
export function getStaffNavLabel(country?: string | null): string {
  return getTerminology(country).staffSingular;
}
