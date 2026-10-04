'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import type { Task, Company, User, TaskType, Auditor } from '@/lib/supabase';
import { getDataCountry, getSession } from '@/lib/auth';
import { formatDate, formatDateTime } from '@/lib/dateUtils';
import {
  exportComprehensiveReportExcel,
  isTaskCompleted,
  getActivePartnerIds,
  parseManualTimeToHours,
  AuditorSummaryRow,
  NzPartnerSummaryRow
} from '@/lib/reportExportUtils';
import CountryFlag from '@/components/CountryFlag';
import {
  Calendar,
  CheckCircle2,
  Users,
  Briefcase,
  Printer,
  RefreshCw,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  X,
  FileSpreadsheet,
  Building2,
  Sparkles,
  FileText,
  Download,
  Eye,
  ShieldCheck,
  Clock,
  ArrowUpDown,
  CheckCheck,
  Layers,
  CalendarRange,
  CalendarDays,
  Edit2,
  Check,
  Loader2,
  SlidersHorizontal,
  RotateCcw
} from 'lucide-react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Status badge styling helper
function getStatusBadgeStyle(status?: string | null) {
  const s = (status || '').toLowerCase().trim();
  if (isTaskCompleted(s)) {
    return {
      bg: 'rgba(16, 185, 129, 0.12)',
      text: '#059669',
      border: 'rgba(16, 185, 129, 0.3)',
      dot: '#10b981'
    };
  }
  if (s.includes('progress') || s.includes('working') || s.includes('active')) {
    return {
      bg: 'rgba(37, 99, 235, 0.12)',
      text: '#2563eb',
      border: 'rgba(37, 99, 235, 0.3)',
      dot: '#3b82f6'
    };
  }
  if (s.includes('review') || s.includes('checking') || s.includes('draft') || s.includes('queries')) {
    return {
      bg: 'rgba(245, 158, 11, 0.12)',
      text: '#d97706',
      border: 'rgba(245, 158, 11, 0.3)',
      dot: '#f59e0b'
    };
  }
  if (s.includes('waiting') || s.includes('hold') || s.includes('access') || s.includes('doc')) {
    return {
      bg: 'rgba(236, 72, 153, 0.12)',
      text: '#db2777',
      border: 'rgba(236, 72, 153, 0.3)',
      dot: '#ec4899'
    };
  }
  return {
    bg: 'rgba(100, 116, 139, 0.12)',
    text: 'var(--text-secondary, #64748b)',
    border: 'rgba(100, 116, 139, 0.25)',
    dot: '#94a3b8'
  };
}

// Priority badge helper
function getPriorityBadge(priority?: string | null) {
  const p = (priority || 'medium').toLowerCase();
  if (p === 'urgent') return { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', label: 'Urgent' };
  if (p === 'high') return { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316', label: 'High' };
  if (p === 'medium') return { bg: 'rgba(59, 130, 246, 0.12)', text: '#3b82f6', label: 'Medium' };
  return { bg: 'rgba(107, 114, 128, 0.12)', text: '#6b7280', label: 'Low' };
}

// ─── Print Report Columns Configuration Types & Defaults ───
export type PrintColumnId =
  | 'company'
  | 'taskType'
  | 'description'
  | 'dueDate'
  | 'auditor'
  | 'partner'
  | 'status'
  | 'timeTaken'
  | 'priority'
  | 'createdDate';

export interface PrintColumnDef {
  id: PrintColumnId;
  label: string;
  headerLabel: string;
  defaultSelected: boolean;
  baseWeight: number; // Used for proportional % width calculation
  align?: 'left' | 'center' | 'right';
}

export const AVAILABLE_PRINT_COLUMNS: PrintColumnDef[] = [
  { id: 'company', label: 'Company Name', headerLabel: 'Company Name', defaultSelected: true, baseWeight: 17, align: 'left' },
  { id: 'taskType', label: 'Task Type', headerLabel: 'Task Type', defaultSelected: true, baseWeight: 12, align: 'left' },
  { id: 'description', label: 'Description', headerLabel: 'Description', defaultSelected: true, baseWeight: 20, align: 'left' },
  { id: 'dueDate', label: 'Due Date', headerLabel: 'Due Date', defaultSelected: true, baseWeight: 9, align: 'left' },
  { id: 'auditor', label: 'Auditor', headerLabel: 'Auditor (Delegated By)', defaultSelected: true, baseWeight: 13, align: 'left' },
  { id: 'partner', label: 'Assigned Partner', headerLabel: 'Assigned Partner(s)', defaultSelected: true, baseWeight: 13, align: 'left' },
  { id: 'status', label: 'Status', headerLabel: 'Status', defaultSelected: true, baseWeight: 10, align: 'center' },
  { id: 'timeTaken', label: 'Time Taken', headerLabel: 'Time Taken', defaultSelected: true, baseWeight: 9, align: 'left' },
  { id: 'priority', label: 'Priority', headerLabel: 'Priority', defaultSelected: false, baseWeight: 8, align: 'center' },
  { id: 'createdDate', label: 'Created Date', headerLabel: 'Created Date', defaultSelected: false, baseWeight: 9, align: 'left' },
];

export const DEFAULT_PRINT_COLUMNS: Record<PrintColumnId, boolean> = {
  company: true,
  taskType: true,
  description: true,
  dueDate: true,
  auditor: true,
  partner: true,
  status: true,
  timeTaken: true,
  priority: false,
  createdDate: false,
};

export default function BahrainReports({ countryOverride }: { countryOverride?: string } = {}) {
  const dataCountry = getDataCountry();
  const activeCountry = countryOverride || dataCountry || 'Bahrain';
  const isNz =
    activeCountry === 'New Zealand' ||
    activeCountry === 'NZ' ||
    activeCountry.toLowerCase() === 'new zealand' ||
    activeCountry.toLowerCase() === 'nz';

  const [tasks, setTasks] = useState<Task[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [partners, setPartners] = useState<User[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [auditors, setAuditors] = useState<Auditor[]>([]);
  const [statusLogCompletedMap, setStatusLogCompletedMap] = useState<Record<string, string>>({});
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Timeframe modes: 'monthly' | 'yearly' | 'range' (Default: Monthly)
  const [timeframeMode, setTimeframeMode] = useState<'monthly' | 'yearly' | 'range'>('monthly');

  // Timeframe values
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth()); // 0-11
  
  // Date range (YYYY-MM-DD)
  const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const currentDayStr = now.toISOString().slice(0, 10);
  const [rangeStartDate, setRangeStartDate] = useState<string>(currentMonthStart);
  const [rangeEndDate, setRangeEndDate] = useState<string>(currentDayStr);

  // Filter Basis: default selection is 'all' ("All Tasks")
  const [dateBasis, setDateBasis] = useState<'all' | 'any' | 'deadline' | 'created_at'>('all');

  // Filters
  const [filterAuditor, setFilterAuditor] = useState<string>('all'); // 'all' | 'direct' | auditorId
  const [filterPartner, setFilterPartner] = useState<string>('all'); // 'all' | 'unassigned' | partnerId
  const [filterTaskType, setFilterTaskType] = useState<string>('all'); // 'all' | taskTypeId
  const [filterStatus, setFilterStatus] = useState<string>('all');   // 'all' | 'completed' | 'pending' | specific status
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Active view tab: 'tasks' | 'auditor-breakdown' | 'partner-breakdown'
  const [activeTab, setActiveTab] = useState<'tasks' | 'auditor-breakdown' | 'partner-breakdown'>('tasks');
  const [showPdfModal, setShowPdfModal] = useState<boolean>(false);

  // Manual Time Taken editing state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTimeValue, setEditingTimeValue] = useState<string>('');
  const [isSavingTime, setIsSavingTime] = useState<boolean>(false);
  const [timeToast, setTimeToast] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null);

  // Manual Time Taken handlers
  const handleStartTimeEdit = (task: Task) => {
    setEditingTaskId(task.id);
    setEditingTimeValue(task.time_taken || '');
  };

  const handleCancelTimeEdit = () => {
    setEditingTaskId(null);
    setEditingTimeValue('');
  };

  const handleSaveTime = async (taskId: string) => {
    const trimmed = editingTimeValue.trim() || null;
    setIsSavingTime(true);

    // 1. Cache locally so changes immediately survive reload
    try {
      const localTimeMap = JSON.parse(localStorage.getItem('manual_time_taken_overrides') || '{}');
      if (trimmed) {
        localTimeMap[taskId] = trimmed;
      } else {
        delete localTimeMap[taskId];
      }
      localStorage.setItem('manual_time_taken_overrides', JSON.stringify(localTimeMap));
    } catch (e) {
      console.warn('Could not write manual time to localStorage:', e);
    }

    // 2. Optimistically update local state immediately
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, time_taken: trimmed } : t));

    // 3. Persist to Supabase tasks table
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ time_taken: trimmed })
        .eq('id', taskId);

      if (error) {
        console.warn('Supabase tasks.time_taken update notice:', error.message);
        if (error.message?.includes('time_taken') || error.code === '42703') {
          setTimeToast({
            message: 'Time Taken saved! Please run sql/add_time_taken_to_tasks.sql in Supabase to sync to database.',
            type: 'warning'
          });
        } else {
          setTimeToast({
            message: `Saved locally. Database notice: ${error.message}`,
            type: 'warning'
          });
        }
      } else {
        setTimeToast({
          message: 'Time Taken saved successfully!',
          type: 'success'
        });
      }
    } catch (err: any) {
      console.warn('Exception updating time_taken in Supabase:', err);
      setTimeToast({
        message: 'Time Taken saved locally for this session.',
        type: 'warning'
      });
    } finally {
      setIsSavingTime(false);
      setEditingTaskId(null);
      setTimeout(() => setTimeToast(null), 4000);
    }
  };

  // Fetch all necessary data for Bahrain
  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);

      // 1. Fetch Tasks (including completed_at)
      const { data: taskData, error: taskErr } = await supabase
        .from('tasks')
        .select('*')
        .eq('country', activeCountry)
        .order('created_at', { ascending: false });

      if (taskErr) console.error('Error fetching Bahrain tasks:', taskErr);

      // 2. Fetch Companies
      const { data: compData, error: compErr } = await supabase
        .from('companies')
        .select('*')
        .eq('country', activeCountry);

      if (compErr) console.error('Error fetching Bahrain companies:', compErr);

      // 3. Fetch Partners & Users for Bahrain
      const { data: userData, error: userErr } = await supabase
        .from('users')
        .select('*')
        .eq('country', activeCountry)
        .order('username', { ascending: true });

      if (userErr) console.error('Error fetching Bahrain users:', userErr);

      // 4. Fetch Task Types
      const { data: ttData, error: ttErr } = await supabase
        .from('task_types')
        .select('*')
        .or(`country.eq.${activeCountry},country.is.null`);

      if (ttErr) console.error('Error fetching task types:', ttErr);

      // 5. Fetch Auditors
      const { data: audData, error: audErr } = await supabase
        .from('auditors')
        .select('*')
        .or(`country.eq.${activeCountry},country.is.null`)
        .order('name', { ascending: true });

      if (audErr) console.error('Error fetching auditors:', audErr);

      // 6. Fetch Status definitions (deduplicated)
      const { data: stData } = await supabase
        .from('statuses')
        .select('name')
        .or(`country.eq.${activeCountry},country.is.null`);

      const statusNames = Array.from(new Set(
        (stData || []).map(s => (s.name || '').trim()).filter(Boolean)
      )).sort();
      setAvailableStatuses(statusNames);

      // 7. Fetch Status Log to backfill completion timestamps if completed_at is null or identical to created_at
      const completedTaskIds = (taskData || [])
        .filter(t => isTaskCompleted(t.status) && (!t.completed_at || t.completed_at === t.created_at))
        .map(t => t.id);

      const statusMap: Record<string, string> = {};
      if (completedTaskIds.length > 0) {
        for (let i = 0; i < completedTaskIds.length; i += 100) {
          const chunk = completedTaskIds.slice(i, i + 100);
          const { data: logData } = await supabase
            .from('status_log')
            .select('task_id, status, remarks, created_at')
            .in('task_id', chunk)
            .order('created_at', { ascending: false });

          if (logData) {
            logData.forEach(log => {
              const remarksSl = (log.remarks || '').toLowerCase();
              if ((isTaskCompleted(log.status) || remarksSl.includes('completed')) && !statusMap[log.task_id]) {
                statusMap[log.task_id] = log.created_at;
              }
            });
          }
        }
      }
      // Merge with any manual time taken overrides from localStorage
      let localTimeMap: Record<string, string> = {};
      try {
        localTimeMap = JSON.parse(localStorage.getItem('manual_time_taken_overrides') || '{}');
      } catch {
        // ignore
      }

      const tasksWithTime = (taskData || []).map(t => ({
        ...t,
        time_taken: (t.time_taken !== undefined && t.time_taken !== null && t.time_taken !== '')
          ? t.time_taken
          : (localTimeMap[t.id] || null)
      }));

      setTasks(tasksWithTime);
      setCompanies(compData || []);
      setPartners(userData || []);
      setTaskTypes(ttData || []);
      setAuditors(audData || []);
    } catch (err) {
      console.error('Failed to load Bahrain report data', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCountry]);

  useEffect(() => {
    setIsMounted(true);
    fetchData();
  }, [fetchData]);

  // Selected Month formatted string: e.g. "2026-09"
  const selectedMonthStr = useMemo(() => {
    const mm = String(selectedMonth + 1).padStart(2, '0');
    return `${selectedYear}-${mm}`;
  }, [selectedYear, selectedMonth]);

  const currentPeriodLabel = useMemo(() => {
    if (timeframeMode === 'monthly') {
      return `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
    }
    if (timeframeMode === 'yearly') {
      return `Year ${selectedYear}`;
    }
    return `${formatDate(rangeStartDate)} – ${formatDate(rangeEndDate)}`;
  }, [timeframeMode, selectedMonth, selectedYear, rangeStartDate, rangeEndDate]);

  // Month navigation helpers
  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(y => y - 1);
    } else {
      setSelectedMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(y => y + 1);
    } else {
      setSelectedMonth(m => m + 1);
    }
  };

  const handleCurrentMonth = () => {
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth());
  };

  // Month distribution counts (for badges on month selector)
  const monthTaskCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (let i = 0; i < 12; i++) counts[i] = 0;

    tasks.forEach(t => {
      const dDeadline = t.deadline?.slice(0, 7);
      const dCreated = t.created_at?.slice(0, 7);
      const dCompleted = (t.completed_at || statusLogCompletedMap[t.id])?.slice(0, 7);
      const targetPrefix = `${selectedYear}-`;

      for (let m = 0; m < 12; m++) {
        const mm = String(m + 1).padStart(2, '0');
        const monthKey = `${targetPrefix}${mm}`;
        if (dateBasis === 'deadline') {
          if (dDeadline === monthKey) counts[m] = (counts[m] || 0) + 1;
        } else if (dateBasis === 'created_at') {
          if (dCreated === monthKey) counts[m] = (counts[m] || 0) + 1;
        } else {
          // 'all' / 'any': matches deadline, completed_at, or created_at
          if (dDeadline === monthKey || dCompleted === monthKey || dCreated === monthKey) {
            counts[m] = (counts[m] || 0) + 1;
          }
        }
      }
    });
    return counts;
  }, [tasks, selectedYear, dateBasis, statusLogCompletedMap]);

  // Lookup maps
  const partnerMap = useMemo(() => new Map<string, User>(partners.map(p => [p.id, p])), [partners]);
  const auditorMap = useMemo(() => new Map<string, Auditor>(auditors.map(a => [a.id, a])), [auditors]);
  const companyMap = useMemo(() => new Map<string, Company>(companies.map(c => [c.id, c])), [companies]);

  // Helper to resolve completion date of a task
  const getTaskCompletedDate = useCallback((task: Task): string | null => {
    if (!isTaskCompleted(task.status)) return null;
    if (task.completed_at && task.completed_at !== task.created_at) {
      return task.completed_at;
    }
    return statusLogCompletedMap[task.id] || task.completed_at || null;
  }, [statusLogCompletedMap]);

  // Filter tasks based on Timeframe
  const timeframeTasks = useMemo(() => {
    return tasks.filter(task => {
      const dDeadline = task.deadline?.slice(0, 10);
      const dCreated = task.created_at?.slice(0, 10);
      const dCompleted = getTaskCompletedDate(task)?.slice(0, 10);

      if (timeframeMode === 'monthly') {
        const dMonthDeadline = dDeadline?.slice(0, 7);
        const dMonthCreated = dCreated?.slice(0, 7);
        const dMonthCompleted = dCompleted?.slice(0, 7);

        if (dateBasis === 'deadline') return dMonthDeadline === selectedMonthStr;
        if (dateBasis === 'created_at') return dMonthCreated === selectedMonthStr;
        return (
          dMonthDeadline === selectedMonthStr ||
          dMonthCompleted === selectedMonthStr ||
          dMonthCreated === selectedMonthStr
        );
      }

      if (timeframeMode === 'yearly') {
        const yStr = String(selectedYear);
        const yDeadline = dDeadline?.slice(0, 4);
        const yCreated = dCreated?.slice(0, 4);
        const yCompleted = dCompleted?.slice(0, 4);

        if (dateBasis === 'deadline') return yDeadline === yStr;
        if (dateBasis === 'created_at') return yCreated === yStr;
        return yDeadline === yStr || yCompleted === yStr || yCreated === yStr;
      }

      if (timeframeMode === 'range') {
        const start = rangeStartDate || '0000-00-00';
        const end = rangeEndDate || '9999-99-99';

        const inRange = (d?: string) => d && d >= start && d <= end;

        if (dateBasis === 'deadline') return inRange(dDeadline);
        if (dateBasis === 'created_at') return inRange(dCreated);
        return inRange(dDeadline) || inRange(dCompleted) || inRange(dCreated);
      }

      return true;
    });
  }, [tasks, timeframeMode, selectedMonthStr, selectedYear, rangeStartDate, rangeEndDate, dateBasis, getTaskCompletedDate]);

  // Executive Metrics for the current timeframe
  const metrics = useMemo(() => {
    const total = timeframeTasks.length;
    let completed = 0;
    const activeAuditorSet = new Set<string>();
    const activePartnerSet = new Set<string>();

    timeframeTasks.forEach(t => {
      if (isTaskCompleted(t.status)) {
        completed++;
      }
      if (t.auditor_id) {
        activeAuditorSet.add(t.auditor_id);
      }
      const pIds = getActivePartnerIds(t);
      pIds.forEach(id => {
        if (partnerMap.has(id)) activePartnerSet.add(id);
      });
    });

    const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0';
    const pending = total - completed;

    return {
      total,
      completed,
      pending,
      completionRate,
      activeAuditorsCount: activeAuditorSet.size,
      activePartnersCount: activePartnerSet.size
    };
  }, [timeframeTasks, partnerMap]);

  // Auditor-wise Breakdown calculation
  // "Whenever a task is assigned to an auditor, it means we are doing the auditor's work/task.
  // The auditor gives us the task, and we complete it for them."
  const auditorBreakdown = useMemo(() => {
    const map: Record<string, {
      auditorId: string;
      name: string;
      totalTasks: number;
      completedTasks: number;
      pendingTasks: number;
      tasks: Task[];
    }> = {};

    timeframeTasks.forEach(task => {
      const key = task.auditor_id || 'direct';
      const completed = isTaskCompleted(task.status);

      if (!map[key]) {
        const aud = task.auditor_id ? auditorMap.get(task.auditor_id) : null;
        map[key] = {
          auditorId: key,
          name: aud ? aud.name : 'Direct Client (No Auditor)',
          totalTasks: 0,
          completedTasks: 0,
          pendingTasks: 0,
          tasks: []
        };
      }

      map[key].totalTasks++;
      if (completed) {
        map[key].completedTasks++;
      } else {
        map[key].pendingTasks++;
      }
      map[key].tasks.push(task);
    });

    const list = Object.values(map).map(item => ({
      ...item,
      completionRate: item.totalTasks > 0
        ? `${((item.completedTasks / item.totalTasks) * 100).toFixed(1)}%`
        : '0%'
    }));

    // Sort by total delegated tasks descending, then completed
    list.sort((a, b) => b.totalTasks - a.totalTasks || b.completedTasks - a.completedTasks);
    return list;
  }, [timeframeTasks, auditorMap]);

  // Partner-wise Breakdown calculation
  const partnerBreakdown = useMemo(() => {
    const map: Record<string, {
      partnerId: string;
      name: string;
      role: string;
      totalTasks: number;
      completedTasks: number;
      pendingTasks: number;
      tasks: Task[];
    }> = {};

    timeframeTasks.forEach(task => {
      const activeIds = getActivePartnerIds(task);
      const completed = isTaskCompleted(task.status);
      const validPartnerIds = activeIds.filter(id => partnerMap.has(id));

      if (validPartnerIds.length === 0) {
        const unassignedKey = 'unassigned';
        if (!map[unassignedKey]) {
          map[unassignedKey] = {
            partnerId: 'unassigned',
            name: 'Unassigned Team',
            role: 'None',
            totalTasks: 0,
            completedTasks: 0,
            pendingTasks: 0,
            tasks: []
          };
        }
        map[unassignedKey].totalTasks++;
        if (completed) map[unassignedKey].completedTasks++;
        else map[unassignedKey].pendingTasks++;
        map[unassignedKey].tasks.push(task);
      } else {
        validPartnerIds.forEach(pId => {
          if (!map[pId]) {
            const user = partnerMap.get(pId);
            map[pId] = {
              partnerId: pId,
              name: user?.username || 'Unknown Partner',
              role: user?.role || 'Partner',
              totalTasks: 0,
              completedTasks: 0,
              pendingTasks: 0,
              tasks: []
            };
          }
          map[pId].totalTasks++;
          if (completed) map[pId].completedTasks++;
          else map[pId].pendingTasks++;
          map[pId].tasks.push(task);
        });
      }
    });

    const list = Object.values(map).map(item => ({
      ...item,
      completionRate: item.totalTasks > 0
        ? `${((item.completedTasks / item.totalTasks) * 100).toFixed(1)}%`
        : '0%'
    }));

    list.sort((a, b) => b.completedTasks - a.completedTasks || b.totalTasks - a.totalTasks);
    return list;
  }, [timeframeTasks, partnerMap]);

  // Filter tasks based on selected dropdowns & search
  const filteredTasks = useMemo(() => {
    return timeframeTasks.filter(task => {
      // 1. Auditor Filter
      if (filterAuditor !== 'all') {
        if (filterAuditor === 'direct') {
          if (task.auditor_id) return false;
        } else {
          if (task.auditor_id !== filterAuditor) return false;
        }
      }

      // 2. Partner Filter
      if (filterPartner !== 'all') {
        const pIds = getActivePartnerIds(task);
        if (filterPartner === 'unassigned') {
          const hasValidPartner = pIds.some(id => partnerMap.has(id));
          if (hasValidPartner) return false;
        } else {
          if (!pIds.includes(filterPartner)) return false;
        }
      }

      // 3. Task Type Filter
      if (filterTaskType !== 'all') {
        const ids: string[] = [];
        if (Array.isArray(task.task_type_ids) && task.task_type_ids.length > 0) {
          ids.push(...task.task_type_ids);
        }
        if (task.task_type_id) {
          const split = task.task_type_id.split(',').map(s => s.trim()).filter(Boolean);
          ids.push(...split);
        }
        if (!ids.includes(filterTaskType)) return false;
      }

      // 4. Status Filter
      if (filterStatus !== 'all') {
        if (filterStatus === 'completed') {
          if (!isTaskCompleted(task.status)) return false;
        } else if (filterStatus === 'pending') {
          if (isTaskCompleted(task.status)) return false;
        } else {
          if ((task.status || '').toLowerCase() !== filterStatus.toLowerCase()) return false;
        }
      }

      // 5. Priority Filter
      if (filterPriority !== 'all') {
        if ((task.priority || '').toLowerCase() !== filterPriority.toLowerCase()) return false;
      }

      // 6. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const comp = companyMap.get(task.company_id)?.company_name?.toLowerCase() || '';
        const title = (task.title || '').toLowerCase();
        const desc = (task.description || '').toLowerCase();
        const aud = task.auditor_id ? (auditorMap.get(task.auditor_id)?.name?.toLowerCase() || '') : '';
        const pIds = getActivePartnerIds(task);
        const pNames = pIds.map(id => partnerMap.get(id)?.username?.toLowerCase() || '').join(' ');

        if (
          !comp.includes(q) &&
          !title.includes(q) &&
          !desc.includes(q) &&
          !aud.includes(q) &&
          !pNames.includes(q) &&
          !task.id.toLowerCase().includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [timeframeTasks, filterAuditor, filterPartner, filterTaskType, filterStatus, filterPriority, searchQuery, companyMap, auditorMap, partnerMap]);

  // STRICT SORTING RULE:
  // "The report shall be sorted like first only completed then in progress"
  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      const aComp = isTaskCompleted(a.status);
      const bComp = isTaskCompleted(b.status);

      // Primary: Completed first!
      if (aComp && !bComp) return -1;
      if (!aComp && bComp) return 1;

      // Secondary for Completed: Most recently completed first
      if (aComp && bComp) {
        const aDate = getTaskCompletedDate(a) || a.created_at || '';
        const bDate = getTaskCompletedDate(b) || b.created_at || '';
        return bDate.localeCompare(aDate);
      }

      // Secondary for In Progress: Closest deadline first (or created_at descending)
      const aDead = a.deadline || '9999-99-99';
      const bDead = b.deadline || '9999-99-99';
      if (aDead !== bDead) return aDead.localeCompare(bDead);

      return (b.created_at || '').localeCompare(a.created_at || '');
    });
  }, [filteredTasks, getTaskCompletedDate]);

  // Export to Excel handler
  const handleExportExcel = async () => {
    const auditorSummaryRows: AuditorSummaryRow[] = auditorBreakdown.map(a => ({
      auditorId: a.auditorId,
      name: a.name,
      totalTasks: a.totalTasks,
      completedTasks: a.completedTasks,
      completionRate: a.completionRate
    }));

    const partnerSummaryRows: NzPartnerSummaryRow[] = partnerBreakdown.map(p => ({
      partnerId: p.partnerId,
      name: p.name,
      role: p.role,
      totalTasks: p.totalTasks,
      completedTasks: p.completedTasks,
      completionRate: p.completionRate
    }));

    await exportComprehensiveReportExcel(
      sortedTasks,
      {
        tasks: timeframeTasks,
        companies,
        partners,
        taskTypes,
        auditors,
        country: activeCountry
      },
      currentPeriodLabel,
      {
        auditorSummary: auditorSummaryRows,
        partnerSummary: partnerSummaryRows,
        timeframeType: timeframeMode,
        fileNamePrefix: `${activeCountry.replace(/\s+/g, '_')}_Report`
      }
    );
  };

  // ─── Print Modal & Report Generator State & Logic ───
  const [printTimeframeMode, setPrintTimeframeMode] = useState<'monthly' | 'yearly' | 'range'>('monthly');
  const [printYear, setPrintYear] = useState<number>(now.getFullYear());
  const [printMonth, setPrintMonth] = useState<number>(now.getMonth());
  const [printRangeStart, setPrintRangeStart] = useState<string>(currentMonthStart);
  const [printRangeEnd, setPrintRangeEnd] = useState<string>(currentDayStr);
  const [printAuditor, setPrintAuditor] = useState<string>('all');
  const [printPartner, setPrintPartner] = useState<string>('all');
  const [printTaskType, setPrintTaskType] = useState<string>('all');
  const [printStatus, setPrintStatus] = useState<string>('all');
  const [printRecipient, setPrintRecipient] = useState<string>('Finex');

  // Print Columns Selection State (persisted to localStorage)
  const [selectedPrintColumns, setSelectedPrintColumns] = useState<Record<PrintColumnId, boolean>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('report_pdf_columns_v1');
        if (saved) {
          const parsed = JSON.parse(saved);
          return { ...DEFAULT_PRINT_COLUMNS, ...parsed };
        }
      } catch (e) {
        // ignore
      }
    }
    return { ...DEFAULT_PRINT_COLUMNS };
  });

  const togglePrintColumn = useCallback((columnId: PrintColumnId) => {
    setSelectedPrintColumns(prev => {
      const isCurrentlySelected = !!prev[columnId];
      // Keep at least one column selected
      const selectedCount = Object.values(prev).filter(Boolean).length;
      if (isCurrentlySelected && selectedCount <= 1) {
        return prev;
      }
      const next = { ...prev, [columnId]: !isCurrentlySelected };
      try {
        localStorage.setItem('report_pdf_columns_v1', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  }, []);

  const selectAllPrintColumns = useCallback(() => {
    const next: Record<PrintColumnId, boolean> = {} as any;
    AVAILABLE_PRINT_COLUMNS.forEach(col => {
      next[col.id] = true;
    });
    try {
      localStorage.setItem('report_pdf_columns_v1', JSON.stringify(next));
    } catch (e) {}
    setSelectedPrintColumns(next);
  }, []);

  const resetDefaultPrintColumns = useCallback(() => {
    const next = { ...DEFAULT_PRINT_COLUMNS };
    try {
      localStorage.setItem('report_pdf_columns_v1', JSON.stringify(next));
    } catch (e) {}
    setSelectedPrintColumns(next);
  }, []);

  const activePrintColumnCount = useMemo(() => {
    return Object.values(selectedPrintColumns).filter(Boolean).length;
  }, [selectedPrintColumns]);

  // Dynamically calculate column widths so active columns span 100% of the table without gaps
  const printColumnWidths = useMemo(() => {
    let totalWeight = 0;
    AVAILABLE_PRINT_COLUMNS.forEach(col => {
      if (selectedPrintColumns[col.id]) {
        totalWeight += col.baseWeight;
      }
    });

    const widths: Record<PrintColumnId, string> = {} as any;
    AVAILABLE_PRINT_COLUMNS.forEach(col => {
      if (selectedPrintColumns[col.id] && totalWeight > 0) {
        // Allocate remaining ~97% (reserving ~3% for # index column)
        const pct = (col.baseWeight / totalWeight) * 97;
        widths[col.id] = `${pct.toFixed(2)}%`;
      } else {
        widths[col.id] = '0%';
      }
    });
    return widths;
  }, [selectedPrintColumns]);

  const openPrintModal = () => {
    setPrintTimeframeMode(timeframeMode);
    setPrintYear(selectedYear);
    setPrintMonth(selectedMonth);
    setPrintRangeStart(rangeStartDate);
    setPrintRangeEnd(rangeEndDate);
    setPrintAuditor(filterAuditor);
    setPrintPartner(filterPartner);
    setPrintTaskType(filterTaskType);
    setPrintStatus(filterStatus);

    // Smart recipient pre-population
    if (filterAuditor !== 'all' && filterAuditor !== 'direct') {
      const aud = auditorMap.get(filterAuditor);
      setPrintRecipient(aud?.name || 'Finex');
    } else if (filterAuditor === 'direct') {
      setPrintRecipient('Direct Clients');
    } else {
      setPrintRecipient('Finex');
    }
    setShowPdfModal(true);
  };

  const printTimeframeTasks = useMemo(() => {
    return tasks.filter(task => {
      const dDeadline = task.deadline?.slice(0, 10);
      const dCreated = task.created_at?.slice(0, 10);
      const dCompleted = getTaskCompletedDate(task)?.slice(0, 10);

      if (printTimeframeMode === 'monthly') {
        const mm = String(printMonth + 1).padStart(2, '0');
        const targetMonth = `${printYear}-${mm}`;
        const dMonthDeadline = dDeadline?.slice(0, 7);
        const dMonthCreated = dCreated?.slice(0, 7);
        const dMonthCompleted = dCompleted?.slice(0, 7);

        return (
          dMonthDeadline === targetMonth ||
          dMonthCompleted === targetMonth ||
          dMonthCreated === targetMonth
        );
      }

      if (printTimeframeMode === 'yearly') {
        const yStr = String(printYear);
        return (
          dDeadline?.slice(0, 4) === yStr ||
          dCompleted?.slice(0, 4) === yStr ||
          dCreated?.slice(0, 4) === yStr
        );
      }

      if (printTimeframeMode === 'range') {
        const start = printRangeStart || '0000-00-00';
        const end = printRangeEnd || '9999-99-99';
        const inRange = (d?: string) => d && d >= start && d <= end;
        return inRange(dDeadline) || inRange(dCompleted) || inRange(dCreated);
      }

      return true;
    });
  }, [tasks, printTimeframeMode, printYear, printMonth, printRangeStart, printRangeEnd, getTaskCompletedDate]);

  const printFilteredTasks = useMemo(() => {
    return printTimeframeTasks.filter(task => {
      if (printAuditor !== 'all') {
        if (printAuditor === 'direct') {
          if (task.auditor_id) return false;
        } else {
          if (task.auditor_id !== printAuditor) return false;
        }
      }

      if (printPartner !== 'all') {
        const pIds = getActivePartnerIds(task);
        if (printPartner === 'unassigned') {
          const hasValid = pIds.some(id => partnerMap.has(id));
          if (hasValid) return false;
        } else {
          if (!pIds.includes(printPartner)) return false;
        }
      }

      // Task Type Filter
      if (printTaskType !== 'all') {
        const ids: string[] = [];
        if (Array.isArray(task.task_type_ids) && task.task_type_ids.length > 0) {
          ids.push(...task.task_type_ids);
        }
        if (task.task_type_id) {
          const split = task.task_type_id.split(',').map(s => s.trim()).filter(Boolean);
          ids.push(...split);
        }
        if (!ids.includes(printTaskType)) return false;
      }

      if (printStatus !== 'all') {
        if (printStatus === 'completed') {
          if (!isTaskCompleted(task.status)) return false;
        } else if (printStatus === 'pending') {
          if (isTaskCompleted(task.status)) return false;
        } else {
          if ((task.status || '').toLowerCase() !== printStatus.toLowerCase()) return false;
        }
      }

      return true;
    });
  }, [printTimeframeTasks, printAuditor, printPartner, printTaskType, printStatus, partnerMap]);

  // STRICT PRINT SORTING RULE AS REQUESTED:
  // 1. Completed tasks should appear first
  // 2. Then the remaining tasks should be sorted alphabetically (A-Z) by Company Name
  const printSortedTasks = useMemo(() => {
    return [...printFilteredTasks].sort((a, b) => {
      const aComp = isTaskCompleted(a.status);
      const bComp = isTaskCompleted(b.status);

      // 1. Completed tasks appear first
      if (aComp && !bComp) return -1;
      if (!aComp && bComp) return 1;

      // If both completed: sort by completed date descending, then company name
      if (aComp && bComp) {
        const aDate = getTaskCompletedDate(a) || a.created_at || '';
        const bDate = getTaskCompletedDate(b) || b.created_at || '';
        if (bDate !== aDate) return bDate.localeCompare(aDate);
        const compA = (companyMap.get(a.company_id)?.company_name || a.title || '').trim().toLowerCase();
        const compB = (companyMap.get(b.company_id)?.company_name || b.title || '').trim().toLowerCase();
        return compA.localeCompare(compB);
      }

      // 2. Remaining tasks sorted alphabetically (A-Z) by Company Name
      const compA = (companyMap.get(a.company_id)?.company_name || a.title || '').trim().toLowerCase();
      const compB = (companyMap.get(b.company_id)?.company_name || b.title || '').trim().toLowerCase();
      return compA.localeCompare(compB);
    });
  }, [printFilteredTasks, companyMap, getTaskCompletedDate]);

  const printPeriodLabel = useMemo(() => {
    if (printTimeframeMode === 'monthly') {
      return `${MONTH_NAMES[printMonth]} ${printYear}`;
    }
    if (printTimeframeMode === 'yearly') {
      return `Year ${printYear}`;
    }
    return `${formatDate(printRangeStart)} – ${formatDate(printRangeEnd)}`;
  }, [printTimeframeMode, printMonth, printYear, printRangeStart, printRangeEnd]);

  // Task Types Breakdown & Counts for Page 1 of the Printed/PDF Report
  const printTaskTypeStats = useMemo(() => {
    const map: Record<string, {
      id: string;
      name: string;
      total: number;
      completed: number;
      pending: number;
    }> = {};

    printSortedTasks.forEach(task => {
      const isComp = isTaskCompleted(task.status);
      const ttIds = task.task_type_ids?.length
        ? task.task_type_ids
        : (task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : []);

      if (ttIds.length === 0) {
        const key = 'unassigned';
        if (!map[key]) {
          map[key] = { id: key, name: 'General / Uncategorized', total: 0, completed: 0, pending: 0 };
        }
        map[key].total++;
        if (isComp) map[key].completed++;
        else map[key].pending++;
      } else {
        ttIds.forEach(id => {
          const typeObj = taskTypes.find(t => t.id === id);
          const typeName = typeObj?.name || 'Uncategorized';
          if (!map[id]) {
            map[id] = { id, name: typeName, total: 0, completed: 0, pending: 0 };
          }
          map[id].total++;
          if (isComp) map[id].completed++;
          else map[id].pending++;
        });
      }
    });

    return Object.values(map).sort((a, b) => b.total - a.total || b.completed - a.completed);
  }, [printSortedTasks, taskTypes]);

  // Executive Overview Summary for Page 1 of the Printed/PDF Report
  const printExecutiveStats = useMemo(() => {
    const total = printSortedTasks.length;
    const completedTasks = printSortedTasks.filter(t => isTaskCompleted(t.status));
    const completed = completedTasks.length;
    const pending = total - completed;
    const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0';
    const pendingRate = total > 0 ? ((pending / total) * 100).toFixed(1) : '0';

    // Calculate Average Time Taken across tasks with manually entered Time Taken
    const tasksWithManualTime = printSortedTasks
      .map(t => ({ task: t, hours: parseManualTimeToHours(t.time_taken) }))
      .filter((r): r is { task: Task; hours: number } => r.hours !== null && r.hours > 0);

    let avgTimeTakenFormatted = '—';
    if (tasksWithManualTime.length > 0) {
      const avgHours = tasksWithManualTime.reduce((acc, cur) => acc + cur.hours, 0) / tasksWithManualTime.length;
      const days = Math.floor(avgHours / 24);
      const remainingHours = Math.round(avgHours % 24);
      if (days > 0) {
        avgTimeTakenFormatted = `${days} day${days === 1 ? '' : 's'}${remainingHours > 0 ? ` ${remainingHours} hr${remainingHours === 1 ? '' : 's'}` : ''}`;
      } else if (avgHours >= 1) {
        avgTimeTakenFormatted = `${avgHours % 1 === 0 ? avgHours.toFixed(0) : avgHours.toFixed(1)} hrs`;
      } else {
        const mins = Math.round(avgHours * 60);
        avgTimeTakenFormatted = `${mins} min${mins === 1 ? '' : 's'}`;
      }
    }

    const activePartners = new Set<string>();
    printSortedTasks.forEach(t => {
      getActivePartnerIds(t).forEach(id => {
        if (partnerMap.has(id)) activePartners.add(id);
      });
    });

    return {
      total,
      completed,
      pending,
      completionRate,
      pendingRate,
      avgTimeTakenFormatted,
      manualTimeCount: tasksWithManualTime.length,
      activePartnersCount: activePartners.size
    };
  }, [printSortedTasks, partnerMap]);

  // Date Range Presets
  const applyDatePreset = (preset: 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'last30Days' | 'ytd') => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();

    if (preset === 'thisMonth') {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      setRangeStartDate(start.toISOString().slice(0, 10));
      setRangeEndDate(end.toISOString().slice(0, 10));
    } else if (preset === 'lastMonth') {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      setRangeStartDate(start.toISOString().slice(0, 10));
      setRangeEndDate(end.toISOString().slice(0, 10));
    } else if (preset === 'thisQuarter') {
      const qMonth = Math.floor(m / 3) * 3;
      const start = new Date(y, qMonth, 1);
      const end = new Date(y, qMonth + 3, 0);
      setRangeStartDate(start.toISOString().slice(0, 10));
      setRangeEndDate(end.toISOString().slice(0, 10));
    } else if (preset === 'last30Days') {
      const start = new Date(today);
      start.setDate(today.getDate() - 30);
      setRangeStartDate(start.toISOString().slice(0, 10));
      setRangeEndDate(today.toISOString().slice(0, 10));
    } else if (preset === 'ytd') {
      const start = new Date(y, 0, 1);
      setRangeStartDate(start.toISOString().slice(0, 10));
      setRangeEndDate(today.toISOString().slice(0, 10));
    }
  };

  const applyPrintDatePreset = (preset: 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'last30Days' | 'ytd') => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();

    if (preset === 'thisMonth') {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      setPrintRangeStart(start.toISOString().slice(0, 10));
      setPrintRangeEnd(end.toISOString().slice(0, 10));
    } else if (preset === 'lastMonth') {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      setPrintRangeStart(start.toISOString().slice(0, 10));
      setPrintRangeEnd(end.toISOString().slice(0, 10));
    } else if (preset === 'thisQuarter') {
      const qMonth = Math.floor(m / 3) * 3;
      const start = new Date(y, qMonth, 1);
      const end = new Date(y, qMonth + 3, 0);
      setPrintRangeStart(start.toISOString().slice(0, 10));
      setPrintRangeEnd(end.toISOString().slice(0, 10));
    } else if (preset === 'last30Days') {
      const start = new Date(today);
      start.setDate(today.getDate() - 30);
      setPrintRangeStart(start.toISOString().slice(0, 10));
      setPrintRangeEnd(today.toISOString().slice(0, 10));
    } else if (preset === 'ytd') {
      const start = new Date(y, 0, 1);
      setPrintRangeStart(start.toISOString().slice(0, 10));
      setPrintRangeEnd(today.toISOString().slice(0, 10));
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '14px' }}>
        <RefreshCw className="animate-spin" size={32} color="var(--accent, #2563eb)" />
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Loading {activeCountry} Reports...
        </div>
      </div>
    );
  }

  return (
    <div className="bahrain-reports-container" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      
      {/* ─── Header & Action Bar ─── */}
      <div className="card glass reports-header" style={{
        padding: '24px 28px',
        borderRadius: '18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '18px',
        background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%)',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            background: isNz
              ? 'linear-gradient(135deg, rgba(37, 99, 235, 0.15) 0%, rgba(30, 64, 175, 0.05) 100%)'
              : 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.05) 100%)',
            border: isNz ? '1px solid rgba(37, 99, 235, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            boxShadow: isNz ? '0 2px 8px rgba(37, 99, 235, 0.12)' : '0 2px 8px rgba(239, 68, 68, 0.12)'
          }}>
            <CountryFlag
              code={isNz ? "NZ" : "BH"}
              name={activeCountry}
              flagEmoji={isNz ? "🇳🇿" : "🇧🇭"}
              size={32}
            />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 750, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                {activeCountry} Comprehensive Reports
              </h1>
              <span style={{
                fontSize: '11.5px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '3px 8px',
                borderRadius: '6px',
                background: isNz ? 'rgba(37, 99, 235, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                color: isNz ? '#2563eb' : '#dc2626',
                border: isNz ? '1px solid rgba(37, 99, 235, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
              }}>
                {activeCountry}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '13.5px', color: 'var(--text-secondary)' }}>
              Execution performance, auditor delegated workload, and completion tracking for <strong>{currentPeriodLabel}</strong>.
            </p>
          </div>
        </div>

        {/* Top Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={fetchData}
            disabled={refreshing}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '9px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600
            }}
            title="Refresh Data"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            onClick={openPrintModal}
            className="btn btn-secondary no-print"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '9px 15px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 650,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
            title="Print Official Report"
          >
            <Printer size={16} color="var(--accent, #2563eb)" />
            <span>Print Report</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="btn btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 16px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 650,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              border: 'none',
              boxShadow: '0 3px 12px rgba(16, 185, 129, 0.25)'
            }}
            title="Export to Excel (.xlsx)"
          >
            <FileSpreadsheet size={16} />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* ─── Timeframe Engine (Monthly / Yearly / Date Range) ─── */}
      <div className="card glass" style={{
        padding: '20px 24px',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        background: 'var(--bg-secondary)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          
          {/* Timeframe Mode Switcher */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-tertiary)',
            padding: '4px',
            borderRadius: '10px',
            border: '1px solid var(--border)'
          }}>
            <button
              onClick={() => setTimeframeMode('monthly')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 650,
                background: timeframeMode === 'monthly' ? 'var(--bg-secondary)' : 'transparent',
                color: timeframeMode === 'monthly' ? 'var(--accent, #2563eb)' : 'var(--text-secondary)',
                boxShadow: timeframeMode === 'monthly' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <CalendarDays size={15} />
              <span>Monthly</span>
            </button>

            <button
              onClick={() => setTimeframeMode('yearly')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 650,
                background: timeframeMode === 'yearly' ? 'var(--bg-secondary)' : 'transparent',
                color: timeframeMode === 'yearly' ? 'var(--accent, #2563eb)' : 'var(--text-secondary)',
                boxShadow: timeframeMode === 'yearly' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Calendar size={15} />
              <span>Yearly</span>
            </button>

            <button
              onClick={() => setTimeframeMode('range')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 650,
                background: timeframeMode === 'range' ? 'var(--bg-secondary)' : 'transparent',
                color: timeframeMode === 'range' ? 'var(--accent, #2563eb)' : 'var(--text-secondary)',
                boxShadow: timeframeMode === 'range' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <CalendarRange size={15} />
              <span>Date Range</span>
            </button>
          </div>

          {/* Filter Basis Selection (Default: All Tasks) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Filter Basis:
            </span>
            <select
              value={dateBasis}
              onChange={e => setDateBasis(e.target.value as any)}
              className="input"
              style={{ height: '34px', fontSize: '12.5px', padding: '4px 10px', borderRadius: '8px' }}
            >
              <option value="all">All Tasks</option>
              <option value="deadline">Due Date / Deadline Only</option>
              <option value="created_at">Creation Date Only</option>
            </select>
          </div>
        </div>

        {/* ── Timeframe Mode Controls ── */}
        {timeframeMode === 'monthly' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Year Select */}
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="input"
                  style={{ fontWeight: 700, fontSize: '14px', height: '36px', padding: '4px 10px', borderRadius: '8px' }}
                >
                  {[2024, 2025, 2026, 2027, 2028].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>

                {/* Prev / Next Month */}
                <button
                  onClick={handlePrevMonth}
                  className="btn btn-secondary"
                  style={{ padding: '7px 10px', borderRadius: '8px' }}
                  title="Previous Month"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={handleNextMonth}
                  className="btn btn-secondary"
                  style={{ padding: '7px 10px', borderRadius: '8px' }}
                  title="Next Month"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={handleCurrentMonth}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '12.5px', borderRadius: '8px', fontWeight: 600 }}
                >
                  Current Month
                </button>
              </div>

              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Active: <span style={{ color: 'var(--accent, #2563eb)' }}>{MONTH_NAMES[selectedMonth]} {selectedYear}</span>
              </div>
            </div>

            {/* 12-Month Quick Selector Bar */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
              gap: '6px',
              overflowX: 'auto',
              paddingBottom: '4px'
            }}>
              {MONTH_NAMES.map((mName, mIdx) => {
                const isSelected = selectedMonth === mIdx;
                const count = monthTaskCounts[mIdx] || 0;
                return (
                  <button
                    key={mName}
                    onClick={() => setSelectedMonth(mIdx)}
                    style={{
                      padding: '8px 4px',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid var(--accent, #2563eb)' : '1px solid var(--border)',
                      background: isSelected ? 'var(--accent, #2563eb)' : 'var(--bg-tertiary)',
                      color: isSelected ? '#ffffff' : 'var(--text-primary)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span style={{ fontSize: '11.5px', fontWeight: 700 }}>{mName.slice(0, 3)}</span>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 650,
                      padding: '1px 6px',
                      borderRadius: '10px',
                      background: isSelected ? 'rgba(255, 255, 255, 0.25)' : 'var(--bg-secondary)',
                      color: isSelected ? '#ffffff' : 'var(--text-secondary)'
                    }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {timeframeMode === 'yearly' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 650, color: 'var(--text-secondary)' }}>Select Year:</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[2024, 2025, 2026, 2027].map(yr => (
                  <button
                    key={yr}
                    onClick={() => setSelectedYear(yr)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: selectedYear === yr ? '2px solid var(--accent, #2563eb)' : '1px solid var(--border)',
                      background: selectedYear === yr ? 'var(--accent, #2563eb)' : 'var(--bg-tertiary)',
                      color: selectedYear === yr ? '#ffffff' : 'var(--text-primary)',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    {yr}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>
              Viewing full annual aggregate report for <strong>{selectedYear}</strong>
            </div>
          </div>
        )}

        {timeframeMode === 'range' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>From:</span>
                <input
                  type="date"
                  value={rangeStartDate}
                  onChange={e => setRangeStartDate(e.target.value)}
                  className="input"
                  style={{ height: '36px', fontSize: '13px', padding: '4px 10px', borderRadius: '8px' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>To:</span>
                <input
                  type="date"
                  value={rangeEndDate}
                  onChange={e => setRangeEndDate(e.target.value)}
                  className="input"
                  style={{ height: '36px', fontSize: '13px', padding: '4px 10px', borderRadius: '8px' }}
                />
              </div>

              {/* Quick Presets */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginLeft: 'auto' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Presets:</span>
                <button onClick={() => applyDatePreset('thisMonth')} className="btn btn-secondary" style={{ fontSize: '11.5px', padding: '4px 8px', borderRadius: '6px' }}>This Month</button>
                <button onClick={() => applyDatePreset('lastMonth')} className="btn btn-secondary" style={{ fontSize: '11.5px', padding: '4px 8px', borderRadius: '6px' }}>Last Month</button>
                <button onClick={() => applyDatePreset('thisQuarter')} className="btn btn-secondary" style={{ fontSize: '11.5px', padding: '4px 8px', borderRadius: '6px' }}>This Quarter</button>
                <button onClick={() => applyDatePreset('last30Days')} className="btn btn-secondary" style={{ fontSize: '11.5px', padding: '4px 8px', borderRadius: '6px' }}>Last 30 Days</button>
                <button onClick={() => applyDatePreset('ytd')} className="btn btn-secondary" style={{ fontSize: '11.5px', padding: '4px 8px', borderRadius: '6px' }}>YTD</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Executive Metrics Row ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '14px'
      }}>
        {/* Card 1: Total Tasks */}
        <div className="card glass" style={{
          padding: '20px 22px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(37, 99, 235, 0.05) 100%)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--card-shadow)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 650, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Tasks
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(37, 99, 235, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers size={18} color="var(--accent, #2563eb)" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '34px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {metrics.total}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              in scope
            </span>
          </div>
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Scheduled during {currentPeriodLabel}
          </div>
        </div>

        {/* Card 2: Completed Tasks */}
        <div
          className="card glass"
          onClick={() => setFilterStatus(prev => prev === 'completed' ? 'all' : 'completed')}
          style={{
            padding: '20px 22px',
            borderRadius: '16px',
            background: filterStatus === 'completed'
              ? 'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(16, 185, 129, 0.14) 100%)'
              : 'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(16, 185, 129, 0.05) 100%)',
            border: filterStatus === 'completed' ? '2px solid #10b981' : '1px solid rgba(16, 185, 129, 0.25)',
            boxShadow: 'var(--card-shadow)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          title="Click to filter completed tasks"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 650, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Completed Tasks
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={18} color="#10b981" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '34px', fontWeight: 800, color: '#10b981', lineHeight: 1 }}>
              {metrics.completed}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#059669' }}>
              ({metrics.completionRate}%)
            </span>
          </div>
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Sorted first in table below
          </div>
        </div>

        {/* Card 3: In Progress Tasks */}
        <div
          className="card glass"
          onClick={() => setFilterStatus(prev => prev === 'pending' ? 'all' : 'pending')}
          style={{
            padding: '20px 22px',
            borderRadius: '16px',
            background: filterStatus === 'pending'
              ? 'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(245, 158, 11, 0.14) 100%)'
              : 'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(245, 158, 11, 0.05) 100%)',
            border: filterStatus === 'pending' ? '2px solid #f59e0b' : '1px solid rgba(245, 158, 11, 0.25)',
            boxShadow: 'var(--card-shadow)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          title="Click to filter in-progress tasks"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 650, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              In Progress / Pending
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={18} color="#f59e0b" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '34px', fontWeight: 800, color: '#f59e0b', lineHeight: 1 }}>
              {metrics.pending}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              active
            </span>
          </div>
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Requires team completion
          </div>
        </div>

        {/* Card 4: Active Auditors (Work Delegators) */}
        <div
          className="card glass"
          onClick={() => setActiveTab('auditor-breakdown')}
          style={{
            padding: '20px 22px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(139, 92, 246, 0.05) 100%)',
            border: '1px solid rgba(139, 92, 246, 0.25)',
            boxShadow: 'var(--card-shadow)',
            cursor: 'pointer'
          }}
          title="Click to view auditor breakdown"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 650, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active Auditors
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={18} color="#8b5cf6" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '34px', fontWeight: 800, color: '#8b5cf6', lineHeight: 1 }}>
              {metrics.activeAuditorsCount}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              firms
            </span>
          </div>
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Delegating tasks to our team
          </div>
        </div>

        {/* Card 5: Active Partners */}
        <div
          className="card glass"
          onClick={() => setActiveTab('partner-breakdown')}
          style={{
            padding: '20px 22px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(14, 165, 233, 0.05) 100%)',
            border: '1px solid rgba(14, 165, 233, 0.25)',
            boxShadow: 'var(--card-shadow)',
            cursor: 'pointer'
          }}
          title="Click to view partner breakdown"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 650, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active Partners
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(14, 165, 233, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={18} color="#0ea5e9" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '34px', fontWeight: 800, color: '#0ea5e9', lineHeight: 1 }}>
              {metrics.activePartnersCount}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              members
            </span>
          </div>
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Executing delegated work
          </div>
        </div>
      </div>

      {/* ─── Breakdown Tabs Navigation ─── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        borderBottom: '1px solid var(--border)',
        paddingBottom: '4px'
      }}>
        <button
          onClick={() => setActiveTab('tasks')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 18px',
            borderRadius: '10px 10px 0 0',
            border: 'none',
            fontSize: '13.5px',
            fontWeight: 700,
            background: activeTab === 'tasks' ? 'var(--bg-secondary)' : 'transparent',
            color: activeTab === 'tasks' ? 'var(--accent, #2563eb)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'tasks' ? '2px solid var(--accent, #2563eb)' : '2px solid transparent',
            cursor: 'pointer'
          }}
        >
          <CheckCheck size={16} />
          <span>Detailed Task Report ({sortedTasks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('auditor-breakdown')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 18px',
            borderRadius: '10px 10px 0 0',
            border: 'none',
            fontSize: '13.5px',
            fontWeight: 700,
            background: activeTab === 'auditor-breakdown' ? 'var(--bg-secondary)' : 'transparent',
            color: activeTab === 'auditor-breakdown' ? '#8b5cf6' : 'var(--text-secondary)',
            borderBottom: activeTab === 'auditor-breakdown' ? '2px solid #8b5cf6' : '2px solid transparent',
            cursor: 'pointer'
          }}
        >
          <ShieldCheck size={16} />
          <span>Auditor Delegated Workload ({auditorBreakdown.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('partner-breakdown')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 18px',
            borderRadius: '10px 10px 0 0',
            border: 'none',
            fontSize: '13.5px',
            fontWeight: 700,
            background: activeTab === 'partner-breakdown' ? 'var(--bg-secondary)' : 'transparent',
            color: activeTab === 'partner-breakdown' ? '#0ea5e9' : 'var(--text-secondary)',
            borderBottom: activeTab === 'partner-breakdown' ? '2px solid #0ea5e9' : '2px solid transparent',
            cursor: 'pointer'
          }}
        >
          <Users size={16} />
          <span>Partner Team Workload ({partnerBreakdown.length})</span>
        </button>
      </div>

      {/* ─── TAB 2: AUDITOR WORKLOAD BREAKDOWN ─── */}
      {activeTab === 'auditor-breakdown' && (
        <div className="card glass animate-fadeIn" style={{
          padding: '24px',
          borderRadius: '18px',
          border: '1px solid var(--border)',
          background: 'var(--bg-secondary)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 750, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={20} color="#8b5cf6" />
                Auditor Delegated Work Breakdown ({currentPeriodLabel})
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Auditors assign tasks to our firm. Click any auditor card to filter and inspect their specific tasks.
              </p>
            </div>

            {filterAuditor !== 'all' && (
              <button
                onClick={() => setFilterAuditor('all')}
                className="btn btn-secondary"
                style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <X size={13} /> Reset Auditor Filter
              </button>
            )}
          </div>

          {auditorBreakdown.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)', fontSize: '14px' }}>
              No tasks delegated by auditors in this timeframe.
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '14px'
            }}>
              {auditorBreakdown.map(aud => {
                const isSelected = filterAuditor === aud.auditorId;
                return (
                  <div
                    key={aud.auditorId}
                    onClick={() => {
                      setFilterAuditor(prev => prev === aud.auditorId ? 'all' : aud.auditorId);
                      setActiveTab('tasks');
                    }}
                    style={{
                      padding: '18px 20px',
                      borderRadius: '14px',
                      background: isSelected ? 'rgba(139, 92, 246, 0.12)' : 'var(--bg-tertiary)',
                      border: isSelected ? '2px solid #8b5cf6' : '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '10px',
                          background: 'rgba(139, 92, 246, 0.15)',
                          color: '#8b5cf6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '15px'
                        }}>
                          🏛️
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                            {aud.name}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                            {aud.auditorId === 'direct' ? 'Direct Client Work' : 'External Audit Partner'}
                          </div>
                        </div>
                      </div>

                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: 'rgba(139, 92, 246, 0.15)',
                        color: '#7c3aed'
                      }}>
                        {aud.completionRate} Done
                      </span>
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '8px',
                      background: 'var(--bg-secondary)',
                      padding: '10px',
                      borderRadius: '10px',
                      border: '1px solid var(--border-light)',
                      textAlign: 'center'
                    }}>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Delegated</div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>{aud.totalTasks}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#059669' }}>Completed</div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#10b981' }}>{aud.completedTasks}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#d97706' }}>In Progress</div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#f59e0b' }}>{aud.pendingTasks}</div>
                      </div>
                    </div>

                    <div style={{ fontSize: '11.5px', color: 'var(--accent, #2563eb)', textAlign: 'right', fontWeight: 600 }}>
                      Click to view tasks →
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 3: PARTNER TEAM WORKLOAD BREAKDOWN ─── */}
      {activeTab === 'partner-breakdown' && (
        <div className="card glass animate-fadeIn" style={{
          padding: '24px',
          borderRadius: '18px',
          border: '1px solid var(--border)',
          background: 'var(--bg-secondary)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 750, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={20} color="#0ea5e9" />
                Partner Team Workload & Execution ({currentPeriodLabel})
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Shows which partners are executing delegated tasks. Click any partner to filter their tasks.
              </p>
            </div>

            {filterPartner !== 'all' && (
              <button
                onClick={() => setFilterPartner('all')}
                className="btn btn-secondary"
                style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <X size={13} /> Reset Partner Filter
              </button>
            )}
          </div>

          {partnerBreakdown.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)', fontSize: '14px' }}>
              No tasks assigned to partners in this timeframe.
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '14px'
            }}>
              {partnerBreakdown.map(p => {
                const isSelected = filterPartner === p.partnerId;
                return (
                  <div
                    key={p.partnerId}
                    onClick={() => {
                      setFilterPartner(prev => prev === p.partnerId ? 'all' : p.partnerId);
                      setActiveTab('tasks');
                    }}
                    style={{
                      padding: '18px 20px',
                      borderRadius: '14px',
                      background: isSelected ? 'rgba(14, 165, 233, 0.12)' : 'var(--bg-tertiary)',
                      border: isSelected ? '2px solid #0ea5e9' : '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '10px',
                          background: 'rgba(14, 165, 233, 0.15)',
                          color: '#0ea5e9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '14px'
                        }}>
                          {p.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                            {p.role}
                          </div>
                        </div>
                      </div>

                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: 'rgba(14, 165, 233, 0.15)',
                        color: '#0284c7'
                      }}>
                        {p.completionRate} Done
                      </span>
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '8px',
                      background: 'var(--bg-secondary)',
                      padding: '10px',
                      borderRadius: '10px',
                      border: '1px solid var(--border-light)',
                      textAlign: 'center'
                    }}>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Assigned</div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>{p.totalTasks}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#059669' }}>Completed</div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#10b981' }}>{p.completedTasks}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#d97706' }}>In Progress</div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#f59e0b' }}>{p.pendingTasks}</div>
                      </div>
                    </div>

                    <div style={{ fontSize: '11.5px', color: 'var(--accent, #2563eb)', textAlign: 'right', fontWeight: 600 }}>
                      Click to view tasks →
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 1: DETAILED TASK REPORT TABLE ─── */}
      {activeTab === 'tasks' && (
        <div className="card glass" style={{
          padding: '24px',
          borderRadius: '18px',
          border: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}>
          {/* Controls Bar: Filter by Auditor, Partner, Status, Priority + Search */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            background: 'var(--bg-tertiary)',
            padding: '14px 18px',
            borderRadius: '14px',
            border: '1px solid var(--border)'
          }}>
            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: '220px', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search company, auditor, partner, description..."
                className="input"
                style={{ paddingLeft: '36px', height: '38px', fontSize: '13px', width: '100%', borderRadius: '8px' }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              
              {/* 1. Auditor Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--text-secondary)' }}>Auditor:</span>
                <select
                  value={filterAuditor}
                  onChange={e => setFilterAuditor(e.target.value)}
                  className="input"
                  style={{
                    height: '38px',
                    fontSize: '12.5px',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    minWidth: '150px',
                    borderColor: filterAuditor !== 'all' ? '#8b5cf6' : undefined
                  }}
                >
                  <option value="all">All Auditors</option>
                  <option value="direct">Direct Clients (No Auditor)</option>
                  {auditors.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {/* 2. Partner Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--text-secondary)' }}>Partner:</span>
                <select
                  value={filterPartner}
                  onChange={e => setFilterPartner(e.target.value)}
                  className="input"
                  style={{
                    height: '38px',
                    fontSize: '12.5px',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    minWidth: '140px',
                    borderColor: filterPartner !== 'all' ? '#0ea5e9' : undefined
                  }}
                >
                  <option value="all">All Partners</option>
                  <option value="unassigned">Unassigned</option>
                  {partners.map(p => (
                    <option key={p.id} value={p.id}>{p.username} ({p.role})</option>
                  ))}
                </select>
              </div>

              {/* 3. Task Type Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--text-secondary)' }}>Type:</span>
                <select
                  value={filterTaskType}
                  onChange={e => setFilterTaskType(e.target.value)}
                  className="input"
                  style={{
                    height: '38px',
                    fontSize: '12.5px',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    minWidth: '140px',
                    borderColor: filterTaskType !== 'all' ? '#f59e0b' : undefined
                  }}
                >
                  <option value="all">All Task Types</option>
                  {taskTypes.map(tt => (
                    <option key={tt.id} value={tt.id}>{tt.name}</option>
                  ))}
                </select>
              </div>

              {/* 4. Status Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--text-secondary)' }}>Status:</span>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="input"
                  style={{
                    height: '38px',
                    fontSize: '12.5px',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    minWidth: '130px',
                    borderColor: filterStatus !== 'all' ? '#10b981' : undefined
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="completed">Completed Only</option>
                  <option value="pending">In Progress / Pending Only</option>
                  {availableStatuses.map((s, idx) => (
                    <option key={`st-${s}-${idx}`} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* 5. Priority Filter */}
              <select
                value={filterPriority}
                onChange={e => setFilterPriority(e.target.value)}
                className="input"
                style={{ height: '38px', fontSize: '12.5px', padding: '4px 10px', borderRadius: '8px', minWidth: '110px' }}
              >
                <option value="all">All Priorities</option>
                <option value="Urgent">Urgent</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>

              {/* Clear All Filters */}
              {(filterAuditor !== 'all' || filterPartner !== 'all' || filterTaskType !== 'all' || filterStatus !== 'all' || filterPriority !== 'all' || searchQuery) && (
                <button
                  onClick={() => {
                    setFilterAuditor('all');
                    setFilterPartner('all');
                    setFilterTaskType('all');
                    setFilterStatus('all');
                    setFilterPriority('all');
                    setSearchQuery('');
                  }}
                  className="btn btn-secondary"
                  style={{ height: '38px', fontSize: '12px', padding: '4px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  <X size={14} /> Clear All
                </button>
              )}
            </div>
          </div>

          {/* Sorting Indicator Banner */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12.5px',
            color: 'var(--text-secondary)',
            padding: '4px 6px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ArrowUpDown size={14} color="var(--accent, #2563eb)" />
              <span>
                Sorted by: <strong style={{ color: '#059669' }}>Completed Tasks First</strong> (most recently completed), then <strong style={{ color: '#d97706' }}>In Progress</strong>.
              </span>
            </div>
            <div>
              Showing <strong>{sortedTasks.length}</strong> tasks
            </div>
          </div>

          {/* The Task Table */}
          {sortedTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-tertiary)' }}>
              <AlertCircle size={36} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
              <div style={{ fontSize: '16px', fontWeight: 650, color: 'var(--text-primary)' }}>No tasks match your filters</div>
              <div style={{ fontSize: '13px', marginTop: '4px' }}>
                Try adjusting the auditor, partner, status filters or date range for {currentPeriodLabel}.
              </div>
            </div>
          ) : (
            <div className="table-container" style={{ width: '100%', overflowX: 'hidden', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
              <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 12px', fontWeight: 750, color: 'var(--text-secondary)', width: '15%' }}>Company</th>
                    <th style={{ padding: '10px 10px', fontWeight: 750, color: 'var(--text-secondary)', width: '11%' }}>Task Type</th>
                    <th style={{ padding: '10px 12px', fontWeight: 750, color: 'var(--text-secondary)', width: '18%' }}>Description</th>
                    <th style={{ padding: '10px 10px', fontWeight: 750, color: '#8b5cf6', width: '12%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }} title="Auditor (Delegated By)">
                        <ShieldCheck size={13} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Auditor</span>
                      </div>
                    </th>
                    <th style={{ padding: '10px 10px', fontWeight: 750, color: '#0ea5e9', width: '13%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }} title="Assigned Partner (Executed By)">
                        <Users size={13} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Assigned Partner</span>
                      </div>
                    </th>
                    <th style={{ padding: '10px 8px', fontWeight: 750, color: 'var(--text-secondary)', width: '9%' }}>Due Date</th>
                    <th style={{ padding: '10px 10px', fontWeight: 750, color: '#059669', width: '10%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
                        <Clock size={13} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Time Taken</span>
                      </div>
                    </th>
                    <th style={{ padding: '10px 12px', fontWeight: 750, color: 'var(--text-secondary)', width: '12%', textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTasks.map(task => {
                    const company = companyMap.get(task.company_id);
                    const ttIds = task.task_type_ids?.length
                      ? task.task_type_ids
                      : (task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()) : []);
                    const ttNames = ttIds.map(id => taskTypes.find(t => t.id === id)?.name).filter(Boolean).join(', ');

                    const auditor = task.auditor_id ? auditorMap.get(task.auditor_id) : null;
                    const activePartnerIds = getActivePartnerIds(task);
                    const partnerNames = activePartnerIds
                      .map(id => partnerMap.get(id)?.username)
                      .filter(Boolean) as string[];

                    const isComp = isTaskCompleted(task.status);
                    const statusStyle = getStatusBadgeStyle(task.status);

                    return (
                      <tr
                        key={task.id}
                        style={{
                          borderBottom: '1px solid var(--border-light)',
                          background: isComp ? 'rgba(16, 185, 129, 0.02)' : 'transparent',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = isComp ? 'rgba(16, 185, 129, 0.02)' : 'transparent'; }}
                      >
                        {/* Company */}
                        <td style={{ padding: '10px 12px', fontWeight: 650, color: 'var(--text-primary)', overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                            <Building2 size={14} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={company?.company_name || 'No Company'}>
                              {company?.company_name || 'No Company'}
                            </span>
                          </div>
                        </td>

                        {/* Task Type */}
                        <td style={{ padding: '10px 10px', overflow: 'hidden' }}>
                          {ttNames ? (
                            <span
                              title={ttNames}
                              style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '2px 7px',
                                borderRadius: '5px',
                                background: 'var(--bg-tertiary)',
                                border: '1px solid var(--border)',
                                color: 'var(--text-primary)',
                                display: 'inline-block',
                                maxWidth: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {ttNames}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                          )}
                        </td>

                        {/* Description */}
                        <td style={{ padding: '10px 12px', overflow: 'hidden' }} title={task.description || undefined}>
                          <div style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: '12px',
                            color: 'var(--text-secondary)'
                          }}>
                            {task.description || <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No notes</span>}
                          </div>
                        </td>

                        {/* Auditor (Delegated By) */}
                        <td style={{ padding: '10px 10px', overflow: 'hidden' }}>
                          {auditor ? (
                            <span
                              title={`🏛️ ${auditor.name}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                fontWeight: 650,
                                padding: '2px 7px',
                                borderRadius: '5px',
                                background: 'rgba(139, 92, 246, 0.1)',
                                color: '#7c3aed',
                                border: '1px solid rgba(139, 92, 246, 0.25)',
                                maxWidth: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              🏛️ <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{auditor.name}</span>
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                              Direct Client
                            </span>
                          )}
                        </td>

                        {/* Assigned Partner(s) (Executed By) */}
                        <td style={{ padding: '10px 10px', overflow: 'hidden' }}>
                          {partnerNames.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', maxHeight: '44px', overflow: 'hidden' }}>
                              {partnerNames.map((name, i) => (
                                <span
                                  key={i}
                                  title={name}
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    padding: '2px 6px',
                                    borderRadius: '5px',
                                    background: 'rgba(14, 165, 233, 0.1)',
                                    color: '#0284c7',
                                    border: '1px solid rgba(14, 165, 233, 0.2)',
                                    maxWidth: '100%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                              Unassigned
                            </span>
                          )}
                        </td>

                        {/* Due Date */}
                        <td style={{ padding: '10px 8px', fontSize: '11.5px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {task.deadline ? formatDate(task.deadline) : '—'}
                        </td>

                        {/* Time Taken */}
                        <td style={{ padding: '10px 10px', overflow: 'hidden' }}>
                          {editingTaskId === task.id ? (
                            <div
                              style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', minWidth: 0 }}
                              onClick={e => e.stopPropagation()}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', width: '100%' }}>
                                <input
                                  type="text"
                                  value={editingTimeValue}
                                  onChange={e => setEditingTimeValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveTime(task.id);
                                    if (e.key === 'Escape') handleCancelTimeEdit();
                                  }}
                                  placeholder="e.g. 2 hrs"
                                  className="input"
                                  style={{
                                    height: '28px',
                                    fontSize: '11px',
                                    padding: '2px 6px',
                                    borderRadius: '5px',
                                    border: '1.5px solid #059669',
                                    width: '100%',
                                    minWidth: 0,
                                    background: 'var(--bg-primary)',
                                    color: 'var(--text-primary)'
                                  }}
                                  autoFocus
                                  disabled={isSavingTime}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveTime(task.id)}
                                  disabled={isSavingTime}
                                  title="Save Time Taken (Enter)"
                                  style={{
                                    height: '28px',
                                    width: '28px',
                                    borderRadius: '5px',
                                    border: 'none',
                                    background: '#059669',
                                    color: '#ffffff',
                                    cursor: isSavingTime ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                  }}
                                >
                                  {isSavingTime ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelTimeEdit}
                                  disabled={isSavingTime}
                                  title="Cancel (Esc)"
                                  style={{
                                    height: '28px',
                                    width: '28px',
                                    borderRadius: '5px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-secondary)',
                                    cursor: isSavingTime ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                  }}
                                >
                                  <X size={13} />
                                </button>
                              </div>
                              {/* Quick suggestion chips */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexWrap: 'wrap' }}>
                                {['1h', '2h', '4h', '1d', '2d'].map(preset => (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() => setEditingTimeValue(preset === '1h' ? '1 hr' : (preset === '2h' ? '2 hrs' : (preset === '4h' ? '4 hrs' : (preset === '1d' ? '1 day' : '2 days'))))}
                                    style={{
                                      fontSize: '9.5px',
                                      padding: '1px 4px',
                                      borderRadius: '3px',
                                      background: 'var(--bg-tertiary)',
                                      border: '1px solid var(--border-light)',
                                      color: 'var(--text-secondary)',
                                      cursor: 'pointer',
                                      lineHeight: 1.2
                                    }}
                                  >
                                    {preset}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : task.time_taken ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', maxWidth: '100%', minWidth: 0 }}>
                              <span
                                onClick={() => handleStartTimeEdit(task)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: '#059669',
                                  background: 'rgba(16, 185, 129, 0.08)',
                                  padding: '3px 7px',
                                  borderRadius: '5px',
                                  border: '1px solid rgba(16, 185, 129, 0.22)',
                                  cursor: 'pointer',
                                  maxWidth: 'calc(100% - 24px)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                                title={`Click to edit: ${task.time_taken}`}
                              >
                                <Clock size={11} color="#059669" style={{ flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.time_taken}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleStartTimeEdit(task)}
                                title="Edit Time Taken"
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '3px',
                                  borderRadius: '4px',
                                  color: 'var(--text-tertiary)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#059669'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                              >
                                <Edit2 size={12} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartTimeEdit(task)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                fontWeight: 600,
                                color: 'var(--text-tertiary)',
                                background: 'transparent',
                                padding: '3px 7px',
                                borderRadius: '5px',
                                border: '1px dashed var(--border)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                whiteSpace: 'nowrap'
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.color = '#059669';
                                e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                                e.currentTarget.style.background = 'rgba(16, 185, 129, 0.06)';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.color = 'var(--text-tertiary)';
                                e.currentTarget.style.borderColor = 'var(--border)';
                                e.currentTarget.style.background = 'transparent';
                              }}
                              title="Click to manually enter Time Taken"
                            >
                              <Clock size={11} />
                              <span>+ Add</span>
                            </button>
                          )}
                        </td>

                        {/* Status */}
                        <td style={{ padding: '10px 12px', textAlign: 'center', overflow: 'hidden' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 9px',
                            borderRadius: '10px',
                            background: statusStyle.bg,
                            color: statusStyle.text,
                            border: `1px solid ${statusStyle.border}`,
                            whiteSpace: 'nowrap',
                            maxWidth: '100%',
                            boxSizing: 'border-box'
                          }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: statusStyle.dot, flexShrink: 0 }} />
                            <span>{task.status || 'Pending'}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── PDF / Print Modal (Rendered via Portal to top of screen) ─── */}
      {isMounted && showPdfModal && createPortal(
        <div
          className="modal-overlay print-modal-overlay"
          onClick={() => setShowPdfModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '16px 20px 24px',
            overflowY: 'auto',
            boxSizing: 'border-box'
          }}
        >
          <div
            className="print-modal-container"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '18px',
              maxWidth: '1150px',
              width: '100%',
              marginTop: '4px',
              marginBottom: '24px',
              maxHeight: 'calc(100vh - 36px)',
              overflowY: 'auto',
              padding: '22px 26px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 25px 60px -15px rgba(0,0,0,0.3)',
              boxSizing: 'border-box'
            }}
          >
            {/* Modal Header */}
            <div className="print-hide" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 750, color: 'var(--text-primary)' }}>
                    Print Report Configuration & Preview
                  </h3>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: 'rgba(239,68,68,0.12)', color: '#dc2626' }}>
                    {activeCountry}
                  </span>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  Configure your filters below. Completed tasks appear first, remaining tasks sorted alphabetically (A-Z).
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => window.print()}
                  className="btn btn-primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 15px',
                    fontSize: '12.5px',
                    fontWeight: 650,
                    background: 'var(--accent, #2563eb)'
                  }}
                  title="Print Report now"
                >
                  <Printer size={15} />
                  <span>Print Document</span>
                </button>
                <button onClick={() => setShowPdfModal(false)} className="btn btn-secondary" style={{ padding: '7px', borderRadius: '8px' }}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Filter & Options Popup Panel */}
            <div className="print-hide" style={{
              background: 'var(--bg-tertiary)',
              padding: '16px 20px',
              borderRadius: '14px',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}>
              <div style={{ fontSize: '12.5px', fontWeight: 750, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Filter size={14} color="var(--accent)" />
                <span>Print Filter & Timeframe Options</span>
              </div>

              {/* Timeframe Type Selection */}
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-secondary)', padding: '3px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <button
                    onClick={() => setPrintTimeframeMode('monthly')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '12.5px',
                      fontWeight: 650,
                      background: printTimeframeMode === 'monthly' ? 'var(--accent, #2563eb)' : 'transparent',
                      color: printTimeframeMode === 'monthly' ? '#ffffff' : 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setPrintTimeframeMode('yearly')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '12.5px',
                      fontWeight: 650,
                      background: printTimeframeMode === 'yearly' ? 'var(--accent, #2563eb)' : 'transparent',
                      color: printTimeframeMode === 'yearly' ? '#ffffff' : 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    Yearly
                  </button>
                  <button
                    onClick={() => setPrintTimeframeMode('range')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '12.5px',
                      fontWeight: 650,
                      background: printTimeframeMode === 'range' ? 'var(--accent, #2563eb)' : 'transparent',
                      color: printTimeframeMode === 'range' ? '#ffffff' : 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    Date Range
                  </button>
                </div>

                {/* Monthly Controls */}
                {printTimeframeMode === 'monthly' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <select
                      value={printYear}
                      onChange={e => setPrintYear(Number(e.target.value))}
                      className="input"
                      style={{ height: '34px', fontSize: '12.5px', fontWeight: 650, borderRadius: '8px' }}
                    >
                      {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select
                      value={printMonth}
                      onChange={e => setPrintMonth(Number(e.target.value))}
                      className="input"
                      style={{ height: '34px', fontSize: '12.5px', fontWeight: 650, borderRadius: '8px' }}
                    >
                      {MONTH_NAMES.map((m, idx) => <option key={m} value={idx}>{m}</option>)}
                    </select>
                  </div>
                )}

                {/* Yearly Controls */}
                {printTimeframeMode === 'yearly' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <select
                      value={printYear}
                      onChange={e => setPrintYear(Number(e.target.value))}
                      className="input"
                      style={{ height: '34px', fontSize: '12.5px', fontWeight: 650, borderRadius: '8px' }}
                    >
                      {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                )}

                {/* Date Range Controls */}
                {printTimeframeMode === 'range' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>From:</span>
                    <input
                      type="date"
                      value={printRangeStart}
                      onChange={e => setPrintRangeStart(e.target.value)}
                      className="input"
                      style={{ height: '34px', fontSize: '12px', borderRadius: '8px' }}
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>To:</span>
                    <input
                      type="date"
                      value={printRangeEnd}
                      onChange={e => setPrintRangeEnd(e.target.value)}
                      className="input"
                      style={{ height: '34px', fontSize: '12px', borderRadius: '8px' }}
                    />
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginLeft: '4px' }}>
                      <button type="button" onClick={() => applyPrintDatePreset('thisMonth')} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '6px' }}>This Month</button>
                      <button type="button" onClick={() => applyPrintDatePreset('lastMonth')} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '6px' }}>Last Month</button>
                      <button type="button" onClick={() => applyPrintDatePreset('thisQuarter')} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '6px' }}>Quarter</button>
                      <button type="button" onClick={() => applyPrintDatePreset('ytd')} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '6px' }}>YTD</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Dropdown Filters: Recipient, Auditor, Partner, Task Type, Status */}
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                {/* 1. Recipient (Addressed To) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--text-secondary)' }}>Report To:</span>
                  <input
                    type="text"
                    value={printRecipient}
                    onChange={e => setPrintRecipient(e.target.value)}
                    placeholder="e.g. Finex"
                    className="input"
                    style={{ height: '34px', fontSize: '12.5px', borderRadius: '8px', minWidth: '150px', fontWeight: 600 }}
                  />
                </div>

                {/* 2. Auditor */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--text-secondary)' }}>Auditor:</span>
                  <select
                    value={printAuditor}
                    onChange={e => {
                      const val = e.target.value;
                      setPrintAuditor(val);
                      if (val !== 'all' && val !== 'direct') {
                        const aud = auditorMap.get(val);
                        if (aud?.name) setPrintRecipient(aud.name);
                      } else if (val === 'direct') {
                        setPrintRecipient('Direct Clients');
                      } else {
                        setPrintRecipient('Finex');
                      }
                    }}
                    className="input"
                    style={{ height: '34px', fontSize: '12.5px', borderRadius: '8px', minWidth: '150px' }}
                  >
                    <option value="all">All Auditors</option>
                    <option value="direct">Direct Clients (No Auditor)</option>
                    {auditors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>

                {/* 3. Partner */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--text-secondary)' }}>Partner:</span>
                  <select
                    value={printPartner}
                    onChange={e => setPrintPartner(e.target.value)}
                    className="input"
                    style={{ height: '34px', fontSize: '12.5px', borderRadius: '8px', minWidth: '140px' }}
                  >
                    <option value="all">All Partners</option>
                    <option value="unassigned">Unassigned</option>
                    {partners.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
                  </select>
                </div>

                {/* 4. Task Type */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--text-secondary)' }}>Task Type:</span>
                  <select
                    value={printTaskType}
                    onChange={e => setPrintTaskType(e.target.value)}
                    className="input"
                    style={{ height: '34px', fontSize: '12.5px', borderRadius: '8px', minWidth: '140px' }}
                  >
                    <option value="all">All Task Types</option>
                    {taskTypes.map(tt => (
                      <option key={tt.id} value={tt.id}>{tt.name}</option>
                    ))}
                  </select>
                </div>

                {/* 5. Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--text-secondary)' }}>Status:</span>
                  <select
                    value={printStatus}
                    onChange={e => setPrintStatus(e.target.value)}
                    className="input"
                    style={{ height: '34px', fontSize: '12.5px', borderRadius: '8px', minWidth: '130px' }}
                  >
                    <option value="all">All Statuses</option>
                    <option value="completed">Completed Only</option>
                    <option value="pending">In Progress / Pending Only</option>
                    {availableStatuses.map((s, idx) => (
                      <option key={`print-st-${s}-${idx}`} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginLeft: 'auto', fontSize: '12.5px', color: '#059669', fontWeight: 700 }}>
                  ✓ Matching Tasks: {printSortedTasks.length}
                </div>
              </div>

              {/* Report Columns Selection Toolbar */}
              <div style={{
                background: 'var(--bg-secondary)',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12.5px',
                      fontWeight: 750,
                      color: 'var(--text-primary)'
                    }}>
                      <SlidersHorizontal size={14} color="var(--accent, #2563eb)" />
                      <span>Report Columns to Include in PDF:</span>
                    </div>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: 'rgba(37, 99, 235, 0.1)',
                      color: 'var(--accent, #2563eb)',
                      border: '1px solid rgba(37, 99, 235, 0.2)'
                    }}>
                      {activePrintColumnCount} of {AVAILABLE_PRINT_COLUMNS.length} fields selected
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={selectAllPrintColumns}
                      className="btn btn-secondary"
                      style={{
                        padding: '4px 10px',
                        fontSize: '11.5px',
                        fontWeight: 650,
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                      title="Include all available columns in the PDF report"
                    >
                      <CheckCheck size={13} />
                      <span>Select All</span>
                    </button>
                    <button
                      type="button"
                      onClick={resetDefaultPrintColumns}
                      className="btn btn-secondary"
                      style={{
                        padding: '4px 10px',
                        fontSize: '11.5px',
                        fontWeight: 650,
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                      title="Reset to recommended default columns"
                    >
                      <RotateCcw size={13} />
                      <span>Reset Default</span>
                    </button>
                  </div>
                </div>

                {/* Column Selection Toggle Chips */}
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px 8px',
                  alignItems: 'center'
                }}>
                  {AVAILABLE_PRINT_COLUMNS.map(col => {
                    const isSelected = !!selectedPrintColumns[col.id];
                    return (
                      <button
                        key={`print-col-chip-${col.id}`}
                        type="button"
                        onClick={() => togglePrintColumn(col.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 12px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: isSelected ? 650 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          border: isSelected
                            ? '1.5px solid var(--accent, #2563eb)'
                            : '1px solid var(--border)',
                          background: isSelected
                            ? 'rgba(37, 99, 235, 0.08)'
                            : 'var(--bg-primary)',
                          color: isSelected
                            ? 'var(--accent, #2563eb)'
                            : 'var(--text-secondary)',
                          boxShadow: isSelected ? '0 1px 3px rgba(37, 99, 235, 0.12)' : 'none'
                        }}
                        title={isSelected ? `Click to exclude ${col.label} from PDF report` : `Click to include ${col.label} in PDF report`}
                      >
                        <span style={{
                          width: '14px',
                          height: '14px',
                          borderRadius: '4px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: isSelected ? 'var(--accent, #2563eb)' : 'transparent',
                          border: isSelected ? 'none' : '1.5px solid var(--border-hover, #94a3b8)',
                          color: '#ffffff',
                          flexShrink: 0
                        }}>
                          {isSelected && <Check size={10} strokeWidth={3.5} />}
                        </span>
                        <span>{col.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sorting rule notice */}
              <div style={{
                fontSize: '11.5px',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                paddingTop: '6px',
                borderTop: '1px solid var(--border-light)'
              }}>
                <ArrowUpDown size={13} color="var(--accent)" />
                <span>
                  <strong>Print Sorting Rule Applied:</strong> 1. Completed tasks appear first &bull; 2. Remaining tasks sorted alphabetically (A-Z) by Company Name.
                </span>
              </div>
            </div>

            {/* Live Generated Report Document (This content is printed) */}
            <div id="printable-report-content" style={{
              background: '#ffffff',
              color: '#0f172a',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              {/* ================= PAGE 1: EXECUTIVE REPORT OVERVIEW ================= */}
              <div className="report-overview-page print-page-1" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}>
                <div className="print-page-1-content" style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}>
                  {/* 1. Header & Metadata Section */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Page 1 Document Header */}
                  <div className="doc-header" style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    borderBottom: '2.5px solid #0f172a',
                    paddingBottom: '14px'
                  }}>
                    <div>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: '#2563eb',
                        marginBottom: '4px'
                      }}>
                        <span>The Digital Ledger</span>
                        <span>&bull;</span>
                        <span>Official Operations & Compliance Report</span>
                      </div>
                      <h1 style={{
                        margin: 0,
                        fontSize: '24px',
                        fontWeight: 900,
                        color: '#0f172a',
                        letterSpacing: '-0.02em',
                        lineHeight: 1.2
                      }}>
                        Digital Ledger Report to {printRecipient || 'Finex'}
                      </h1>
                      <div style={{ fontSize: '13.5px', fontWeight: 650, color: '#475569', marginTop: '4px' }}>
                        {activeCountry} Operations & Task Execution Overview &bull; <strong>{printPeriodLabel}</strong>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                      <span style={{
                        fontSize: '10.5px',
                        fontWeight: 800,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        padding: '4px 10px',
                        borderRadius: '5px',
                        background: '#f1f5f9',
                        color: '#1e293b',
                        border: '1.5px solid #cbd5e1'
                      }}>
                        EXECUTIVE OVERVIEW &bull; PAGE 1
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                        Generated: {formatDate(new Date())}
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        Jurisdiction: {activeCountry}
                      </span>
                    </div>
                  </div>

                  {/* Summary Scope Metadata Bar */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '12px',
                    background: '#f8fafc',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '12px 18px'
                  }}>
                    <div>
                      <div style={{ fontSize: '10.5px', fontWeight: 750, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Report Addressed To
                      </div>
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a', marginTop: '3px' }}>
                        {printRecipient || 'Finex'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10.5px', fontWeight: 750, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Auditor / Client Delegator
                      </div>
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a', marginTop: '3px' }}>
                        {printAuditor === 'all'
                          ? 'All Delegating Auditors'
                          : (printAuditor === 'direct' ? 'Direct Clients' : (auditorMap.get(printAuditor)?.name || printAuditor))}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10.5px', fontWeight: 750, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Reporting Period
                      </div>
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a', marginTop: '3px' }}>
                        {printPeriodLabel}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10.5px', fontWeight: 750, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Task Type Scope
                      </div>
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a', marginTop: '3px' }}>
                        {printTaskType === 'all'
                          ? 'All Task Types'
                          : (taskTypes.find(tt => tt.id === printTaskType)?.name || printTaskType)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Large Summary Metric KPI Cards */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: '14px',
                  margin: '4px 0 8px 0'
                }}>
                  {/* Total Tasks Card */}
                  <div style={{
                    background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                    border: '2px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '20px 14px 18px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '140px',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.04)'
                  }}>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      fontWeight: 850,
                      color: '#475569',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em'
                    }}>
                      <Layers size={14} color="#64748b" />
                      <span>Total Tasks</span>
                    </div>
                    <div style={{
                      fontSize: '46px',
                      fontWeight: 900,
                      color: '#0f172a',
                      lineHeight: 1.05,
                      letterSpacing: '-0.03em',
                      margin: '6px 0 6px 0'
                    }}>
                      {printExecutiveStats.total}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#475569',
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      padding: '3px 10px',
                      borderRadius: '12px'
                    }}>
                      In Total Scope
                    </div>
                  </div>

                  {/* Completed Card */}
                  <div style={{
                    background: 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)',
                    border: '2px solid #86efac',
                    borderRadius: '12px',
                    padding: '20px 14px 18px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '140px',
                    boxShadow: '0 2px 5px rgba(22,163,74,0.06)'
                  }}>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      fontWeight: 850,
                      color: '#15803d',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em'
                    }}>
                      <CheckCheck size={15} color="#16a34a" />
                      <span>Completed</span>
                    </div>
                    <div style={{
                      fontSize: '46px',
                      fontWeight: 900,
                      color: '#16a34a',
                      lineHeight: 1.05,
                      letterSpacing: '-0.03em',
                      margin: '6px 0 6px 0'
                    }}>
                      {printExecutiveStats.completed}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      fontWeight: 750,
                      color: '#15803d',
                      background: '#dcfce7',
                      border: '1px solid #86efac',
                      padding: '3px 10px',
                      borderRadius: '12px'
                    }}>
                      {printExecutiveStats.completionRate}% Done
                    </div>
                  </div>

                  {/* Pending / In Progress Card */}
                  <div style={{
                    background: 'linear-gradient(180deg, #ffffff 0%, #fffbeb 100%)',
                    border: '2px solid #fde68a',
                    borderRadius: '12px',
                    padding: '20px 14px 18px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '140px',
                    boxShadow: '0 2px 5px rgba(217,119,6,0.06)'
                  }}>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      fontWeight: 850,
                      color: '#b45309',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em'
                    }}>
                      <Clock size={14} color="#d97706" />
                      <span>In Progress</span>
                    </div>
                    <div style={{
                      fontSize: '46px',
                      fontWeight: 900,
                      color: '#d97706',
                      lineHeight: 1.05,
                      letterSpacing: '-0.03em',
                      margin: '6px 0 6px 0'
                    }}>
                      {printExecutiveStats.pending}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      fontWeight: 750,
                      color: '#b45309',
                      background: '#fef3c7',
                      border: '1px solid #fde68a',
                      padding: '3px 10px',
                      borderRadius: '12px'
                    }}>
                      {printExecutiveStats.pendingRate}% Remaining
                    </div>
                  </div>

                  {/* Avg Time Taken Card */}
                  <div style={{
                    background: 'linear-gradient(180deg, #ffffff 0%, #eff6ff 100%)',
                    border: '2px solid #bfdbfe',
                    borderRadius: '12px',
                    padding: '20px 10px 18px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '140px',
                    boxShadow: '0 2px 5px rgba(37,99,235,0.06)'
                  }}>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      fontWeight: 850,
                      color: '#1d4ed8',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em'
                    }}>
                      <TrendingUp size={14} color="#2563eb" />
                      <span>Avg Time Taken</span>
                    </div>
                    <div style={{
                      fontSize: printExecutiveStats.avgTimeTakenFormatted.length > 15 ? '22px' : (printExecutiveStats.avgTimeTakenFormatted.length > 10 ? '28px' : '36px'),
                      fontWeight: 900,
                      color: '#2563eb',
                      lineHeight: 1.15,
                      letterSpacing: '-0.02em',
                      margin: '6px 0 6px 0'
                    }}>
                      {printExecutiveStats.avgTimeTakenFormatted}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      fontWeight: 750,
                      color: '#1d4ed8',
                      background: '#dbeafe',
                      border: '1px solid #bfdbfe',
                      padding: '3px 10px',
                      borderRadius: '12px'
                    }}>
                      {printExecutiveStats.manualTimeCount > 0 ? `${printExecutiveStats.manualTimeCount} Logged` : 'Manual Entries'}
                    </div>
                  </div>

                  {/* Task Types Card */}
                  <div style={{
                    background: 'linear-gradient(180deg, #ffffff 0%, #faf5ff 100%)',
                    border: '2px solid #e9d5ff',
                    borderRadius: '12px',
                    padding: '20px 14px 18px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '140px',
                    boxShadow: '0 2px 5px rgba(147,51,234,0.06)'
                  }}>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      fontWeight: 850,
                      color: '#7e22ce',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em'
                    }}>
                      <Briefcase size={14} color="#9333ea" />
                      <span>Task Types</span>
                    </div>
                    <div style={{
                      fontSize: '46px',
                      fontWeight: 900,
                      color: '#9333ea',
                      lineHeight: 1.05,
                      letterSpacing: '-0.03em',
                      margin: '6px 0 6px 0'
                    }}>
                      {printTaskTypeStats.length}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      fontWeight: 750,
                      color: '#7e22ce',
                      background: '#f3e8ff',
                      border: '1px solid #e9d5ff',
                      padding: '3px 10px',
                      borderRadius: '12px'
                    }}>
                      {printTaskTypeStats.length} {printTaskTypeStats.length === 1 ? 'Category' : 'Categories'}
                    </div>
                  </div>
                </div>

                {/* 3. Task Types and Their Counts Table */}
                <div style={{
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  background: '#ffffff'
                }}>
                  <div style={{
                    background: '#0f172a',
                    color: '#ffffff',
                    padding: '9px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Task Types and Their Counts
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                      {printTaskTypeStats.length} Unique Categories
                    </div>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #cbd5e1', color: '#475569', fontSize: '11px' }}>
                        <th style={{ padding: '8px 12px', width: '32px' }}>#</th>
                        <th style={{ padding: '8px 12px' }}>Task Type</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', width: '90px' }}>Total Tasks</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', width: '90px', color: '#16a34a' }}>Completed</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', width: '100px', color: '#d97706' }}>In Progress</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right', width: '140px' }}>Completion Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printTaskTypeStats.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                            No tasks found matching current filters.
                          </td>
                        </tr>
                      ) : (
                        printTaskTypeStats.map((stat, idx) => {
                          const rate = stat.total > 0 ? (stat.completed / stat.total) * 100 : 0;
                          return (
                            <tr key={stat.id + idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 1 ? '#f8fafc' : '#ffffff' }}>
                              <td style={{ padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                              <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>{stat.name}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800 }}>{stat.total}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 750, color: '#16a34a' }}>{stat.completed}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 750, color: '#d97706' }}>{stat.pending}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                  <span style={{ fontWeight: 800, color: rate === 100 ? '#16a34a' : (rate > 50 ? '#2563eb' : '#d97706') }}>
                                    {rate.toFixed(1)}%
                                  </span>
                                  <div style={{ width: '55px', height: '6px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ width: `${rate}%`, height: '100%', background: rate === 100 ? '#16a34a' : (rate > 50 ? '#2563eb' : '#d97706') }} />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {printTaskTypeStats.length > 0 && (
                      <tfoot>
                        <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 850 }}>
                          <td style={{ padding: '8px 12px' }} colSpan={2}>Total Overall</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>{printExecutiveStats.total}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', color: '#16a34a' }}>{printExecutiveStats.completed}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', color: '#d97706' }}>{printExecutiveStats.pending}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#2563eb' }}>{printExecutiveStats.completionRate}%</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {/* 4. Priority Breakdown & Operational Scope */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1.25fr 1fr',
                  gap: '12px'
                }}>
                  {/* Priority Box */}
                  <div style={{
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    background: '#ffffff'
                  }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                      Priority Breakdown & Distribution
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {['Urgent', 'High', 'Medium', 'Low'].map(p => {
                        const count = printSortedTasks.filter(t => (t.priority || 'Medium').toLowerCase() === p.toLowerCase()).length;
                        const badge = getPriorityBadge(p);
                        return (
                          <div key={p} style={{
                            flex: 1,
                            padding: '8px 6px',
                            borderRadius: '8px',
                            background: badge.bg,
                            border: `1px solid ${badge.text}33`,
                            textAlign: 'center'
                          }}>
                            <div style={{ fontSize: '10.5px', fontWeight: 750, color: badge.text }}>{p}</div>
                            <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', marginTop: '2px' }}>{count}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Operational Highlights */}
                  <div style={{
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    background: '#ffffff'
                  }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                      Operational Scope & Highlights
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#334155', lineHeight: '1.6' }}>
                      <div>&bull; Delegating Firm: <strong>{printAuditor === 'all' ? 'Multiple / All Auditors' : (printAuditor === 'direct' ? 'Direct Clients' : (auditorMap.get(printAuditor)?.name || printAuditor))}</strong></div>
                      <div>&bull; Team Assignees: <strong>{printExecutiveStats.activePartnersCount} Partners active</strong></div>
                      <div>&bull; Filtered Status: <strong>{printStatus === 'all' ? 'All Task Statuses' : printStatus}</strong></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

              {/* Visual On-Screen Divider between Page 1 and Page 2 in preview */}
              <div className="print-hide" style={{
                margin: '18px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: 'var(--text-tertiary)',
                fontSize: '12px',
                fontWeight: 700
              }}>
                <div style={{ flex: 1, height: '2px', background: 'var(--border)' }} />
                <span style={{ padding: '4px 12px', borderRadius: '12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
                  📄 Page 2 Onward: Detailed Task Report
                </span>
                <div style={{ flex: 1, height: '2px', background: 'var(--border)' }} />
              </div>

              {/* ================= PAGE 2+: DETAILED TASK REPORT ================= */}
              <div className="report-details-page print-page-2-plus" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                {/* Page 2 Running Header */}
                <div className="doc-header" style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  borderBottom: '2px solid #0f172a',
                  paddingBottom: '10px'
                }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#2563eb' }}>
                      The Digital Ledger &bull; Detailed Task Execution Ledger
                    </div>
                    <h2 style={{ margin: '2px 0 0', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                      Task Details & Timelines &bull; {printRecipient || 'Finex'}
                    </h2>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      Reporting Period: {printPeriodLabel} &bull; Scope: {printSortedTasks.length} Tasks &bull; Completed Tasks First, then Alphabetical (A-Z)
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '10.5px', color: '#64748b' }}>
                    <div>Report Generated: {formatDate(new Date())}</div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>Page 2 Onward</div>
                  </div>
                </div>

                {/* Printable Tasks Table with Time Taken Column */}
                {printSortedTasks.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontSize: '13px' }}>
                    No tasks matched the selected criteria for this report.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left', tableLayout: 'fixed' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', borderBottom: '1.5px solid #cbd5e1' }}>
                        <th style={{ padding: '6px 7px', width: '3%' }}>#</th>
                        {selectedPrintColumns.company && (
                          <th style={{ padding: '6px 7px', width: printColumnWidths.company }}>Company Name</th>
                        )}
                        {selectedPrintColumns.taskType && (
                          <th style={{ padding: '6px 7px', width: printColumnWidths.taskType }}>Task Type</th>
                        )}
                        {selectedPrintColumns.description && (
                          <th style={{ padding: '6px 7px', width: printColumnWidths.description }}>Description</th>
                        )}
                        {selectedPrintColumns.dueDate && (
                          <th style={{ padding: '6px 7px', width: printColumnWidths.dueDate }}>Due Date</th>
                        )}
                        {selectedPrintColumns.auditor && (
                          <th style={{ padding: '6px 7px', width: printColumnWidths.auditor }}>Auditor (Delegated By)</th>
                        )}
                        {selectedPrintColumns.partner && (
                          <th style={{ padding: '6px 7px', width: printColumnWidths.partner }}>Assigned Partner(s)</th>
                        )}
                        {selectedPrintColumns.status && (
                          <th style={{ padding: '6px 7px', width: printColumnWidths.status, textAlign: 'center' }}>Status</th>
                        )}
                        {selectedPrintColumns.timeTaken && (
                          <th style={{ padding: '6px 7px', width: printColumnWidths.timeTaken }}>Time Taken</th>
                        )}
                        {selectedPrintColumns.priority && (
                          <th style={{ padding: '6px 7px', width: printColumnWidths.priority, textAlign: 'center' }}>Priority</th>
                        )}
                        {selectedPrintColumns.createdDate && (
                          <th style={{ padding: '6px 7px', width: printColumnWidths.createdDate }}>Created Date</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {printSortedTasks.map((task, idx) => {
                        const comp = companyMap.get(task.company_id);
                        const ttIds = task.task_type_ids?.length ? task.task_type_ids : (task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()) : []);
                        const ttNames = ttIds.map(id => taskTypes.find(t => t.id === id)?.name).filter(Boolean).join(', ');
                        const aud = task.auditor_id ? auditorMap.get(task.auditor_id) : null;
                        const pIds = getActivePartnerIds(task);
                        const pNames = pIds.map(id => partnerMap.get(id)?.username).filter(Boolean).join(', ');
                        const isComp = isTaskCompleted(task.status);

                        return (
                          <tr key={task.id} style={{ borderBottom: '1px solid #e2e8f0', background: isComp ? '#f0fdf4' : (idx % 2 === 1 ? '#f8fafc' : '#ffffff') }}>
                            <td style={{ padding: '5px 7px', color: '#64748b' }}>{idx + 1}</td>
                            
                            {selectedPrintColumns.company && (
                              <td style={{ padding: '5px 7px', fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {comp?.company_name || 'No Company'}
                              </td>
                            )}

                            {selectedPrintColumns.taskType && (
                              <td style={{ padding: '5px 7px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {ttNames || '—'}
                              </td>
                            )}

                            {selectedPrintColumns.description && (
                              <td style={{ padding: '5px 7px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                {task.description || '—'}
                              </td>
                            )}

                            {selectedPrintColumns.dueDate && (
                              <td style={{ padding: '5px 7px', whiteSpace: 'nowrap' }}>
                                {task.deadline ? formatDate(task.deadline) : '—'}
                              </td>
                            )}

                            {selectedPrintColumns.auditor && (
                              <td style={{ padding: '5px 7px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {aud ? aud.name : 'Direct Client'}
                              </td>
                            )}

                            {selectedPrintColumns.partner && (
                              <td style={{ padding: '5px 7px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {pNames || 'Unassigned'}
                              </td>
                            )}

                            {selectedPrintColumns.status && (
                              <td style={{ padding: '5px 7px', textAlign: 'center' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  background: isComp ? '#dcfce7' : '#e0e7ff',
                                  color: isComp ? '#15803d' : '#3730a3',
                                  border: `1px solid ${isComp ? '#bbf7d0' : '#c7d2fe'}`,
                                  whiteSpace: 'nowrap'
                                }}>
                                  {task.status || 'Pending'}
                                </span>
                              </td>
                            )}

                            {selectedPrintColumns.timeTaken && (
                              <td style={{ padding: '5px 7px', fontSize: '10.5px', whiteSpace: 'nowrap' }}>
                                {task.time_taken ? (
                                  <span style={{ fontWeight: 700, color: '#059669' }}>
                                    {task.time_taken}
                                  </span>
                                ) : (
                                  <span style={{ color: '#94a3b8' }}>—</span>
                                )}
                              </td>
                            )}

                            {selectedPrintColumns.priority && (
                              <td style={{ padding: '5px 7px', textAlign: 'center' }}>
                                {(() => {
                                  const p = task.priority || 'Medium';
                                  const badge = getPriorityBadge(p);
                                  return (
                                    <span style={{
                                      display: 'inline-block',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      background: badge.bg,
                                      color: badge.text,
                                      border: `1px solid ${badge.text}33`,
                                      whiteSpace: 'nowrap'
                                    }}>
                                      {p}
                                    </span>
                                  );
                                })()}
                              </td>
                            )}

                            {selectedPrintColumns.createdDate && (
                              <td style={{ padding: '5px 7px', fontSize: '10.5px', color: '#475569', whiteSpace: 'nowrap' }}>
                                {task.created_at ? formatDate(task.created_at) : '—'}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {/* Document Footer */}
                <div className="doc-footer" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: '8px', fontSize: '10px', color: '#64748b' }}>
                  <div>The Digital Ledger &bull; {activeCountry} Operational Reports &bull; Report to {printRecipient || 'Finex'}</div>
                  <div>Confidential Business Document</div>
                  <div>Generated: {formatDate(new Date())}</div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="print-hide" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
              <button onClick={() => setShowPdfModal(false)} className="btn btn-secondary" style={{ padding: '9px 18px', fontSize: '13px' }}>
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="btn btn-primary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 20px',
                  fontSize: '13.5px',
                  fontWeight: 650,
                  background: 'var(--accent, #2563eb)'
                }}
              >
                <Printer size={16} />
                <span>Print Document</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ─── Global Print Stylesheet ─── */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @media screen {
          .report-overview-page {
            min-height: 880px;
          }
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 12mm 8mm 12mm;
          }

          /* Hide entire main document tree so it consumes 0 height and 0 pages */
          body > *:not(.print-modal-overlay) {
            display: none !important;
            height: 0 !important;
            max-height: 0 !important;
            overflow: hidden !important;
          }

          html,
          body {
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
            color: #0f172a !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Modal overlay container becomes a neutral in-flow print container */
          .print-modal-overlay {
            position: static !important;
            display: block !important;
            inset: auto !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            backdrop-filter: none !important;
            overflow: visible !important;
          }

          .print-modal-container {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
            overflow: visible !important;
          }

          /* Hide interactive/non-print modal elements */
          .print-hide,
          .no-print,
          aside,
          nav,
          header {
            display: none !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Document to print */
          #printable-report-content {
            display: block !important;
            position: static !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
            box-shadow: none !important;
          }

          /* Page 1: Overview Page */
          .print-page-1 {
            display: block !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin: 0 !important;
          }

          .print-page-1-content {
            display: flex !important;
            flex-direction: column !important;
            gap: 16px !important;
          }

          /* Page 2 Onward: Detailed Task Report */
          .print-page-2-plus {
            display: block !important;
            page-break-before: always !important;
            break-before: page !important;
            padding-top: 2mm !important;
          }

          .print-page-2-plus .doc-header {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-bottom: 10px !important;
          }

          .print-page-2-plus table {
            width: 100% !important;
            border-collapse: collapse !important;
            table-layout: fixed !important;
            page-break-inside: auto !important;
            margin-bottom: 12px !important;
          }

          .print-page-2-plus th,
          .print-page-2-plus td {
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
          }

          .print-page-2-plus thead {
            display: table-header-group !important;
          }

          .print-page-2-plus tbody {
            display: table-row-group !important;
          }

          .print-page-2-plus tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .doc-footer {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-top: 8px !important;
          }
        }
      `}} />

      {/* ─── Time Taken Feedback Toast ─── */}
      {timeToast && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 9999,
          background: timeToast.type === 'error'
            ? 'linear-gradient(135deg, #7f1d1d, #991b1b)'
            : (timeToast.type === 'warning' ? 'linear-gradient(135deg, #78350f, #92400e)' : 'linear-gradient(135deg, #0f172a, #1e293b)'),
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '14px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '13.5px',
          fontWeight: 600,
          animation: 'fadeIn 0.2s ease-out',
        }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: timeToast.type === 'error' ? '#ef4444' : (timeToast.type === 'warning' ? '#f59e0b' : '#10b981'),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            {timeToast.type === 'error' ? <AlertCircle size={14} color="#ffffff" /> : (timeToast.type === 'warning' ? <AlertCircle size={14} color="#ffffff" /> : <Check size={14} color="#ffffff" />)}
          </div>
          <span>{timeToast.message}</span>
        </div>
      )}

    </div>
  );
}
