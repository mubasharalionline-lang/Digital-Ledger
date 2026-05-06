import { getSession } from './auth';

/**
 * Unified terminology — all countries now use "Partner" terminology.
 * The previous country-specific branching has been removed.
 */
interface Terminology {
  /** Singular: "Partner" */
  staffSingular: string;
  /** Plural: "Partners" */
  staffPlural: string;
  /** Page title: "Partner Management" */
  staffPageTitle: string;
  /** "Assigned Partners" */
  assignedStaff: string;
  /** "Assign Partner" */
  assignStaff: string;
  /** "Select a partner..." */
  selectStaffMember: string;
  /** "Add Partner" */
  addStaff: string;
  /** "partners" */
  teamMembers: string;
  /** "No partners yet" */
  noUsersYet: string;
  /** "Add First Partner" */
  addFirstUser: string;
}

const UNIFIED_TERMS: Terminology = {
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

/**
 * Returns unified Partner terminology for all countries.
 */
export function getTerminology(_country?: string | null): Terminology {
  return UNIFIED_TERMS;
}

/**
 * Returns the nav label for the sidebar item.
 */
export function getStaffNavLabel(_country?: string | null): string {
  return UNIFIED_TERMS.staffSingular;
}
