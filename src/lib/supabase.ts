import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole = string;
export type TaskStatus = string;
export type TaskPriority = 'high' | 'medium' | 'low';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  country?: string;
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
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  company_id: string;
  assigned_to: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string;
  admin_note?: string;
  created_at: string;
  // joined fields
  company?: Company;
  assignee?: User;
}
