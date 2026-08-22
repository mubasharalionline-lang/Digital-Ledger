'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Task, Company, User, TaskType, StatusLog } from '@/lib/supabase';
import { getDataCountry, getSession, isAdmin } from '@/lib/auth';
import { BAHRAIN_PRIORITIES, BAHRAIN_STATUSES } from '@/lib/bahrain';
import {
  getTaskColumns,
  saveTaskColumns,
  normalizeCountryKey,
  TaskColumnConfig,
  TaskColumnId
} from '@/lib/taskColumns';
import {
  Plus, Eye, Trash2, X, Edit2, MoreHorizontal, Clock, CheckCircle2, Check,
  BarChart3, PieChart, Activity, ArrowRight, TrendingUp, Building2, Share2,
  MessageSquare, Copy, Send, Search, ListTodo, FileSpreadsheet, CheckSquare,
  Square, Download, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Link2,
  SlidersHorizontal, Columns3, RotateCcw, XCircle, Sparkles, Filter, FileCheck2, FileX2, CheckCheck,
  Calendar, FolderOpen, Globe
} from 'lucide-react';
import { EGRESS_OPTIMIZATION_MODE } from '@/lib/optimizationConfig';
import { exportTaskManagementExcel, formatPlDateDisplay } from '@/lib/reportExportUtils';
import CountryFlag from '@/components/CountryFlag';

function GoogleDriveIcon({ size = 14, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 87.3 78"
      style={{ display: 'block', flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}

export default function BahrainTasks() {
  const { user: currentUser } = getSession();
  const isAdminUser = isAdmin(currentUser);
  const userAuditorAccess: string[] = currentUser?.permissions?.auditor_access || [];
  const isTaskAllowed = (t: Task) => {
    if (isAdminUser) return true;
    const activePartnerIds = t.assigned_partners && t.assigned_partners.length > 0
      ? t.assigned_partners
      : (t.assigned_to ? [t.assigned_to] : []);
    const isAssigned = activePartnerIds.includes(currentUser?.id || '');
    const hasAuditorAccess = t.auditor_id ? userAuditorAccess.includes(t.auditor_id) : false;
    if (userAuditorAccess.length > 0) {
      return hasAuditorAccess;
    }
    return isAssigned && !t.auditor_id;
  };
  const canManageTask = (task: Task) => isAdminUser || userAuditorAccess.includes(task.auditor_id || '');
  const canUpdateStatus = isAdminUser || userAuditorAccess.length > 0 || (currentUser?.permissions?.can_update_status ?? true);

  const dataCountry = getDataCountry();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [partners, setPartners] = useState<User[]>([]);
  const [auditors, setAuditors] = useState<any[]>([]);
  const [dynamicStatuses, setDynamicStatuses] = useState<string[]>(BAHRAIN_STATUSES);
  const [statusObjects, setStatusObjects] = useState<{ name: string; task_type_ids: string[] | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<{ id: string, message: string, taskId: string }[]>([]);

  // Country-specific Column Preferences
  const [columnsConfig, setColumnsConfig] = useState<TaskColumnConfig[]>(() => getTaskColumns(dataCountry));
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const columnPickerRef = useRef<HTMLDivElement>(null);

  // Task Pagination States (Default: 50 rows per page)
  const [pageSize, setPageSize] = useState<number | 'all'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dl_tasks_page_size');
      if (saved === 'all') return 'all';
      if (saved && ['25', '50', '100'].includes(saved)) return parseInt(saved, 10);
    }
    return 50;
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.classList.contains('dark');
    }
    return false;
  });

  useEffect(() => {
    const checkTheme = () => {
      const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.classList.contains('dark');
      setIsDark(isDarkTheme);
    };
    checkTheme();
    window.addEventListener('app-theme-changed', checkTheme);
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => {
      window.removeEventListener('app-theme-changed', checkTheme);
      observer.disconnect();
    };
  }, []);

  const searchParams = useSearchParams();

  // Filters
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '');
  const [filterPriority, setFilterPriority] = useState(searchParams.get('priority') || '');
  const [filterCompany, setFilterCompany] = useState(searchParams.get('company') || '');
  const [filterPartner, setFilterPartner] = useState(searchParams.get('partner') || '');
  const [filterAuditor, setFilterAuditor] = useState(searchParams.get('auditor') || '');
  const [filterTaskType, setFilterTaskType] = useState(searchParams.get('taskType') || '');
  const [filterDescUpdated, setFilterDescUpdated] = useState(searchParams.get('descUpdated') || '');
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [descUpdateMap, setDescUpdateMap] = useState<Record<string, string>>({});

  const formatDescDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  // Sync column configurations across components & country switches
  useEffect(() => {
    setColumnsConfig(getTaskColumns(dataCountry));
    const handleColChange = (e: any) => {
      const targetCountry = e.detail?.country;
      if (!targetCountry || targetCountry === 'ALL' || targetCountry === normalizeCountryKey(dataCountry)) {
        setColumnsConfig(getTaskColumns(dataCountry));
      }
    };
    window.addEventListener('task-columns-changed', handleColChange);
    return () => window.removeEventListener('task-columns-changed', handleColChange);
  }, [dataCountry]);

  // Keep a stable time reference for recent update badge calculation
  useEffect(() => {
    setCurrentTime(Date.now());
  }, [tasks]);

  const toggleColumnVisibility = (colId: TaskColumnId) => {
    const updated = columnsConfig.map(col => col.id === colId ? { ...col, visible: !col.visible } : col);
    setColumnsConfig(updated);
    saveTaskColumns(dataCountry, updated);
  };

  const handlePageSizeChange = (newSize: number | 'all') => {
    setPageSize(newSize);
    setCurrentPage(1);
    if (typeof window !== 'undefined') {
      localStorage.setItem('dl_tasks_page_size', String(newSize));
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  };

  // New Task modal
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({
    company_id: '', task_type_id: '', task_type_ids: [] as string[], priority: 'Medium', status: '', auditor_id: '', deadline: '', pl_date: '', description: '', assigned_to: '', assigned_partners: [] as string[]
  });

  // Task Detail modal
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  // Inline PL Date Edit states
  const [inlineEditPlTaskId, setInlineEditPlTaskId] = useState<string | null>(null);
  const [inlineEditPlValue, setInlineEditPlValue] = useState('');
  const [hoveredPlTaskId, setHoveredPlTaskId] = useState<string | null>(null);

  // Inline Description Edit states
  const [inlineEditDescId, setInlineEditDescId] = useState<string | null>(null);
  const [inlineEditDescValue, setInlineEditDescValue] = useState('');
  const [hoveredDescTaskId, setHoveredDescTaskId] = useState<string | null>(null);

  // Inline CR Number & Link Edit states
  const [inlineEditCrId, setInlineEditCrId] = useState<string | null>(null);
  const [inlineEditCrValue, setInlineEditCrValue] = useState('');
  const [inlineEditCrLinkValue, setInlineEditCrLinkValue] = useState('');
  const [savingCrTaskId, setSavingCrTaskId] = useState<string | null>(null);
  const [hoveredCrTaskId, setHoveredCrTaskId] = useState<string | null>(null);

  // Hover state for Company Name & Drive Link
  const [hoveredCompanyTaskId, setHoveredCompanyTaskId] = useState<string | null>(null);

  // Helper to safely format external URL
  const formatExternalUrl = (url?: string | null) => {
    if (!url) return '';
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return `https://${trimmed}`;
  };

  // Custom description tooltip states
  const [activeTooltipTaskId, setActiveTooltipTaskId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number; align: 'top' | 'bottom' }>({ x: 0, y: 0, align: 'bottom' });
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Ref to track which task the tooltip is currently locked to, preventing re-render loops
  const activeTooltipRef = useRef<string | null>(null);

  // Recent Modifications inline edit states
  const [recentEditId, setRecentEditId] = useState<string | null>(null);
  const [recentEditValue, setRecentEditValue] = useState('');
  const [recentEditSaving, setRecentEditSaving] = useState(false);

  // Multiple Selection & Bulk WhatsApp states
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [showBulkWhatsAppModal, setShowBulkWhatsAppModal] = useState(false);
  const [bulkWaGroupBy, setBulkWaGroupBy] = useState<'status' | 'partner' | 'company' | 'flat'>('status');
  const [bulkWaIncludeCr, setBulkWaIncludeCr] = useState(true);
  const [bulkWaIncludeDesc, setBulkWaIncludeDesc] = useState(true);
  const [bulkWaIncludePriority, setBulkWaIncludePriority] = useState(true);
  const [bulkWaIncludeDueDate, setBulkWaIncludeDueDate] = useState(true);
  const [bulkWaIncludeAuditor, setBulkWaIncludeAuditor] = useState(true);
  const [bulkWaIncludeAssigned, setBulkWaIncludeAssigned] = useState(true);
  const [bulkWaCustomNote, setBulkWaCustomNote] = useState('');
  const [bulkWaCopied, setBulkWaCopied] = useState(false);

  // Excel Export feedback toast
  const [exportToast, setExportToast] = useState<string | null>(null);

  // Clean up tooltip timeout on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  // Reset tooltip & page number if filters or search changes
  useEffect(() => {
    activeTooltipRef.current = null;
    setActiveTooltipTaskId(null);
    setInlineEditCrId(null);
    setInlineEditDescId(null);
    setCurrentPage(1);
  }, [search, filterStatus, filterPriority, filterCompany, filterPartner, filterTaskType, filterAuditor, filterDescUpdated]);

  const handleTooltipMouseEnter = () => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
  };

  const handleTooltipMouseLeave = () => {
    activeTooltipRef.current = null;
    setActiveTooltipTaskId(null);
  };

  // Save description from Recent Modifications inline edit
  async function saveRecentEditDescription(taskId: string) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    if (recentEditValue === task.description) {
      setRecentEditId(null);
      return;
    }
    setRecentEditSaving(true);
    const previousDesc = task.description;
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, description: recentEditValue } : t));
    setDescUpdateMap(prev => ({ ...prev, [taskId]: new Date().toISOString() }));
    const { data, error } = await supabase.from('tasks').update({ description: recentEditValue }).eq('id', taskId).select();
    if (error) {
      console.error('Description update error:', error);
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, description: previousDesc } : t));
      alert('Error updating description: ' + error.message);
    } else if (!data || data.length === 0) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, description: previousDesc } : t));
      alert('Update blocked by Supabase Row Level Security (RLS).');
    } else {
      // Also update the log entry in the recent activity panel
      setRecentActivityLogs(prev => prev.map((log: any) => {
        if (log.task_id === taskId && log.task) {
          return { ...log, task: { ...log.task, description: recentEditValue } };
        }
        return log;
      }));
      if (currentUser) {
        await supabase.from('status_log').insert({
          task_id: taskId,
          status: task.status || 'Unknown',
          updated_by: currentUser.id,
          remarks: `Description updated to: ${recentEditValue}`
        });
      }
      sessionStorage.removeItem('tasks_data_cache');
      sessionStorage.removeItem('tasks_data_time');
      sessionStorage.removeItem('dashboard_data_time_v2');
    }
    setRecentEditSaving(false);
    setRecentEditId(null);
  }
  // Stat card modal states
  const [showRecentModal, setShowRecentModal] = useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [showTaskTypeModal, setShowTaskTypeModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [waGenStatuses, setWaGenStatuses] = useState<string[]>([]);
  const [waGenPartners, setWaGenPartners] = useState<string[]>([]);
  const [waGenCopied, setWaGenCopied] = useState(false);
  const [waGenIncludeDesc, setWaGenIncludeDesc] = useState(true);
  const [waGenIncludeCr, setWaGenIncludeCr] = useState(true);
  const [waGenIncludeAuditor, setWaGenIncludeAuditor] = useState(false);
  const [waGenIncludePriority, setWaGenIncludePriority] = useState(false);
  const [waGenGroupBy, setWaGenGroupBy] = useState<'status' | 'partner' | 'compact'>('status');
  const [waGenStatusSearch, setWaGenStatusSearch] = useState('');
  const [waGenPartnerSearch, setWaGenPartnerSearch] = useState('');
  const [recentActivityLogs, setRecentActivityLogs] = useState<any[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [detailCompany, setDetailCompany] = useState<Company | null>(null);
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);


  const [updateStatus, setUpdateStatus] = useState('');
  const [updateBy, setUpdateBy] = useState('');
  const [updateRemarks, setUpdateRemarks] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top?: number, bottom?: number, right: number, maxHeight?: string }>({ top: 0, right: 0 });

  // Inline Create Company state
  const [showInlineCompanyForm, setShowInlineCompanyForm] = useState(false);
  const [inlineCompanyForm, setInlineCompanyForm] = useState({ name: '', tax_registration: '', industry: '', compliance_type: '' });
  const [inlineCompanySaving, setInlineCompanySaving] = useState(false);

  const loadData = useCallback(async () => {
    const cacheKey = 'tasks_data_cache';
    const cacheTimeKey = 'tasks_data_time';
    const cachedData = sessionStorage.getItem(cacheKey);
    const cacheTime = sessionStorage.getItem(cacheTimeKey);

    // Show cached data instantly for zero-wait UI
    if (cachedData && cacheTime) {
      const age = Date.now() - parseInt(cacheTime);
      try {
        const parsed = JSON.parse(cachedData);
        setCompanies(parsed.companies || []);
        setTasks(parsed.tasks || []);
        setTaskTypes(parsed.taskTypes || []);
        setPartners(parsed.partners || []);
        if (parsed.auditors) setAuditors(parsed.auditors);
        if (parsed.dynamicStatuses && parsed.dynamicStatuses.length > 0) {
          setDynamicStatuses(parsed.dynamicStatuses.sort((a: string, b: string) => a.localeCompare(b)));
        }
        if (parsed.statusObjects) setStatusObjects(parsed.statusObjects);
        if (parsed.descUpdateMap) setDescUpdateMap(parsed.descUpdateMap);
        setLoading(false);
        // If cache is fresh (< 60s), skip network entirely
        if (age < 60 * 1000) return;
      } catch (e) { }
    }

    // Fetch fresh data in parallel — ZERO waterfalls
    try {
      const targetCountry = dataCountry || 'Bahrain';
      let usersQuery = supabase.from('users').select('id, username, role, country, permissions, created_at').order('created_at', { ascending: false });
      if (dataCountry) {
        usersQuery = usersQuery.eq('country', dataCountry);
      }

      const compsPromise = (async () => {
        const res = await supabase.from('companies').select('id, company_name, notes, country, cr_number, cr_link, google_drive_link, created_at').eq('country', targetCountry);
        if (res.error) {
          console.warn('Companies select with google_drive_link failed, falling back...', res.error);
          const fb1 = await supabase.from('companies').select('id, company_name, notes, country, cr_number, cr_link, created_at').eq('country', targetCountry);
          if (fb1.error) {
            return supabase.from('companies').select('id, company_name, notes, country, cr_number, created_at').eq('country', targetCountry);
          }
          return fb1;
        }
        return res;
      })();

      const tasksPromise = (async () => {
        const { data: t, error: tErr } = await supabase.from('tasks').select('id, title, company_id, assigned_to, assigned_partners, status, priority, deadline, admin_note, task_type_id, task_type_ids, auditor_id, description, is_daily, country, pl_uploaded, pl_date, created_at').eq('country', targetCountry).neq('is_daily', true);
        if (tErr) {
          console.warn('pl_date column query fallback:', tErr.message);
          const { data: fallbackTasks } = await supabase.from('tasks').select('id, title, company_id, assigned_to, assigned_partners, status, priority, deadline, admin_note, task_type_id, task_type_ids, auditor_id, description, is_daily, country, pl_uploaded, created_at').eq('country', targetCountry).neq('is_daily', true);
          return fallbackTasks || [];
        }
        return t || [];
      })();

      const [compsRes, ttRes, usersRes, statusRes, audRes, taskList] = await Promise.all([
        compsPromise,
        supabase.from('task_types').select('id, name, category, jurisdiction, status_options, active, created_at').eq('active', true).eq('country', targetCountry),
        usersQuery,
        dataCountry
          ? supabase.from('statuses').select('name, active, task_type_ids').eq('country', dataCountry)
          : supabase.from('statuses').select('name, active, task_type_ids'),
        dataCountry
          ? supabase.from('auditors').select('id, name, country').eq('country', dataCountry).order('name')
          : supabase.from('auditors').select('id, name, country').order('name'),
        tasksPromise
      ]);

      const companyList = compsRes.data || [];
      const ttList = ttRes.data || [];
      const usersList = usersRes.data || [];
      const audList = audRes.data || [];
      const activeStatuses = statusRes.data?.filter(s => s.active !== false) || [];
      const dbStatuses = activeStatuses.map(s => s.name);

      const resolvedStatuses = dbStatuses.length > 0
        ? [...new Set(dbStatuses)].sort((a, b) => a.localeCompare(b)) as string[]
        : (!dataCountry || dataCountry === 'Bahrain' ? [...BAHRAIN_STATUSES].sort((a, b) => a.localeCompare(b)) : []);
      setDynamicStatuses(resolvedStatuses);

      // Store full status objects for task-type filtering
      const sObjs = activeStatuses.map(s => ({ name: s.name, task_type_ids: s.task_type_ids || null }));
      setStatusObjects(sObjs);

      let filteredTaskList = taskList;
      let filteredCompanyList = companyList;
      let filteredAuditorList = audList;

      if (!isAdminUser) {
        filteredTaskList = taskList.filter(isTaskAllowed);
        filteredCompanyList = companyList.filter(c => 
          filteredTaskList.some(t => t.company_id === c.id)
        );
        filteredAuditorList = audList.filter(a => userAuditorAccess.includes(a.id));
      }

      setCompanies(filteredCompanyList);
      setTaskTypes(ttList);
      setPartners(usersList);
      setAuditors(filteredAuditorList);
      setTasks(filteredTaskList);

      sessionStorage.setItem(cacheKey, JSON.stringify({
        companies: filteredCompanyList,
        taskTypes: ttList,
        partners: usersList,
        auditors: filteredAuditorList,
        tasks: filteredTaskList,
        dynamicStatuses: resolvedStatuses,
        statusObjects: sObjs,
        descUpdateMap
      }));
      sessionStorage.setItem(cacheTimeKey, Date.now().toString());

    } catch (err) {
      console.error('Load error:', err);
    }
    setLoading(false);
  }, [dataCountry]);

  useEffect(() => { loadData(); }, [loadData]);

  // Targeted Description Logs: Fetch logs on-demand when description filter is activated
  useEffect(() => {
    if (!filterDescUpdated || filterDescUpdated === 'no_desc' || filterDescUpdated === 'has_desc') return;
    let isMounted = true;
    let query = supabase.from('status_log').select('task_id, created_at, remarks').ilike('remarks', '%Description%');
    if (filterDescUpdated === '24h') {
      query = query.gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    } else if (filterDescUpdated === '7d') {
      query = query.gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    } else if (filterDescUpdated === '30d') {
      query = query.gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    } else if (filterDescUpdated === 'updated') {
      query = query.limit(500);
    }
    query.order('created_at', { ascending: false }).then(({ data: filterLogs }) => {
      if (!isMounted || !filterLogs || filterLogs.length === 0) return;
      setDescUpdateMap(prev => {
        const next = { ...prev };
        let changed = false;
        filterLogs.forEach((l: any) => {
          if (!next[l.task_id] || new Date(l.created_at) > new Date(next[l.task_id])) {
            next[l.task_id] = l.created_at;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    });
    return () => { isMounted = false; };
  }, [filterDescUpdated]);

  // Close action menu when clicking outside or scrolling
  useEffect(() => {
    if (!openMenuId) return;
    const handleClose = () => setOpenMenuId(null);
    document.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('resize', handleClose);
    return () => {
      document.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, [openMenuId]);

  // Close column picker when clicking outside
  useEffect(() => {
    if (!showColumnPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
        setShowColumnPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColumnPicker]);

  // Filter tasks
  // Determine if the user is actively looking for completed tasks via filter or search
  const isCompletedFilterActive = filterStatus && (() => {
    const fl = filterStatus.toLowerCase();
    return fl === 'complete' || fl === 'completed' || fl === 'closed' || fl === 'filed' || fl === 'done' || fl.includes('complete') || fl.includes('closed') || fl.includes('filed') || fl.includes('done');
  })();
  const isSearchActive = search.trim().length > 0;

  const filtered = tasks.filter(t => {
    const sl = (t.status || '').toLowerCase();
    // Hide completed tasks by default, but show them when the user
    // explicitly filters by a completed status or uses the search bar
    if ((sl === 'complete' || sl === 'completed' || sl === 'closed' || sl === 'filed' || sl === 'done') && !isCompletedFilterActive && !isSearchActive) {
      return false;
    }

    const activePartnerIds = t.assigned_partners && t.assigned_partners.length > 0
      ? t.assigned_partners
      : (t.assigned_to ? [t.assigned_to] : []);

    const isAssigned = activePartnerIds.includes(currentUser?.id || '');
    const hasAuditorAccess = (currentUser?.permissions?.auditor_access || []).includes(t.auditor_id || '');
    if (!isAdminUser && !isAssigned && !hasAuditorAccess) return false;

    if (filterStatus && t.status !== filterStatus) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterCompany && t.company_id !== filterCompany) return false;
    if (filterPartner) {
      const hasPartner = activePartnerIds.includes(filterPartner);
      if (!hasPartner) return false;
    }
    if (filterAuditor && t.auditor_id !== filterAuditor) return false;
    // Task Type filter
    if (filterTaskType) {
      const ttIds = t.task_type_ids && t.task_type_ids.length > 0 ? t.task_type_ids : (t.task_type_id ? t.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : []);
      if (!ttIds.includes(filterTaskType)) return false;
    }
    if (filterDescUpdated) {
      const hasDescription = Boolean(t.description && t.description.trim().length > 0);
      if (filterDescUpdated === 'no_desc') {
        if (hasDescription) return false;
      } else {
        // Exclude all tasks that have no description or empty description
        if (!hasDescription) return false;

        const updateDateStr = descUpdateMap[t.id] || t.created_at || null;

        if (filterDescUpdated === 'has_desc') {
          // Already confirmed hasDescription
        } else if (filterDescUpdated === 'updated') {
          if (!descUpdateMap[t.id]) return false;
        } else {
          if (!updateDateStr) return false;
          const updateTime = new Date(updateDateStr).getTime();
          if (isNaN(updateTime)) return false;
          const now = currentTime;
          let maxAgeMs = 0;
          if (filterDescUpdated === '24h') maxAgeMs = 24 * 60 * 60 * 1000;
          else if (filterDescUpdated === '7d') maxAgeMs = 7 * 24 * 60 * 60 * 1000;
          else if (filterDescUpdated === '30d') maxAgeMs = 30 * 24 * 60 * 60 * 1000;
          if (maxAgeMs > 0 && (now - updateTime > maxAgeMs || now < updateTime - 60000)) return false;
        }
      }
    }
    if (search) {
      const s = search.toLowerCase();
      const ttIds = t.task_type_ids && t.task_type_ids.length > 0 ? t.task_type_ids : (t.task_type_id ? t.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : []);
      const comp = companies.find(c => c.id === t.company_id);
      const matchTitle = t.title?.toLowerCase().includes(s);
      const matchDesc = t.description?.toLowerCase().includes(s);
      const matchType = ttIds.some(id => taskTypes.find(x => x.id === id)?.name.toLowerCase().includes(s));
      const matchCompany = comp?.company_name?.toLowerCase().includes(s);
      const matchCr = comp?.cr_number?.toLowerCase().includes(s);
      const matchStatus = t.status?.toLowerCase().includes(s);
      const matchPriority = t.priority?.toLowerCase().includes(s);
      const matchId = t.id?.toLowerCase().includes(s);
      if (!matchTitle && !matchDesc && !matchType && !matchCompany && !matchCr && !matchStatus && !matchPriority && !matchId) return false;
    }
    return true;
  }).sort((a, b) => {
    if (filterDescUpdated && filterDescUpdated !== 'no_desc') {
      const timeA = descUpdateMap[a.id] ? new Date(descUpdateMap[a.id]).getTime() : (a.description ? new Date(a.created_at).getTime() : 0);
      const timeB = descUpdateMap[b.id] ? new Date(descUpdateMap[b.id]).getTime() : (b.description ? new Date(b.created_at).getTime() : 0);
      if (timeA !== timeB) {
        return timeB - timeA; // Descending (most recently updated descriptions first)
      }
    }
    return (a.status || '').localeCompare(b.status || '');
  });

  // Active visible columns and pagination calculation
  const visibleColumns = columnsConfig.filter(c => c.visible);
  const totalCount = filtered.length;
  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(totalCount / (pageSize as number)));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = pageSize === 'all' ? 0 : (safeCurrentPage - 1) * (pageSize as number);
  const endIndex = pageSize === 'all' ? totalCount : Math.min(totalCount, startIndex + (pageSize as number));
  const paginatedTasks = pageSize === 'all' ? filtered : filtered.slice(startIndex, endIndex);

  // Targeted Description Logs: Fetch description update logs only for visible page tasks
  useEffect(() => {
    if (!paginatedTasks || paginatedTasks.length === 0) return;
    const missingIds = paginatedTasks
      .filter(t => Boolean(t.description && t.description.trim().length > 0))
      .map(t => t.id)
      .filter(id => !descUpdateMap[id]);
    
    if (missingIds.length === 0) return;

    let isMounted = true;
    supabase
      .from('status_log')
      .select('task_id, created_at, remarks')
      .in('task_id', missingIds)
      .ilike('remarks', '%Description%')
      .order('created_at', { ascending: false })
      .then(({ data: logs }) => {
        if (!isMounted || !logs || logs.length === 0) return;
        setDescUpdateMap(prev => {
          const next = { ...prev };
          let changed = false;
          logs.forEach((l: any) => {
            if (!next[l.task_id] || new Date(l.created_at) > new Date(next[l.task_id])) {
              next[l.task_id] = l.created_at;
              changed = true;
            }
          });
          return changed ? next : prev;
        });
      });

    return () => { isMounted = false; };
  }, [paginatedTasks, descUpdateMap]);
  useEffect(() => {
    const openDescId = searchParams.get('openDesc');

    if (openDescId && tasks.length > 0 && !detailTask) {
      viewDetail(openDescId);
      const url = new URL(window.location.href);
      url.searchParams.delete('openDesc');
      window.history.replaceState({}, '', url);
    }
  }, [searchParams, tasks, detailTask]);


  // Inline status update
  function handleStatusChange(taskId: string, newStatus: string) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;
    const previousStatus = task.status;

    // Optimistic update — UI changes instantly
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));

    // Fire DB calls in the background
    supabase.from('tasks').update({ status: newStatus }).eq('id', taskId).select('id').then(async ({ data, error }) => {
      if (error) {
        console.error('Status update error:', error);
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: previousStatus } : t));
        return;
      }
      if (!data || data.length === 0) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: previousStatus } : t));
        alert('Update blocked by Supabase Row Level Security (RLS). Ask Admin to run the database fix script.');
        return;
      }

      // Log the status change in background (non-blocking)
      const { user } = getSession();
      const updaterId = user?.id || null;
      supabase.from('status_log').insert({
        task_id: taskId,
        status: newStatus,
        updated_by: updaterId,
        remarks: `${previousStatus} → ${newStatus}`,
      }).then(({ error: logErr }) => {
        if (logErr) console.error('Status log error:', logErr);
      });

      sessionStorage.removeItem('tasks_data_time');
      sessionStorage.removeItem('dashboard_data_time_v2');
    });
  }

  function handlePriorityChange(taskId: string, newPriority: string) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.priority === newPriority) return;
    const previousPriority = task.priority;

    // Optimistic update — UI changes instantly
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, priority: newPriority } : t));

    // Fire DB call in the background
    supabase.from('tasks').update({ priority: newPriority }).eq('id', taskId).select('id').then(({ data, error }) => {
      if (error) {
        console.error('Priority update error:', error);
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, priority: previousPriority } : t));
        return;
      }
      if (!data || data.length === 0) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, priority: previousPriority } : t));
        alert('Update blocked by Supabase Row Level Security (RLS).');
        return;
      }
      sessionStorage.removeItem('tasks_data_time');
      sessionStorage.removeItem('dashboard_data_time_v2');
    });
  }

  function openEditTask(task: Task) {
    setEditingTaskId(task.id);
    const existingTypeIds = task.task_type_ids && task.task_type_ids.length > 0 ? task.task_type_ids : (task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : []);
    setNewTask({
      company_id: task.company_id || '',
      task_type_id: task.task_type_id || '',
      task_type_ids: existingTypeIds,
      priority: task.priority || 'Medium',
      status: task.status || '',
      auditor_id: task.auditor_id || '',
      deadline: task.deadline || '',
      pl_date: task.pl_date || '',
      description: task.description || '',
      assigned_to: task.assigned_to || '',
      assigned_partners: task.assigned_partners || (task.assigned_to ? [task.assigned_to] : [])
    });
    setShowTaskModal(true);
  }

  // Inline partner assignment
  function handleAssign(taskId: string, partnerId: string) {
    const assignValue = partnerId && partnerId.length > 0 ? partnerId : null;
    const previousTask = tasks.find(t => t.id === taskId);
    if (!previousTask) return;

    // Optimistic update — UI changes instantly
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, assigned_to: assignValue || '', assigned_partners: assignValue ? [assignValue] : [] } : t));

    // Fire DB call in the background
    supabase.from('tasks').update({ assigned_to: assignValue }).eq('id', taskId).select('id').then(async ({ data, error }) => {
      if (error) {
        console.error('Assign error:', error);
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, assigned_to: previousTask.assigned_to, assigned_partners: previousTask.assigned_partners } : t));
        alert('Error assigning: ' + error.message);
        return;
      }
      if (!data || data.length === 0) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, assigned_to: previousTask.assigned_to, assigned_partners: previousTask.assigned_partners } : t));
        alert('Assignment blocked by Supabase Row Level Security (RLS).');
        return;
      }

      if (assignValue) {
        const partner = partners.find(p => p.id === assignValue);
        supabase.from('status_log').insert({
          task_id: taskId,
          status: previousTask.status || 'Unknown',
          updated_by: assignValue,
          remarks: `Task assigned to ${partner?.username || 'Unknown'}`,
        }).then(({ error: logErr }) => {
          if (logErr) console.error('Assign log error:', logErr);
        });
      }

      sessionStorage.removeItem('tasks_data_time');
      sessionStorage.removeItem('dashboard_data_time_v2');
    });
  }

  // Inline auditor assignment
  function handleAssignAuditor(taskId: string, auditorId: string) {
    const assignValue = auditorId && auditorId.length > 0 ? auditorId : null;
    const previousAuditorId = tasks.find(t => t.id === taskId)?.auditor_id;

    // Optimistic update — UI changes instantly
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, auditor_id: assignValue } : t));

    // Fire DB call in the background
    supabase.from('tasks').update({ auditor_id: assignValue }).eq('id', taskId).select('id').then(({ data, error }) => {
      if (error) {
        console.error('Assign auditor error:', error);
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, auditor_id: previousAuditorId } : t));
        alert('Error assigning auditor: ' + error.message);
        return;
      }
      if (!data || data.length === 0) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, auditor_id: previousAuditorId } : t));
        alert('Assignment blocked by Supabase Row Level Security (RLS).');
        return;
      }
    });
  }

  // Toggle PL Uploaded
  function handlePlUploadedToggle(taskId: string) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const newVal = !task.pl_uploaded;
    // Optimistic update — UI changes instantly
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, pl_uploaded: newVal } : t));
    // Fire DB update in background — don't block the UI
    supabase.from('tasks').update({ pl_uploaded: newVal }).eq('id', taskId).select('id').then(({ data, error }) => {
      if (error) {
        console.error('PL uploaded toggle error:', error);
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, pl_uploaded: !newVal } : t));
        return;
      }
      if (!data || data.length === 0) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, pl_uploaded: !newVal } : t));
        alert('Update blocked by Supabase RLS.');
        return;
      }
      sessionStorage.removeItem('tasks_data_time');
    });
  }

  // Update PL Date
  function handlePlDateChange(taskId: string, newDate: string | null) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const formattedDate = newDate && newDate.trim() !== '' ? newDate.trim() : null;
    const previousDate = task.pl_date || null;
    const previousUploaded = task.pl_uploaded;
    if (formattedDate === previousDate && inlineEditPlTaskId !== taskId) {
      setInlineEditPlTaskId(null);
      return;
    }

    const newUploaded = !!formattedDate;

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, pl_date: formattedDate, pl_uploaded: newUploaded } : t));
    setInlineEditPlTaskId(null);

    // Update in Supabase
    supabase.from('tasks')
      .update({ pl_date: formattedDate, pl_uploaded: newUploaded })
      .eq('id', taskId)
      .select('id')
      .then(({ data, error }) => {
        if (error) {
          console.warn('Failed to update pl_date, attempting pl_uploaded fallback:', error.message);
          supabase.from('tasks').update({ pl_uploaded: newUploaded }).eq('id', taskId).select('id').then(({ error: fbErr }) => {
            if (fbErr) console.error('pl_uploaded fallback error:', fbErr);
          });
          return;
        }
        if (!data || data.length === 0) {
          console.warn('Update blocked by RLS, attempting pl_uploaded fallback');
          supabase.from('tasks').update({ pl_uploaded: newUploaded }).eq('id', taskId).select('id').then(({ error: fbErr }) => {
            if (fbErr) console.error('pl_uploaded fallback error:', fbErr);
          });
          return;
        }
        sessionStorage.removeItem('tasks_data_time');
      });
  }

  // Save inline description
  async function saveInlineDescription(taskId: string) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    if (inlineEditDescValue === task.description) {
      setInlineEditDescId(null);
      return;
    }

    // Optimistic update
    const previousDesc = task.description;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, description: inlineEditDescValue } : t));
    setDescUpdateMap(prev => ({ ...prev, [taskId]: new Date().toISOString() }));

    const { data, error } = await supabase.from('tasks').update({ description: inlineEditDescValue }).eq('id', taskId).select();

    if (error) {
      console.error('Description update error:', error);
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, description: previousDesc } : t));
      alert('Error updating description: ' + error.message);
    } else if (!data || data.length === 0) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, description: previousDesc } : t));
      alert('Update blocked by Supabase Row Level Security (RLS).');
    } else {
      if (currentUser) {
        await supabase.from('status_log').insert({
          task_id: taskId,
          status: task.status || 'Unknown',
          updated_by: currentUser.id,
          remarks: `Description updated to: ${inlineEditDescValue}`
        });
      }
      sessionStorage.removeItem('tasks_data_cache');
      sessionStorage.removeItem('tasks_data_time');
      sessionStorage.removeItem('dashboard_data_time_v2');
    }
    setInlineEditDescId(null);
  }

  // Save inline CR Number & Link
  async function saveInlineCrNumber(companyId: string, taskId: string) {
    const comp = companies.find(c => c.id === companyId);
    if (!comp) return;
    const newCr = inlineEditCrValue.trim();
    const newCrLink = inlineEditCrLinkValue.trim();
    if (newCr === (comp.cr_number || '') && newCrLink === (comp.cr_link || '')) {
      setInlineEditCrId(null);
      return;
    }

    // Optimistic update
    const previousCr = comp.cr_number;
    const previousCrLink = comp.cr_link;
    setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, cr_number: newCr || undefined, cr_link: newCrLink || undefined } : c));
    setSavingCrTaskId(taskId);

    let { data, error } = await supabase
      .from('companies')
      .update({
        cr_number: newCr || null,
        cr_link: newCrLink || null
      })
      .eq('id', companyId)
      .select();

    if (error && (error.message?.includes('cr_link') || (error as any).code === 'PGRST204' || error.message?.includes('column'))) {
      console.warn('cr_link column might not exist in database yet, falling back to saving cr_number only:', error.message);
      const fallback = await supabase
        .from('companies')
        .update({ cr_number: newCr || null })
        .eq('id', companyId)
        .select();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error('CR details update error:', error);
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, cr_number: previousCr, cr_link: previousCrLink } : c));
      alert('Error updating CR details: ' + error.message);
    } else if (!data || data.length === 0) {
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, cr_number: previousCr, cr_link: previousCrLink } : c));
      alert('Update blocked by Supabase Row Level Security (RLS).');
    } else {
      sessionStorage.removeItem('tasks_data_cache');
      sessionStorage.removeItem('tasks_data_time');
      sessionStorage.removeItem('dashboard_data_time_v2');
    }
    setSavingCrTaskId(null);
    setInlineEditCrId(null);
  }

  // ─── Multi-Select & Bulk WhatsApp Helpers ───
  const toggleSelectTask = (taskId: string) => {
    setSelectedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const selectAllFiltered = () => {
    const visibleIds = filtered.map(t => t.id);
    setSelectedTaskIds(visibleIds);
  };

  const deselectAll = () => {
    setSelectedTaskIds([]);
  };

  const isAllFilteredSelected = filtered.length > 0 && filtered.every(t => selectedTaskIds.includes(t.id));
  const isSomeFilteredSelected = filtered.some(t => selectedTaskIds.includes(t.id)) && !isAllFilteredSelected;

  const buildBulkWhatsAppMessage = () => {
    const selectedTasks = tasks.filter(t => selectedTaskIds.includes(t.id));
    if (selectedTasks.length === 0) return '';

    const getAssignedNames = (task: Task) => {
      const activePartnerIds = task.assigned_partners && task.assigned_partners.length > 0 
        ? task.assigned_partners 
        : (task.assigned_to ? [task.assigned_to] : []);
      const allNames = activePartnerIds.map((id: string) => partners.find((p: any) => p.id === id)?.username).filter(Boolean);
      return allNames.length > 0 ? allNames.join(', ') : 'Unassigned';
    };

    const getAuditType = (task: Task) => {
      const ttIds = task.task_type_ids && task.task_type_ids.length > 0 ? task.task_type_ids : (task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : []);
      return ttIds.map(id => taskTypes.find(t => t.id === id)?.name).filter(Boolean).join(', ') || 'N/A';
    };

    const formatSingleTask = (task: Task, idx: number, lines: string[]) => {
      const comp = companies.find(c => c.id === task.company_id);
      const aud = auditors.find(a => a.id === task.auditor_id);

      if (idx > 0) {
        lines.push('----------------------------------');
        lines.push('');
      }

      lines.push(`*${idx + 1}. Company:* ${comp?.company_name || 'Unknown'}`);
      if (bulkWaIncludeCr && comp?.cr_number) {
        lines.push(`*CR Number:* ${comp.cr_number}`);
      }
      lines.push(`*Task Type:* ${getAuditType(task)}`);
      if (bulkWaIncludeAssigned) {
        lines.push(`*Assigned To:* ${getAssignedNames(task)}`);
      }
      if (bulkWaIncludeAuditor && aud?.name) {
        lines.push(`*Auditor:* ${aud.name}`);
      }
      if (bulkWaIncludePriority) {
        lines.push(`*Priority:* ${task.priority || 'Medium'}`);
      }
      if (bulkWaIncludeDueDate && task.deadline) {
        lines.push(`*Due Date:* ${task.deadline}`);
      }
      lines.push(`*Status:* ${task.status || 'N/A'}`);
      if (bulkWaIncludeDesc && task.description && task.description.trim() !== '') {
        lines.push(`*Description:* ${task.description}`);
      }
      lines.push('');
    };

    const sections: string[] = [];

    if (bulkWaCustomNote.trim()) {
      sections.push(`📢 *${bulkWaCustomNote.trim()}*`);
      sections.push('');
    } else {
      sections.push(`📋 *Compliance & Task Summary (${selectedTasks.length} Tasks)*`);
      sections.push('');
    }

    if (bulkWaGroupBy === 'status') {
      const statuses = Array.from(new Set(selectedTasks.map(t => t.status || 'Pending'))).sort((a, b) => a.localeCompare(b));
      statuses.forEach(status => {
        const groupTasks = selectedTasks.filter(t => (t.status || 'Pending') === status);
        if (groupTasks.length === 0) return;
        sections.push('━━━━━━━━━━━━━━━━━━');
        sections.push(`*Status: ${status}* (${groupTasks.length})`);
        sections.push('━━━━━━━━━━━━━━━━━━');
        sections.push('');
        groupTasks.forEach((t, i) => formatSingleTask(t, i, sections));
      });
    } else if (bulkWaGroupBy === 'partner') {
      const allActivePartners = Array.from(new Set(selectedTasks.flatMap(t => {
        const pids = t.assigned_partners && t.assigned_partners.length > 0 ? t.assigned_partners : (t.assigned_to ? [t.assigned_to] : []);
        return pids.length > 0 ? pids : ['unassigned'];
      })));
      allActivePartners.forEach(pId => {
        const partnerObj = partners.find(p => p.id === pId);
        const pName = partnerObj ? partnerObj.username : (pId === 'unassigned' ? 'Unassigned' : 'Unknown');
        const groupTasks = selectedTasks.filter(t => {
          const pids = t.assigned_partners && t.assigned_partners.length > 0 ? t.assigned_partners : (t.assigned_to ? [t.assigned_to] : []);
          return pId === 'unassigned' ? pids.length === 0 : pids.includes(pId);
        });
        if (groupTasks.length === 0) return;
        sections.push('━━━━━━━━━━━━━━━━━━');
        sections.push(`*Assignee: ${pName}* (${groupTasks.length})`);
        sections.push('━━━━━━━━━━━━━━━━━━');
        sections.push('');
        groupTasks.forEach((t, i) => formatSingleTask(t, i, sections));
      });
    } else if (bulkWaGroupBy === 'company') {
      const compIds = Array.from(new Set(selectedTasks.map(t => t.company_id)));
      compIds.forEach(cId => {
        const comp = companies.find(c => c.id === cId);
        const groupTasks = selectedTasks.filter(t => t.company_id === cId);
        if (groupTasks.length === 0) return;
        sections.push('━━━━━━━━━━━━━━━━━━');
        sections.push(`*Company: ${comp?.company_name || 'Unknown'}* (${groupTasks.length})`);
        sections.push('━━━━━━━━━━━━━━━━━━');
        sections.push('');
        groupTasks.forEach((t, i) => formatSingleTask(t, i, sections));
      });
    } else {
      // Flat list
      selectedTasks.forEach((t, i) => formatSingleTask(t, i, sections));
    }

    return sections.join('\n');
  };

  // ─── Professional Excel Export Handler ───
  const handleExportExcel = async (mode: 'all' | 'filtered' | 'selected' = 'filtered') => {
    let listToExport: Task[] = [];
    let title = 'Task Management';
    let prefix = 'Task_Management';

    if (mode === 'selected' && selectedTaskIds.length > 0) {
      listToExport = tasks.filter(t => selectedTaskIds.includes(t.id));
      title = `Selected Tasks (${listToExport.length})`;
      prefix = 'Selected_Tasks';
    } else if (mode === 'all') {
      listToExport = tasks;
      title = `All Tasks (${listToExport.length})`;
      prefix = 'All_Tasks';
    } else {
      listToExport = filtered;
      title = `Filtered Tasks (${listToExport.length})`;
      prefix = 'Filtered_Tasks';
    }

    if (listToExport.length === 0) {
      alert('No tasks to export.');
      return;
    }

    try {
      await exportTaskManagementExcel(listToExport, {
        tasks,
        companies,
        partners,
        taskTypes,
        auditors,
        country: dataCountry || 'Bahrain',
        descUpdateMap,
      }, {
        title,
        filenamePrefix: prefix,
      });
      setExportToast(`Exported ${listToExport.length} task${listToExport.length === 1 ? '' : 's'} to Excel!`);
      setTimeout(() => setExportToast(null), 4000);
    } catch (e: any) {
      console.error('Export error:', e);
      alert('Error exporting tasks: ' + e.message);
    }
  };

  const handleExportTasks = async () => {
    const listToExport = selectedTaskIds.length > 0
      ? tasks.filter(t => selectedTaskIds.includes(t.id))
      : filtered;

    if (listToExport.length === 0) {
      alert('No tasks found to export.');
      return;
    }

    try {
      await exportTaskManagementExcel(listToExport, {
        tasks,
        country: dataCountry || 'Bahrain',
        companies,
        taskTypes,
        partners,
        auditors,
        descUpdateMap,
      });
      setExportToast(`Exported ${listToExport.length} task${listToExport.length === 1 ? '' : 's'} to Excel!`);
      setTimeout(() => setExportToast(null), 4000);
    } catch (e: any) {
      console.error('Export error:', e);
      alert('Error exporting tasks: ' + e.message);
    }
  };

  // Save inline company in modal
  async function saveInlineCompany() {
    if (!inlineCompanyForm.name.trim()) { alert('Company name is required'); return; }
    setInlineCompanySaving(true);
    try {
      const companyCountry = dataCountry || 'Bahrain';
      const { data, error } = await supabase.from('companies').insert({
        company_name: inlineCompanyForm.name.trim(),
        country: companyCountry,
        tax_registration: inlineCompanyForm.tax_registration || null,
        industry: inlineCompanyForm.industry || null,
        compliance_type: inlineCompanyForm.compliance_type || null,
        notes: '',
        status: 'Active',
      }).select().single();
      if (error) { alert('Error creating company: ' + error.message); setInlineCompanySaving(false); return; }
      setCompanies(prev => [...prev, data].sort((a, b) => a.company_name.localeCompare(b.company_name)));
      setNewTask(p => ({ ...p, company_id: data.id }));
      setShowInlineCompanyForm(false);
      setInlineCompanyForm({ name: '', tax_registration: '', industry: '', compliance_type: '' });
      sessionStorage.removeItem('tasks_data_time');
      sessionStorage.removeItem('dashboard_data_time_v2');
    } catch (err) {
      console.error('Inline company create error:', err);
      alert('An unexpected error occurred.');
    }
    setInlineCompanySaving(false);
  }

  async function saveTask() {
    const typeIds = newTask.task_type_ids || [];
    if (!newTask.company_id || typeIds.length === 0 || !newTask.deadline) {
      alert('Please fill all required fields (Company, at least one Task Type, and Due Date)');
      return;
    }

    const firstTt = taskTypes.find(t => t.id === typeIds[0]);
    const firstStatus = newTask.status || (firstTt?.status_options ? firstTt.status_options.split(',')[0].trim() : 'Not Started');
    const assignArray = newTask.assigned_partners || [];
    const assignTo = assignArray.length > 0 ? assignArray[0] : null;
    const desc = newTask.description && newTask.description.length > 0 ? newTask.description : null;
    const primaryTtId = typeIds.length > 0 ? typeIds[0] : null;
    const combinedTitle = typeIds.map(id => taskTypes.find(t => t.id === id)?.name).filter(Boolean).join(', ') || 'Untitled';

    let resultError, resultData;

    if (editingTaskId) {
      let { data, error } = await supabase.from('tasks').update({
        title: combinedTitle,
        company_id: newTask.company_id,
        task_type_id: primaryTtId,
        task_type_ids: typeIds,
        priority: newTask.priority,
        status: firstStatus,
        auditor_id: newTask.auditor_id || null,
        deadline: newTask.deadline,
        pl_date: newTask.pl_date && newTask.pl_date.trim() !== '' ? newTask.pl_date.trim() : null,
        pl_uploaded: !!(newTask.pl_date && newTask.pl_date.trim() !== ''),
        description: desc,
        assigned_to: assignTo,
        assigned_partners: assignArray,
      }).eq('id', editingTaskId).select().single();

      if (error && (error.message?.includes('pl_date') || error.message?.includes('schema cache'))) {
        console.warn('pl_date column not in schema, retrying update without pl_date:', error.message);
        const fallback = await supabase.from('tasks').update({
          title: combinedTitle,
          company_id: newTask.company_id,
          task_type_id: primaryTtId,
          task_type_ids: typeIds,
          priority: newTask.priority,
          status: firstStatus,
          auditor_id: newTask.auditor_id || null,
          deadline: newTask.deadline,
          pl_uploaded: !!(newTask.pl_date && newTask.pl_date.trim() !== ''),
          description: desc,
          assigned_to: assignTo,
          assigned_partners: assignArray,
        }).eq('id', editingTaskId).select().single();
        data = fallback.data;
        error = fallback.error;
      }

      resultError = error;
      resultData = data;
    } else {
      let { data, error } = await supabase.from('tasks').insert({
        title: combinedTitle,
        company_id: newTask.company_id,
        task_type_id: primaryTtId,
        task_type_ids: typeIds,
        priority: newTask.priority,
        deadline: newTask.deadline,
        pl_date: newTask.pl_date && newTask.pl_date.trim() !== '' ? newTask.pl_date.trim() : null,
        pl_uploaded: !!(newTask.pl_date && newTask.pl_date.trim() !== ''),
        description: desc,
        assigned_to: assignTo,
        assigned_partners: assignArray,
        status: firstStatus,
        auditor_id: newTask.auditor_id || null,
        country: dataCountry || 'Bahrain',
      }).select().single();

      if (error && (error.message?.includes('pl_date') || error.message?.includes('schema cache'))) {
        console.warn('pl_date column not in schema, retrying insert without pl_date:', error.message);
        const fallback = await supabase.from('tasks').insert({
          title: combinedTitle,
          company_id: newTask.company_id,
          task_type_id: primaryTtId,
          task_type_ids: typeIds,
          priority: newTask.priority,
          deadline: newTask.deadline,
          pl_uploaded: !!(newTask.pl_date && newTask.pl_date.trim() !== ''),
          description: desc,
          assigned_to: assignTo,
          assigned_partners: assignArray,
          status: firstStatus,
          auditor_id: newTask.auditor_id || null,
          country: dataCountry || 'Bahrain',
        }).select().single();
        data = fallback.data;
        error = fallback.error;
      }

      resultError = error;
      resultData = data;
    }

    if (resultError) { console.error('Save task error:', resultError); alert('Error: ' + resultError.message); return; }

    // Status log for new tasks or changed status on edit
    if (!editingTaskId) {
      const { user } = getSession();
      await supabase.from('status_log').insert({
        task_id: resultData.id,
        status: firstStatus,
        updated_by: user?.id || null,
        remarks: 'Task created',
      });
    } else {
      const oldTask = tasks.find(t => t.id === editingTaskId);
      if (oldTask) {
        const { user } = getSession();
        let remarksArr = [];

        // Check if description changed
        const oldDesc = (oldTask.description || '').trim();
        const newDesc = (desc || '').trim();
        if (oldDesc !== newDesc) {
          remarksArr.push(`Description updated to: ${newDesc}`);
          setDescUpdateMap(prev => ({ ...prev, [editingTaskId]: new Date().toISOString() }));
        }

        // Check if status changed
        if (oldTask.status !== firstStatus && firstStatus) {
           remarksArr.push(`Status updated from ${oldTask.status} to ${firstStatus}`);
        }

        // Check if assignment changed
        const oldAssign = oldTask.assigned_partners || (oldTask.assigned_to ? [oldTask.assigned_to] : []);
        const newAssign = assignArray;
        const oldSorted = [...oldAssign].sort();
        const newSorted = [...newAssign].sort();
        if (JSON.stringify(oldSorted) !== JSON.stringify(newSorted)) {
           const oldPartnerNames = oldAssign.map(id => partners.find(p => p.id === id)?.username).filter(Boolean);
           const newPartnerNames = newAssign.map(id => partners.find(p => p.id === id)?.username).filter(Boolean);
           const oldNamesStr = oldPartnerNames.length > 0 ? oldPartnerNames.join(', ') : 'Unassigned';
           const newNamesStr = newPartnerNames.length > 0 ? newPartnerNames.join(', ') : 'Unassigned';
           remarksArr.push(`Assignment updated: ${oldNamesStr} → ${newNamesStr}`);
        }

        if (remarksArr.length > 0) {
          await supabase.from('status_log').insert({
            task_id: editingTaskId,
            status: firstStatus || oldTask.status,
            updated_by: user?.id || null,
            remarks: remarksArr.join(' | '),
          });
        }
      }
    }

    setShowTaskModal(false);
    setEditingTaskId(null);
    setNewTask({ company_id: '', task_type_id: '', task_type_ids: [], priority: 'Medium', status: '', auditor_id: '', deadline: '', pl_date: '', description: '', assigned_to: '', assigned_partners: [] });

    sessionStorage.removeItem('tasks_data_cache');
    sessionStorage.removeItem('tasks_data_time');
    sessionStorage.removeItem('dashboard_data_time_v2');

    loadData();
  }

  // View task detail
  async function viewDetail(taskId: string) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    setDetailTask(task);
    setDetailCompany(companies.find(c => c.id === task.company_id) || null);
    setUpdateStatus(task.status);
    setUpdatePartners(task.assigned_partners || (task.assigned_to ? [task.assigned_to] : []));

    const { data: logs, error } = await supabase
      .from('status_log')
      .select('id, task_id, status, updated_by, remarks, created_at')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    if (error) console.error('Status log error:', error);

    // Enrich with partner names — resolve from local list, session, or DB
    const { user: sessionUser } = getSession();
    const unresolvedIds = new Set<string>();
    (logs || []).forEach(log => {
      if (log.updated_by && !partners.find(p => p.id === log.updated_by) && log.updated_by !== sessionUser?.id) {
        unresolvedIds.add(log.updated_by);
      }
    });

    // Fetch any missing user names from the database
    let extraUsers: { id: string; username: string }[] = [];
    if (unresolvedIds.size > 0) {
      const { data: fetchedUsers } = await supabase
        .from('users')
        .select('id, username')
        .in('id', Array.from(unresolvedIds));
      extraUsers = fetchedUsers || [];
    }

    const enriched = (logs || []).map(log => {
      let username: string | null = null;
      // 1. Check local partners array
      const localPartner = partners.find(p => p.id === log.updated_by);
      if (localPartner) {
        username = localPartner.username;
      }
      // 2. Check current session user
      else if (sessionUser && log.updated_by === sessionUser.id) {
        username = sessionUser.username;
      }
      // 3. Check extra fetched users
      else {
        const extra = extraUsers.find(u => u.id === log.updated_by);
        if (extra) username = extra.username;
      }
      return { ...log, updater: username ? { username } : null };
    });
    setStatusLogs(enriched as any);

    const { user } = getSession();
    // Default to the assigned partner if Admin in Bahrain, otherwise self
    if ((isAdminUser || canManageTask(task)) && dataCountry === 'Bahrain' && task.assigned_to) {
      setUpdateBy(task.assigned_to);
    } else {
      setUpdateBy(user?.id || '');
    }
    setUpdateRemarks('');
  }

  const [updatePartners, setUpdatePartners] = useState<string[]>([]);

  // Update status and partners from detail modal
  async function submitStatusUpdate() {
    if (!detailTask) return;
    const previousStatus = detailTask.status;
    // Always use the actual logged-in user for accurate tracking
    const { user: sessionUser } = getSession();
    const actualUpdaterId = sessionUser?.id || null;
    const assignTo = updatePartners.length > 0 ? updatePartners[0] : null;

    const { data, error: e1 } = await supabase.from('tasks').update({
      status: updateStatus,
      assigned_partners: updatePartners,
      assigned_to: assignTo
    }).eq('id', detailTask.id).select();
    if (e1) { console.error('Update error:', e1); alert('Error: ' + e1.message); return; }
    if (!data || data.length === 0) {
      alert('Update blocked by Supabase RLS. Contact admin.');
      return;
    }
    // Build clear remarks showing transition + any custom notes
    const transitionNote = previousStatus !== updateStatus
      ? `${previousStatus} → ${updateStatus}`
      : `Status unchanged (${updateStatus})`;

    // Check if assignments changed
    const previousPartners = detailTask.assigned_partners || (detailTask.assigned_to ? [detailTask.assigned_to] : []);
    const oldSorted = [...previousPartners].sort();
    const newSorted = [...updatePartners].sort();
    const assignmentChanged = JSON.stringify(oldSorted) !== JSON.stringify(newSorted);

    let assignmentNote = '';
    if (assignmentChanged) {
       const oldPartnerNames = previousPartners.map(id => partners.find(p => p.id === id)?.username).filter(Boolean);
       const newPartnerNames = updatePartners.map(id => partners.find(p => p.id === id)?.username).filter(Boolean);
       const oldNamesStr = oldPartnerNames.length > 0 ? oldPartnerNames.join(', ') : 'Unassigned';
       const newNamesStr = newPartnerNames.length > 0 ? newPartnerNames.join(', ') : 'Unassigned';
       assignmentNote = `Assignment updated: ${oldNamesStr} → ${newNamesStr}`;
    }

    const notesArr = [transitionNote];
    if (assignmentChanged) notesArr.push(assignmentNote);
    if (updateRemarks) notesArr.push(updateRemarks);

    const fullRemarks = notesArr.join(' | ');

    const { error: e2 } = await supabase.from('status_log').insert({
      task_id: detailTask.id,
      status: updateStatus,
      updated_by: actualUpdaterId,
      remarks: fullRemarks,
    });
    if (e2) console.error('Log error:', e2);

    setDetailTask(null);
    sessionStorage.removeItem('tasks_data_cache');
    sessionStorage.removeItem('tasks_data_time');
    sessionStorage.removeItem('dashboard_data_time_v2');
    loadData();
  }

  // Delete task
  async function deleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return;
    try {
      // Delete status logs first (cascade should handle this but be safe)
      await supabase.from('status_log').delete().eq('task_id', taskId);

      const { data, error } = await supabase.from('tasks').delete().eq('id', taskId).select();
      if (error) {
        console.error('Delete error:', error);
        alert('Error deleting: ' + error.message);
        return;
      }
      if (!data || data.length === 0) {
        alert('Delete blocked by Supabase Row Level Security (RLS). Please run the database fix script.');
        return;
      }

      sessionStorage.removeItem('tasks_data_cache');
      sessionStorage.removeItem('tasks_data_time');
      sessionStorage.removeItem('dashboard_data_time_v2');
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err: any) {
      console.error('Delete exception:', err);
      alert('Exception during delete: ' + err.message);
    }
  }



  const getColumnColorConfig = (colId: string) => {
    if (!isDark) {
      return {
        headerColor: '#475569',
        dotColor: 'transparent',
        tagBg: 'var(--bg-tertiary)',
        tagText: '#1e293b',
        tagBorder: '#e2e8f0'
      };
    }
    switch (colId) {
      case 'pl':
        return { headerColor: '#a5b4fc', dotColor: '#818cf8', tagBg: 'rgba(99, 102, 241, 0.15)', tagText: '#a5b4fc', tagBorder: 'rgba(99, 102, 241, 0.35)' };
      case 'company':
        return { headerColor: '#38bdf8', dotColor: '#0ea5e9', tagBg: 'rgba(56, 189, 248, 0.14)', tagText: '#38bdf8', tagBorder: 'rgba(56, 189, 248, 0.35)' };
      case 'cr_number':
        return { headerColor: '#fbbf24', dotColor: '#f59e0b', tagBg: 'rgba(245, 158, 11, 0.14)', tagText: '#fbbf24', tagBorder: 'rgba(245, 158, 11, 0.35)' };
      case 'task_type':
        return { headerColor: '#60a5fa', dotColor: '#3b82f6', tagBg: 'rgba(59, 130, 246, 0.15)', tagText: '#60a5fa', tagBorder: 'rgba(59, 130, 246, 0.35)' };
      case 'description':
        return { headerColor: '#94a3b8', dotColor: '#64748b', tagBg: 'rgba(148, 163, 184, 0.12)', tagText: 'var(--text-secondary)', tagBorder: 'var(--border)' };
      case 'desc_updated':
        return { headerColor: '#22d3ee', dotColor: '#06b6d4', tagBg: 'rgba(6, 182, 212, 0.15)', tagText: '#22d3ee', tagBorder: 'rgba(6, 182, 212, 0.35)' };
      case 'priority':
        return { headerColor: '#fb7185', dotColor: '#f43f5e', tagBg: 'rgba(244, 63, 94, 0.15)', tagText: '#fb7185', tagBorder: 'rgba(244, 63, 94, 0.35)' };
      case 'deadline':
        return { headerColor: '#fb923c', dotColor: '#f97316', tagBg: 'rgba(249, 115, 22, 0.15)', tagText: '#fb923c', tagBorder: 'rgba(249, 115, 22, 0.35)' };
      case 'status':
        return { headerColor: '#34d399', dotColor: '#10b981', tagBg: 'rgba(16, 185, 129, 0.15)', tagText: '#34d399', tagBorder: 'rgba(16, 185, 129, 0.35)' };
      case 'auditor':
        return { headerColor: '#c084fc', dotColor: '#a855f7', tagBg: 'rgba(168, 85, 247, 0.15)', tagText: '#c084fc', tagBorder: 'rgba(168, 85, 247, 0.35)' };
      case 'assigned_to':
        return { headerColor: '#2dd4bf', dotColor: '#14b8a6', tagBg: 'rgba(20, 184, 166, 0.15)', tagText: '#2dd4bf', tagBorder: 'rgba(20, 184, 166, 0.35)' };
      default:
        return { headerColor: 'var(--text-secondary)', dotColor: 'var(--text-tertiary)', tagBg: 'var(--bg-tertiary)', tagText: 'var(--text-primary)', tagBorder: 'var(--border)' };
    }
  };

  const priorityColor = (p: string) => {
    if (!isDark) {
      switch (p) {
        case 'Urgent':
        case 'Critical': return { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
        case 'High': return { bg: '#fffbeb', color: '#d97706', border: '#fde68a' };
        case 'Medium': return { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' };
        case 'Low': return { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' };
        default: return { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
      }
    }
    switch (p) {
      case 'Urgent':
      case 'Critical': return { bg: 'rgba(239, 68, 68, 0.18)', color: '#f87171', border: 'rgba(239, 68, 68, 0.45)' };
      case 'High': return { bg: 'rgba(245, 158, 11, 0.18)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.45)' };
      case 'Medium': return { bg: 'rgba(59, 130, 246, 0.18)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.45)' };
      case 'Low': return { bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: 'rgba(148, 163, 184, 0.35)' };
      default: return { bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: 'rgba(148, 163, 184, 0.35)' };
    }
  };

  const DARK_PARTNER_PALETTES = [
    { text: '#38bdf8', bg: 'rgba(56, 189, 248, 0.22)', border: 'rgba(56, 189, 248, 0.55)', avatarBg: 'linear-gradient(135deg, #0284c7, #38bdf8)' },
    { text: '#c084fc', bg: 'rgba(192, 132, 252, 0.22)', border: 'rgba(192, 132, 252, 0.55)', avatarBg: 'linear-gradient(135deg, #7e22ce, #c084fc)' },
    { text: '#34d399', bg: 'rgba(52, 211, 153, 0.22)', border: 'rgba(52, 211, 153, 0.55)', avatarBg: 'linear-gradient(135deg, #059669, #34d399)' },
    { text: '#fbbf24', bg: 'rgba(251, 191, 36, 0.22)', border: 'rgba(251, 191, 36, 0.55)', avatarBg: 'linear-gradient(135deg, #d97706, #fbbf24)' },
    { text: '#f472b6', bg: 'rgba(244, 114, 182, 0.22)', border: 'rgba(244, 114, 182, 0.55)', avatarBg: 'linear-gradient(135deg, #db2777, #f472b6)' },
    { text: '#818cf8', bg: 'rgba(129, 140, 248, 0.22)', border: 'rgba(129, 140, 248, 0.55)', avatarBg: 'linear-gradient(135deg, #4f46e5, #818cf8)' },
    { text: '#2dd4bf', bg: 'rgba(45, 212, 191, 0.22)', border: 'rgba(45, 212, 191, 0.55)', avatarBg: 'linear-gradient(135deg, #0d9488, #2dd4bf)' },
    { text: '#fb923c', bg: 'rgba(249, 115, 22, 0.22)', border: 'rgba(249, 115, 22, 0.55)', avatarBg: 'linear-gradient(135deg, #ea580c, #fb923c)' },
    { text: '#a78bfa', bg: 'rgba(167, 139, 250, 0.22)', border: 'rgba(167, 139, 250, 0.55)', avatarBg: 'linear-gradient(135deg, #6d28d9, #a78bfa)' },
    { text: '#4ade80', bg: 'rgba(74, 222, 128, 0.22)', border: 'rgba(74, 222, 128, 0.55)', avatarBg: 'linear-gradient(135deg, #16a34a, #4ade80)' },
  ];

  const LIGHT_PARTNER_PALETTES = [
    { text: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', avatarBg: 'linear-gradient(135deg, #0284c7, #38bdf8)' },
    { text: '#7e22ce', bg: '#faf5ff', border: '#e9d5ff', avatarBg: 'linear-gradient(135deg, #7e22ce, #c084fc)' },
    { text: '#059669', bg: '#ecfdf5', border: '#a7f3d0', avatarBg: 'linear-gradient(135deg, #059669, #34d399)' },
    { text: '#d97706', bg: '#fffbeb', border: '#fde68a', avatarBg: 'linear-gradient(135deg, #d97706, #fbbf24)' },
    { text: '#db2777', bg: '#fdf2f8', border: '#fbcfe8', avatarBg: 'linear-gradient(135deg, #db2777, #f472b6)' },
    { text: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe', avatarBg: 'linear-gradient(135deg, #4f46e5, #818cf8)' },
    { text: '#0d9488', bg: '#f0fdfa', border: '#99f6e4', avatarBg: 'linear-gradient(135deg, #0d9488, #2dd4bf)' },
    { text: '#ea580c', bg: '#fff7ed', border: '#fed7aa', avatarBg: 'linear-gradient(135deg, #ea580c, #fb923c)' },
    { text: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe', avatarBg: 'linear-gradient(135deg, #6d28d9, #a78bfa)' },
    { text: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', avatarBg: 'linear-gradient(135deg, #16a34a, #4ade80)' },
  ];

  const getPartnerColor = (identifier?: string | null) => {
    if (!identifier || identifier.trim() === '') {
      return {
        text: 'var(--text-secondary)',
        bg: 'var(--bg-tertiary)',
        border: 'var(--border)',
        avatarBg: 'linear-gradient(135deg, #64748b, #94a3b8)'
      };
    }
    let hash = 0;
    for (let i = 0; i < identifier.length; i++) {
      hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
    }
    const palettes = isDark ? DARK_PARTNER_PALETTES : LIGHT_PARTNER_PALETTES;
    const index = Math.abs(hash) % palettes.length;
    return palettes[index];
  };

  const statusColor = (s: string) => {
    if (!isDark) {
      if (!s) return { bg: '#47556912', color: '#475569', border: '#47556924', dot: '#475569', glow: 'none' };
      const sl = s.trim().toLowerCase();
      let hex = '#475569'; // Default Slate 700

      // 1. Success / Completed / Done / Submitted (Emerald / Teal / Cyan / Green)
      if (sl === 'completed' || sl === 'done' || sl.includes('submitted')) hex = '#047857'; // Emerald 700
      else if (sl === 'closed') hex = '#065f46';    // Emerald 800
      else if (sl === 'filed' || sl.includes('file')) hex = '#0e7490';     // Cyan 700
      else if (sl.includes('received')) hex = '#16a34a'; // Green 600

      // 2. Query / Info / Ask (Yellow / Gold)
      else if (sl.includes('query') || sl.includes('info') || sl.includes('question') || sl.includes('letter') || sl.includes('confirmation')) hex = '#a16207'; // Yellow 700

      // 3. Review / Verification / Auditor / Approval (Purple / Violet)
      else if (sl.includes('review') || sl.includes('auditor') || sl.includes('approval') || sl.includes('validation')) hex = '#6d28d9'; // Purple 700

      // 4. Financials / Billing / Accounting (Indigo / Violet)
      else if (sl.includes('payment') || sl.includes('financial') || sl.includes('billing') || sl.includes('invoice') || sl.includes('xero')) hex = '#4338ca'; // Indigo 700

      // 5. Active / Work / In Progress (Blue / Sky)
      else if (sl === 'in progress' || sl === 'progress' || sl.includes('progress') || sl.includes('progess')) hex = '#1d4ed8'; // Blue 700
      else if (sl === 'active' || sl === 'started' || sl === 'running') hex = '#1e40af'; // Blue 800
      else if (sl.includes('checklist')) hex = '#0369a1'; // Sky 700

      // 6. Danger / Alerts (Red / Rose)
      else if (sl === 'overdue') hex = '#b91c1c';   // Red 700
      else if (sl === 'urgent' || sl === 'high') hex = '#991b1b'; // Red 800
      else if (sl === 'rework' || sl === 'blocked') hex = '#be123c'; // Rose 700

      // 7. Pending / Deferred / Awaiting (Amber / Orange)
      else if (sl === 'pending' || sl.includes('yet to start') || sl.includes('not started')) hex = '#b45309';   // Amber 700
      else if (sl.includes('hold') || sl.includes('waiting') || sl.includes('awaited') || sl.includes('pending')) hex = '#c2410c'; // Orange 700

      // 8. Info / Draft / Default
      else if (sl === 'new' || sl === 'created') hex = '#0369a1'; // Sky 700
      else if (sl === 'draft' || sl === 'memo') hex = '#475569'; // Slate 700

      // Broad Fallbacks
      else if (sl.includes('completed') || sl.includes('closed') || sl.includes('done') || sl.includes('filed')) hex = '#047857';
      else if (sl.includes('review') || sl.includes('waiting') || sl.includes('draft') || sl.includes('auditor')) hex = '#6d28d9';
      else if (sl.includes('progress') || sl.includes('active') || sl.includes('started')) hex = '#1d4ed8';
      else if (sl.includes('urgent') || sl.includes('overdue') || sl.includes('rework') || sl.includes('block')) hex = '#b91c1c';
      else if (sl.includes('query') || sl.includes('info') || sl.includes('question')) hex = '#a16207';
      else if (sl.includes('financial') || sl.includes('billing') || sl.includes('invoice')) hex = '#4338ca';

      return {
        bg: `${hex}12`,
        color: hex,
        border: `${hex}24`,
        dot: hex,
        glow: 'none'
      };
    }

    if (!s) return { bg: 'rgba(148, 163, 184, 0.12)', color: 'var(--text-tertiary)', border: 'var(--border)', dot: '#94a3b8', glow: 'none' };
    const sl = s.trim().toLowerCase();
    let hex = '#60a5fa';
    let rgb = '96, 165, 250';

    // 1. Success / Completed / Done / Submitted
    if (sl === 'completed' || sl === 'done' || sl.includes('submitted')) { hex = '#34d399'; rgb = '52, 211, 153'; }
    else if (sl === 'closed') { hex = '#10b981'; rgb = '16, 185, 129'; }
    else if (sl === 'filed' || sl.includes('file')) { hex = '#22d3ee'; rgb = '34, 211, 238'; }
    else if (sl.includes('received') || sl.includes('accepted')) { hex = '#4ade80'; rgb = '74, 222, 128'; }

    // 2. Query / Info / Ask
    else if (sl.includes('query') || sl.includes('info') || sl.includes('question') || sl.includes('letter') || sl.includes('confirmation')) { hex = '#facc15'; rgb = '250, 204, 21'; }

    // 3. Review / Verification / Auditor / Approval
    else if (sl.includes('review') || sl.includes('auditor') || sl.includes('approval') || sl.includes('validation')) { hex = '#c084fc'; rgb = '192, 132, 252'; }

    // 4. Financials / Billing / Accounting
    else if (sl.includes('payment') || sl.includes('financial') || sl.includes('billing') || sl.includes('invoice') || sl.includes('xero')) { hex = '#818cf8'; rgb = '129, 140, 248'; }

    // 5. Active / Work / In Progress
    else if (sl === 'in progress' || sl === 'progress' || sl.includes('progress') || sl.includes('progess')) { hex = '#38bdf8'; rgb = '56, 189, 248'; }
    else if (sl === 'active' || sl === 'started' || sl === 'running') { hex = '#60a5fa'; rgb = '96, 165, 250'; }
    else if (sl.includes('checklist')) { hex = '#2dd4bf'; rgb = '45, 212, 191'; }

    // 6. Danger / Alerts
    else if (sl === 'overdue' || sl === 'urgent' || sl === 'high') { hex = '#f87171'; rgb = '248, 113, 113'; }
    else if (sl === 'rework' || sl === 'blocked' || sl.includes('reject')) { hex = '#fb7185'; rgb = '251, 113, 133'; }

    // 7. Pending / Deferred / Awaiting
    else if (sl === 'pending' || sl.includes('yet to start') || sl.includes('not started')) { hex = '#fbbf24'; rgb = '251, 191, 36'; }
    else if (sl.includes('hold') || sl.includes('waiting') || sl.includes('awaited')) { hex = '#fb923c'; rgb = '251, 146, 60'; }

    // 8. Info / Draft / Default
    else if (sl === 'new' || sl === 'created') { hex = '#38bdf8'; rgb = '56, 189, 248'; }
    else if (sl === 'draft' || sl === 'memo') { hex = '#94a3b8'; rgb = '148, 163, 184'; }

    // Broad Fallbacks
    else if (sl.includes('completed') || sl.includes('closed') || sl.includes('done') || sl.includes('filed')) { hex = '#34d399'; rgb = '52, 211, 153'; }
    else if (sl.includes('review') || sl.includes('waiting') || sl.includes('draft') || sl.includes('auditor')) { hex = '#c084fc'; rgb = '192, 132, 252'; }
    else if (sl.includes('progress') || sl.includes('active') || sl.includes('started')) { hex = '#38bdf8'; rgb = '56, 189, 248'; }
    else if (sl.includes('urgent') || sl.includes('overdue') || sl.includes('rework') || sl.includes('block')) { hex = '#f87171'; rgb = '248, 113, 113'; }
    else if (sl.includes('query') || sl.includes('info') || sl.includes('question')) { hex = '#facc15'; rgb = '250, 204, 21'; }
    else if (sl.includes('financial') || sl.includes('billing') || sl.includes('invoice')) { hex = '#818cf8'; rgb = '129, 140, 248'; }
    else { hex = '#94a3b8'; rgb = '148, 163, 184'; }

    return {
      bg: `rgba(${rgb}, 0.22)`,
      color: hex,
      border: `rgba(${rgb}, 0.55)`,
      dot: hex,
      glow: `0 0 10px rgba(${rgb}, 0.25)`
    };
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '60px', color: '#7F8C8D' }}>Loading tasks...</div>;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Header */}
      <div className="task-header" style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '26px', padding: '28px 32px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
        borderRadius: '20px', boxShadow: '0 6px 24px rgba(15,23,42,0.16)',
        border: '1px solid rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ color: '#ffffff', fontSize: '24px', fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>
              Task Management
            </h2>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.12)', padding: '3px 10px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
              <CountryFlag name={dataCountry || 'Bahrain'} size={14} />
              <span style={{ color: '#e2e8f0', fontSize: '11.5px', fontWeight: 600 }}>{dataCountry || 'Bahrain'}</span>
            </span>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '14px', margin: '6px 0 0 0' }}>
            Manage, assign, and track all compliance tasks
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Multiple Selection Toggle Button */}
          <button
            onClick={() => {
              if (multiSelectMode) {
                setMultiSelectMode(false);
                setSelectedTaskIds([]);
              } else {
                setMultiSelectMode(true);
              }
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 16px',
              background: multiSelectMode ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.12)',
              color: multiSelectMode ? '#93c5fd' : '#ffffff',
              border: multiSelectMode ? '1px solid #60a5fa' : '1px solid rgba(255,255,255,0.18)',
              borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = multiSelectMode ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = multiSelectMode ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.12)'; }}
            title="Select multiple tasks for batch WhatsApp sharing or export"
          >
            <CheckSquare size={15} />
            {multiSelectMode ? `Selecting (${selectedTaskIds.length})` : 'Select Multiple'}
          </button>

          {/* Export to Excel Button */}
          <button
            onClick={() => handleExportExcel(selectedTaskIds.length > 0 ? 'selected' : 'filtered')}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 16px',
              background: 'rgba(255,255,255,0.12)', color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
            title={selectedTaskIds.length > 0 ? `Export ${selectedTaskIds.length} Selected Tasks to Excel` : `Export ${filtered.length} Tasks to Excel`}
          >
            <FileSpreadsheet size={15} />
            Export Excel
          </button>

          {(isAdminUser || userAuditorAccess.length > 0) && (
            <button
              onClick={() => { setEditingTaskId(null); setNewTask({ company_id: '', task_type_id: '', task_type_ids: [], priority: 'Medium', status: '', auditor_id: '', deadline: '', pl_date: '', description: '', assigned_to: '', assigned_partners: [] }); setShowTaskModal(true); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 20px', background: '#ffffff', color: '#0f172a',
                border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.15)', transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.22)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.15)'; }}
            >
              <Plus size={15} /> New Task
            </button>
          )}
        </div>
      </div>

      {/* ─── 4 Compact Stat Cards (Placed on top) ─── */}
      {(isAdminUser || !isAdminUser) && (
        <div className="task-stat-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '20px' }}>
          {/* Card 1: Recently Modified Tasks */}
          <div
            onClick={async () => {
              setShowRecentModal(true);
              setRecentLoading(true);
              try {
                const { data: logs } = await supabase
                  .from('status_log')
                  .select('id, task_id, status, updated_by, remarks, created_at')
                  .order('created_at', { ascending: false })
                  .limit(200);
                if (logs) {
                  const taskMap = new Map<string, any>();
                  logs.forEach((log: any) => {
                    if (tasks.some(t => t.id === log.task_id)) {
                      if (!taskMap.has(log.task_id)) taskMap.set(log.task_id, log);
                    }
                  });
                  const top20 = Array.from(taskMap.values()).slice(0, 40);
                  const unresolvedIds = new Set<string>();
                  const { user: sessionUser } = getSession();
                  top20.forEach(log => {
                    if (log.updated_by && !partners.find(p => p.id === log.updated_by) && log.updated_by !== sessionUser?.id) {
                      unresolvedIds.add(log.updated_by);
                    }
                  });

                  let extraUsers: { id: string; username: string }[] = [];
                  if (unresolvedIds.size > 0) {
                    const { data: fetchedUsers } = await supabase
                      .from('users')
                      .select('id, username')
                      .in('id', Array.from(unresolvedIds));
                    extraUsers = fetchedUsers || [];
                  }

                  const enriched = top20.map((log: any) => {
                    const task = tasks.find(t => t.id === log.task_id);
                    const company = task ? companies.find(c => c.id === task.company_id) : null;
                    let updaterName = 'Unknown';

                    const localPartner = partners.find(p => p.id === log.updated_by);
                    if (localPartner) {
                      updaterName = localPartner.username;
                    } else if (sessionUser && log.updated_by === sessionUser.id) {
                      updaterName = sessionUser.username;
                    } else {
                      const extra = extraUsers.find(u => u.id === log.updated_by);
                      if (extra) updaterName = extra.username;
                    }

                    return { ...log, task, company, updaterName };
                  });
                  setRecentActivityLogs(enriched);
                }
              } catch (e) { console.error(e); }
              setRecentLoading(false);
            }}
            style={{
              background: 'var(--bg-card, var(--bg-secondary))', borderRadius: '14px', padding: '16px 18px',
              border: '1px solid var(--border)', cursor: 'pointer',
              boxShadow: 'var(--card-shadow)', transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'center', gap: '14px',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(59,130,246,0.18)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--card-shadow)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(59,130,246,0.35))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Clock size={20} color="#3b82f6" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Recently Modified</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {(() => {
                  const now = new Date();
                  const recent = tasks.filter(t => {
                    const created = new Date(t.created_at);
                    return (now.getTime() - created.getTime()) < 7 * 24 * 60 * 60 * 1000;
                  });
                  return recent.length;
                })()}
              </div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', marginTop: '1px' }}>Last 7 days · Click to view</div>
            </div>
            <ArrowRight size={16} color="var(--text-tertiary)" />
          </div>

          {/* Card 2: Completed Tasks */}
          <div
            onClick={() => setShowCompletedModal(true)}
            style={{
              background: 'var(--bg-card, var(--bg-secondary))', borderRadius: '14px', padding: '16px 18px',
              border: '1px solid var(--border)', cursor: 'pointer',
              boxShadow: 'var(--card-shadow)', transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'center', gap: '14px',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(16,185,129,0.18)'; e.currentTarget.style.borderColor = '#10b981'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--card-shadow)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.35))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CheckCircle2 size={20} color="#10b981" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Completed</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {tasks.filter(t => {
                  const sl = (t.status || '').toLowerCase();
                  return sl.includes('complete') || sl.includes('closed') || sl.includes('filed') || sl.includes('done');
                }).length}
              </div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', marginTop: '1px' }}>Total completed · Click to view</div>
            </div>
            <ArrowRight size={16} color="var(--text-tertiary)" />
          </div>

          {/* Card 3: All Task Types */}
          <div
            onClick={() => setShowTaskTypeModal(true)}
            style={{
              background: 'var(--bg-card, var(--bg-secondary))', borderRadius: '14px', padding: '16px 18px',
              border: '1px solid var(--border)', cursor: 'pointer',
              boxShadow: 'var(--card-shadow)', transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'center', gap: '14px',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(139,92,246,0.18)'; e.currentTarget.style.borderColor = '#8b5cf6'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--card-shadow)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(139,92,246,0.35))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BarChart3 size={20} color="#8b5cf6" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Task Types</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {taskTypes.filter(t => t.active).length}
              </div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', marginTop: '1px' }}>Distribution · Click to view</div>
            </div>
            <ArrowRight size={16} color="var(--text-tertiary)" />
          </div>

          {/* Card 4: WhatsApp Message Generator */}
          <div
            onClick={() => { setShowStatusModal(true); setWaGenStatuses([]); setWaGenPartners([]); setWaGenCopied(false); }}
            style={{
              background: 'linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(22,163,74,0.22) 100%)',
              borderRadius: '16px',
              padding: '16px 18px',
              border: '1px solid rgba(34,197,94,0.35)',
              cursor: 'pointer',
              boxShadow: 'var(--card-shadow)',
              transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              position: 'relative',
              overflow: 'hidden'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(34, 197, 94, 0.22)';
              e.currentTarget.style.borderColor = '#22c55e';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = 'var(--card-shadow)';
              e.currentTarget.style.borderColor = 'rgba(34,197,94,0.35)';
            }}
          >
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)'
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#ffffff">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                <span style={{ fontSize: '10.5px', color: '#16a34a', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  WhatsApp Dispatch
                </span>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              </div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.25 }}>
                Share Tasks
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 550, marginTop: '2px' }}>
                Filter by status & partner
              </div>
            </div>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'rgba(34, 197, 94, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#22c55e',
              flexShrink: 0
            }}>
              <ArrowRight size={15} strokeWidth={2.5} />
            </div>
          </div>
        </div>
      )}

      {/* Filters (Placed below cards) */}
      <div className="task-filters" style={{
        display: 'flex', gap: '10px', marginBottom: '22px', flexWrap: 'wrap',
        padding: '16px 18px', background: 'var(--bg-card, var(--bg-secondary))',
        borderRadius: '18px', border: '1px solid var(--border)',
        boxShadow: 'var(--card-shadow)', alignItems: 'center'
      }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={filterStyle}>
          <option value="">All Status</option>
          {(() => {
            const allStatuses = new Set<string>(dynamicStatuses);
            if (!dataCountry || dataCountry === 'Bahrain') {
              tasks.forEach(t => { if (t.status) allStatuses.add(t.status); });
            }
            return Array.from(allStatuses).sort((a, b) => a.localeCompare(b)).map(s => <option key={s} value={s}>{s}</option>);
          })()}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={filterStyle}>
          <option value="">All Priority</option>
          {BAHRAIN_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} style={filterStyle}>
          <option value="">All Companies</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
        </select>
        {isAdminUser && (
          <select value={filterPartner} onChange={e => setFilterPartner(e.target.value)} style={filterStyle}>
            <option value="">All Partners</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
          </select>
        )}
        <select value={filterAuditor} onChange={e => setFilterAuditor(e.target.value)} style={filterStyle}>
          <option value="">All Auditors</option>
          {auditors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={filterTaskType} onChange={e => setFilterTaskType(e.target.value)} style={filterStyle}>
          <option value="">All Task Types</option>
          {taskTypes.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={filterDescUpdated} onChange={e => setFilterDescUpdated(e.target.value)} style={filterStyle}>
          <option value="">All Descriptions</option>
          <option value="24h">Desc Updated: Last 24 Hours</option>
          <option value="7d">Desc Updated: Last 7 Days</option>
          <option value="30d">Desc Updated: Last 30 Days</option>
          <option value="updated">Desc Updated: Any Update</option>
          <option value="has_desc">Has Description</option>
          <option value="no_desc">No Description</option>
        </select>
        <div style={{ position: 'relative', flex: '2 1 180px', minWidth: '160px' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks..."
            style={{ ...filterStyle, width: '100%', paddingRight: search ? '28px' : '12px' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px', display: 'flex' }}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* Columns Quick Toggle Popover */}
        <div style={{ position: 'relative' }} ref={columnPickerRef}>
          <button
            type="button"
            onClick={() => setShowColumnPicker(!showColumnPicker)}
            style={{
              padding: '8px 14px',
              background: showColumnPicker ? 'var(--accent-light)' : 'var(--bg-secondary)',
              color: showColumnPicker ? 'var(--accent)' : 'var(--text-primary)',
              border: showColumnPicker ? '1.5px solid var(--accent)' : '1px solid var(--border)',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: 650,
              fontSize: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
              boxShadow: 'var(--card-shadow)'
            }}
            title="Choose which columns to show or hide in this table"
          >
            <Columns3 size={14} color="var(--accent)" />
            <span>Columns ({visibleColumns.length})</span>
            <ChevronDown size={12} style={{ transform: showColumnPicker ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </button>

          {showColumnPicker && (
            <div
              onClick={e => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                zIndex: 1000,
                background: 'var(--bg-card, var(--bg-secondary))',
                borderRadius: '14px',
                border: '1px solid var(--border)',
                boxShadow: '0 14px 34px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.1)',
                padding: '12px',
                minWidth: '240px',
                maxHeight: '360px',
                overflowY: 'auto'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Columns ({visibleColumns.length}/{columnsConfig.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowColumnPicker(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px' }}
                >
                  <X size={13} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '10px' }}>
                {columnsConfig.map(col => {
                  const colCfg = getColumnColorConfig(col.id);
                  return (
                    <label
                      key={`picker-${col.id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: col.visible ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        fontWeight: col.visible ? 650 : 400,
                        background: col.visible ? 'var(--bg-tertiary)' : 'transparent',
                        transition: 'all 0.12s ease'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={col.visible}
                        onChange={() => toggleColumnVisibility(col.id)}
                        style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                      />
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: colCfg.dotColor, display: isDark ? 'inline-block' : 'none', flexShrink: 0 }} />
                      <span>{col.label}</span>
                    </label>
                  );
                })}
              </div>

              <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <Link
                  href="/dashboard/settings"
                  onClick={() => setShowColumnPicker(false)}
                  style={{
                    fontSize: '11.5px',
                    color: 'var(--accent)',
                    fontWeight: 700,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '6px',
                    borderRadius: '6px',
                    background: 'var(--accent-light)'
                  }}
                >
                  <SlidersHorizontal size={12} /> Custom Order in Settings →
                </Link>
              </div>
            </div>
          )}
        </div>

        {(filterStatus || filterPriority || filterCompany || filterPartner || filterAuditor || filterTaskType || filterDescUpdated || search) && (
          <button
            onClick={() => { setFilterStatus(''); setFilterPriority(''); setFilterCompany(''); setFilterPartner(''); setFilterAuditor(''); setFilterTaskType(''); setFilterDescUpdated(''); setSearch(''); }}
            style={{ padding: '8px 16px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', transition: 'all 0.15s ease' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'; }}
          >
            <X size={14} /> Clear Filters
          </button>
        )}
      </div>

      {/* ─── Recently Modified Modal ─── */}
      {showRecentModal && (
        <Modal title="Recently Modified Tasks (Latest 40)" onClose={() => { setShowRecentModal(false); setRecentEditId(null); }}>
          {recentLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading activity history...</div>
          ) : recentActivityLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No recent activity found</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                <button
                  onClick={() => {
                    const lines: string[] = [];
                    lines.push('━━━━━━━━━━━━━━━━━━');
                    lines.push('*Recently Modified Tasks*');
                    lines.push('━━━━━━━━━━━━━━━━━━');
                    lines.push('');
                    recentActivityLogs.forEach((log: any, idx: number) => {
                      const task = log.task;
                      if (!task) return;
                      const comp = log.company;
                      const ttIds = task.task_type_ids && task.task_type_ids.length > 0 ? task.task_type_ids : (task.task_type_id ? task.task_type_id.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
                      const ttNames = ttIds.map((id: string) => taskTypes.find(t => t.id === id)?.name).filter(Boolean).join(', ') || 'N/A';
                      const formattedDate = log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A';
                      const activePartnerIds = task.assigned_partners && task.assigned_partners.length > 0 
                        ? task.assigned_partners 
                        : (task.assigned_to ? [task.assigned_to] : []);
                      const allNames = activePartnerIds.map((id: string) => partners.find((p: any) => p.id === id)?.username).filter(Boolean);
                      const assignedNames = allNames.length > 0 ? allNames.join(', ') : 'Unassigned';
                      
                      lines.push(`Company: ${comp?.company_name || 'Unknown'}`);
                      lines.push(`CR Number: ${comp?.cr_number || 'N/A'}`);
                      lines.push(`Assigned To: ${assignedNames}`);
                      lines.push(`Status: ${task.status || 'N/A'}`);
                      lines.push(`Description: ${task.description || 'N/A'}`);
                      lines.push(`Audit Type: ${ttNames}`);
                      lines.push(`Modified: ${formattedDate}`);
                      lines.push('');
                    });
                    const message = lines.join('\n').trim();
                    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
                  }}
                  style={{
                    padding: '8px 14px', borderRadius: '10px',
                    border: 'none', background: 'linear-gradient(135deg, #25D366, #128C7E)',
                    color: '#ffffff', fontWeight: 600, fontSize: '12px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                    boxShadow: '0 2px 8px rgba(37,211,102,0.3)',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(37,211,102,0.4)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(37,211,102,0.3)'; }}
                >
                  <Send size={14} /> Share via WhatsApp
                </button>
              </div>
              {recentActivityLogs.map((log: any, i: number) => {
                const isEditingThis = recentEditId === log.task_id;
                const taskDesc = tasks.find(t => t.id === log.task_id)?.description || '';
                return (
                <div key={log.id || i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '12px',
                  padding: '16px 18px', background: isEditingThis ? '#eff6ff' : '#f8fafc', borderRadius: '14px',
                  border: isEditingThis ? '1.5px solid #93c5fd' : '1px solid #f1f5f9', transition: 'all 0.15s',
                }}>
                  <div
                    style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px', cursor: 'pointer' }}
                    title="View task details"
                    onClick={() => { setShowRecentModal(false); setRecentEditId(null); if (log.task_id) viewDetail(log.task_id); }}
                  >
                    <Activity size={16} color="#2563eb" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span
                        style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a', cursor: 'pointer' }}
                        title="Click to view task details"
                        onClick={() => { setShowRecentModal(false); setRecentEditId(null); if (log.task_id) viewDetail(log.task_id); }}
                      >
                        #{log.task_id?.slice(0, 6)} — {log.company?.company_name || 'Unknown Company'}
                      </span>
                      <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#475569', marginBottom: '5px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, background: '#eff6ff', color: '#2563eb', marginRight: '6px' }}>{log.status}</span>
                      {log.remarks && <span style={{ color: '#64748b' }}>{log.remarks}</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>By: {log.updaterName}</div>
                    {/* Description with inline edit */}
                    {isEditingThis ? (
                      <div style={{ marginTop: '6px', padding: '10px', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: '#64748b', marginBottom: '6px' }}>✏️ Edit Description</div>
                        <textarea
                          autoFocus
                          value={recentEditValue}
                          onChange={e => setRecentEditValue(e.target.value)}
                          style={{
                            width: '100%',
                            minHeight: '70px',
                            padding: '8px 10px',
                            fontSize: '12px',
                            borderRadius: '8px',
                            border: '1.5px solid #3b82f6',
                            outline: 'none',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            color: '#1e293b',
                            lineHeight: 1.5,
                            boxSizing: 'border-box',
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Escape') setRecentEditId(null);
                            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveRecentEditDescription(log.task_id);
                          }}
                        />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                          <button
                            onClick={() => setRecentEditId(null)}
                            style={{ padding: '5px 12px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                            onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                          >
                            <X size={12} /> Cancel
                          </button>
                          <button
                            onClick={() => saveRecentEditDescription(log.task_id)}
                            disabled={recentEditSaving}
                            style={{ padding: '5px 12px', border: 'none', background: recentEditSaving ? '#93c5fd' : '#3b82f6', color: '#fff', borderRadius: '6px', cursor: recentEditSaving ? 'not-allowed' : 'pointer', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s', boxShadow: '0 2px 6px rgba(59,130,246,0.3)' }}
                          >
                            <Check size={12} /> {recentEditSaving ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: '6px', display: 'flex', alignItems: 'flex-start', gap: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 12px' }}>
                        <div style={{ fontSize: '12px', color: '#1e293b', lineHeight: 1.6, flex: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 700, color: '#16a34a', marginRight: '6px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>📋 Description:</span>
                          {taskDesc ? (
                            <span style={{ color: '#0f172a', fontWeight: 500 }}>{taskDesc.length > 120 ? taskDesc.slice(0, 120) + '…' : taskDesc}</span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No description</span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRecentEditId(log.task_id);
                            setRecentEditValue(taskDesc);
                          }}
                          style={{
                            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px',
                            cursor: 'pointer', padding: '4px 8px', display: 'flex', alignItems: 'center',
                            gap: '4px', color: '#3b82f6', fontSize: '10px', fontWeight: 600,
                            transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
                          }}
                          title="Edit description inline"
                          onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; }}
                        >
                          <Edit2 size={11} /> Edit
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {/* ─── Completed Tasks Modal ─── */}
      {showCompletedModal && (
        <Modal title="All Completed Tasks" onClose={() => setShowCompletedModal(false)}>
          {(() => {
            const completedTasks = tasks.filter(t => {
              const sl = (t.status || '').toLowerCase();
              return sl.includes('complete') || sl.includes('closed') || sl.includes('filed') || sl.includes('done');
            });
            if (completedTasks.length === 0) return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No completed tasks yet</div>;
            return (
              <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      {['ID', 'Company', 'CR Number', 'Task Type', 'Status', 'Priority', 'Due Date'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', color: '#64748b' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {completedTasks.map(task => {
                      const company = companies.find(c => c.id === task.company_id);
                      const ttIds = task.task_type_ids && task.task_type_ids.length > 0 ? task.task_type_ids : (task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : []);
                      const ttNames = ttIds.map(id => taskTypes.find(t => t.id === id)?.name).filter(Boolean);
                      const pc = priorityColor(task.priority);
                      const sc = statusColor(task.status);
                      return (
                        <tr key={task.id} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                          title="Click to view task details"
                          onClick={() => { setShowCompletedModal(false); viewDetail(task.id); }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: '#475569' }}>#{task.id.slice(0, 6)}</td>
                          <td style={{ padding: '10px 12px', fontSize: '12px', color: '#1e293b', fontWeight: 500 }}>{company?.company_name || 'Unknown'}</td>
                          <td style={{ padding: '10px 12px', fontSize: '12px', color: '#64748b', fontWeight: 500 }}>{company?.cr_number || '—'}</td>
                          <td style={{ padding: '10px 12px', fontSize: '12px' }}>
                            {ttNames.length > 0 ? ttNames.map((name, i) => (
                              <span key={i} style={{ padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, background: '#EBF5FB', color: '#2980B9', border: '1px solid #AED6F1', marginRight: '4px' }}>{name}</span>
                            )) : '—'}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{task.status}</span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: pc.bg, color: pc.color }}>{task.priority}</span>
                          </td>
                          <td style={{ padding: '10px 12px', fontSize: '12px', color: '#475569' }}>{task.deadline || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '0 0 12px 12px', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                  Total: {completedTasks.length} completed task{completedTasks.length !== 1 ? 's' : ''}
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* ─── Task Type Distribution Modal ─── */}
      {showTaskTypeModal && (
        <Modal title="Task Type Distribution" onClose={() => setShowTaskTypeModal(false)}>
          {(() => {
            // Count tasks per task type
            const typeCount: Record<string, number> = {};
            tasks.forEach(t => {
              const ttIds = t.task_type_ids && t.task_type_ids.length > 0 ? t.task_type_ids : (t.task_type_id ? t.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : []);
              ttIds.forEach(id => { typeCount[id] = (typeCount[id] || 0) + 1; });
            });
            const total = tasks.length;
            const entries = Object.entries(typeCount)
              .map(([id, count]) => ({ id, name: taskTypes.find(t => t.id === id)?.name || 'Unknown', count }))
              .sort((a, b) => b.count - a.count);

            const barColors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#6366f1'];

            return (
              <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {entries.map((entry, i) => {
                    const pct = total > 0 ? ((entry.count / total) * 100) : 0;
                    const color = barColors[i % barColors.length];
                    return (
                      <div key={entry.id} onClick={() => { setShowTaskTypeModal(false); setFilterTaskType(entry.id); }}
                        style={{ cursor: 'pointer', padding: '10px 12px', borderRadius: '10px', transition: 'all 0.15s', border: '1px solid transparent' }}
                        title={`Click to filter by "${entry.name}"`}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f5f3ff'; e.currentTarget.style.borderColor = '#ddd6fe'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{entry.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{entry.count} tasks ({pct.toFixed(1)}%)</span>
                            <ArrowRight size={12} color="#c4b5fd" />
                          </div>
                        </div>
                        <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.6s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: '20px', padding: '12px 16px', background: '#f8fafc', borderRadius: '10px', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                  Total: {total} task{total !== 1 ? 's' : ''} across {entries.length} type{entries.length !== 1 ? 's' : ''}
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* ─── WhatsApp Message Generator Modal ─── */}
      {showStatusModal && (
        <Modal title="WhatsApp Task Dispatcher" onClose={() => setShowStatusModal(false)}>
          {(() => {
            // Collect all unique statuses and partners from tasks
            const allStatuses = [...new Set(tasks.map(t => t.status).filter(Boolean))] as string[];
            allStatuses.sort((a, b) => a.localeCompare(b));

            // Extract all unique partners assigned to any task
            const taskPartnerIds = new Set<string>();
            tasks.forEach(t => {
              if (t.assigned_to) taskPartnerIds.add(t.assigned_to);
              if (t.assigned_partners) t.assigned_partners.forEach(p => taskPartnerIds.add(p));
            });
            const allPartnerIds = [...taskPartnerIds];
            const allPartners = allPartnerIds.map(id => partners.find(p => p.id === id)).filter(Boolean) as User[];
            allPartners.sort((a, b) => a.username.localeCompare(b.username));

            // Filtered lists by search
            const filteredStatuses = allStatuses.filter(s => s.toLowerCase().includes(waGenStatusSearch.toLowerCase()));
            const filteredPartners = allPartners.filter(p => p.username.toLowerCase().includes(waGenPartnerSearch.toLowerCase()));

            // Toggle a status in the multi-select array
            const toggleStatus = (status: string) => {
              setWaGenStatuses(prev =>
                prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
              );
              setWaGenCopied(false);
            };

            const togglePartner = (partnerId: string) => {
              setWaGenPartners(prev =>
                prev.includes(partnerId) ? prev.filter(p => p !== partnerId) : [...prev, partnerId]
              );
              setWaGenCopied(false);
            };

            // Select / deselect all statuses
            const toggleAllStatuses = () => {
              if (waGenStatuses.length === allStatuses.length) {
                setWaGenStatuses([]);
              } else {
                setWaGenStatuses([...allStatuses]);
              }
              setWaGenCopied(false);
            };

            // Select / deselect all partners
            const toggleAllPartners = () => {
              if (waGenPartners.length === allPartners.length) {
                setWaGenPartners([]);
              } else {
                setWaGenPartners(allPartners.map(p => p.id));
              }
              setWaGenCopied(false);
            };

            // Quick preset: Select urgent tasks only
            const selectUrgentTasks = () => {
              const urgentStatuses = [...new Set(tasks.filter(t => t.priority === 'Urgent' && t.status).map(t => t.status!))];
              setWaGenStatuses(urgentStatuses);
              setWaGenPartners([]);
              setWaGenCopied(false);
            };

            // Quick preset: Select pending tasks
            const selectPendingTasks = () => {
              const pendingStatuses = allStatuses.filter(s => {
                const sl = s.toLowerCase();
                return !sl.includes('complete') && !sl.includes('closed') && !sl.includes('filed') && !sl.includes('done');
              });
              setWaGenStatuses(pendingStatuses);
              setWaGenPartners([]);
              setWaGenCopied(false);
            };

            // Tasks matching any of the selected statuses AND selected partners
            const matchingTasks = (waGenStatuses.length > 0 || waGenPartners.length > 0)
              ? tasks.filter(t => {
                  const statusMatch = waGenStatuses.length === 0 || waGenStatuses.includes(t.status || '');
                  const partnerMatch = waGenPartners.length === 0 || waGenPartners.includes(t.assigned_to || '') || (t.assigned_partners && t.assigned_partners.some(p => waGenPartners.includes(p)));
                  return statusMatch && partnerMatch;
                })
              : [];

            // Build the WhatsApp message — grouped by status or partner or compact list
            const buildMessage = () => {
              if ((waGenStatuses.length === 0 && waGenPartners.length === 0) || matchingTasks.length === 0) return '';

              // Helper to resolve assigned names
              const getAssignedNames = (task: Task) => {
                const activePartnerIds = task.assigned_partners && task.assigned_partners.length > 0 
                  ? task.assigned_partners 
                  : (task.assigned_to ? [task.assigned_to] : []);
                const allNames = activePartnerIds.map((id: string) => partners.find((p: any) => p.id === id)?.username).filter(Boolean);
                return allNames.length > 0 ? allNames.join(', ') : 'Unassigned';
              };

              // Helper to resolve audit type (task type names)
              const getAuditType = (task: Task) => {
                const ttIds = task.task_type_ids && task.task_type_ids.length > 0 ? task.task_type_ids : (task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : []);
                return ttIds.map(id => taskTypes.find(t => t.id === id)?.name).filter(Boolean).join(', ') || 'N/A';
              };

              const formatTask = (task: Task, idx: number, lines: string[]) => {
                const comp = companies.find(c => c.id === task.company_id);
                
                if (idx > 0) {
                  lines.push('──────────────────────────────────');
                  lines.push('');
                }
                
                lines.push(`*${idx + 1}. Company:* ${comp?.company_name || 'Unknown'}`);
                if (waGenIncludeCr && comp?.cr_number) {
                  lines.push(`*CR Number:* ${comp.cr_number}`);
                }
                lines.push(`*Audit Type:* ${getAuditType(task)}`);
                lines.push(`*Assigned To:* ${getAssignedNames(task)}`);
                lines.push(`*Status:* ${task.status || 'N/A'}`);
                if (waGenIncludePriority && task.priority) {
                  lines.push(`*Priority:* ${task.priority}`);
                }
                if (waGenIncludeAuditor && task.auditor_id) {
                  const aud = auditors.find(a => a.id === task.auditor_id);
                  if (aud) lines.push(`*Auditor:* ${aud.name}`);
                }
                if (waGenIncludeDesc && task.description && task.description.trim() !== '') {
                  lines.push(`*Description:* ${task.description}`);
                }
                lines.push('');
              };

              const sections: string[] = [];
              const countryTitle = dataCountry ? ` • ${dataCountry}` : '';
              sections.push(`📋 *COMPLIANCE & TASK SUMMARY${countryTitle.toUpperCase()}*`);
              sections.push(`Generated on: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} • Total: ${matchingTasks.length} task${matchingTasks.length !== 1 ? 's' : ''}`);
              sections.push('');

              if (waGenGroupBy === 'compact') {
                sections.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                matchingTasks.forEach((task, idx) => formatTask(task, idx, sections));
              } else if (waGenGroupBy === 'partner' || (waGenPartners.length > 0 && waGenStatuses.length === 0)) {
                // Group by partner
                const partnerIdsToGroup = waGenPartners.length > 0 ? waGenPartners : allPartnerIds;
                partnerIdsToGroup.forEach(partnerId => {
                  const partner = partners.find(p => p.id === partnerId);
                  const partnerTasks = matchingTasks.filter(t => {
                    const activeIds = t.assigned_partners && t.assigned_partners.length > 0
                      ? t.assigned_partners
                      : (t.assigned_to ? [t.assigned_to] : []);
                    return activeIds.includes(partnerId);
                  });
                  if (partnerTasks.length === 0) return;
                  sections.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                  sections.push(`👤 *Staff: ${partner?.username || 'Unknown'}* (${partnerTasks.length} task${partnerTasks.length !== 1 ? 's' : ''})`);
                  sections.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                  sections.push('');
                  partnerTasks.forEach((task, idx) => formatTask(task, idx, sections));
                });
              } else {
                // Group by status (default)
                const statusesToGroup = waGenStatuses.length > 0 ? waGenStatuses : allStatuses;
                statusesToGroup.forEach(status => {
                  const statusTasks = matchingTasks.filter(t => t.status === status);
                  if (statusTasks.length === 0) return;
                  sections.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                  sections.push(`📌 *Status: ${status}* (${statusTasks.length} task${statusTasks.length !== 1 ? 's' : ''})`);
                  sections.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                  sections.push('');
                  statusTasks.forEach((task, idx) => formatTask(task, idx, sections));
                });
              }

              sections.push('──────────────────────────────────');
              sections.push('_Generated via The Digital Ledger_');

              return sections.join('\n').trim();
            };

            const message = buildMessage();
            const allStatusesSelected = waGenStatuses.length === allStatuses.length && allStatuses.length > 0;
            const allPartnersSelected = waGenPartners.length === allPartners.length && allPartners.length > 0;
            const urgentCount = tasks.filter(t => t.priority === 'Urgent').length;
            const completedCount = tasks.filter(t => {
              const sl = (t.status || '').toLowerCase();
              return sl.includes('complete') || sl.includes('closed') || sl.includes('filed') || sl.includes('done');
            }).length;

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Hero Header Banner */}
                <div style={{
                  background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)',
                  borderRadius: '16px',
                  padding: '20px 22px',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  boxShadow: '0 8px 24px rgba(4, 120, 87, 0.22)',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '14px',
                    background: 'rgba(255, 255, 255, 0.16)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 4px 14px rgba(0,0,0,0.15)'
                  }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="#25D366">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#4ade80' }} />
                        Dispatch Engine
                      </span>
                      <span style={{ fontSize: '11px', color: '#a7f3d0', fontWeight: 600 }}>
                        {matchingTasks.length} task{matchingTasks.length !== 1 ? 's' : ''} targeted
                      </span>
                    </div>
                    <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 2px', letterSpacing: '-0.02em', color: '#ffffff' }}>
                      WhatsApp Compliance Summary
                    </h3>
                    <p style={{ fontSize: '12.5px', color: '#d1fae5', margin: 0, opacity: 0.9 }}>
                      Select statuses and team members below to instantly compile formatted updates.
                    </p>
                  </div>
                </div>

                {/* Quick Presets Toolbar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Quick Presets:
                  </span>
                  <button
                    type="button"
                    onClick={selectPendingTasks}
                    style={{
                      padding: '5px 11px', borderRadius: '8px', border: '1px solid var(--border)',
                      background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600,
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-light)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                  >
                    <Clock size={12} color="var(--accent)" /> Active / Pending
                  </button>
                  <button
                    type="button"
                    onClick={selectUrgentTasks}
                    style={{
                      padding: '5px 11px', borderRadius: '8px', border: '1px solid var(--border)',
                      background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600,
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                  >
                    <span style={{ color: '#ef4444' }}>●</span> Urgent ({urgentCount})
                  </button>
                  <button
                    type="button"
                    onClick={toggleAllStatuses}
                    style={{
                      padding: '5px 11px', borderRadius: '8px', border: '1px solid var(--border)',
                      background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600,
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                  >
                    <CheckSquare size={12} color="#10b981" /> {allStatusesSelected ? 'Deselect All Statuses' : 'All Statuses'}
                  </button>
                  {(waGenStatuses.length > 0 || waGenPartners.length > 0) && (
                    <button
                      type="button"
                      onClick={() => { setWaGenStatuses([]); setWaGenPartners([]); setWaGenCopied(false); }}
                      style={{
                        padding: '5px 11px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)',
                        background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontSize: '12px', fontWeight: 600,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px',
                        marginLeft: 'auto'
                      }}
                    >
                      <RotateCcw size={12} /> Reset
                    </button>
                  )}
                </div>

                {/* Dual Filter Selectors */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {/* Left Column: Status Selector */}
                  <div style={{
                    background: 'var(--bg-tertiary)',
                    borderRadius: '14px',
                    border: '1px solid var(--border)',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Target Statuses
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-light)', padding: '1px 6px', borderRadius: '10px' }}>
                          {waGenStatuses.length}/{allStatuses.length}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={toggleAllStatuses}
                        style={{
                          background: 'transparent', border: 'none', color: 'var(--accent)',
                          fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', padding: '2px 4px'
                        }}
                      >
                        {allStatusesSelected ? 'Clear' : 'Select All'}
                      </button>
                    </div>

                    {/* Status Search */}
                    <div style={{ position: 'relative' }}>
                      <Search size={13} color="var(--text-tertiary)" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)' }} />
                      <input
                        type="text"
                        placeholder="Search statuses..."
                        value={waGenStatusSearch}
                        onChange={e => setWaGenStatusSearch(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 10px 6px 28px',
                          borderRadius: '8px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          fontSize: '12px',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    {/* Statuses List */}
                    <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px', paddingRight: '2px' }}>
                      {filteredStatuses.map(s => {
                        const count = tasks.filter(t => t.status === s).length;
                        const isChecked = waGenStatuses.includes(s);
                        const sc = statusColor(s);
                        return (
                          <div
                            key={s}
                            onClick={() => toggleStatus(s)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              background: isChecked ? 'var(--bg-secondary)' : 'transparent',
                              border: isChecked ? '1px solid var(--accent)' : '1px solid transparent',
                              boxShadow: isChecked ? 'var(--card-shadow)' : 'none',
                              transition: 'all 0.12s ease'
                            }}
                            onMouseEnter={e => { if (!isChecked) e.currentTarget.style.background = 'var(--bg-card, var(--bg-secondary))'; }}
                            onMouseLeave={e => { if (!isChecked) e.currentTarget.style.background = 'transparent'; }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                              <div style={{
                                width: '16px', height: '16px', borderRadius: '4px',
                                border: isChecked ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
                                background: isChecked ? 'var(--accent)' : 'var(--bg-secondary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0
                              }}>
                                {isChecked && <Check size={11} color="#ffffff" strokeWidth={3} />}
                              </div>
                              <span style={{
                                padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 650,
                                background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                                maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                              }}>
                                {s}
                              </span>
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                              {count}
                            </span>
                          </div>
                        );
                      })}
                      {filteredStatuses.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                          No statuses match search
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Partner Selector */}
                  <div style={{
                    background: 'var(--bg-tertiary)',
                    borderRadius: '14px',
                    border: '1px solid var(--border)',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Target Staff
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-light)', padding: '1px 6px', borderRadius: '10px' }}>
                          {waGenPartners.length}/{allPartners.length}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={toggleAllPartners}
                        style={{
                          background: 'transparent', border: 'none', color: 'var(--accent)',
                          fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', padding: '2px 4px'
                        }}
                      >
                        {allPartnersSelected ? 'Clear' : 'Select All'}
                      </button>
                    </div>

                    {/* Partner Search */}
                    <div style={{ position: 'relative' }}>
                      <Search size={13} color="var(--text-tertiary)" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)' }} />
                      <input
                        type="text"
                        placeholder="Search staff..."
                        value={waGenPartnerSearch}
                        onChange={e => setWaGenPartnerSearch(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 10px 6px 28px',
                          borderRadius: '8px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          fontSize: '12px',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    {/* Partner List */}
                    <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px', paddingRight: '2px' }}>
                      {filteredPartners.map(p => {
                        const count = tasks.filter(t => {
                          const activeIds = t.assigned_partners && t.assigned_partners.length > 0
                            ? t.assigned_partners
                            : (t.assigned_to ? [t.assigned_to] : []);
                          return activeIds.includes(p.id);
                        }).length;
                        const isChecked = waGenPartners.includes(p.id);
                        return (
                          <div
                            key={p.id}
                            onClick={() => togglePartner(p.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              background: isChecked ? 'var(--bg-secondary)' : 'transparent',
                              border: isChecked ? '1px solid var(--accent)' : '1px solid transparent',
                              boxShadow: isChecked ? 'var(--card-shadow)' : 'none',
                              transition: 'all 0.12s ease'
                            }}
                            onMouseEnter={e => { if (!isChecked) e.currentTarget.style.background = 'var(--bg-card, var(--bg-secondary))'; }}
                            onMouseLeave={e => { if (!isChecked) e.currentTarget.style.background = 'transparent'; }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                              <div style={{
                                width: '16px', height: '16px', borderRadius: '4px',
                                border: isChecked ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
                                background: isChecked ? 'var(--accent)' : 'var(--bg-secondary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0
                              }}>
                                {isChecked && <Check size={11} color="#ffffff" strokeWidth={3} />}
                              </div>
                              <div style={{
                                width: '22px', height: '22px', borderRadius: '50%',
                                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                                color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '10px', fontWeight: 750, flexShrink: 0
                              }}>
                                {p.username.substring(0, 1).toUpperCase()}
                              </div>
                              <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.username}
                              </span>
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                              {count}
                            </span>
                          </div>
                        );
                      })}
                      {filteredPartners.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                          No staff found
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Formatting Options Bar */}
                <div style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap'
                }}>
                  {/* Grouping */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Grouping:
                    </span>
                    {(['status', 'partner', 'compact'] as const).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setWaGenGroupBy(mode)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: waGenGroupBy === mode ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                          background: waGenGroupBy === mode ? 'var(--accent-light)' : 'var(--bg-secondary)',
                          color: waGenGroupBy === mode ? 'var(--accent)' : 'var(--text-secondary)',
                          fontSize: '11.5px',
                          fontWeight: waGenGroupBy === mode ? 700 : 500,
                          cursor: 'pointer',
                          textTransform: 'capitalize'
                        }}
                      >
                        {mode === 'partner' ? 'By Staff' : mode === 'status' ? 'By Status' : 'Compact'}
                      </button>
                    ))}
                  </div>

                  {/* Include Toggles */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={waGenIncludeCr} onChange={e => setWaGenIncludeCr(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                      CR Number
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={waGenIncludeDesc} onChange={e => setWaGenIncludeDesc(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                      Description
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={waGenIncludePriority} onChange={e => setWaGenIncludePriority(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                      Priority
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={waGenIncludeAuditor} onChange={e => setWaGenIncludeAuditor(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                      Auditor
                    </label>
                  </div>
                </div>

                {/* Message Preview or Empty State */}
                {matchingTasks.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '36px 20px',
                    borderRadius: '14px',
                    background: '#f8fafc',
                    border: '1px dashed #cbd5e1',
                    color: '#64748b'
                  }}>
                    <MessageSquare size={32} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                      No tasks selected for WhatsApp message
                    </div>
                    <div style={{ fontSize: '12.5px', color: '#94a3b8' }}>
                      Select one or more statuses / staff members above or click a Quick Preset to generate your broadcast.
                    </div>
                  </div>
                ) : (
                  <div>
                    {/* WhatsApp Chat Bubble Live Preview */}
                    <div style={{
                      borderRadius: '14px',
                      border: '1px solid #bbf7d0',
                      background: '#f0fdf4',
                      overflow: 'hidden',
                      boxShadow: '0 4px 16px rgba(34, 197, 94, 0.08)'
                    }}>
                      {/* Preview Header Bar */}
                      <div style={{
                        background: 'linear-gradient(135deg, #15803d, #166534)',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        color: '#ffffff'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <MessageSquare size={14} color="#86efac" />
                          <span style={{ fontSize: '12px', fontWeight: 750, letterSpacing: '0.02em' }}>
                            WhatsApp Message Live Preview
                          </span>
                          <span style={{ background: 'rgba(255,255,255,0.2)', fontSize: '11px', fontWeight: 700, padding: '1px 7px', borderRadius: '10px' }}>
                            {matchingTasks.length} task{matchingTasks.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(message).then(() => {
                              setWaGenCopied(true);
                              setTimeout(() => setWaGenCopied(false), 2500);
                            });
                          }}
                          style={{
                            background: 'rgba(255,255,255,0.18)',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#ffffff',
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          {waGenCopied ? <Check size={12} /> : <Copy size={12} />}
                          {waGenCopied ? 'Copied' : 'Quick Copy'}
                        </button>
                      </div>

                      {/* Chat text content */}
                      <div style={{ padding: '14px 16px', maxHeight: '230px', overflowY: 'auto' }}>
                        <pre style={{
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          fontSize: '12px',
                          lineHeight: 1.6,
                          color: '#0f172a',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          margin: 0
                        }}>
                          {message}
                        </pre>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(message).then(() => {
                            setWaGenCopied(true);
                            setTimeout(() => setWaGenCopied(false), 2500);
                          });
                        }}
                        style={{
                          flex: 1,
                          padding: '12px 18px',
                          borderRadius: '12px',
                          border: '1.5px solid #cbd5e1',
                          background: waGenCopied ? '#f0fdf4' : '#ffffff',
                          color: waGenCopied ? '#16a34a' : '#1e293b',
                          fontWeight: 700,
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          transition: 'all 0.15s ease',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}
                      >
                        {waGenCopied ? <CheckCheck size={16} color="#16a34a" /> : <Copy size={16} color="#475569" />}
                        {waGenCopied ? 'Copied to Clipboard!' : 'Copy Formatted Message'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
                        }}
                        style={{
                          flex: 1.2,
                          padding: '12px 20px',
                          borderRadius: '12px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                          color: '#ffffff',
                          fontWeight: 750,
                          fontSize: '13.5px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          boxShadow: '0 4px 16px rgba(34, 197, 94, 0.35)',
                          transition: 'all 0.18s ease'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 6px 20px rgba(34, 197, 94, 0.45)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.boxShadow = '0 4px 16px rgba(34, 197, 94, 0.35)';
                        }}
                      >
                        <Send size={16} /> Open in WhatsApp & Send
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </Modal>
      )}

      {/* Tasks Table — Desktop View (>768px) */}
      <div className="desktop-task-view" style={{ width: '100%', maxWidth: '100%', minWidth: 0 }}>
        <div className="task-table-wrap" style={{
          width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto', borderRadius: '18px',
          boxShadow: 'var(--card-shadow)',
          border: '1px solid var(--border)', background: 'var(--bg-card, var(--bg-secondary))',
          WebkitOverflowScrolling: 'touch'
        }}>
          <table style={{ width: '100%', minWidth: '100%', borderCollapse: 'collapse', background: 'var(--bg-card, var(--bg-secondary))', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{
                background: 'var(--bg-tertiary)',
                borderBottom: '1.5px solid var(--border)'
              }}>
                {multiSelectMode && (
                  <th style={{
                    padding: '10px 4px', textAlign: 'center', width: '34px', minWidth: '34px', maxWidth: '34px',
                    borderBottom: '1.5px solid var(--border)'
                  }}>
                    <input
                      type="checkbox"
                      checked={isAllFilteredSelected}
                      ref={el => { if (el) el.indeterminate = isSomeFilteredSelected; }}
                      onChange={e => {
                        if (e.target.checked) selectAllFiltered();
                        else deselectAll();
                      }}
                      style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: 'var(--accent)' }}
                      title={isAllFilteredSelected ? 'Deselect All' : 'Select All Filtered'}
                    />
                  </th>
                )}
                {visibleColumns.length === 0 ? (
                  <th style={{
                    padding: '12px 14px', textAlign: 'left',
                    fontSize: '11.5px', fontWeight: 700, color: '#dc2626',
                    borderBottom: '1.5px solid var(--border)'
                  }}>
                    No Columns Visible (Enable columns in Columns menu or Settings)
                  </th>
                ) : (
                  visibleColumns.map((col) => {
                    const isActions = col.id === 'actions';
                    const colCfg = getColumnColorConfig(col.id);
                    const getHeaderWidth = (id: string) => {
                      switch (id) {
                        case 'actions': return '38px';
                        case 'pl': return '9%';
                        case 'company': return '14%';
                        case 'cr_number': return '8%';
                        case 'task_type': return '8.5%';
                        case 'description': return '17%';
                        case 'desc_updated': return '8%';
                        case 'priority': return '6.5%';
                        case 'deadline': return '9.5%';
                        case 'status': return '9.5%';
                        case 'auditor': return '7%';
                        case 'assigned_to': return '9.5%';
                        default: return 'auto';
                      }
                    };

                    return (
                      <th key={col.id} style={{
                        padding: isActions ? '10px 2px' : '10px 6px',
                        textAlign: (isActions ? 'center' : col.align) as any,
                        fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.04em', color: isDark ? colCfg.headerColor : 'var(--text-secondary)', whiteSpace: 'nowrap',
                        borderBottom: isDark ? `2px solid ${colCfg.tagBorder || 'var(--border)'}` : '1.5px solid var(--border)',
                        width: isActions ? '38px' : getHeaderWidth(col.id),
                        maxWidth: isActions ? '40px' : undefined,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {isActions ? '' : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: colCfg.dotColor, display: isDark ? 'inline-block' : 'none', flexShrink: 0, boxShadow: `0 0 6px ${colCfg.dotColor}` }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{col.shortLabel !== undefined && col.shortLabel !== '' ? col.shortLabel : col.label}</span>
                          </span>
                        )}
                      </th>
                    );
                  })
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(1, visibleColumns.length) + (multiSelectMode ? 1 : 0)} style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--text-tertiary)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ListTodo size={28} color="var(--text-tertiary)" />
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 650, color: 'var(--text-primary)' }}>No matching tasks found</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Try adjusting your filters or search keywords</div>
                    </div>
                  </td>
                </tr>
              ) : paginatedTasks.map(task => {
                const company = companies.find(c => c.id === task.company_id);
                const ttIds: string[] = task.task_type_ids && task.task_type_ids.length > 0 ? task.task_type_ids : (task.task_type_id ? task.task_type_id.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
                const ttNames = ttIds.map(id => taskTypes.find(t => t.id === id)?.name).filter(Boolean);
                const statusOptions = getStatusesForTask(ttIds, statusObjects, dynamicStatuses);
                if (task.status && !statusOptions.includes(task.status)) {
                  statusOptions.push(task.status);
                  statusOptions.sort((a, b) => a.localeCompare(b));
                }
                const pc = priorityColor(task.priority);
                const isMenuOpen = openMenuId === task.id;
                const isSelected = selectedTaskIds.includes(task.id);

                return (
                  <tr key={task.id} style={{
                    borderBottom: '1px solid var(--border-light)',
                    background: isSelected ? 'var(--accent-light)' : 'transparent',
                    transition: 'background 0.15s cubic-bezier(0.16, 1, 0.3, 1)'
                  }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
                    {multiSelectMode && (
                      <td style={{ ...compactCell, textAlign: 'center', width: '34px', maxWidth: '34px', padding: '8px 2px', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectTask(task.id)}
                          style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: 'var(--accent)' }}
                        />
                      </td>
                    )}

                    {/* Render Columns Dynamically in User-Defined Order */}
                    {visibleColumns.map((col) => {
                      switch (col.id) {
                        case 'pl':
                          const isEditingPl = inlineEditPlTaskId === task.id;
                          return (
                            <td
                              key={`pl-${task.id}`}
                              style={{ ...compactCell, overflow: 'hidden', textOverflow: 'ellipsis' }}
                              onMouseEnter={() => setHoveredPlTaskId(task.id)}
                              onMouseLeave={() => setHoveredPlTaskId(null)}
                            >
                              {isEditingPl ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', width: '100%', minWidth: 0 }} onClick={e => e.stopPropagation()}>
                                  <input
                                    type="date"
                                    autoFocus
                                    value={inlineEditPlValue}
                                    onChange={e => setInlineEditPlValue(e.target.value)}
                                    onBlur={() => handlePlDateChange(task.id, inlineEditPlValue)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handlePlDateChange(task.id, inlineEditPlValue);
                                      if (e.key === 'Escape') setInlineEditPlTaskId(null);
                                    }}
                                    style={{
                                      padding: '2px 4px',
                                      borderRadius: '5px',
                                      border: isDark ? '1.5px solid #818cf8' : '1.5px solid #2563eb',
                                      fontSize: '10.5px',
                                      fontWeight: 600,
                                      outline: 'none',
                                      background: isDark ? 'var(--bg-secondary)' : '#ffffff',
                                      color: isDark ? 'var(--text-primary)' : '#0f172a',
                                      fontFamily: 'ui-monospace, monospace',
                                      boxShadow: isDark ? '0 2px 8px rgba(99, 102, 241, 0.25)' : '0 2px 8px rgba(37,99,235,0.2)',
                                      width: '100%',
                                      minWidth: 0
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      handlePlDateChange(task.id, null);
                                    }}
                                    title="Clear PL Date"
                                    style={{
                                      background: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2',
                                      border: 'none',
                                      borderRadius: '4px',
                                      color: isDark ? '#ef4444' : '#dc2626',
                                      cursor: 'pointer',
                                      padding: '3px 4px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      flexShrink: 0
                                    }}
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              ) : task.pl_date ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInlineEditPlTaskId(task.id);
                                    setInlineEditPlValue(task.pl_date || '');
                                  }}
                                  title={`PL Date: ${formatPlDateDisplay(task.pl_date)} (Click to edit)`}
                                  style={{
                                    padding: '2px 5px',
                                    borderRadius: '5px',
                                    border: isDark ? '1px solid rgba(99, 102, 241, 0.45)' : '1px solid #bfdbfe',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    fontWeight: 650,
                                    transition: 'all 0.15s ease',
                                    background: isDark ? 'rgba(99, 102, 241, 0.15)' : '#eff6ff',
                                    color: isDark ? '#a5b4fc' : '#1d4ed8',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    whiteSpace: 'nowrap',
                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                    boxShadow: isDark ? '0 1px 3px rgba(99, 102, 241, 0.15)' : '0 1px 2px rgba(37,99,235,0.05)'
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                    e.currentTarget.style.borderColor = isDark ? '#818cf8' : '#3b82f6';
                                    e.currentTarget.style.boxShadow = isDark ? '0 3px 8px rgba(99, 102, 241, 0.3)' : '0 3px 8px rgba(37,99,235,0.15)';
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'none';
                                    e.currentTarget.style.borderColor = isDark ? 'rgba(99, 102, 241, 0.45)' : '#bfdbfe';
                                    e.currentTarget.style.boxShadow = isDark ? '0 1px 3px rgba(99, 102, 241, 0.15)' : '0 1px 2px rgba(37,99,235,0.05)';
                                  }}
                                >
                                  <Calendar size={10} color={isDark ? '#818cf8' : '#2563eb'} style={{ flexShrink: 0 }} />
                                  <span style={{ whiteSpace: 'nowrap' }}>{formatPlDateDisplay(task.pl_date)}</span>
                                  {hoveredPlTaskId === task.id && <Edit2 size={8} color={isDark ? '#818cf8' : '#3b82f6'} style={{ marginLeft: '1px', flexShrink: 0 }} />}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInlineEditPlTaskId(task.id);
                                    setInlineEditPlValue(new Date().toISOString().split('T')[0]);
                                  }}
                                  title="Set Proposal / Engagement Letter Date"
                                  style={{
                                    padding: '2px 5px',
                                    borderRadius: '5px',
                                    border: isDark ? '1px dashed rgba(99, 102, 241, 0.4)' : '1px dashed #cbd5e1',
                                    cursor: 'pointer',
                                    fontSize: '10px',
                                    fontWeight: 550,
                                    transition: 'all 0.15s ease',
                                    background: isDark ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                                    color: isDark ? '#818cf8' : '#94a3b8',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    whiteSpace: 'nowrap',
                                    maxWidth: '100%'
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.borderColor = isDark ? '#818cf8' : '#3b82f6';
                                    e.currentTarget.style.color = isDark ? '#a5b4fc' : '#2563eb';
                                    e.currentTarget.style.background = isDark ? 'rgba(99, 102, 241, 0.18)' : '#f0f7ff';
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = isDark ? 'rgba(99, 102, 241, 0.4)' : '#cbd5e1';
                                    e.currentTarget.style.color = isDark ? '#818cf8' : '#94a3b8';
                                    e.currentTarget.style.background = isDark ? 'rgba(99, 102, 241, 0.08)' : 'transparent';
                                  }}
                                >
                                  <Calendar size={9} style={{ flexShrink: 0 }} />
                                  <span>Set</span>
                                </button>
                              )}
                            </td>
                          );

                        case 'company':
                          const hasDrive = !!(company?.google_drive_link && company.google_drive_link.trim() !== '');
                          const isCompHovered = hoveredCompanyTaskId === task.id;
                          const driveUrl = hasDrive ? formatExternalUrl(company.google_drive_link) : '';

                          return (
                            <td
                              key={`comp-${task.id}`}
                              style={{ ...compactCell, overflow: 'hidden' }}
                              onMouseEnter={() => setHoveredCompanyTaskId(task.id)}
                              onMouseLeave={() => setHoveredCompanyTaskId(null)}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%', minWidth: 0, overflow: 'hidden' }}>
                                {hasDrive ? (
                                  <a
                                    href={driveUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    title={`Open Google Drive for ${company?.company_name || 'Company'}`}
                                    style={{
                                      fontWeight: 650,
                                      fontSize: '12px',
                                      color: isCompHovered ? (isDark ? '#38bdf8' : '#16a34a') : 'var(--text-primary)',
                                      textDecoration: isCompHovered ? 'underline' : 'none',
                                      textUnderlineOffset: '2px',
                                      cursor: 'pointer',
                                      display: 'inline-block',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      flex: 1,
                                      minWidth: 0,
                                      letterSpacing: '-0.01em',
                                      transition: 'all 0.15s ease'
                                    }}
                                  >
                                    {company?.company_name || 'Unknown'}
                                  </a>
                                ) : (
                                  <span
                                    style={{
                                      fontWeight: 650,
                                      fontSize: '12px',
                                      color: 'var(--text-primary)',
                                      display: 'inline-block',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      flex: 1,
                                      minWidth: 0,
                                      letterSpacing: '-0.01em'
                                    }}
                                    title={company?.company_name || 'Unknown'}
                                  >
                                    {company?.company_name || 'Unknown'}
                                  </span>
                                )}

                                {hasDrive && (
                                  <a
                                    href={driveUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    title={`Google Drive: ${company.google_drive_link}`}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      width: '18px',
                                      height: '18px',
                                      borderRadius: '4px',
                                      background: isDark ? 'rgba(34, 197, 94, 0.18)' : '#f0fdf4',
                                      border: isDark ? '1px solid rgba(34, 197, 94, 0.45)' : '1px solid #bbf7d0',
                                      boxShadow: '0 1px 3px rgba(22, 163, 74, 0.15)',
                                      flexShrink: 0,
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                      padding: '2px'
                                    }}
                                    onMouseEnter={e => {
                                      e.currentTarget.style.transform = 'scale(1.1)';
                                      e.currentTarget.style.background = isDark ? 'rgba(34, 197, 94, 0.3)' : '#dcfce7';
                                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(34, 197, 94, 0.35)';
                                    }}
                                    onMouseLeave={e => {
                                      e.currentTarget.style.transform = 'scale(1)';
                                      e.currentTarget.style.background = isDark ? 'rgba(34, 197, 94, 0.18)' : '#f0fdf4';
                                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(22, 163, 74, 0.15)';
                                    }}
                                  >
                                    <GoogleDriveIcon size={11} />
                                  </a>
                                )}
                              </div>
                            </td>
                          );

                        case 'cr_number':
                          const hasCrLink = !!(company?.cr_link && company.cr_link.trim() !== '');
                          const isCrHovered = hoveredCrTaskId === task.id;
                          const crUrl = hasCrLink ? formatExternalUrl(company.cr_link) : '';

                          return (
                            <td
                              key={`cr-${task.id}`}
                              style={{ ...compactCell, overflow: 'hidden', position: 'relative', cursor: (canManageTask(task) && company) ? 'pointer' : 'default' }}
                              onMouseEnter={() => setHoveredCrTaskId(task.id)}
                              onMouseLeave={() => setHoveredCrTaskId(null)}
                            >
                              {inlineEditCrId === task.id ? (
                                <div
                                  onClick={e => e.stopPropagation()}
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                    minWidth: '180px',
                                    position: 'absolute',
                                    zIndex: 20,
                                    background: isDark ? 'var(--bg-card, var(--bg-secondary))' : '#ffffff',
                                    padding: '8px',
                                    borderRadius: '8px',
                                    boxShadow: isDark ? '0 16px 36px rgba(0,0,0,0.45)' : '0 12px 30px rgba(15, 23, 42, 0.18)',
                                    border: isDark ? '1px solid var(--accent)' : '1px solid #93c5fd',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    left: '4px'
                                  }}
                                >
                                  <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span>Edit CR</span>
                                    <button
                                      onClick={() => setInlineEditCrId(null)}
                                      style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '1px' }}
                                    >
                                      <X size={11} />
                                    </button>
                                  </div>
                                  <input
                                    autoFocus
                                    type="text"
                                    value={inlineEditCrValue}
                                    onChange={e => setInlineEditCrValue(e.target.value)}
                                    placeholder="CR Number"
                                    style={{
                                      padding: '3px 6px',
                                      fontSize: '10.5px',
                                      borderRadius: '5px',
                                      border: '1px solid var(--border)',
                                      background: isDark ? 'var(--bg-tertiary)' : '#ffffff',
                                      color: 'var(--text-primary)',
                                      outline: 'none',
                                      fontFamily: 'ui-monospace, monospace'
                                    }}
                                    onKeyDown={e => {
                                      if (e.key === 'Escape') setInlineEditCrId(null);
                                      if (e.key === 'Enter' && company) saveInlineCrNumber(company.id, task.id);
                                    }}
                                  />
                                  <input
                                    type="text"
                                    value={inlineEditCrLinkValue}
                                    onChange={e => setInlineEditCrLinkValue(e.target.value)}
                                    placeholder="URL (optional)"
                                    style={{
                                      padding: '3px 6px',
                                      fontSize: '10.5px',
                                      borderRadius: '5px',
                                      border: '1px solid var(--border)',
                                      background: isDark ? 'var(--bg-tertiary)' : '#ffffff',
                                      color: 'var(--text-primary)',
                                      outline: 'none'
                                    }}
                                    onKeyDown={e => {
                                      if (e.key === 'Escape') setInlineEditCrId(null);
                                      if (e.key === 'Enter' && company) saveInlineCrNumber(company.id, task.id);
                                    }}
                                  />
                                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', marginTop: '2px' }}>
                                    <button
                                      type="button"
                                      onClick={() => setInlineEditCrId(null)}
                                      style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => { if (company) saveInlineCrNumber(company.id, task.id); }}
                                      style={{ padding: '2px 8px', borderRadius: '4px', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', width: '100%', minWidth: 0, overflow: 'hidden' }}>
                                  {company?.cr_number ? (
                                    <span
                                      onClick={() => {
                                        if (canManageTask(task) && company) {
                                          setInlineEditCrId(task.id);
                                          setInlineEditCrValue(company.cr_number || '');
                                          setInlineEditCrLinkValue(company.cr_link || '');
                                        }
                                      }}
                                      style={{
                                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        color: isDark ? '#cbd5e1' : '#334155',
                                        background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
                                        padding: '1.5px 4px',
                                        borderRadius: '4px',
                                        border: '1px solid var(--border)',
                                        display: 'inline-block',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        flex: 1,
                                        minWidth: 0,
                                        letterSpacing: '-0.01em'
                                      }}
                                      title={canManageTask(task) ? `${company.cr_number} (Click to edit)` : company.cr_number}
                                    >
                                      {company.cr_number}
                                    </span>
                                  ) : (
                                    canManageTask(task) && company && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setInlineEditCrId(task.id);
                                          setInlineEditCrValue('');
                                          setInlineEditCrLinkValue('');
                                        }}
                                        title="Add CR Number"
                                        style={{
                                          padding: '1.5px 4px',
                                          borderRadius: '4px',
                                          border: isDark ? '1px dashed rgba(245, 158, 11, 0.4)' : '1px dashed #cbd5e1',
                                          cursor: 'pointer',
                                          fontSize: '10px',
                                          fontWeight: 550,
                                          background: isDark ? 'rgba(245, 158, 11, 0.08)' : 'transparent',
                                          color: isDark ? '#fbbf24' : '#94a3b8',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '2px',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        <Plus size={8} /> CR
                                      </button>
                                    )
                                  )}

                                  {hasCrLink && (
                                    <a
                                      href={crUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      title={`CR Link: ${company.cr_link}`}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '4px',
                                        background: isDark ? 'rgba(56, 189, 248, 0.18)' : '#ecfdf5',
                                        border: isDark ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid #a7f3d0',
                                        boxShadow: '0 1px 3px rgba(22, 163, 74, 0.15)',
                                        color: isDark ? '#38bdf8' : '#059669',
                                        flexShrink: 0,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        padding: '2px',
                                        textDecoration: 'none'
                                      }}
                                      onMouseEnter={e => {
                                        e.currentTarget.style.transform = 'scale(1.1)';
                                        e.currentTarget.style.background = isDark ? 'rgba(56, 189, 248, 0.32)' : '#d1fae5';
                                        e.currentTarget.style.color = isDark ? '#38bdf8' : '#047857';
                                      }}
                                      onMouseLeave={e => {
                                        e.currentTarget.style.transform = 'scale(1)';
                                        e.currentTarget.style.background = isDark ? 'rgba(56, 189, 248, 0.18)' : '#ecfdf5';
                                        e.currentTarget.style.color = isDark ? '#38bdf8' : '#059669';
                                      }}
                                    >
                                      <Globe size={10} strokeWidth={2.2} />
                                    </a>
                                  )}
                                </div>
                              )}
                            </td>
                          );

                        case 'task_type':
                          return (
                            <td key={`tt-${task.id}`} style={{ ...compactCell, overflow: 'hidden' }}>
                              {ttNames.length > 0 ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', overflow: 'hidden', maxHeight: '28px' }}>
                                  {ttNames.map((name, i) => (
                                    <span key={i} style={{
                                      padding: '1.5px 5px', borderRadius: '4px', fontSize: '10px',
                                      fontWeight: 650,
                                      background: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
                                      color: isDark ? '#60a5fa' : '#2563eb',
                                      border: isDark ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid rgba(59, 130, 246, 0.25)',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      maxWidth: '100%',
                                      letterSpacing: '0.01em',
                                    }}>{name}</span>
                                  ))}
                                </div>
                              ) : <span style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>—</span>}
                            </td>
                          );

                        case 'description':
                          const isEditingDesc = inlineEditDescId === task.id;
                          return (
                            <td
                              key={`desc-${task.id}`}
                              style={{
                                ...compactCell,
                                overflow: isEditingDesc ? 'visible' : 'hidden',
                                position: 'relative',
                                zIndex: isEditingDesc ? 50 : 1
                              }}
                              onMouseEnter={(e) => {
                                setHoveredDescTaskId(task.id);
                                if (task.description && !isEditingDesc) {
                                  if (tooltipTimeoutRef.current) {
                                    clearTimeout(tooltipTimeoutRef.current);
                                    tooltipTimeoutRef.current = null;
                                  }
                                  if (activeTooltipRef.current === task.id) {
                                    return;
                                  }
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const tooltipWidth = 320;
                                  let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
                                  if (left < 16) left = 16;
                                  if (left + tooltipWidth > window.innerWidth - 16) {
                                    left = window.innerWidth - tooltipWidth - 16;
                                  }
                                  const top = rect.top - 6;
                                  const align: 'top' | 'bottom' = 'top';
                                  activeTooltipRef.current = task.id;
                                  setTooltipPos({ x: left, y: top, align });
                                  setActiveTooltipTaskId(task.id);
                                }
                              }}
                              onMouseLeave={() => {
                                setHoveredDescTaskId(null);
                                if (tooltipTimeoutRef.current) {
                                  clearTimeout(tooltipTimeoutRef.current);
                                  tooltipTimeoutRef.current = null;
                                }
                                tooltipTimeoutRef.current = setTimeout(() => {
                                  activeTooltipRef.current = null;
                                  setActiveTooltipTaskId(null);
                                }, 200);
                              }}
                            >
                              {isEditingDesc ? (
                                <div
                                  onClick={e => e.stopPropagation()}
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px',
                                    width: '280px',
                                    position: 'absolute',
                                    zIndex: 1000,
                                    background: isDark ? 'var(--bg-card, #1e293b)' : '#ffffff',
                                    padding: '10px',
                                    borderRadius: '10px',
                                    boxShadow: isDark ? '0 20px 45px rgba(0,0,0,0.6)' : '0 16px 36px rgba(15,23,42,0.22)',
                                    border: isDark ? '1.5px solid var(--accent)' : '1.5px solid #3b82f6',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    left: '4px'
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <Edit2 size={11} color="var(--accent)" /> Edit Task Description
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setInlineEditDescId(null)}
                                      style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '1px' }}
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                  <textarea
                                    autoFocus
                                    value={inlineEditDescValue}
                                    onChange={e => setInlineEditDescValue(e.target.value)}
                                    placeholder="Enter task notes or description..."
                                    style={{
                                      width: '100%',
                                      minHeight: '65px',
                                      padding: '6px 8px',
                                      fontSize: '11.5px',
                                      borderRadius: '6px',
                                      border: isDark ? '1.5px solid var(--accent)' : '1.5px solid #2563eb',
                                      outline: 'none',
                                      resize: 'vertical',
                                      fontFamily: 'inherit',
                                      background: isDark ? 'var(--bg-tertiary)' : '#fff',
                                      color: 'var(--text-primary)',
                                      boxShadow: isDark ? '0 0 0 3px rgba(37,99,235,0.15)' : '0 0 0 3px rgba(37,99,235,0.1)',
                                      boxSizing: 'border-box'
                                    }}
                                    onKeyDown={e => {
                                      if (e.key === 'Escape') {
                                        setInlineEditDescId(null);
                                      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                        saveInlineDescription(task.id);
                                      }
                                    }}
                                  />
                                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '2px' }}>
                                    <button
                                      type="button"
                                      onClick={() => setInlineEditDescId(null)}
                                      style={{ padding: '3px 8px', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', borderRadius: '5px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10.5px', fontWeight: 600 }}
                                      title="Cancel (Esc)"
                                    >
                                      <X size={11} /> Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => saveInlineDescription(task.id)}
                                      style={{ padding: '3px 10px', border: 'none', background: 'var(--accent)', color: '#fff', borderRadius: '5px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10.5px', fontWeight: 700 }}
                                      title="Save (Ctrl+Enter)"
                                    >
                                      <Check size={11} /> Save
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', minHeight: '22px', width: '100%', minWidth: 0 }}>
                                  <span
                                    onClick={() => {
                                      if (canManageTask(task)) {
                                        setInlineEditDescId(task.id);
                                        setInlineEditDescValue(task.description || '');
                                      }
                                    }}
                                    style={{
                                      fontSize: '11.5px',
                                      color: task.description ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                                      fontStyle: task.description ? 'normal' : 'italic',
                                      flex: 1,
                                      minWidth: 0,
                                      display: 'inline-block',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      cursor: canManageTask(task) ? 'pointer' : 'default'
                                    }}
                                    title={task.description ? `${task.description} (Click to edit)` : (canManageTask(task) ? 'Click to add description' : '')}
                                  >
                                    {task.description || '—'}
                                  </span>
                                  {canManageTask(task) && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setInlineEditDescId(task.id);
                                        setInlineEditDescValue(task.description || '');
                                        activeTooltipRef.current = null;
                                        setActiveTooltipTaskId(null);
                                      }}
                                      style={{
                                        background: isDark ? 'rgba(148, 163, 184, 0.15)' : '#f1f5f9',
                                        border: isDark ? '1px solid rgba(148, 163, 184, 0.35)' : '1px solid #cbd5e1',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        padding: '2px 4px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: isDark ? '#94a3b8' : '#475569',
                                        transition: 'all 0.15s ease',
                                        height: '19px',
                                        flexShrink: 0,
                                      }}
                                      title="Edit Description"
                                      onMouseEnter={e => {
                                        e.currentTarget.style.background = isDark ? 'rgba(59, 130, 246, 0.25)' : '#eff6ff';
                                        e.currentTarget.style.color = isDark ? '#60a5fa' : '#2563eb';
                                        e.currentTarget.style.borderColor = isDark ? '#3b82f6' : '#93c5fd';
                                      }}
                                      onMouseLeave={e => {
                                        e.currentTarget.style.background = isDark ? 'rgba(148, 163, 184, 0.15)' : '#f1f5f9';
                                        e.currentTarget.style.color = isDark ? '#94a3b8' : '#475569';
                                        e.currentTarget.style.borderColor = isDark ? 'rgba(148, 163, 184, 0.35)' : '#cbd5e1';
                                      }}
                                    >
                                      <Edit2 size={9} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          );

                        case 'desc_updated':
                          return (
                            <td key={`desc_up-${task.id}`} style={{ ...compactCell, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {(() => {
                                const updateDate = descUpdateMap[task.id] || (task.description ? task.created_at : null);
                                if (!updateDate || !task.description || task.description.trim() === '') {
                                  return <span style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>—</span>;
                                }
                                const updateTime = new Date(updateDate).getTime();
                                const isRecent = !isNaN(updateTime) && (currentTime - updateTime < 24 * 60 * 60 * 1000);
                                return (
                                  <span
                                    title={`Last updated: ${new Date(updateDate).toLocaleString()}`}
                                    style={{
                                      fontSize: '10px',
                                      color: isRecent ? (isDark ? '#22d3ee' : '#0284c7') : 'var(--text-secondary)',
                                      fontWeight: isRecent ? 700 : 500,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '2.5px',
                                      background: isRecent ? (isDark ? 'rgba(6, 182, 212, 0.15)' : 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)') : 'transparent',
                                      padding: isRecent ? '1.5px 4px' : '0',
                                      borderRadius: '4px',
                                      border: isRecent ? (isDark ? '1px solid rgba(6, 182, 212, 0.35)' : '1px solid #bae6fd') : 'none',
                                      maxWidth: '100%',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis'
                                    }}
                                  >
                                    {isRecent && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: isDark ? '#22d3ee' : '#0284c7', boxShadow: isDark ? '0 0 6px #22d3ee' : '0 0 0 1.5px #bae6fd', flexShrink: 0 }} />}
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatDescDate(updateDate)}</span>
                                  </span>
                                );
                              })()}
                            </td>
                          );

                        case 'priority':
                          return (
                            <td key={`prio-${task.id}`} style={{ ...compactCell, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {canUpdateStatus ? (
                                <select value={task.priority} onChange={e => handlePriorityChange(task.id, e.target.value)}
                                  style={{
                                    padding: '2.5px 4px', borderRadius: '5px',
                                    border: `1px solid ${pc.border || 'var(--border)'}`,
                                    background: pc.bg, color: pc.color, fontWeight: 700,
                                    fontSize: '10px', cursor: 'pointer', outline: 'none',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                    width: '100%',
                                    maxWidth: '100%'
                                  }}>
                                  {BAHRAIN_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                              ) : (
                                <span style={{ padding: '2px 5px', borderRadius: '5px', fontSize: '10px', fontWeight: 700, background: pc.bg, color: pc.color, border: `1px solid ${pc.border || 'transparent'}`, whiteSpace: 'nowrap', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                                  {task.priority}
                                </span>
                              )}
                            </td>
                          );

                        case 'deadline':
                          const isOverdue = !!(task.deadline && new Date(task.deadline).getTime() < new Date().setHours(0,0,0,0) && !['completed', 'closed', 'filed', 'done'].includes((task.status || '').toLowerCase()));
                          return (
                            <td key={`dl-${task.id}`} style={{ ...compactCell, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {task.deadline ? (
                                <span style={{
                                  fontSize: '11px',
                                  color: isOverdue ? '#ef4444' : (isDark ? '#fb923c' : '#334155'),
                                  background: isOverdue ? (isDark ? 'rgba(239, 68, 68, 0.18)' : '#fef2f2') : (isDark ? 'rgba(249, 115, 22, 0.14)' : '#f8fafc'),
                                  border: isOverdue ? (isDark ? '1px solid rgba(239, 68, 68, 0.45)' : '1px solid #fecaca') : (isDark ? '1px solid rgba(249, 115, 22, 0.35)' : '1px solid #e2e8f0'),
                                  padding: '2px 5px',
                                  borderRadius: '5px',
                                  fontWeight: isOverdue ? 700 : 600,
                                  whiteSpace: 'nowrap',
                                  fontFamily: 'ui-monospace, monospace',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}>
                                  <Calendar size={10} color={isOverdue ? '#ef4444' : (isDark ? '#fb923c' : '#64748b')} style={{ flexShrink: 0 }} />
                                  <span style={{ whiteSpace: 'nowrap' }}>{task.deadline}</span>
                                </span>
                              ) : (
                                <span style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>—</span>
                              )}
                            </td>
                          );

                        case 'status':
                          const sc = statusColor(task.status);
                          return (
                            <td key={`stat-${task.id}`} style={{ ...compactCell, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {canUpdateStatus ? (
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%', minWidth: 0 }}>
                                  <select
                                    value={task.status}
                                    onChange={e => handleStatusChange(task.id, e.target.value)}
                                    style={{
                                      padding: '2.5px 4px 2.5px 15px',
                                      borderRadius: '6px',
                                      border: `1.5px solid ${sc.border}`,
                                      background: sc.bg,
                                      color: sc.color,
                                      fontWeight: 750,
                                      fontSize: '10.5px',
                                      letterSpacing: '0.01em',
                                      cursor: 'pointer',
                                      outline: 'none',
                                      width: '100%',
                                      maxWidth: '100%',
                                      boxShadow: sc.glow,
                                      transition: 'all 0.15s ease',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                  <span style={{
                                    position: 'absolute',
                                    left: '5px',
                                    width: '5px',
                                    height: '5px',
                                    borderRadius: '50%',
                                    background: sc.dot,
                                    boxShadow: `0 0 6px ${sc.dot}`,
                                    pointerEvents: 'none'
                                  }} />
                                </div>
                              ) : (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  padding: '2px 5px',
                                  borderRadius: '6px',
                                  fontSize: '10.5px',
                                  fontWeight: 750,
                                  background: sc.bg,
                                  color: sc.color,
                                  border: `1.5px solid ${sc.border}`,
                                  whiteSpace: 'nowrap',
                                  boxShadow: sc.glow,
                                  maxWidth: '100%',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis'
                                }}>
                                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: sc.dot, boxShadow: `0 0 6px ${sc.dot}`, flexShrink: 0 }} />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.status}</span>
                                </span>
                              )}
                            </td>
                          );

                        case 'auditor':
                          return (
                            <td key={`aud-${task.id}`} style={{ ...compactCell, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {isAdminUser ? (
                                <select value={task.auditor_id || ''} onChange={e => handleAssignAuditor(task.id, e.target.value)}
                                  style={{
                                    padding: '2.5px 4px', borderRadius: '5px',
                                    border: isDark ? (task.auditor_id ? '1px solid rgba(168, 85, 247, 0.45)' : '1px solid var(--border)') : '1px solid #e2e8f0',
                                    background: isDark ? (task.auditor_id ? 'rgba(168, 85, 247, 0.14)' : 'var(--bg-tertiary)') : '#f8fafc',
                                    color: isDark ? (task.auditor_id ? '#c084fc' : 'var(--text-secondary)') : '#1e293b',
                                    fontSize: '10.5px', fontWeight: 600, width: '100%', maxWidth: '100%',
                                    cursor: 'pointer', outline: 'none',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                  }}>
                                  <option value="">No Auditor</option>
                                  {auditors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                              ) : (
                                <span style={{
                                  fontSize: '10.5px',
                                  color: task.auditor_id ? (isDark ? '#c084fc' : '#7e22ce') : 'var(--text-tertiary)',
                                  background: task.auditor_id ? (isDark ? 'rgba(168, 85, 247, 0.14)' : '#faf5ff') : 'transparent',
                                  border: task.auditor_id ? (isDark ? '1px solid rgba(168, 85, 247, 0.35)' : '1px solid #f3e8ff') : 'none',
                                  padding: task.auditor_id ? '2px 5px' : '0',
                                  borderRadius: '4px',
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap',
                                  display: 'inline-block',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  maxWidth: '100%'
                                }}>
                                  {auditors.find(a => a.id === task.auditor_id)?.name || '—'}
                                </span>
                              )}
                            </td>
                          );

                        case 'assigned_to':
                          const activePartnerIds = task.assigned_partners && task.assigned_partners.length > 0 
                            ? task.assigned_partners 
                            : (task.assigned_to ? [task.assigned_to] : []);
                          const activePartnerObjects = activePartnerIds.map((id: string) => partners.find((p: any) => p.id === id)).filter((p): p is typeof partners[number] => Boolean(p));

                          return (
                            <td key={`ass-${task.id}`} style={{ ...compactCell, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {isAdminUser ? (
                                isDark ? (() => {
                                  const selectedPartner = partners.find(p => p.id === task.assigned_to);
                                  const pCol = getPartnerColor(selectedPartner?.username || selectedPartner?.id);
                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', width: '100%', minWidth: 0 }}>
                                      {selectedPartner && (
                                        <div style={{
                                          width: '16px', height: '16px', borderRadius: '50%',
                                          background: pCol.avatarBg,
                                          color: '#ffffff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                          fontSize: '8px', fontWeight: 800, flexShrink: 0,
                                          boxShadow: `0 0 6px ${pCol.border}`
                                        }}>
                                          {selectedPartner.username.substring(0, 1).toUpperCase()}
                                        </div>
                                      )}
                                      <select
                                        value={task.assigned_to || ''}
                                        onChange={e => handleAssign(task.id, e.target.value)}
                                        style={{
                                          padding: '2.5px 4px',
                                          borderRadius: '5px',
                                          border: task.assigned_to ? `1.5px solid ${pCol.border}` : '1px solid var(--border)',
                                          background: task.assigned_to ? pCol.bg : 'var(--bg-tertiary)',
                                          color: task.assigned_to ? pCol.text : 'var(--text-secondary)',
                                          fontSize: '10.5px',
                                          fontWeight: 700,
                                          width: '100%',
                                          maxWidth: '100%',
                                          cursor: 'pointer',
                                          outline: 'none',
                                          boxShadow: task.assigned_to ? `0 0 6px ${pCol.bg}` : 'none'
                                        }}
                                      >
                                        <option value="">👤 Unassigned</option>
                                        {partners.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
                                      </select>
                                    </div>
                                  );
                                })() : (
                                  <select value={task.assigned_to || ''} onChange={e => handleAssign(task.id, e.target.value)}
                                    style={{
                                      padding: '2.5px 4px', borderRadius: '5px', border: '1px solid #e2e8f0',
                                      background: '#f8fafc', fontSize: '10.5px', color: '#1e293b',
                                      width: '100%', maxWidth: '100%', cursor: 'pointer', outline: 'none', fontWeight: 550,
                                      boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                    }}>
                                    <option value="">Unassigned</option>
                                    {partners.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
                                  </select>
                                )
                              ) : (
                                activePartnerObjects.length > 0 ? (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', alignItems: 'center', overflow: 'hidden', maxHeight: '28px' }}>
                                    {activePartnerObjects.map(p => {
                                      const pCol = getPartnerColor(p.username || p.id);
                                      return (
                                        <span
                                          key={p.id}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '2.5px',
                                            fontSize: '10px',
                                            fontWeight: 700,
                                            color: pCol.text,
                                            background: pCol.bg,
                                            border: `1px solid ${pCol.border}`,
                                            padding: '1.5px 5px',
                                            borderRadius: '4px',
                                            whiteSpace: 'nowrap',
                                            boxShadow: `0 0 6px ${pCol.bg}`,
                                            maxWidth: '100%',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                          }}
                                          title={p.username}
                                        >
                                          <span style={{
                                            width: '12px', height: '12px', borderRadius: '50%',
                                            background: pCol.avatarBg, color: '#ffffff',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '7px', fontWeight: 800, flexShrink: 0
                                          }}>
                                            {p.username.substring(0, 1).toUpperCase()}
                                          </span>
                                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.username}</span>
                                        </span>
                                      );
                                    })}
                                  </div>
                                ) : <span style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>Unassigned</span>
                              )}
                            </td>
                          );

                        case 'actions':
                          return (
                            <td key={`act-${task.id}`} style={{
                              ...compactCell,
                              position: 'relative',
                              width: '36px',
                              minWidth: '36px',
                              maxWidth: '38px',
                              padding: '4px 2px',
                              textAlign: 'center',
                              overflow: 'visible'
                            }}>
                              <button onClick={e => { 
                                e.stopPropagation(); 
                                if (isMenuOpen) {
                                  setOpenMenuId(null);
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const menuHeight = 180;
                                  let top: number | undefined = rect.bottom + 4;
                                  let bottom: number | undefined = undefined;
                                  let maxHeight = `calc(100vh - ${top}px - 10px)`;
                                  
                                  if (rect.bottom + menuHeight > window.innerHeight && rect.top > window.innerHeight - rect.bottom) {
                                    top = undefined;
                                    bottom = window.innerHeight - rect.top + 4;
                                    maxHeight = `calc(${rect.top}px - 10px)`;
                                  }
                                  
                                  setMenuPos({ top, bottom, right: window.innerWidth - rect.right, maxHeight });
                                  setOpenMenuId(task.id);
                                }
                              }}
                                style={{
                                  background: isMenuOpen ? 'var(--accent-light)' : 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  borderRadius: '6px',
                                  padding: '3px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.15s ease',
                                  position: 'relative',
                                  width: '26px',
                                  height: '26px',
                                  margin: '0 auto'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                                onMouseLeave={e => { if (!isMenuOpen) { e.currentTarget.style.background = 'transparent'; } }}>
                                <MoreHorizontal size={16} color="var(--text-secondary)" />
                              </button>
                              {isMenuOpen && typeof window !== 'undefined' && createPortal(
                                <div style={{ position: 'fixed', top: menuPos.top, bottom: menuPos.bottom, right: menuPos.right, maxHeight: menuPos.maxHeight || 'none', overflowY: 'auto', background: 'var(--bg-card, var(--bg-secondary))', borderRadius: '12px', boxShadow: '0 16px 36px rgba(0,0,0,0.45)', border: '1px solid var(--border)', zIndex: 9999, minWidth: '175px' }}
                                  onClick={e => e.stopPropagation()}>
                                  <button onClick={() => { viewDetail(task.id); setOpenMenuId(null); }} style={menuItemStyle}>
                                    <Eye size={14} color="var(--accent)" /> View Details
                                  </button>
                                  {canManageTask(task) && (<>
                                    <button onClick={() => { openEditTask(task); setOpenMenuId(null); }} style={menuItemStyle}>
                                      <Edit2 size={14} color="#f59e0b" /> Edit Task
                                    </button>
                                  </>)}
                                  <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
                                  <button
                                    onClick={() => {
                                      const comp = companies.find(c => c.id === task.company_id);
                                      const ttIds = task.task_type_ids && task.task_type_ids.length > 0 ? task.task_type_ids : (task.task_type_id ? task.task_type_id.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
                                      const ttNames = ttIds.map(id => taskTypes.find(t => t.id === id)?.name).filter(Boolean).join(', ') || 'N/A';
                                      const activePartnerIds = task.assigned_partners && task.assigned_partners.length > 0 
                                        ? task.assigned_partners 
                                        : (task.assigned_to ? [task.assigned_to] : []);
                                      const allNames = activePartnerIds.map((id: string) => partners.find((p: any) => p.id === id)?.username).filter(Boolean);
                                      const assignedNames = allNames.length > 0 ? allNames.join(', ') : 'Unassigned';
                                      const msg = [
                                        '━━━━━━━━━━━━━━━━━━',
                                        '*Task Update*',
                                        '━━━━━━━━━━━━━━━━━━',
                                        '',
                                        `*Company:* ${comp?.company_name || 'Unknown'}`,
                                        `*CR Number:* ${comp?.cr_number || 'N/A'}`,
                                        `*Audit Type:* ${ttNames}`,
                                        `*Assigned To:* ${assignedNames}`,
                                        `*Status:* ${task.status || 'N/A'}`,
                                        ...(task.description ? [`*Description:* ${task.description}`] : []),
                                      ].join('\n');
                                      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                                      setOpenMenuId(null);
                                    }}
                                    style={menuItemStyle}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(34, 197, 94, 0.15)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366" style={{ flexShrink: 0 }}>
                                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                    </svg>
                                    <span style={{ color: '#25D366', fontWeight: 600 }}>WhatsApp</span>
                                  </button>
                                  {canManageTask(task) && (<>
                                    <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
                                    <button onClick={() => { deleteTask(task.id); setOpenMenuId(null); }} style={{ ...menuItemStyle, color: '#ef4444' }}>
                                      <Trash2 size={14} color="#ef4444" /> Delete
                                    </button>
                                  </>)}
                                </div>,
                                document.body
                              )}
                            </td>
                          );

                        default:
                          return null;
                      }
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Task Cards View (<= 768px) */}
      <div className="mobile-task-view">
        {filtered.length === 0 ? (
          <div style={{
            background: 'var(--bg-card, var(--bg-secondary))', borderRadius: '16px', padding: '40px 20px',
            textAlign: 'center', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)'
          }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
              <ListTodo size={24} color="var(--text-tertiary)" />
            </div>
            <div style={{ fontSize: '15px', fontWeight: 650, color: 'var(--text-primary)' }}>No matching tasks found</div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginTop: '4px' }}>Try adjusting your filters or keywords</div>
          </div>
        ) : (
          paginatedTasks.map(task => {
            const company = companies.find(c => c.id === task.company_id);
            const ttIds = task.task_type_ids && task.task_type_ids.length > 0 ? task.task_type_ids : (task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : []);
            const ttNames = ttIds.map(id => taskTypes.find(t => t.id === id)?.name).filter(Boolean);
            const statusOptions = getStatusesForTask(ttIds, statusObjects, dynamicStatuses);
            if (task.status && !statusOptions.includes(task.status)) {
              statusOptions.push(task.status);
              statusOptions.sort((a, b) => a.localeCompare(b));
            }
            const pc = priorityColor(task.priority);
            const isMenuOpen = openMenuId === task.id;
            const isSelected = selectedTaskIds.includes(task.id);

            return (
              <div
                key={`mobile-card-${task.id}`}
                style={{
                  background: isSelected ? 'var(--accent-light)' : 'var(--bg-card, var(--bg-secondary))',
                  border: isSelected ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '12px 14px',
                  boxShadow: 'var(--card-shadow)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  position: 'relative',
                  transition: 'all 0.15s ease'
                }}
              >
                {/* Row 1: Left (Checkbox + Company Name + Task Type Chips) | Right (Status Pill + Actions Menu) */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flex: 1, minWidth: 0 }}>
                    {multiSelectMode && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectTask(task.id)}
                        style={{ cursor: 'pointer', width: '17px', height: '17px', accentColor: 'var(--accent)', flexShrink: 0, marginTop: '2px' }}
                      />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {company?.google_drive_link ? (
                          <a
                            href={formatExternalUrl(company.google_drive_link)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{
                              fontWeight: 700,
                              fontSize: '15px',
                              color: 'var(--text-primary)',
                              letterSpacing: '-0.2px',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                            title={`Open Google Drive: ${company.google_drive_link}`}
                          >
                            <span>{company?.company_name || 'Unknown Company'}</span>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '20px',
                              height: '20px',
                              borderRadius: '5px',
                              background: 'var(--bg-tertiary)',
                              border: '1px solid rgba(34, 197, 94, 0.45)',
                              boxShadow: '0 1px 3px rgba(22, 163, 74, 0.18)',
                              flexShrink: 0,
                              padding: '2px'
                            }}>
                              <GoogleDriveIcon size={12} />
                            </span>
                          </a>
                        ) : (
                          <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>
                            {company?.company_name || 'Unknown Company'}
                          </span>
                        )}
                        {ttNames.map((name, i) => (
                          <span key={i} style={{
                            padding: '1px 6px', borderRadius: '5px', fontSize: '10px',
                            fontWeight: 600, background: 'rgba(59, 130, 246, 0.12)', color: 'var(--accent)', border: '1px solid rgba(59, 130, 246, 0.3)'
                          }}>
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right side: Status Dropdown/Pill + 3-dots Menu */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {canUpdateStatus ? (() => {
                      const sc = statusColor(task.status);
                      return (
                        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                          <select
                            value={task.status}
                            onChange={e => handleStatusChange(task.id, e.target.value)}
                            style={{
                              padding: '3.5px 8px 3.5px 18px', borderRadius: '12px',
                              border: `1.5px solid ${sc.border}`, background: sc.bg,
                              color: sc.color, fontWeight: 800, fontSize: '11px',
                              cursor: 'pointer', outline: 'none', appearance: 'none',
                              WebkitAppearance: 'none', paddingRight: '18px',
                              textAlign: 'left', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              boxShadow: sc.glow
                            }}
                          >
                            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <span style={{
                            position: 'absolute',
                            left: '6px',
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: sc.dot,
                            boxShadow: `0 0 6px ${sc.dot}`,
                            pointerEvents: 'none'
                          }} />
                          <ChevronDown size={10} style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: sc.color }} />
                        </div>
                      );
                    })() : (() => {
                      const sc = statusColor(task.status);
                      return (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          padding: '3px 8px', borderRadius: '12px', fontSize: '11px',
                          fontWeight: 800, background: sc.bg, color: sc.color,
                          border: `1.5px solid ${sc.border}`, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          boxShadow: sc.glow
                        }}>
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: sc.dot, boxShadow: `0 0 6px ${sc.dot}` }} />
                          {task.status}
                        </span>
                      );
                    })()}

                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (isMenuOpen) {
                          setOpenMenuId(null);
                        } else {
                          const rect = e.currentTarget.getBoundingClientRect();
                          let top: number | undefined = rect.bottom + 4;
                          let bottom: number | undefined = undefined;
                          let maxHeight = `calc(100vh - ${top}px - 10px)`;
                          if (rect.bottom + 200 > window.innerHeight) {
                            top = undefined;
                            bottom = window.innerHeight - rect.top + 4;
                            maxHeight = `calc(${rect.top}px - 10px)`;
                          }
                          setMenuPos({ top, bottom, right: 14, maxHeight });
                          setOpenMenuId(task.id);
                        }
                      }}
                      style={{
                        width: '26px', height: '26px', borderRadius: '6px', border: '1px solid var(--border)',
                        background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', cursor: 'pointer'
                      }}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {isMenuOpen && typeof window !== 'undefined' && createPortal(
                      <div style={{ position: 'fixed', top: menuPos.top, bottom: menuPos.bottom, right: menuPos.right, maxHeight: menuPos.maxHeight || 'none', overflowY: 'auto', background: 'var(--bg-card, var(--bg-secondary))', borderRadius: '12px', boxShadow: '0 16px 36px rgba(0,0,0,0.45)', border: '1px solid var(--border)', zIndex: 9999, minWidth: '175px' }}
                        onClick={e => e.stopPropagation()}>
                        <button onClick={() => { viewDetail(task.id); setOpenMenuId(null); }} style={menuItemStyle}>
                          <Eye size={14} color="var(--accent)" /> View Details
                        </button>
                        {canManageTask(task) && (
                          <button onClick={() => { openEditTask(task); setOpenMenuId(null); }} style={menuItemStyle}>
                            <Edit2 size={14} color="#f59e0b" /> Edit Task
                          </button>
                        )}
                        <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
                        <button
                          onClick={() => {
                            const comp = companies.find(c => c.id === task.company_id);
                            const ttIds = task.task_type_ids && task.task_type_ids.length > 0 ? task.task_type_ids : (task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : []);
                            const ttNames = ttIds.map(id => taskTypes.find(t => t.id === id)?.name).filter(Boolean).join(', ') || 'N/A';
                            const activePartnerIds = task.assigned_partners && task.assigned_partners.length > 0 
                              ? task.assigned_partners 
                              : (task.assigned_to ? [task.assigned_to] : []);
                            const allNames = activePartnerIds.map((id: string) => partners.find((p: any) => p.id === id)?.username).filter(Boolean);
                            const assignedNames = allNames.length > 0 ? allNames.join(', ') : 'Unassigned';
                            const msg = [
                              '━━━━━━━━━━━━━━━━━━',
                              '*Task Update*',
                              '━━━━━━━━━━━━━━━━━━',
                              '',
                              `*Company:* ${comp?.company_name || 'Unknown'}`,
                              `*CR Number:* ${comp?.cr_number || 'N/A'}`,
                              `*Audit Type:* ${ttNames}`,
                              `*Priority:* ${task.priority}`,
                              `*Status:* ${task.status}`,
                              `*Due Date:* ${task.deadline || 'N/A'}`,
                              `*Description:* ${task.description || 'N/A'}`,
                              `*Assigned To:* ${assignedNames}`,
                              '',
                              `_Sent via The Digital Ledger_`,
                            ].join('\n');
                            window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                            setOpenMenuId(null);
                          }}
                          style={menuItemStyle}
                        >
                          <Share2 size={14} color="#25D366" /> Share via WhatsApp
                        </button>
                        {isAdminUser && (
                          <>
                            <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />
                            <button onClick={() => { deleteTask(task.id); setOpenMenuId(null); }} style={{ ...menuItemStyle, color: '#ef4444' }}>
                              <Trash2 size={14} color="#ef4444" /> Delete
                            </button>
                          </>
                        )}
                      </div>,
                      document.body
                    )}
                  </div>
                </div>

                {/* Row 2: Badges Bar: Priority (soft dot badge), PL Toggle, CR Chip */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {/* Priority */}
                  {canUpdateStatus ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <select
                        value={task.priority}
                        onChange={e => handlePriorityChange(task.id, e.target.value)}
                        style={{
                          padding: '2px 7px', borderRadius: '6px', border: `1px solid ${pc.border || 'var(--border)'}`,
                          background: pc.bg, color: pc.color, fontWeight: 700,
                          fontSize: '10.5px', cursor: 'pointer', outline: 'none',
                          appearance: 'none', WebkitAppearance: 'none', paddingRight: '16px'
                        }}
                      >
                        {BAHRAIN_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <ChevronDown size={9} style={{ position: 'absolute', right: '5px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: pc.color }} />
                    </div>
                  ) : (
                    <span style={{ padding: '2px 7px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 700, background: pc.bg, color: pc.color, border: `1px solid ${pc.border || 'transparent'}` }}>
                      {task.priority}
                    </span>
                  )}

                  {/* PL Date Pill */}
                  {task.pl_date ? (
                    <button
                      onClick={() => {
                        setInlineEditPlTaskId(task.id);
                        setInlineEditPlValue(task.pl_date || '');
                      }}
                      title="PL Date (Click to change)"
                      style={{
                        padding: '2.5px 7px',
                        borderRadius: '7px',
                        border: '1px solid rgba(99, 102, 241, 0.45)',
                        cursor: 'pointer',
                        fontSize: '10.5px',
                        fontWeight: 650,
                        background: 'rgba(99, 102, 241, 0.15)',
                        color: '#a5b4fc',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontFamily: 'ui-monospace, monospace'
                      }}
                    >
                      <Calendar size={11} color="#818cf8" />
                      <span>PL: {formatPlDateDisplay(task.pl_date)}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setInlineEditPlTaskId(task.id);
                        setInlineEditPlValue(new Date().toISOString().split('T')[0]);
                      }}
                      title="Set PL Date"
                      style={{
                        padding: '2.5px 7px',
                        borderRadius: '7px',
                        border: '1px dashed rgba(99, 102, 241, 0.4)',
                        cursor: 'pointer',
                        fontSize: '10.5px',
                        fontWeight: 600,
                        background: 'rgba(99, 102, 241, 0.08)',
                        color: '#818cf8',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Calendar size={11} />
                      <span>PL: Set Date</span>
                    </button>
                  )}

                  {/* CR Number Monospace Chip */}
                  {company?.cr_number ? (
                    <span style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: '10.5px', fontWeight: 650, color: '#fbbf24',
                      background: 'rgba(245, 158, 11, 0.14)', padding: '2px 6px', borderRadius: '5px',
                      border: '1px solid rgba(245, 158, 11, 0.38)', display: 'inline-flex', alignItems: 'center', gap: '4px'
                    }}>
                      CR: {company.cr_number}
                    </span>
                  ) : null}

                  {/* CR Link */}
                  {company?.cr_link && (
                    <a
                      href={formatExternalUrl(company.cr_link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{
                        fontSize: '10.5px', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.16)',
                        border: '1px solid rgba(56, 189, 248, 0.45)', padding: '2px 6px', borderRadius: '5px',
                        display: 'inline-flex', alignItems: 'center', gap: '3px', textDecoration: 'none', fontWeight: 600,
                        boxShadow: '0 1px 2px rgba(56, 189, 248, 0.15)'
                      }}
                      title={`Open CR Link: ${company.cr_link}`}
                    >
                      <Globe size={11} strokeWidth={2.2} /> CR Link
                    </a>
                  )}

                  {/* Edit CR Trigger */}
                  {canManageTask(task) && company && (
                    <button
                      onClick={() => {
                        setInlineEditCrId(task.id);
                        setInlineEditCrValue(company.cr_number || '');
                        setInlineEditCrLinkValue(company.cr_link || '');
                      }}
                      style={{
                        fontSize: '10px', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.15)',
                        border: '1px solid rgba(245, 158, 11, 0.35)', padding: '2px 5px', borderRadius: '4px',
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '2px'
                      }}
                    >
                      <Edit2 size={9} /> CR
                    </button>
                  )}
                </div>

                {/* Inline CR Number & Link Editor on Mobile */}
                {inlineEditCrId === task.id && (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{ background: 'var(--bg-tertiary)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Edit CR Details</span>
                      <button onClick={() => setInlineEditCrId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}><X size={12} /></button>
                    </div>
                    <input
                      autoFocus
                      type="text"
                      value={inlineEditCrValue}
                      onChange={e => setInlineEditCrValue(e.target.value)}
                      placeholder="CR Number"
                      style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                      onKeyDown={e => { if (e.key === 'Enter' && company) saveInlineCrNumber(company.id, task.id); }}
                    />
                    <input
                      type="url"
                      value={inlineEditCrLinkValue}
                      onChange={e => setInlineEditCrLinkValue(e.target.value)}
                      placeholder="CR Link"
                      style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                      onKeyDown={e => { if (e.key === 'Enter' && company) saveInlineCrNumber(company.id, task.id); }}
                    />
                    <button
                      disabled={savingCrTaskId === task.id}
                      onClick={() => { if (company) saveInlineCrNumber(company.id, task.id); }}
                      style={{ padding: '6px', background: 'var(--accent)', color: '#fff', borderRadius: '6px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
                    >
                      {savingCrTaskId === task.id ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}

                {/* Row 3: Description (Compact & only shown if present or on edit) */}
                {task.description ? (
                  <div
                    onClick={() => {
                      if (canManageTask(task) && inlineEditDescId !== task.id) {
                        setInlineEditDescId(task.id);
                        setInlineEditDescValue(task.description || '');
                      }
                    }}
                    style={{
                      background: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: '8px',
                      border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-primary)',
                      lineHeight: 1.4, cursor: canManageTask(task) ? 'pointer' : 'default',
                      position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <span style={{ wordBreak: 'break-word', flex: 1 }}>
                        {task.description}
                      </span>
                      {canManageTask(task) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setInlineEditDescId(task.id);
                            setInlineEditDescValue(task.description || '');
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px', display: 'flex', flexShrink: 0 }}
                        >
                          <Edit2 size={11} />
                        </button>
                      )}
                    </div>
                    {/* Desc update timestamp */}
                    {(() => {
                      const updateDate = descUpdateMap[task.id] || task.created_at;
                      if (!updateDate) return null;
                      const updateTime = new Date(updateDate).getTime();
                      const isRecent = !isNaN(updateTime) && (currentTime - updateTime < 24 * 60 * 60 * 1000);
                      return (
                        <div style={{ fontSize: '10px', color: isRecent ? '#22d3ee' : 'var(--text-tertiary)', marginTop: '3px', fontWeight: isRecent ? 650 : 400 }}>
                          Updated: {formatDescDate(updateDate)} {isRecent ? '• Recent' : ''}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  canManageTask(task) && inlineEditDescId !== task.id && (
                    <button
                      onClick={() => {
                        setInlineEditDescId(task.id);
                        setInlineEditDescValue('');
                      }}
                      style={{
                        background: 'transparent', border: '1px dashed var(--border)', borderRadius: '6px',
                        padding: '4px 8px', fontSize: '11px', color: 'var(--text-tertiary)', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: '4px', alignSelf: 'flex-start'
                      }}
                    >
                      <Plus size={11} /> Add description
                    </button>
                  )
                )}

                {/* Inline description editor */}
                {inlineEditDescId === task.id && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg-tertiary)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <textarea
                      autoFocus
                      value={inlineEditDescValue}
                      onChange={e => setInlineEditDescValue(e.target.value)}
                      placeholder="Enter task description..."
                      style={{ width: '100%', minHeight: '52px', padding: '6px 8px', fontSize: '12px', borderRadius: '6px', border: '1.5px solid var(--accent)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }}
                    />
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button onClick={() => setInlineEditDescId(null)} style={{ padding: '3px 8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                      <button onClick={() => saveInlineDescription(task.id)} style={{ padding: '3px 10px', border: 'none', background: 'var(--accent)', color: '#fff', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Save</button>
                    </div>
                  </div>
                )}

                {/* Row 4: Single-Line Meta Strip: Assignee, Auditor, Due Date */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  paddingTop: '6px', borderTop: '1px solid var(--border-light)', fontSize: '11.5px', color: 'var(--text-secondary)', gap: '8px'
                }}>
                  {/* Left: Assignee + Auditor */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    {/* Assignee */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                      {isAdminUser ? (() => {
                        const selectedPartner = partners.find(p => p.id === task.assigned_to);
                        const pCol = getPartnerColor(selectedPartner?.username || selectedPartner?.id);
                        return (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            {selectedPartner && (
                              <div style={{
                                width: '15px', height: '15px', borderRadius: '50%',
                                background: pCol.avatarBg,
                                color: '#ffffff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '8px', fontWeight: 800, flexShrink: 0
                              }}>
                                {selectedPartner.username.substring(0, 1).toUpperCase()}
                              </div>
                            )}
                            <select
                              value={task.assigned_to || ''}
                              onChange={e => handleAssign(task.id, e.target.value)}
                              style={{
                                fontSize: '11px', color: task.assigned_to ? pCol.text : 'var(--text-secondary)',
                                fontWeight: 750,
                                background: task.assigned_to ? pCol.bg : 'var(--bg-tertiary)',
                                border: task.assigned_to ? `1px solid ${pCol.border}` : '1px solid var(--border)',
                                borderRadius: '6px',
                                padding: '2px 5px', outline: 'none', cursor: 'pointer', maxWidth: '105px',
                                boxShadow: (task.assigned_to && isDark) ? `0 0 6px ${pCol.bg}` : 'none'
                              }}
                            >
                              <option value="">👤 Unassigned</option>
                              {partners.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
                            </select>
                          </div>
                        );
                      })() : (() => {
                        const activePartnerIds = task.assigned_partners && task.assigned_partners.length > 0 
                          ? task.assigned_partners 
                          : (task.assigned_to ? [task.assigned_to] : []);
                        const activePartnerObjects = activePartnerIds.map((id: string) => partners.find((p: any) => p.id === id)).filter((p): p is typeof partners[number] => Boolean(p));
                        
                        if (activePartnerObjects.length === 0) {
                          return <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>👤 Unassigned</span>;
                        }

                        return (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                            {activePartnerObjects.map(p => {
                              const pCol = getPartnerColor(p.username || p.id);
                              return (
                                <span
                                  key={p.id}
                                  style={{
                                    fontWeight: 750,
                                    fontSize: '11px',
                                    color: pCol.text,
                                    background: pCol.bg,
                                    border: `1px solid ${pCol.border}`,
                                    padding: '1.5px 6px',
                                    borderRadius: '5px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    boxShadow: isDark ? `0 0 6px ${pCol.bg}` : 'none'
                                  }}
                                >
                                  <span style={{
                                    width: '12px', height: '12px', borderRadius: '50%',
                                    background: pCol.avatarBg, color: '#ffffff',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '7.5px', fontWeight: 800, flexShrink: 0
                                  }}>
                                    {p.username.substring(0, 1).toUpperCase()}
                                  </span>
                                  {p.username}
                                </span>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Auditor */}
                    {isAdminUser ? (
                      <select
                        value={task.auditor_id || ''}
                        onChange={e => handleAssignAuditor(task.id, e.target.value)}
                        style={{
                          fontSize: '11px',
                          color: task.auditor_id ? (isDark ? '#c084fc' : '#6b21a8') : 'var(--text-secondary)',
                          fontWeight: 650,
                          background: task.auditor_id ? (isDark ? 'rgba(168, 85, 247, 0.14)' : '#faf5ff') : 'var(--bg-tertiary)',
                          border: task.auditor_id ? (isDark ? '1px solid rgba(168, 85, 247, 0.35)' : '1px solid #e9d5ff') : '1px solid var(--border)',
                          borderRadius: '6px',
                          padding: '2px 5px', outline: 'none', cursor: 'pointer', maxWidth: '95px'
                        }}
                      >
                        <option value="">🏛️ No Auditor</option>
                        {auditors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    ) : (
                      task.auditor_id && (
                        <span style={{ color: '#c084fc', fontSize: '11px', fontWeight: 600 }}>
                          🏛️ {auditors.find(a => a.id === task.auditor_id)?.name}
                        </span>
                      )
                    )}
                  </div>

                  {/* Right: Due Date */}
                  <div style={{ flexShrink: 0, fontWeight: 650, fontSize: '11px', color: task.deadline ? '#fb923c' : 'var(--text-tertiary)', fontFamily: 'ui-monospace, monospace' }}>
                    📅 {task.deadline || 'No date'}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ─── Task Management Pagination Navigation Bar ─── */}
      {totalCount > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          marginTop: '20px',
          marginBottom: '28px',
          padding: '14px 18px',
          background: 'var(--bg-card, var(--bg-secondary))',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          boxShadow: 'var(--card-shadow)'
        }}>
          {/* Left Side: Showing Range & Total Results */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Showing <strong style={{ color: 'var(--text-primary)' }}>{startIndex + 1}</strong>–<strong style={{ color: 'var(--text-primary)' }}>{endIndex}</strong> of <strong style={{ color: 'var(--accent)' }}>{totalCount}</strong> tasks
              {totalCount !== tasks.length && (
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginLeft: '6px' }}>
                  (filtered from {tasks.length} total)
                </span>
              )}
            </div>

            {/* Rows Per Page Options: 25, 50, 100, All */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Rows per page:</span>
              <div style={{
                display: 'inline-flex',
                background: 'var(--bg-tertiary)',
                padding: '2px',
                borderRadius: '8px',
                border: '1px solid var(--border)'
              }}>
                {([25, 50, 100, 'all'] as const).map(option => {
                  const isSelected = pageSize === option;
                  return (
                    <button
                      key={`rows-${option}`}
                      type="button"
                      onClick={() => handlePageSizeChange(option)}
                      style={{
                        padding: '3px 10px',
                        borderRadius: '6px',
                        border: 'none',
                        background: isSelected ? 'var(--accent)' : 'transparent',
                        color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                        fontSize: '11.5px',
                        fontWeight: isSelected ? 750 : 600,
                        cursor: 'pointer',
                        boxShadow: isSelected ? '0 1px 4px rgba(37,99,235,0.3)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {option === 'all' ? 'All' : option}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Side: Page Numbers & Prev/Next (hidden when 'all' or single page) */}
          {pageSize !== 'all' && totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <button
                type="button"
                onClick={() => handlePageChange(safeCurrentPage - 1)}
                disabled={safeCurrentPage <= 1}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: safeCurrentPage <= 1 ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                  color: safeCurrentPage <= 1 ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  fontSize: '12px',
                  fontWeight: 650,
                  cursor: safeCurrentPage <= 1 ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease'
                }}
              >
                <ChevronLeft size={14} /> Previous
              </button>

              {(() => {
                const pageNumbers: (number | string)[] = [];
                if (totalPages <= 7) {
                  for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
                } else {
                  pageNumbers.push(1);
                  if (safeCurrentPage > 3) pageNumbers.push('...');
                  const start = Math.max(2, safeCurrentPage - 1);
                  const end = Math.min(totalPages - 1, safeCurrentPage + 1);
                  for (let i = start; i <= end; i++) pageNumbers.push(i);
                  if (safeCurrentPage < totalPages - 2) pageNumbers.push('...');
                  pageNumbers.push(totalPages);
                }

                return pageNumbers.map((p, idx) => {
                  if (p === '...') {
                    return (
                      <span key={`dots-${idx}`} style={{ padding: '0 4px', color: 'var(--text-tertiary)', fontSize: '13px', fontWeight: 600 }}>
                        …
                      </span>
                    );
                  }

                  const pageNum = p as number;
                  const isCurrent = pageNum === safeCurrentPage;

                  return (
                    <button
                      key={`page-${pageNum}`}
                      type="button"
                      onClick={() => handlePageChange(pageNum)}
                      style={{
                        minWidth: '32px',
                        height: '32px',
                        padding: '0 6px',
                        borderRadius: '8px',
                        border: isCurrent ? 'none' : '1px solid var(--border)',
                        background: isCurrent ? 'var(--accent)' : 'var(--bg-secondary)',
                        color: isCurrent ? '#ffffff' : 'var(--text-primary)',
                        fontSize: '12px',
                        fontWeight: isCurrent ? 750 : 600,
                        cursor: isCurrent ? 'default' : 'pointer',
                        boxShadow: isCurrent ? '0 2px 6px rgba(37,99,235,0.28)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {pageNum}
                    </button>
                  );
                });
              })()}

              <button
                type="button"
                onClick={() => handlePageChange(safeCurrentPage + 1)}
                disabled={safeCurrentPage >= totalPages}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: safeCurrentPage >= totalPages ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                  color: safeCurrentPage >= totalPages ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  fontSize: '12px',
                  fontWeight: 650,
                  cursor: safeCurrentPage >= totalPages ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease'
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* New/Edit Task Modal */}
      {showTaskModal && (
        <Modal title={editingTaskId ? "✏️ Edit Task" : "✨ New Task"} onClose={() => { setShowTaskModal(false); setEditingTaskId(null); }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '20px' }}>
            <FormField label="Company *">
              <select value={newTask.company_id} onChange={e => {
                if (e.target.value === '__create_new__') {
                  setShowInlineCompanyForm(true);
                  // Reset selection so dropdown doesn't stick on the magic value
                  setNewTask(p => ({ ...p, company_id: '' }));
                } else {
                  setNewTask(p => ({ ...p, company_id: e.target.value }));
                }
              }} style={inputStyle}>
                <option value="">Select Company</option>
                <option value="__create_new__" style={{ fontWeight: 700, color: '#10b981' }}>＋ Create New Company</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
              {/* Inline Create Company Mini-Form */}
              {showInlineCompanyForm && (
                <div style={{ marginTop: '12px', padding: '16px', background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', borderRadius: '14px', border: '1.5px solid #86efac', boxShadow: '0 4px 16px rgba(16,185,129,0.1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Building2 size={14} color="#ffffff" />
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#065f46' }}>New Company</span>
                    </div>
                    <button onClick={() => { setShowInlineCompanyForm(false); setInlineCompanyForm({ name: '', tax_registration: '', industry: '', compliance_type: '' }); }} style={{ background: '#dcfce7', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#065f46', transition: 'all 0.15s' }}>
                      <X size={14} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <input
                      autoFocus
                      value={inlineCompanyForm.name}
                      onChange={e => setInlineCompanyForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="Company Name *"
                      style={{ ...inputStyle, fontSize: '13px', padding: '10px 14px', borderColor: '#86efac' }}
                      onKeyDown={e => { if (e.key === 'Enter') saveInlineCompany(); if (e.key === 'Escape') { setShowInlineCompanyForm(false); setInlineCompanyForm({ name: '', tax_registration: '', industry: '', compliance_type: '' }); } }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <input
                        value={inlineCompanyForm.tax_registration}
                        onChange={e => setInlineCompanyForm(p => ({ ...p, tax_registration: e.target.value }))}
                        placeholder="Tax Registration"
                        style={{ ...inputStyle, fontSize: '12px', padding: '8px 12px', borderColor: '#bbf7d0' }}
                      />
                      <input
                        value={inlineCompanyForm.industry}
                        onChange={e => setInlineCompanyForm(p => ({ ...p, industry: e.target.value }))}
                        placeholder="Industry"
                        style={{ ...inputStyle, fontSize: '12px', padding: '8px 12px', borderColor: '#bbf7d0' }}
                      />
                    </div>
                    <input
                      value={inlineCompanyForm.compliance_type}
                      onChange={e => setInlineCompanyForm(p => ({ ...p, compliance_type: e.target.value }))}
                      placeholder="Compliance Type (e.g., VAT, Corporate Tax)"
                      style={{ ...inputStyle, fontSize: '12px', padding: '8px 12px', borderColor: '#bbf7d0' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                      <button onClick={() => { setShowInlineCompanyForm(false); setInlineCompanyForm({ name: '', tax_registration: '', industry: '', compliance_type: '' }); }}
                        style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '12px', transition: 'all 0.15s' }}>
                        Cancel
                      </button>
                      <button onClick={saveInlineCompany} disabled={inlineCompanySaving}
                        style={{ padding: '8px 16px', background: inlineCompanySaving ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', borderRadius: '8px', cursor: inlineCompanySaving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '12px', boxShadow: '0 2px 8px rgba(16,185,129,0.3)', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Plus size={14} /> {inlineCompanySaving ? 'Creating...' : 'Create & Select'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </FormField>
            <FormField label="Task Types *">
              <MultiSelect
                options={taskTypes.filter(t => t.active).map(t => ({ id: t.id, label: t.name }))}
                selected={newTask.task_type_ids}
                onChange={vals => setNewTask(p => ({ ...p, task_type_ids: vals, task_type_id: vals[0] || '' }))}
                placeholder="Select Task Types"
              />
            </FormField>
            <FormField label="Priority *">
              <select value={newTask.priority} onChange={e => setNewTask(p => ({ ...p, priority: e.target.value }))} style={inputStyle}>
                {BAHRAIN_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </FormField>
            <FormField label="Status">
              <select value={newTask.status} onChange={e => setNewTask(p => ({ ...p, status: e.target.value }))} style={inputStyle}>
                <option value="">Default (Auto)</option>
                {getStatusesForTask(newTask.task_type_ids, statusObjects, dynamicStatuses).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormField>
            <FormField label="Auditor">
              {isAdminUser ? (
                <select value={newTask.auditor_id} onChange={e => setNewTask(p => ({ ...p, auditor_id: e.target.value }))} style={inputStyle}>
                  <option value="">Select Auditor</option>
                  {auditors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              ) : (
                <select value={newTask.auditor_id} onChange={e => setNewTask(p => ({ ...p, auditor_id: e.target.value }))} style={{ ...inputStyle, opacity: editingTaskId ? 0.6 : 1 }} disabled={!!editingTaskId}>
                  <option value="">Select Auditor</option>
                  {auditors.filter(a => userAuditorAccess.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
            </FormField>
            <FormField label="Due Date *">
              <input type="date" value={newTask.deadline} onChange={e => setNewTask(p => ({ ...p, deadline: e.target.value }))} style={inputStyle} />
            </FormField>
            <FormField label="PL Date (Proposal Letter)">
              <input type="date" value={newTask.pl_date} onChange={e => setNewTask(p => ({ ...p, pl_date: e.target.value }))} style={inputStyle} />
            </FormField>
          </div>
          <div style={{ background: '#f8fafc', borderRadius: '14px', padding: '18px', marginBottom: '18px', border: '1px solid #f1f5f9' }}>
            <FormField label="📝 Description">
              <textarea value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} placeholder="Describe task details, requirements, and notes..." style={{ ...inputStyle, minHeight: '90px', resize: 'vertical', background: '#ffffff' }} />
            </FormField>
            <FormField label="👥 Assign To">
              <MultiSelect
                options={partners.map(p => ({ id: p.id, label: p.username }))}
                selected={newTask.assigned_partners}
                onChange={vals => setNewTask(p => ({ ...p, assigned_partners: vals }))}
                placeholder="Select Partners"
              />
            </FormField>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
            <button onClick={() => setShowTaskModal(false)} style={{ padding: '11px 24px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', transition: 'all 0.15s ease' }} onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'} onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}>Cancel</button>
            <button onClick={saveTask} style={{ padding: '11px 28px', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', boxShadow: '0 4px 14px rgba(16,185,129,0.3)', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', gap: '8px' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(16,185,129,0.4)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(16,185,129,0.3)'; }}>Save Task</button>
          </div>
        </Modal>
      )}

      {/* Task Detail Modal */}
      {detailTask && (
        <Modal title={`Task #${detailTask.id.slice(0, 6)} — ${taskTypes.find(t => t.id === detailTask.task_type_id)?.name || detailTask.title}`} onClose={() => setDetailTask(null)}>
          {/* Task info grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px',
            padding: '20px', background: 'var(--bg-secondary, #ECF0F1)', borderRadius: '8px', marginBottom: '24px',
          }}>
            <div>
              <strong>Company:</strong> {detailCompany?.company_name || 'Unknown'}
              {detailCompany?.google_drive_link && (
                <a
                  href={formatExternalUrl(detailCompany.google_drive_link)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    marginLeft: '8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    color: '#16a34a',
                    fontSize: '12px',
                    textDecoration: 'none',
                    fontWeight: 600,
                    background: '#f0fdf4',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: '1px solid #bbf7d0'
                  }}
                  title={`Open Google Drive: ${detailCompany.google_drive_link}`}
                >
                  <GoogleDriveIcon size={13} /> Open Drive
                </a>
              )}
            </div>
            <div>
              <strong>CR Number:</strong> {detailCompany?.cr_number || '—'}
              {detailCompany?.cr_link && (
                <a
                  href={formatExternalUrl(detailCompany.cr_link)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    marginLeft: '8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: '#2563eb',
                    fontSize: '12px',
                    textDecoration: 'none',
                    fontWeight: 600,
                    background: '#eff6ff',
                    padding: '2px 8px',
                    borderRadius: '5px',
                    border: '1px solid #bfdbfe'
                  }}
                  title={`Open CR Link: ${detailCompany.cr_link}`}
                >
                  <Globe size={12} strokeWidth={2.2} /> Open CR Link
                </a>
              )}
            </div>
            <div><strong>Type:</strong> {(() => {
              const ids = detailTask.task_type_ids && detailTask.task_type_ids.length > 0 ? detailTask.task_type_ids : (detailTask.task_type_id ? detailTask.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : []);
              const names = ids.map(id => taskTypes.find(t => t.id === id)?.name).filter(Boolean);
              return names.length > 0 ? names.join(', ') : detailTask.title;
            })()}</div>
            <div><strong>Auditor:</strong> {auditors.find(a => a.id === detailTask.auditor_id)?.name || 'None'}</div>
            <div><strong>Priority:</strong> <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: priorityColor(detailTask.priority).bg, color: '#fff' }}>{detailTask.priority}</span></div>
            <div><strong>Status:</strong> <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: '#D6EAF8', color: '#3498DB' }}>{detailTask.status}</span></div>
            <div><strong>Due Date:</strong> {detailTask.deadline}</div>
            <div>
              <strong>PL Date:</strong> {detailTask.pl_date ? (
                <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: '#1d4ed8', background: '#eff6ff', padding: '2px 8px', borderRadius: '6px', border: '1px solid #bfdbfe', marginLeft: '6px' }}>
                  📅 {formatPlDateDisplay(detailTask.pl_date)}
                </span>
              ) : (
                <span style={{ color: '#94a3b8', marginLeft: '6px' }}>Not set</span>
              )}
            </div>
            <div><strong>Created:</strong> {detailTask.created_at?.slice(0, 10)}</div>
            <div><strong>Description Updated:</strong> {formatDescDate(descUpdateMap[detailTask.id] || (detailTask.description ? detailTask.created_at : null))}</div>
            <div style={{ gridColumn: '1 / -1' }}><strong>Description:</strong><br />{detailTask.description || 'No description'}</div>
          </div>

          {/* Status History Timeline */}
          <h3 style={{ marginBottom: '15px', color: '#2E4053', fontSize: '16px' }}>Status History</h3>
          <div style={{ position: 'relative', paddingLeft: '40px', marginBottom: '24px' }}>
            <div style={{ position: 'absolute', left: '15px', top: 0, bottom: 0, width: '2px', background: '#BDC3C7' }} />
            {statusLogs.length === 0 ? (
              <div style={{ padding: '15px', color: '#7F8C8D' }}>No history yet</div>
            ) : statusLogs.map((log, i) => (
              <div key={log.id} style={{ position: 'relative', marginBottom: '20px' }}>
                <div style={{
                  position: 'absolute', left: '-32px', top: '0',
                  width: '14px', height: '14px', borderRadius: '50%',
                  background: '#5DADE2', border: '3px solid white', boxShadow: '0 0 0 2px #5DADE2',
                }} />
                <div style={{ background: 'var(--bg-secondary, #ECF0F1)', padding: '12px 15px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#7F8C8D', fontWeight: 600 }}>{new Date(log.created_at).toLocaleString()}</div>
                  <div style={{ fontWeight: 700, color: '#2E4053', margin: '4px 0' }}>{log.status}</div>
                  <div style={{ fontSize: '14px', color: '#34495E' }}>{log.remarks || 'No remarks'}</div>
                  <div style={{ fontSize: '12px', color: '#7F8C8D', marginTop: '4px' }}>
                    By: {(log as any).updater?.username || 'Unknown'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Update Status */}
          {canUpdateStatus && (
            <>
              <h3 style={{ marginBottom: '15px', color: '#2E4053', fontSize: '16px' }}>Update Status</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <FormField label="New Status">
                  <select value={updateStatus} onChange={e => setUpdateStatus(e.target.value)} style={inputStyle}>
                    {(() => {
                      const dttIds = detailTask?.task_type_ids && detailTask.task_type_ids.length > 0
                        ? detailTask.task_type_ids
                        : (detailTask?.task_type_id ? detailTask.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : []);
                      return getStatusesForTask(dttIds, statusObjects, dynamicStatuses).map(s => <option key={s} value={s}>{s}</option>);
                    })()}
                  </select>
                </FormField>
                <FormField label="Updated By">
                  <select value={updateBy} onChange={e => setUpdateBy(e.target.value)} style={inputStyle} disabled={!isAdminUser && !(detailTask && canManageTask(detailTask))}>
                    {!partners.some(p => p.id === updateBy) && updateBy && (
                      <option value={updateBy}>{currentUser?.username || 'Current User'}</option>
                    )}
                    {partners.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
                  </select>
                </FormField>
              </div>
              {isAdminUser && (
                <FormField label="Assign Partners">
                  <MultiSelect
                    options={partners.map(p => ({ id: p.id, label: p.username }))}
                    selected={updatePartners}
                    onChange={setUpdatePartners}
                    placeholder="Select Partners"
                  />
                </FormField>
              )}
              <FormField label="Remarks">
                <textarea value={updateRemarks} onChange={e => setUpdateRemarks(e.target.value)} placeholder="Add notes..." style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} />
              </FormField>
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
            <button onClick={() => setDetailTask(null)} style={{ padding: '11px 24px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', transition: 'all 0.15s ease' }} onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'} onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}>Close</button>
            {canUpdateStatus && (
              <button onClick={submitStatusUpdate} style={{ padding: '11px 24px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', boxShadow: '0 4px 14px rgba(59,130,246,0.3)', transition: 'all 0.15s ease' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(59,130,246,0.4)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(59,130,246,0.3)'; }}>Update Status</button>
            )}
          </div>
        </Modal>
      )}

      {activeTooltipTaskId && typeof window !== 'undefined' && createPortal(
        <div
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
          style={{
            position: 'fixed',
            top: tooltipPos.y,
            left: tooltipPos.x,
            width: '330px',
            zIndex: 9999,
            paddingTop: tooltipPos.align === 'bottom' ? '6px' : '0px',
            paddingBottom: tooltipPos.align === 'top' ? '6px' : '0px',
            marginTop: tooltipPos.align === 'bottom' ? '-6px' : '0px',
            marginBottom: tooltipPos.align === 'top' ? '-6px' : '0px',
            transform: tooltipPos.align === 'top' ? 'translateY(-100%)' : 'none',
            pointerEvents: 'auto',
          }}
        >
          <div
            className={`tooltip-glass-card ${
              tooltipPos.align === 'bottom' ? 'animate-tooltip-down' : 'animate-tooltip-up'
            }`}
            style={{
              borderRadius: '14px',
              padding: '16px',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px' }}>📝</span>
              <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b' }}>
                Task Description
              </span>
            </div>
            <div style={{
              fontSize: '13px',
              lineHeight: 1.6,
              color: '#1e293b',
              maxHeight: '220px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              paddingRight: '4px'
            }}>
              {tasks.find(t => t.id === activeTooltipTaskId)?.description || ''}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ─── Floating Bottom Batch Action Dock (Expert UI) ─── */}
      {selectedTaskIds.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 900,
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          color: '#ffffff',
          borderRadius: '18px',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 16px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.12)',
          animation: 'fadeIn 0.2s ease-out',
          width: 'max-content',
          maxWidth: 'calc(100vw - 24px)',
          flexWrap: 'wrap',
          justifyContent: 'center'
        }}>
          {/* Selected count badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '12px', borderRight: '1px solid rgba(255,255,255,0.15)' }}>
            <span style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: '#ffffff',
              padding: '3px 9px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 700,
            }}>
              {selectedTaskIds.length}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap' }}>
              Tasks Selected
            </span>
          </div>

          {/* Quick Select All / Deselect buttons */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {!isAllFilteredSelected ? (
              <button
                onClick={selectAllFiltered}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  color: '#e2e8f0',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '6px 11px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              >
                Select All ({filtered.length})
              </button>
            ) : (
              <button
                onClick={deselectAll}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  color: '#e2e8f0',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '6px 11px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              >
                Deselect All
              </button>
            )}
          </div>

          {/* Primary WhatsApp Share Button */}
          <button
            onClick={() => { setShowBulkWhatsAppModal(true); setBulkWaCopied(false); }}
            style={{
              background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(37,211,102,0.35)',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <Send size={14} /> Share via WhatsApp
          </button>

          {/* Export Selected to Excel Button */}
          <button
            onClick={() => handleExportExcel('selected')}
            style={{
              background: 'rgba(59, 130, 246, 0.25)',
              color: '#93c5fd',
              border: '1px solid rgba(96, 165, 250, 0.35)',
              borderRadius: '10px',
              padding: '8px 14px',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)'; }}
          >
            <FileSpreadsheet size={14} /> Export Selected ({selectedTaskIds.length})
          </button>

          {/* Close Selection */}
          <button
            onClick={() => { setMultiSelectMode(false); setSelectedTaskIds([]); }}
            style={{
              background: 'transparent',
              color: '#94a3b8',
              border: 'none',
              borderRadius: '8px',
              padding: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s ease',
            }}
            title="Exit Selection Mode"
            onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ─── Multiple Selection Bulk WhatsApp Share Modal (Expert UI) ─── */}
      {showBulkWhatsAppModal && (
        <Modal
          title=""
          onClose={() => setShowBulkWhatsAppModal(false)}
        >
          {(() => {
            const selectedTasks = tasks.filter(t => selectedTaskIds.includes(t.id));
            const message = buildBulkWhatsAppMessage();

            return (
              <div style={{ padding: '4px 0' }}>
                {/* Modal Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="#25D366">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.3px' }}>
                        Share Selected Tasks via WhatsApp
                      </h3>
                      <span style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px' }}>
                        {selectedTasks.length} Selected
                      </span>
                    </div>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: '3px 0 0' }}>
                      Configure layout, grouping, and format directly for WhatsApp
                    </p>
                  </div>
                </div>

                {/* Configuration Options */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px', marginBottom: '18px' }}>
                  {/* Group By selector */}
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
                      Group Tasks By
                    </label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {[
                        { id: 'status', label: 'Status' },
                        { id: 'partner', label: 'Assignee' },
                        { id: 'company', label: 'Company' },
                        { id: 'flat', label: 'Flat List' },
                      ].map(g => (
                        <button
                          key={g.id}
                          onClick={() => setBulkWaGroupBy(g.id as any)}
                          style={{
                            padding: '7px 14px',
                            borderRadius: '8px',
                            border: bulkWaGroupBy === g.id ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                            background: bulkWaGroupBy === g.id ? '#eff6ff' : '#ffffff',
                            color: bulkWaGroupBy === g.id ? '#1d4ed8' : '#475569',
                            fontWeight: bulkWaGroupBy === g.id ? 700 : 500,
                            fontSize: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Include Fields Toggles */}
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
                      Include Fields
                    </label>
                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                      {[
                        { label: 'CR Number', state: bulkWaIncludeCr, setter: setBulkWaIncludeCr },
                        { label: 'Description', state: bulkWaIncludeDesc, setter: setBulkWaIncludeDesc },
                        { label: 'Priority', state: bulkWaIncludePriority, setter: setBulkWaIncludePriority },
                        { label: 'Due Date', state: bulkWaIncludeDueDate, setter: setBulkWaIncludeDueDate },
                        { label: 'Auditor', state: bulkWaIncludeAuditor, setter: setBulkWaIncludeAuditor },
                        { label: 'Assigned To', state: bulkWaIncludeAssigned, setter: setBulkWaIncludeAssigned },
                      ].map(f => (
                        <label key={f.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#334155', cursor: 'pointer', fontWeight: 500 }}>
                          <input
                            type="checkbox"
                            checked={f.state}
                            onChange={e => f.setter(e.target.checked)}
                            style={{ cursor: 'pointer', accentColor: '#2563eb' }}
                          />
                          {f.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Custom Header Note */}
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
                      Custom Announcement / Header (Optional)
                    </label>
                    <input
                      type="text"
                      value={bulkWaCustomNote}
                      onChange={e => setBulkWaCustomNote(e.target.value)}
                      placeholder="e.g. Action Required: Weekly Compliance Update"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12.5px',
                        outline: 'none',
                        background: '#ffffff',
                        color: '#0f172a',
                      }}
                    />
                  </div>
                </div>

                {/* Message Preview Box */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.5px' }}>
                      WhatsApp Message Preview
                    </span>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                      {message.length} chars · {message.split('\n').length} lines
                    </span>
                  </div>
                  <pre style={{
                    background: '#0f172a',
                    color: '#e2e8f0',
                    padding: '16px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    lineHeight: '1.6',
                    maxHeight: '260px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    border: '1px solid #334155',
                    boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.3)',
                    margin: 0,
                  }}>
                    {message}
                  </pre>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                  <button
                    onClick={() => setShowBulkWhatsAppModal(false)}
                    style={{
                      padding: '10px 18px',
                      background: '#f1f5f9',
                      color: '#475569',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '13px',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(message);
                      setBulkWaCopied(true);
                      setTimeout(() => setBulkWaCopied(false), 2500);
                    }}
                    style={{
                      padding: '10px 18px',
                      background: bulkWaCopied ? '#ecfdf5' : '#ffffff',
                      color: bulkWaCopied ? '#059669' : '#0f172a',
                      border: bulkWaCopied ? '1px solid #a7f3d0' : '1px solid #cbd5e1',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {bulkWaCopied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy Message</>}
                  </button>
                  <button
                    onClick={() => {
                      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
                    }}
                    style={{
                      padding: '10px 22px',
                      background: 'linear-gradient(135deg, #25D366, #128C7E)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 14px rgba(37,211,102,0.35)',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(37,211,102,0.45)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(37,211,102,0.35)'; }}
                  >
                    <Send size={15} /> Share via WhatsApp
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* ─── Export Success Toast ─── */}
      {exportToast && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 9999,
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
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
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={14} color="#ffffff" />
          </div>
          {exportToast}
        </div>
      )}
    </div>
  );
}

/* ---- Shared sub-components & styles ---- */

function MultiSelect({ options, selected, onChange, placeholder }: { options: { id: string, label: string }[], selected: string[], onChange: (val: string[]) => void, placeholder: string }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const toggle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selected.includes(id)) {
      onChange(selected.filter(x => x !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <div onClick={() => setOpen(!open)} style={{
        padding: '8px 12px', border: open ? '1.5px solid var(--accent)' : '1px solid var(--border)',
        borderRadius: '10px', fontSize: '13px', width: '100%',
        background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer',
        display: 'flex', flexWrap: 'wrap', gap: '5px', minHeight: '40px',
        alignItems: 'center', transition: 'all 0.15s ease',
        boxShadow: open ? '0 0 0 3px rgba(37,99,235,0.15)' : 'none'
      }}>
        {selected.length === 0 ? <span style={{ color: 'var(--text-tertiary)' }}>{placeholder}</span> :
          selected.map(s => {
            const opt = options.find(o => o.id === s);
            return (
              <span key={s} style={{
                background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid rgba(59, 130, 246, 0.35)',
                padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px',
                fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px'
              }}>
                {opt?.label || s}
                <X size={12} onClick={(e) => toggle(s, e)} style={{ cursor: 'pointer', opacity: 0.7 }} />
              </span>
            );
          })
        }
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'var(--bg-card, var(--bg-secondary))', border: '1px solid var(--border)', borderRadius: '10px',
          marginTop: '6px', zIndex: 100, maxHeight: '220px', overflowY: 'auto',
          boxShadow: '0 16px 36px rgba(0,0,0,0.35)'
        }}>
          {options.map(opt => (
            <div key={opt.id} onClick={(e) => toggle(opt.id, e)} style={{
              padding: '9px 12px', cursor: 'pointer', display: 'flex',
              alignItems: 'center', gap: '9px',
              background: selected.includes(opt.id) ? 'var(--accent-light)' : 'transparent',
              borderBottom: '1px solid var(--border-light)', transition: 'background 0.1s ease'
            }}
              onMouseEnter={e => { if (!selected.includes(opt.id)) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
              onMouseLeave={e => { if (!selected.includes(opt.id)) e.currentTarget.style.background = 'transparent'; }}
            >
              <input type="checkbox" checked={selected.includes(opt.id)} readOnly style={{ cursor: 'pointer', accentColor: 'var(--accent)' }} />
              <span style={{ color: selected.includes(opt.id) ? 'var(--accent)' : 'var(--text-primary)', fontSize: '13px', fontWeight: selected.includes(opt.id) ? 600 : 400 }}>{opt.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="stat-modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '16px', animation: 'fadeIn 0.15s ease-out',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card, var(--bg-secondary))', borderRadius: '18px', maxWidth: '820px', width: '100%',
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
        animation: 'scaleIn 0.2s ease-out', border: '1px solid var(--border)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--bg-card, var(--bg-secondary))',
          borderRadius: '18px 18px 0 0',
        }}>
          <h2 style={{ fontSize: '16px', color: 'var(--text-primary)', fontWeight: 700, letterSpacing: '-0.01em', margin: 0, lineHeight: 1.3 }}>{title}</h2>
          <button onClick={onClose} style={{
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-secondary)',
            width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s ease'
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-tertiary)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <X size={15} />
          </button>
        </div>
        <div style={{ padding: '20px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function getStatusesForTask(
  taskTypeIds: string[],
  statusObjects: { name: string; task_type_ids?: string[] | null }[],
  fallbackStatuses: string[]
): string[] {
  if (statusObjects.length === 0) return [...fallbackStatuses];

  if (!taskTypeIds || taskTypeIds.length === 0) {
    return [...new Set(statusObjects.map(s => s.name))].sort((a, b) => a.localeCompare(b));
  }

  const filtered = statusObjects.filter(s => {
    if (!s.task_type_ids || s.task_type_ids.length === 0) return true;
    return s.task_type_ids.some((id: string) => taskTypeIds.includes(id));
  });

  return [...new Set(filtered.map(s => s.name))].sort((a, b) => a.localeCompare(b));
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '8px' }}>
      <label style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '12.5px', letterSpacing: '0.01em', display: 'flex', alignItems: 'center', gap: '4px' }}>{label}</label>
      {children}
    </div>
  );
}

const filterStyle: React.CSSProperties = {
  height: '38px',
  padding: '0 12px',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  fontSize: '12.5px',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  outline: 'none',
  transition: 'all 0.15s ease',
  boxShadow: 'var(--card-shadow)',
  fontWeight: 500,
  flex: '1 1 125px',
  minWidth: '120px',
  display: 'flex',
  alignItems: 'center',
  boxSizing: 'border-box'
};

const compactCell: React.CSSProperties = {
  padding: '9px 8px',
  fontSize: '12px',
  verticalAlign: 'middle',
  color: 'var(--text-primary)',
  boxSizing: 'border-box',
  lineHeight: '1.4'
};

const cellStyle: React.CSSProperties = {
  padding: '9px 8px',
  fontSize: '12px',
  verticalAlign: 'middle',
  color: 'var(--text-primary)',
  boxSizing: 'border-box',
  lineHeight: '1.4'
};

const dropdownStyle: React.CSSProperties = {
  padding: '5px 8px',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  fontSize: '11.5px',
  width: '100%',
  minWidth: '100px',
  cursor: 'pointer',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  outline: 'none',
  transition: 'all 0.15s ease',
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  padding: '10px 14px',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  fontSize: '13px',
  width: '100%',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  outline: 'none',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  fontWeight: 500,
  boxSizing: 'border-box'
};

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '10px 14px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: '13px',
  color: 'var(--text-primary)',
  fontWeight: 500,
  transition: 'background 0.1s ease',
  textAlign: 'left',
};

function btnSmStyle(bg: string): React.CSSProperties {
  return {
    padding: '8px 12px',
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.15s ease',
    boxShadow: `0 1px 3px ${bg}40`,
    fontSize: '12px',
    fontWeight: 600
  };
}
