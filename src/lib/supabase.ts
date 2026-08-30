import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole = string;
export type TaskStatus = string;
export type TaskPriority = string;

export interface User {
  id: string;
  username: string;
  role: UserRole;
  country?: string;
  organization?: string;
  email?: string;
  jurisdiction?: string;
  access_level?: string;
  permissions?: {
    can_update_status: boolean;
    can_view_companies: boolean;
    can_message?: boolean;
    auditor_access?: string[];
  };
  created_at: string;
}

export interface CompanyStaff {
  id: string;
  company_id: string;
  user_id: string;
  role: string;
  user?: User;
}

export interface Company {
  id: string;
  company_name: string;
  notes: string;
  job?: string;
  start_date?: string;
  due_date?: string;
  status?: string;
  country: string;
  tax_registration?: string;
  industry?: string;
  fy_end?: string;
  compliance_type?: string;
  google_drive_link?: string;
  cr_number?: string;
  cr_link?: string;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  company_id: string;
  assigned_to: string;
  assigned_partners?: string[];
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string;
  admin_note?: string;
  task_type_id?: string;
  task_type_ids?: string[];
  auditor_id?: string | null;
  description?: string;
  is_daily?: boolean;
  repeat_daily?: boolean;
  repeat_monthly?: boolean;
  country?: string;
  pl_uploaded?: boolean;
  pl_date?: string | null;
  completed_at?: string | null;
  created_at: string;
  // joined fields
  company?: Company;
  assignee?: User;
  task_type?: TaskType;
}

export interface TaskType {
  id: string;
  name: string;
  category: string;
  jurisdiction: string;
  status_options?: string;
  description?: string;
  active: boolean;
  created_at: string;
}

export interface Auditor {
  id: string;
  name: string;
  country?: string;
  created_at: string;
}

export interface StatusLog {
  id: string;
  task_id: string;
  status: string;
  updated_by?: string;
  remarks?: string;
  created_at: string;
  // joined
  updater?: User;
}

export interface TaskMessage {
  id: string;
  task_id: string;
  sender_id: string;
  message: string;
  created_at: string;
  // joined / enriched
  sender?: { username: string; role?: string };
}
