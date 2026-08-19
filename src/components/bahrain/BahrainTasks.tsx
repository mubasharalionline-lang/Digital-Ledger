'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Task, Company, User, TaskType, StatusLog } from '@/lib/supabase';
import { getDataCountry, getSession, isAdmin } from '@/lib/auth';
import { BAHRAIN_PRIORITIES, BAHRAIN_STATUSES } from '@/lib/bahrain';
import { Plus, Eye, Trash2, X, Edit2, MoreHorizontal, Clock, CheckCircle2, Check, BarChart3, PieChart, Activity, ArrowRight, TrendingUp, Building2, Share2, MessageSquare, Copy, Send, Search, ListTodo, FileSpreadsheet, CheckSquare, Square, Download, ChevronDown, ExternalLink, Link2 } from 'lucide-react';
import { EGRESS_OPTIMIZATION_MODE } from '@/lib/optimizationConfig';
import { exportTaskManagementExcel } from '@/lib/reportExportUtils';
import CountryFlag from '@/components/CountryFlag';

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

  const [tasks, setTasks] = useState<Task[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [partners, setPartners] = useState<User[]>([]);
  const [auditors, setAuditors] = useState<any[]>([]);
  const [dynamicStatuses, setDynamicStatuses] = useState<string[]>(BAHRAIN_STATUSES);
  const [statusObjects, setStatusObjects] = useState<{ name: string; task_type_ids: string[] | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<{ id: string, message: string, taskId: string }[]>([]);

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

  // New Task modal
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({
    company_id: '', task_type_id: '', task_type_ids: [] as string[], priority: 'Medium', status: '', auditor_id: '', deadline: '', description: '', assigned_to: '', assigned_partners: [] as string[]
  });

  // Task Detail modal
  const [detailTask, setDetailTask] = useState<Task | null>(null);

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

  // Reset tooltip if filters or search changes to prevent orphaned tooltips
  useEffect(() => {
    activeTooltipRef.current = null;
    setActiveTooltipTaskId(null);
    setInlineEditCrId(null);
    setInlineEditDescId(null);
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

  const dataCountry = getDataCountry();

  const loadData = useCallback(async () => {
    const cacheKey = 'tasks_data_cache';
    const cacheTimeKey = 'tasks_data_time';
    const cachedData = sessionStorage.getItem(cacheKey);
    const cacheTime = sessionStorage.getItem(cacheTimeKey);

    let hadCache = false;

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
        hadCache = true;
        // If cache is fresh (< 2 min), skip network entirely
        if (age < 2 * 60 * 1000) return;
      } catch (e) { }
    }

    // Fetch fresh data (runs in background if we had cache)
    try {
      let usersQuery = supabase.from('users').select('id, username, role, country, permissions, created_at').order('created_at', { ascending: false });
      if (dataCountry) {
        usersQuery = usersQuery.eq('country', dataCountry);
      }

      const compsPromise = (async () => {
        const res = await supabase.from('companies').select('id, company_name, notes, country, cr_number, cr_link, created_at').eq('country', dataCountry || 'Bahrain');
        if (res.error) {
          console.warn('Companies select with cr_link failed (column may not exist yet in DB), falling back...', res.error);
          return supabase.from('companies').select('id, company_name, notes, country, cr_number, created_at').eq('country', dataCountry || 'Bahrain');
        }
        return res;
      })();

      const [compsRes, ttRes, usersRes, statusRes, audRes, descLogsRes] = await Promise.all([
        compsPromise,
        supabase.from('task_types').select('id, name, category, jurisdiction, status_options, active, created_at').eq('active', true).eq('country', dataCountry || 'Bahrain'),
        usersQuery,
        dataCountry
          ? supabase.from('statuses').select('name, active, task_type_ids').eq('country', dataCountry)
          : supabase.from('statuses').select('name, active, task_type_ids'),
        dataCountry
          ? supabase.from('auditors').select('id, name, country').eq('country', dataCountry).order('name')
          : supabase.from('auditors').select('id, name, country').order('name'),
        supabase.from('status_log').select('task_id, created_at, remarks').ilike('remarks', '%Description%').order('created_at', { ascending: false }).limit(5000)
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

      // Build map of latest description update dates
      const descMap: Record<string, string> = {};
      (descLogsRes.data || []).forEach((l: any) => {
        if (!descMap[l.task_id]) {
          descMap[l.task_id] = l.created_at;
        }
      });
      setDescUpdateMap(descMap);

      const companyIds = companyList.map(c => c.id);
      let taskList: Task[] = [];
      if (companyIds.length > 0) {
        const { data: t } = await supabase.from('tasks').select('id, title, company_id, assigned_to, assigned_partners, status, priority, deadline, admin_note, task_type_id, task_type_ids, auditor_id, description, is_daily, country, pl_uploaded, created_at').in('company_id', companyIds).neq('is_daily', true);
        taskList = t || [];
      }

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
        descUpdateMap: descMap
      }));
      sessionStorage.setItem(cacheTimeKey, Date.now().toString());

    } catch (err) {
      console.error('Load error:', err);
    }
    setLoading(false);
  }, [dataCountry]);

  useEffect(() => { loadData(); }, [loadData]);

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
          const now = Date.now();
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

  // Check for openDesc URL param
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
  const handleExportExcel = (mode: 'all' | 'filtered' | 'selected' = 'filtered') => {
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
      alert('No tasks found to export.');
      return;
    }

    try {
      exportTaskManagementExcel(listToExport, {
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

  // Save new task
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
      // Add the new company to the local list and auto-select it
      setCompanies(prev => [...prev, data].sort((a, b) => a.company_name.localeCompare(b.company_name)));
      setNewTask(p => ({ ...p, company_id: data.id }));
      setShowInlineCompanyForm(false);
      setInlineCompanyForm({ name: '', tax_registration: '', industry: '', compliance_type: '' });
      // Invalidate caches
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

    // Use the first selected task type for backward-compatible fields
    const firstTt = taskTypes.find(t => t.id === typeIds[0]);
    const firstStatus = newTask.status || (firstTt?.status_options ? firstTt.status_options.split(',')[0].trim() : 'Not Started');
    const assignArray = newTask.assigned_partners || [];
    const assignTo = assignArray.length > 0 ? assignArray[0] : null;
    const desc = newTask.description && newTask.description.length > 0 ? newTask.description : null;
    const primaryTtId = typeIds.length > 0 ? typeIds[0] : null;
    // Build a combined title from all selected types
    const combinedTitle = typeIds.map(id => taskTypes.find(t => t.id === id)?.name).filter(Boolean).join(', ') || 'Untitled';

    let resultError, resultData;

    if (editingTaskId) {
      const { data, error } = await supabase.from('tasks').update({
        title: combinedTitle,
        company_id: newTask.company_id,
        task_type_id: primaryTtId,
        task_type_ids: typeIds,
        priority: newTask.priority,
        status: firstStatus,
        auditor_id: newTask.auditor_id || null,
        deadline: newTask.deadline,
        description: desc,
        assigned_to: assignTo,
        assigned_partners: assignArray,
      }).eq('id', editingTaskId).select().single();
      resultError = error;
      resultData = data;
    } else {
      const { data, error } = await supabase.from('tasks').insert({
        title: combinedTitle,
        company_id: newTask.company_id,
        task_type_id: primaryTtId,
        task_type_ids: typeIds,
        priority: newTask.priority,
        deadline: newTask.deadline,
        description: desc,
        assigned_to: assignTo,
        assigned_partners: assignArray,
        status: firstStatus,
        auditor_id: newTask.auditor_id || null,
        country: dataCountry || 'Bahrain',
      }).select().single();
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
    setNewTask({ company_id: '', task_type_id: '', task_type_ids: [], priority: 'Medium', status: '', auditor_id: '', deadline: '', description: '', assigned_to: '', assigned_partners: [] });

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



  const priorityColor = (p: string) => {
    switch (p) {
      case 'Urgent':
      case 'Critical': return { bg: '#E74C3C', color: '#fff' };
      case 'High': return { bg: '#F39C12', color: '#fff' };
      case 'Medium': return { bg: '#3498DB', color: '#fff' };
      case 'Low': return { bg: '#95A5A6', color: '#fff' };
      default: return { bg: '#95A5A6', color: '#fff' };
    }
  };

  const statusColor = (s: string) => {
    if (!s) return { bg: '#47556912', color: '#475569', border: '#47556924' };
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
      border: `${hex}24`
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
              onClick={() => { setEditingTaskId(null); setNewTask({ company_id: '', task_type_id: '', task_type_ids: [], priority: 'Medium', status: '', auditor_id: '', deadline: '', description: '', assigned_to: '', assigned_partners: [] }); setShowTaskModal(true); }}
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

      {/* Filters */}
      <div className="task-filters" style={{
        display: 'flex', gap: '10px', marginBottom: '22px', flexWrap: 'wrap',
        padding: '16px 18px', background: 'rgba(255, 255, 255, 0.75)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderRadius: '18px', border: '1px solid rgba(255,255,255,0.9)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)', alignItems: 'center'
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
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px', display: 'flex' }}>
              <X size={13} />
            </button>
          )}
        </div>
        {(filterStatus || filterPriority || filterCompany || filterPartner || filterAuditor || filterTaskType || filterDescUpdated || search) && (
          <button
            onClick={() => { setFilterStatus(''); setFilterPriority(''); setFilterCompany(''); setFilterPartner(''); setFilterAuditor(''); setFilterTaskType(''); setFilterDescUpdated(''); setSearch(''); }}
            style={{ padding: '8px 16px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', transition: 'all 0.15s ease' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fef2f2'; }}
          >
            <X size={14} /> Clear Filters
          </button>
        )}
      </div>

      {/* ─── 4 Compact Stat Cards ─── */}
      {(isAdminUser || !isAdminUser) && (
        <div className="task-stat-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '22px' }}>
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
              background: '#ffffff', borderRadius: '14px', padding: '16px 18px',
              border: '1px solid #e2e8f0', cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)', transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'center', gap: '14px',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(59,130,246,0.12)'; e.currentTarget.style.borderColor = '#93c5fd'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.03)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
          >
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Clock size={20} color="#2563eb" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Recently Modified</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                {(() => {
                  const now = new Date();
                  const recent = tasks.filter(t => {
                    const created = new Date(t.created_at);
                    return (now.getTime() - created.getTime()) < 7 * 24 * 60 * 60 * 1000;
                  });
                  return recent.length;
                })()}
              </div>
              <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '1px' }}>Last 7 days · Click to view</div>
            </div>
            <ArrowRight size={16} color="#94a3b8" />
          </div>

          {/* Card 2: Completed Tasks */}
          <div
            onClick={() => setShowCompletedModal(true)}
            style={{
              background: '#ffffff', borderRadius: '14px', padding: '16px 18px',
              border: '1px solid #e2e8f0', cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)', transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'center', gap: '14px',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(16,185,129,0.12)'; e.currentTarget.style.borderColor = '#6ee7b7'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.03)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
          >
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CheckCircle2 size={20} color="#059669" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Completed</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                {tasks.filter(t => {
                  const sl = (t.status || '').toLowerCase();
                  return sl.includes('complete') || sl.includes('closed') || sl.includes('filed') || sl.includes('done');
                }).length}
              </div>
              <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '1px' }}>Total completed · Click to view</div>
            </div>
            <ArrowRight size={16} color="#94a3b8" />
          </div>

          {/* Card 3: All Task Types */}
          <div
            onClick={() => setShowTaskTypeModal(true)}
            style={{
              background: '#ffffff', borderRadius: '14px', padding: '16px 18px',
              border: '1px solid #e2e8f0', cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)', transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'center', gap: '14px',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(139,92,246,0.12)'; e.currentTarget.style.borderColor = '#c4b5fd'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.03)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
          >
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #ede9fe, #ddd6fe)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BarChart3 size={20} color="#7c3aed" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Task Types</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                {taskTypes.filter(t => t.active).length}
              </div>
              <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '1px' }}>Distribution · Click to view</div>
            </div>
            <ArrowRight size={16} color="#94a3b8" />
          </div>

          {/* Card 4: WhatsApp Message Generator */}
          <div
            onClick={() => { setShowStatusModal(true); setWaGenStatuses([]); setWaGenPartners([]); setWaGenCopied(false); }}
            style={{
              background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)', borderRadius: '14px', padding: '16px 18px',
              border: '1px solid #bbf7d0', cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)', transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'center', gap: '14px',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(37,211,102,0.18)'; e.currentTarget.style.borderColor = '#86efac'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.03)'; e.currentTarget.style.borderColor = '#bbf7d0'; }}
          >
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>WhatsApp Generator</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                <MessageSquare size={19} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                Share
              </div>
              <div style={{ fontSize: '10.5px', color: '#15803d', marginTop: '1px' }}>Generate by status · Click</div>
            </div>
            <ArrowRight size={16} color="#22c55e" />
          </div>
        </div>
      )}

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
        <Modal title="" onClose={() => setShowStatusModal(false)}>
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

            // Tasks matching any of the selected statuses AND selected partners
            const matchingTasks = (waGenStatuses.length > 0 || waGenPartners.length > 0)
              ? tasks.filter(t => {
                  const statusMatch = waGenStatuses.length === 0 || waGenStatuses.includes(t.status || '');
                  const partnerMatch = waGenPartners.length === 0 || waGenPartners.includes(t.assigned_to || '') || (t.assigned_partners && t.assigned_partners.some(p => waGenPartners.includes(p)));
                  return statusMatch && partnerMatch;
                })
              : [];

            // Build the WhatsApp message — grouped by status or partner
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
                  lines.push('----------------------------------');
                  lines.push('');
                }
                
                lines.push(`*${idx + 1}. Company:* ${comp?.company_name || 'Unknown'}`);
                lines.push(`*CR Number:* ${comp?.cr_number || 'N/A'}`);
                lines.push(`*Audit Type:* ${getAuditType(task)}`);
                lines.push(`*Assigned To:* ${getAssignedNames(task)}`);
                lines.push(`*Status:* ${task.status || 'N/A'}`);
                if (task.description && task.description.trim() !== '') {
                  lines.push(`*Description:* ${task.description}`);
                }
                lines.push('');
              };

              const sections: string[] = [];

              // If grouping by status makes sense (multiple statuses, or status is selected and partner is single/none)
              if (waGenStatuses.length > 1 || (waGenStatuses.length === 1 && waGenPartners.length <= 1) || (waGenStatuses.length > 0 && waGenPartners.length > 0)) {
                waGenStatuses.sort((a, b) => a.localeCompare(b)).forEach(status => {
                  const statusTasks = matchingTasks.filter(t => t.status === status);
                  if (statusTasks.length === 0) return;
                  if (waGenStatuses.length > 1 || waGenPartners.length > 1) {
                    sections.push('━━━━━━━━━━━━━━━━━━');
                    sections.push(`*Status: ${status}* (${statusTasks.length})`);
                    sections.push('━━━━━━━━━━━━━━━━━━');
                    sections.push('');
                  } else {
                    sections.push('━━━━━━━━━━━━━━━━━━');
                    sections.push(`*Status: ${status}* (${statusTasks.length})`);
                    sections.push('━━━━━━━━━━━━━━━━━━');
                    sections.push('');
                  }
                  statusTasks.forEach((task, idx) => formatTask(task, idx, sections));
                });
              } 
              // Otherwise, group by partner
              else if (waGenPartners.length > 0) {
                waGenPartners.forEach(partnerId => {
                  const partner = partners.find(p => p.id === partnerId);
                  const partnerTasks = matchingTasks.filter(t => {
                    const activeIds = t.assigned_partners && t.assigned_partners.length > 0
                      ? t.assigned_partners
                      : (t.assigned_to ? [t.assigned_to] : []);
                    return activeIds.includes(partnerId);
                  });
                  if (partnerTasks.length === 0) return;
                  if (waGenPartners.length > 1) {
                    sections.push('━━━━━━━━━━━━━━━━━━');
                    sections.push(`*Partner: ${partner?.username || 'Unknown'}* (${partnerTasks.length})`);
                    sections.push('━━━━━━━━━━━━━━━━━━');
                    sections.push('');
                  } else {
                    sections.push('━━━━━━━━━━━━━━━━━━');
                    sections.push(`*Partner: ${partner?.username || 'Unknown'}* (${partnerTasks.length})`);
                    sections.push('━━━━━━━━━━━━━━━━━━');
                    sections.push('');
                  }
                  partnerTasks.forEach((task, idx) => formatTask(task, idx, sections));
                });
              }

              return sections.join('\n').trim();
            };

            const message = buildMessage();
            const allStatusesSelected = waGenStatuses.length === allStatuses.length && allStatuses.length > 0;
            const allPartnersSelected = waGenPartners.length === allPartners.length && allPartners.length > 0;

            return (
              <div>
                {/* Premium header */}
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #25D366, #128C7E)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', boxShadow: '0 6px 20px rgba(37,211,102,0.3)' }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="#ffffff">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-0.3px' }}>WhatsApp Message Generator</h3>
                  <div style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', margin: 0 }}>
                    Select statuses and/or partners to generate a shareable message
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px', marginTop: '20px' }}>
                  {/* Left Column: Status multi-select */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Select Statuses</label>
                      <button
                        onClick={toggleAllStatuses}
                        style={{
                          background: 'none', border: '1px solid #e2e8f0', borderRadius: '8px',
                          padding: '4px 12px', fontSize: '11px', fontWeight: 600,
                          color: allStatusesSelected ? '#dc2626' : '#25D366', cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = allStatusesSelected ? '#fef2f2' : '#f0fdf4'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                      >
                        {allStatusesSelected ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div style={{
                      maxHeight: '200px', overflowY: 'auto', borderRadius: '12px',
                      border: '2px solid #e2e8f0', background: '#ffffff', padding: '6px',
                    }}>
                      {allStatuses.map(s => {
                        const count = tasks.filter(t => t.status === s).length;
                        const isChecked = waGenStatuses.includes(s);
                        const sc = statusColor(s);
                        return (
                          <label
                            key={s}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '9px 12px', borderRadius: '8px', cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              background: isChecked ? '#f0fdf4' : 'transparent',
                              border: isChecked ? '1px solid #bbf7d0' : '1px solid transparent',
                              marginBottom: '2px',
                            }}
                            onMouseEnter={e => { if (!isChecked) e.currentTarget.style.background = '#f8fafc'; }}
                            onMouseLeave={e => { if (!isChecked) e.currentTarget.style.background = 'transparent'; }}
                          >
                            <div style={{
                              width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0,
                              border: isChecked ? '2px solid #25D366' : '2px solid #cbd5e1',
                              background: isChecked ? '#25D366' : '#ffffff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'all 0.15s ease',
                            }}>
                              {isChecked && (
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleStatus(s)}
                              style={{ display: 'none' }}
                            />
                            <span style={{
                              padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                              background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                            }}>{s}</span>
                            <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: 'auto', fontWeight: 500 }}>
                              {count}
                            </span>
                          </label>
                        );
                      })}
                      {allStatuses.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '13px' }}>No statuses found</div>
                      )}
                    </div>
                    {waGenStatuses.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                        {waGenStatuses.map(s => (
                          <span
                            key={s}
                            onClick={() => toggleStatus(s)}
                            style={{
                              padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                              background: '#dcfce7', color: '#15803d', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: '4px',
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#fecaca'; e.currentTarget.style.color = '#dc2626'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#dcfce7'; e.currentTarget.style.color = '#15803d'; }}
                          >
                            {s} <X size={10} />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Partner multi-select */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Select Partners</label>
                      <button
                        onClick={toggleAllPartners}
                        style={{
                          background: 'none', border: '1px solid #e2e8f0', borderRadius: '8px',
                          padding: '4px 12px', fontSize: '11px', fontWeight: 600,
                          color: allPartnersSelected ? '#dc2626' : '#25D366', cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = allPartnersSelected ? '#fef2f2' : '#f0fdf4'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                      >
                        {allPartnersSelected ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div style={{
                      maxHeight: '200px', overflowY: 'auto', borderRadius: '12px',
                      border: '2px solid #e2e8f0', background: '#ffffff', padding: '6px',
                    }}>
                      {allPartners.map(p => {
                        const count = tasks.filter(t => {
                          const activeIds = t.assigned_partners && t.assigned_partners.length > 0
                            ? t.assigned_partners
                            : (t.assigned_to ? [t.assigned_to] : []);
                          return activeIds.includes(p.id);
                        }).length;
                        const isChecked = waGenPartners.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '9px 12px', borderRadius: '8px', cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              background: isChecked ? '#f0fdf4' : 'transparent',
                              border: isChecked ? '1px solid #bbf7d0' : '1px solid transparent',
                              marginBottom: '2px',
                            }}
                            onMouseEnter={e => { if (!isChecked) e.currentTarget.style.background = '#f8fafc'; }}
                            onMouseLeave={e => { if (!isChecked) e.currentTarget.style.background = 'transparent'; }}
                          >
                            <div style={{
                              width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0,
                              border: isChecked ? '2px solid #25D366' : '2px solid #cbd5e1',
                              background: isChecked ? '#25D366' : '#ffffff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'all 0.15s ease',
                            }}>
                              {isChecked && (
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => togglePartner(p.id)}
                              style={{ display: 'none' }}
                            />
                            <div style={{
                              width: '24px', height: '24px', borderRadius: '50%',
                              background: 'linear-gradient(135deg, #e2e8f0, #cbd5e1)',
                              color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '10px', fontWeight: 700
                            }}>
                              {p.username.substring(0, 2).toUpperCase()}
                            </div>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                              {p.username}
                            </span>
                            <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: 'auto', fontWeight: 500 }}>
                              {count}
                            </span>
                          </label>
                        );
                      })}
                      {allPartners.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '13px' }}>No partners found</div>
                      )}
                    </div>
                    {waGenPartners.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                        {waGenPartners.map(pId => {
                          const pName = allPartners.find(p => p.id === pId)?.username;
                          return (
                            <span
                              key={pId}
                              onClick={() => togglePartner(pId)}
                              style={{
                                padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                                background: '#dbeafe', color: '#1d4ed8', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '4px',
                                transition: 'all 0.15s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#fecaca'; e.currentTarget.style.color = '#dc2626'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = '#dbeafe'; e.currentTarget.style.color = '#1d4ed8'; }}
                            >
                              {pName} <X size={10} />
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Results */}
                {(waGenStatuses.length > 0 || waGenPartners.length > 0) && matchingTasks.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '14px' }}>No tasks found for the selected combination</div>
                )}

                {(waGenStatuses.length > 0 || waGenPartners.length > 0) && matchingTasks.length > 0 && (
                  <>
                    {/* Count badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                      <div style={{ padding: '4px 12px', borderRadius: '20px', background: '#dcfce7', color: '#15803d', fontSize: '12px', fontWeight: 700 }}>
                        {matchingTasks.length} task{matchingTasks.length !== 1 ? 's' : ''}
                      </div>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                        matching the selected filters
                      </span>
                    </div>

                    {/* Message preview */}
                    <div style={{
                      background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '14px',
                      padding: '16px', marginBottom: '18px', maxHeight: '240px', overflowY: 'auto',
                    }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: '#16a34a', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MessageSquare size={12} /> Message Preview
                      </div>
                      <pre style={{
                        fontSize: '12px', lineHeight: 1.7, color: '#1e293b',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        margin: 0, fontFamily: 'inherit',
                      }}>{message}</pre>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(message).then(() => {
                            setWaGenCopied(true);
                            setTimeout(() => setWaGenCopied(false), 2500);
                          });
                        }}
                        style={{
                          flex: 1, padding: '12px 16px', borderRadius: '12px',
                          border: '1.5px solid #e2e8f0', background: waGenCopied ? '#f0fdf4' : '#ffffff',
                          color: waGenCopied ? '#16a34a' : '#475569', fontWeight: 600, fontSize: '13px',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          gap: '8px', transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={e => { if (!waGenCopied) { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#cbd5e1'; } }}
                        onMouseLeave={e => { if (!waGenCopied) { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = '#e2e8f0'; } }}
                      >
                        {waGenCopied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy Message</>}
                      </button>
                      <button
                        onClick={() => {
                          window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
                        }}
                        style={{
                          flex: 1, padding: '12px 16px', borderRadius: '12px',
                          border: 'none', background: 'linear-gradient(135deg, #25D366, #128C7E)',
                          color: '#ffffff', fontWeight: 700, fontSize: '13px',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          gap: '8px', boxShadow: '0 4px 14px rgba(37,211,102,0.35)',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(37,211,102,0.45)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(37,211,102,0.35)'; }}
                      >
                        <Send size={15} /> Share via WhatsApp
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </Modal>
      )}

      {/* Tasks Table — Desktop View (>768px) */}
      <div className="desktop-task-view">
        <div className="task-table-wrap" style={{
        width: '100%', overflowX: 'auto', borderRadius: '18px',
        boxShadow: '0 4px 24px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.02)',
        border: '1px solid rgba(226, 232, 240, 0.85)', background: '#ffffff',
        WebkitOverflowScrolling: 'touch'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#ffffff' }}>
          <thead>
            <tr style={{
              background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
              borderBottom: '1.5px solid #e2e8f0'
            }}>
              {multiSelectMode && (
                <th style={{
                  padding: '11px 8px', textAlign: 'center', width: '38px',
                  borderBottom: '1.5px solid #e2e8f0'
                }}>
                  <input
                    type="checkbox"
                    checked={isAllFilteredSelected}
                    ref={el => { if (el) el.indeterminate = isSomeFilteredSelected; }}
                    onChange={e => {
                      if (e.target.checked) selectAllFiltered();
                      else deselectAll();
                    }}
                    style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#2563eb' }}
                    title={isAllFilteredSelected ? 'Deselect All' : 'Select All Filtered'}
                  />
                </th>
              )}
              {[
                { label: 'PL', align: 'center' },
                { label: 'Company', align: 'left' },
                { label: 'CR Number', align: 'left' },
                { label: 'Task Type', align: 'left' },
                { label: 'Description', align: 'left' },
                { label: 'Desc Updated', align: 'left' },
                { label: 'Priority', align: 'left' },
                { label: 'Due Date', align: 'left' },
                { label: 'Status', align: 'left' },
                { label: 'Auditor', align: 'left' },
                { label: 'Assigned To', align: 'left' },
                { label: '', align: 'right' }
              ].map((h, i) => (
                <th key={i} style={{
                  padding: '11px 8px', textAlign: h.align as any,
                  fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.05em', color: '#475569', whiteSpace: 'nowrap',
                  borderBottom: '1.5px solid #e2e8f0'
                }}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={multiSelectMode ? 13 : 12} style={{ textAlign: 'center', padding: '64px 20px', color: '#94a3b8' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ListTodo size={28} color="#94a3b8" />
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 650, color: '#334155' }}>No matching tasks found</div>
                    <div style={{ fontSize: '13px', color: '#94a3b8' }}>Try adjusting your filters or search keywords</div>
                  </div>
                </td>
              </tr>
            ) : filtered.map(task => {
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
                <tr key={task.id} style={{
                  borderBottom: '1px solid rgba(241, 245, 249, 0.9)',
                  background: isSelected ? 'rgba(239, 246, 255, 0.85)' : 'transparent',
                  transition: 'background 0.15s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(248, 250, 252, 0.85)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
                  {multiSelectMode && (
                    <td style={{ ...compactCell, textAlign: 'center', width: '38px' }} onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectTask(task.id)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#2563eb' }}
                      />
                    </td>
                  )}
                  <td style={{ ...compactCell, textAlign: 'center', width: '48px' }}>
                    <button
                      onClick={() => handlePlUploadedToggle(task.id)}
                      title={task.pl_uploaded ? 'PL Uploaded: Yes — click to change' : 'PL Uploaded: No — click to change'}
                      style={{
                        padding: '3px 8px', borderRadius: '12px',
                        border: task.pl_uploaded ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)',
                        cursor: 'pointer', fontSize: '9.5px', fontWeight: 700,
                        letterSpacing: '0.02em', transition: 'all 0.15s ease',
                        background: task.pl_uploaded ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)' : 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                        color: task.pl_uploaded ? '#047857' : '#b91c1c',
                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                        boxShadow: task.pl_uploaded ? '0 1px 2px rgba(16, 185, 129, 0.1)' : '0 1px 2px rgba(239, 68, 68, 0.1)'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                      {task.pl_uploaded ? '✓ Yes' : '✗ No'}
                    </button>
                  </td>
                  <td style={compactCell}>
                    <span style={{ fontWeight: 650, fontSize: '12.5px', color: '#0f172a', maxWidth: '125px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }} title={company?.company_name || 'Unknown'}>
                      {company?.company_name || 'Unknown'}
                    </span>
                  </td>
                  <td
                    style={{ ...compactCell, position: 'relative', cursor: (canManageTask(task) && company) ? 'pointer' : 'default' }}
                    onMouseEnter={() => setHoveredCrTaskId(task.id)}
                    onMouseLeave={() => setHoveredCrTaskId(null)}
                  >
                    {inlineEditCrId === task.id ? (
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '7px',
                          minWidth: '220px',
                          maxWidth: '260px',
                          position: 'absolute',
                          zIndex: 40,
                          background: '#ffffff',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          boxShadow: '0 12px 30px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(59, 130, 246, 0.25)',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          left: '4px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '5px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <FileSpreadsheet size={12} color="#2563eb" /> CR Details
                          </span>
                          <button
                            type="button"
                            onClick={() => setInlineEditCrId(null)}
                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                            title="Close (Esc)"
                          >
                            <X size={12} />
                          </button>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '9.5px', fontWeight: 650, color: '#64748b', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            CR Number
                          </label>
                          <input
                            autoFocus
                            type="text"
                            value={inlineEditCrValue}
                            onChange={e => setInlineEditCrValue(e.target.value)}
                            placeholder="e.g. 167145-1"
                            style={{
                              width: '100%',
                              padding: '5px 8px',
                              fontSize: '11.5px',
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                              borderRadius: '6px',
                              border: '1.5px solid #cbd5e1',
                              outline: 'none',
                              color: '#0f172a',
                              background: '#f8fafc',
                              boxSizing: 'border-box'
                            }}
                            onFocus={e => {
                              e.target.style.borderColor = '#2563eb';
                              e.target.style.background = '#ffffff';
                              e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.12)';
                            }}
                            onBlur={e => {
                              e.target.style.borderColor = '#cbd5e1';
                              e.target.style.background = '#f8fafc';
                              e.target.style.boxShadow = 'none';
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Escape') setInlineEditCrId(null);
                              else if (e.key === 'Enter') {
                                if (company) saveInlineCrNumber(company.id, task.id);
                              }
                            }}
                          />
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <label style={{ fontSize: '9.5px', fontWeight: 650, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              CR Link / URL
                            </label>
                            {inlineEditCrLinkValue && (
                              <a
                                href={formatExternalUrl(inlineEditCrLinkValue)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                style={{ fontSize: '9.5px', color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '2px', fontWeight: 600 }}
                                title="Test link in new tab"
                              >
                                Test <ExternalLink size={9} />
                              </a>
                            )}
                          </div>
                          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <input
                              type="url"
                              value={inlineEditCrLinkValue}
                              onChange={e => setInlineEditCrLinkValue(e.target.value)}
                              placeholder="e.g. https://sijilat.bh/..."
                              style={{
                                width: '100%',
                                padding: '5px 8px 5px 24px',
                                fontSize: '11.5px',
                                borderRadius: '6px',
                                border: '1.5px solid #cbd5e1',
                                outline: 'none',
                                color: '#0f172a',
                                background: '#f8fafc',
                                boxSizing: 'border-box'
                              }}
                              onFocus={e => {
                                e.target.style.borderColor = '#2563eb';
                                e.target.style.background = '#ffffff';
                                e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.12)';
                              }}
                              onBlur={e => {
                                e.target.style.borderColor = '#cbd5e1';
                                e.target.style.background = '#f8fafc';
                                e.target.style.boxShadow = 'none';
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Escape') setInlineEditCrId(null);
                                else if (e.key === 'Enter') {
                                  if (company) saveInlineCrNumber(company.id, task.id);
                                }
                              }}
                            />
                            <span style={{ position: 'absolute', left: '7px', color: '#94a3b8', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                              <ExternalLink size={11} />
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end', marginTop: '3px' }}>
                          <button
                            type="button"
                            onClick={() => setInlineEditCrId(null)}
                            style={{
                              padding: '4px 8px',
                              border: '1px solid #e2e8f0',
                              background: '#f8fafc',
                              color: '#64748b',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px',
                              fontSize: '10.5px',
                              fontWeight: 600
                            }}
                            title="Cancel (Esc)"
                          >
                            <X size={11} /> Cancel
                          </button>
                          <button
                            type="button"
                            disabled={savingCrTaskId === task.id}
                            onClick={() => { if (company) saveInlineCrNumber(company.id, task.id); }}
                            style={{
                              padding: '4px 10px',
                              border: 'none',
                              background: '#2563eb',
                              color: '#fff',
                              borderRadius: '6px',
                              cursor: savingCrTaskId === task.id ? 'wait' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px',
                              fontSize: '10.5px',
                              fontWeight: 600,
                              opacity: savingCrTaskId === task.id ? 0.7 : 1,
                              boxShadow: '0 2px 6px rgba(37,99,235,0.25)'
                            }}
                            title="Save (Enter)"
                          >
                            <Check size={11} /> {savingCrTaskId === task.id ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3px', minHeight: '22px' }}>
                        {company?.cr_number ? (
                          <span style={{
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            fontSize: '10px', fontWeight: 600, color: '#334155',
                            background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', padding: '2px 6px', borderRadius: '5px',
                            border: '1px solid #cbd5e1', display: 'inline-block',
                            maxWidth: '85px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            letterSpacing: '0.02em',
                          }} title={company.cr_number}>
                            {company.cr_number}
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#cbd5e1' }}>—</span>
                        )}

                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          flexShrink: 0,
                          opacity: hoveredCrTaskId === task.id ? 1 : 0,
                          pointerEvents: hoveredCrTaskId === task.id ? 'auto' : 'none',
                          transition: 'opacity 0.15s ease, transform 0.15s ease',
                        }}>
                          {/* CR Hyperlink Icon */}
                          {company?.cr_link && (
                            <a
                              href={formatExternalUrl(company.cr_link)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => {
                                e.stopPropagation();
                              }}
                              style={{
                                background: '#ecfdf5',
                                border: '1px solid #a7f3d0',
                                borderRadius: '5px',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#059669',
                                transition: 'all 0.15s ease',
                                width: '19px',
                                height: '19px',
                                textDecoration: 'none',
                                flexShrink: 0,
                              }}
                              title={`Open CR Link: ${company.cr_link}`}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = '#d1fae5';
                                e.currentTarget.style.borderColor = '#6ee7b7';
                                e.currentTarget.style.color = '#047857';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = '#ecfdf5';
                                e.currentTarget.style.borderColor = '#a7f3d0';
                                e.currentTarget.style.color = '#059669';
                              }}
                            >
                              <ExternalLink size={10.5} />
                            </a>
                          )}

                          {/* Edit CR Number & Link Button */}
                          {canManageTask(task) && company && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setInlineEditCrId(task.id);
                                setInlineEditCrValue(company.cr_number || '');
                                setInlineEditCrLinkValue(company.cr_link || '');
                              }}
                              style={{
                                background: '#eff6ff',
                                border: '1px solid #dbeafe',
                                borderRadius: '5px',
                                cursor: 'pointer',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#2563eb',
                                transition: 'all 0.15s ease',
                                width: '19px',
                                height: '19px',
                                flexShrink: 0,
                              }}
                              title="Edit CR Number & Link"
                              onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; }}
                            >
                              <Edit2 size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                  <td style={compactCell}>
                    {ttNames.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                        {ttNames.map((name, i) => (
                          <span key={i} style={{
                            padding: '2px 6px', borderRadius: '5px', fontSize: '10px',
                            fontWeight: 650, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                            color: '#1d4ed8', border: '1px solid #bfdbfe', whiteSpace: 'nowrap',
                            letterSpacing: '0.01em',
                          }}>{name}</span>
                        ))}
                      </div>
                    ) : <span style={{ fontSize: '11px', color: '#cbd5e1' }}>—</span>}
                  </td>
                  <td
                    style={{ ...compactCell, position: 'relative', cursor: (task.description && inlineEditDescId !== task.id) ? 'pointer' : 'default' }}
                    onMouseEnter={(e) => {
                      setHoveredDescTaskId(task.id);
                      if (task.description && inlineEditDescId !== task.id) {
                        if (tooltipTimeoutRef.current) {
                          clearTimeout(tooltipTimeoutRef.current);
                          tooltipTimeoutRef.current = null;
                        }
                        if (activeTooltipRef.current === task.id) {
                          return;
                        }
                        const rect = e.currentTarget.getBoundingClientRect();
                        const tooltipWidth = 330;
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
                    {inlineEditDescId === task.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: '200px', position: 'absolute', zIndex: 20, background: '#fff', padding: '10px', borderRadius: '10px', boxShadow: '0 12px 30px rgba(0,0,0,0.15)', border: '1px solid #93c5fd', top: '50%', transform: 'translateY(-50%)', left: '10px' }}>
                        <textarea
                          autoFocus
                          value={inlineEditDescValue}
                          onChange={e => setInlineEditDescValue(e.target.value)}
                          style={{
                            width: '100%',
                            minHeight: '68px',
                            padding: '8px',
                            fontSize: '11.5px',
                            borderRadius: '6px',
                            border: '1.5px solid #2563eb',
                            outline: 'none',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            color: '#0f172a',
                            boxShadow: '0 0 0 3px rgba(37,99,235,0.1)'
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
                            onClick={() => setInlineEditDescId(null)}
                            style={{ padding: '4px 9px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600 }}
                            title="Cancel (Esc)"
                          >
                            <X size={12} /> Cancel
                          </button>
                          <button
                            onClick={() => saveInlineDescription(task.id)}
                            style={{ padding: '4px 10px', border: 'none', background: '#2563eb', color: '#fff', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600 }}
                            title="Save (Ctrl+Enter)"
                          >
                            <Check size={12} /> Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3px', minHeight: '22px' }}>
                        <span style={{ fontSize: '11.5px', color: '#475569', maxWidth: '120px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={task.description || ''}>
                          {task.description || '—'}
                        </span>
                        {canManageTask(task) && (
                          <button
                            onClick={() => {
                              setInlineEditDescId(task.id);
                              setInlineEditDescValue(task.description || '');
                              activeTooltipRef.current = null;
                              setActiveTooltipTaskId(null);
                            }}
                            style={{
                              background: '#eff6ff',
                              border: '1px solid #dbeafe',
                              borderRadius: '5px',
                              cursor: 'pointer',
                              padding: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#2563eb',
                              transition: 'all 0.15s ease',
                              opacity: hoveredDescTaskId === task.id ? 1 : 0,
                              pointerEvents: hoveredDescTaskId === task.id ? 'auto' as const : 'none' as const,
                              width: '19px',
                              height: '19px',
                              flexShrink: 0,
                            }}
                            title="Edit Description"
                            onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; }}
                          >
                            <Edit2 size={10} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={compactCell}>
                    {(() => {
                      const updateDate = descUpdateMap[task.id] || (task.description ? task.created_at : null);
                      if (!updateDate || !task.description || task.description.trim() === '') {
                        return <span style={{ fontSize: '10.5px', color: '#cbd5e1' }}>—</span>;
                      }
                      const updateTime = new Date(updateDate).getTime();
                      const isRecent = !isNaN(updateTime) && (Date.now() - updateTime < 24 * 60 * 60 * 1000) && (Date.now() >= updateTime - 60000);
                      return (
                        <span
                          title={`Last updated: ${new Date(updateDate).toLocaleString()}`}
                          style={{
                            fontSize: '10px',
                            color: isRecent ? '#0284c7' : '#64748b',
                            fontWeight: isRecent ? 650 : 500,
                            whiteSpace: 'nowrap',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            background: isRecent ? 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)' : 'transparent',
                            padding: isRecent ? '2px 5px' : '0',
                            borderRadius: isRecent ? '5px' : '0',
                            border: isRecent ? '1px solid #bae6fd' : 'none',
                          }}
                        >
                          {isRecent && <span style={{ width: '4.5px', height: '4.5px', borderRadius: '50%', background: '#0284c7', boxShadow: '0 0 0 1.5px #bae6fd' }} />}
                          {formatDescDate(updateDate)}
                        </span>
                      );
                    })()}
                  </td>
                  <td style={compactCell}>
                    {canUpdateStatus ? (
                      <select value={task.priority} onChange={e => handlePriorityChange(task.id, e.target.value)}
                        style={{
                          padding: '3px 6px', borderRadius: '7px', border: '1px solid rgba(0,0,0,0.06)',
                          background: pc.bg, color: pc.color, fontWeight: 700,
                          fontSize: '10.5px', cursor: 'pointer', outline: 'none',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}>
                        {BAHRAIN_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    ) : (
                      <span style={{ padding: '3px 6px', borderRadius: '7px', fontSize: '10px', fontWeight: 700, background: pc.bg, color: pc.color, whiteSpace: 'nowrap' }}>
                        {task.priority}
                      </span>
                    )}
                  </td>
                  <td style={compactCell}>
                    <span style={{ fontSize: '11px', color: '#475569', fontWeight: 500, whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace' }}>
                      {task.deadline || '—'}
                    </span>
                  </td>
                  <td style={compactCell}>
                    {canUpdateStatus ? (() => {
                      const sc = statusColor(task.status);
                      return (
                        <select value={task.status} onChange={e => handleStatusChange(task.id, e.target.value)}
                          style={{
                            padding: '3.5px 6px', borderRadius: '7px',
                            border: `1px solid ${sc.border}`, background: sc.bg,
                            color: sc.color, fontWeight: 650, fontSize: '10.5px',
                            cursor: 'pointer', outline: 'none', minWidth: '95px', maxWidth: '125px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                          }}>
                          {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      );
                    })() : (() => {
                      const sc = statusColor(task.status);
                      return (
                        <span style={{
                          padding: '2.5px 6px', borderRadius: '6px', fontSize: '10.5px',
                          fontWeight: 650, background: sc.bg, color: sc.color,
                          border: `1px solid ${sc.border}`, whiteSpace: 'nowrap'
                        }}>
                          {task.status}
                        </span>
                      );
                    })()}
                  </td>
                  <td style={compactCell}>
                    {isAdminUser ? (
                      <select value={task.auditor_id || ''} onChange={e => handleAssignAuditor(task.id, e.target.value)}
                        style={{
                          padding: '3.5px 6px', borderRadius: '7px', border: '1px solid #e2e8f0',
                          background: '#f8fafc', fontSize: '10.5px', color: '#1e293b',
                          minWidth: '85px', maxWidth: '115px', cursor: 'pointer', outline: 'none', fontWeight: 500,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                        }}>
                        <option value="">No Auditor</option>
                        {auditors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#475569', fontWeight: 500 }}>
                        {auditors.find(a => a.id === task.auditor_id)?.name || '—'}
                      </span>
                    )}
                  </td>
                  <td style={compactCell}>
                    {isAdminUser ? (
                      <select value={task.assigned_to || ''} onChange={e => handleAssign(task.id, e.target.value)}
                        style={{
                          padding: '3.5px 6px', borderRadius: '7px', border: '1px solid #e2e8f0',
                          background: '#f8fafc', fontSize: '10.5px', color: '#1e293b',
                          minWidth: '85px', maxWidth: '115px', cursor: 'pointer', outline: 'none', fontWeight: 500,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                        }}>
                        <option value="">Unassigned</option>
                        {partners.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
                      </select>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#1e293b', fontWeight: 500 }}>
                        {(() => {
                          const activePartnerIds = task.assigned_partners && task.assigned_partners.length > 0 
                            ? task.assigned_partners 
                            : (task.assigned_to ? [task.assigned_to] : []);
                          const allNames = activePartnerIds.map((id: string) => partners.find((p: any) => p.id === id)?.username).filter(Boolean);
                          return allNames.length > 0 ? allNames.join(', ') : 'Unassigned';
                        })()}
                      </span>
                    )}
                  </td>
                  <td style={{ ...compactCell, position: 'relative', width: '32px', padding: '6px 2px' }}>
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
                        background: isMenuOpen ? '#eff6ff' : 'transparent',
                        border: 'none',
                        cursor: 'pointer', borderRadius: '8px', padding: '6px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s ease', position: 'relative',
                        marginLeft: 'auto',
                        width: '30px',
                        height: '30px',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                      onMouseLeave={e => { if (!isMenuOpen) { e.currentTarget.style.background = 'transparent'; } }}>
                      <MoreHorizontal size={17} color="#64748b" />
                    </button>
                    {isMenuOpen && typeof window !== 'undefined' && createPortal(
                      <div style={{ position: 'fixed', top: menuPos.top, bottom: menuPos.bottom, right: menuPos.right, maxHeight: menuPos.maxHeight || 'none', overflowY: 'auto', background: '#fff', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0', zIndex: 9999, minWidth: '165px' }}
                        onClick={e => e.stopPropagation()}>
                        <button onClick={() => { viewDetail(task.id); setOpenMenuId(null); }} style={menuItemStyle}>
                          <Eye size={14} color="#3b82f6" /> View Details
                        </button>
                        {canManageTask(task) && (<>
                          <button onClick={() => { openEditTask(task); setOpenMenuId(null); }} style={menuItemStyle}>
                            <Edit2 size={14} color="#f59e0b" /> Edit Task
                          </button>
                        </>)}
                        <div style={{ height: '1px', background: '#f1f5f9', margin: '2px 0' }} />
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
                              `*Assigned To:* ${assignedNames}`,
                              `*Status:* ${task.status || 'N/A'}`,
                              ...(task.description ? [`*Description:* ${task.description}`] : []),
                            ].join('\n');
                            window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                            setOpenMenuId(null);
                          }}
                          style={menuItemStyle}
                          onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366" style={{ flexShrink: 0 }}>
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                          <span style={{ color: '#25D366', fontWeight: 600 }}>WhatsApp</span>
                        </button>
                        {canManageTask(task) && (<>
                          <div style={{ height: '1px', background: '#f1f5f9', margin: '2px 0' }} />
                          <button onClick={() => { deleteTask(task.id); setOpenMenuId(null); }} style={{ ...menuItemStyle, color: '#ef4444' }}>
                            <Trash2 size={14} color="#ef4444" /> Delete
                          </button>
                        </>)}
                      </div>,
                      document.body
                    )}
                  </td>
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
            background: '#ffffff', borderRadius: '16px', padding: '40px 20px',
            textAlign: 'center', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
          }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
              <ListTodo size={24} color="#94a3b8" />
            </div>
            <div style={{ fontSize: '15px', fontWeight: 650, color: '#334155' }}>No matching tasks found</div>
            <div style={{ fontSize: '12.5px', color: '#94a3b8', marginTop: '4px' }}>Try adjusting your filters or keywords</div>
          </div>
        ) : (
          filtered.map(task => {
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
                  background: isSelected ? '#eff6ff' : '#ffffff',
                  border: isSelected ? '1.5px solid #3b82f6' : '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '12px 14px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
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
                        style={{ cursor: 'pointer', width: '17px', height: '17px', accentColor: '#2563eb', flexShrink: 0, marginTop: '2px' }}
                      />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a', letterSpacing: '-0.2px' }}>
                          {company?.company_name || 'Unknown Company'}
                        </span>
                        {ttNames.map((name, i) => (
                          <span key={i} style={{
                            padding: '1px 6px', borderRadius: '5px', fontSize: '10px',
                            fontWeight: 600, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe'
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
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <select
                            value={task.status}
                            onChange={e => handleStatusChange(task.id, e.target.value)}
                            style={{
                              padding: '3px 8px', borderRadius: '12px',
                              border: `1px solid ${sc.border}`, background: sc.bg,
                              color: sc.color, fontWeight: 700, fontSize: '11px',
                              cursor: 'pointer', outline: 'none', appearance: 'none',
                              WebkitAppearance: 'none', paddingRight: '18px',
                              textAlign: 'left', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }}
                          >
                            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <ChevronDown size={10} style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: sc.color }} />
                        </div>
                      );
                    })() : (() => {
                      const sc = statusColor(task.status);
                      return (
                        <span style={{
                          padding: '3px 8px', borderRadius: '12px', fontSize: '11px',
                          fontWeight: 700, background: sc.bg, color: sc.color,
                          border: `1px solid ${sc.border}`, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}>
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
                        width: '26px', height: '26px', borderRadius: '6px', border: '1px solid #e2e8f0',
                        background: '#f8fafc', color: '#64748b', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', cursor: 'pointer'
                      }}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {isMenuOpen && typeof window !== 'undefined' && createPortal(
                      <div style={{ position: 'fixed', top: menuPos.top, bottom: menuPos.bottom, right: menuPos.right, maxHeight: menuPos.maxHeight || 'none', overflowY: 'auto', background: '#fff', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.18)', border: '1px solid #e2e8f0', zIndex: 9999, minWidth: '175px' }}
                        onClick={e => e.stopPropagation()}>
                        <button onClick={() => { viewDetail(task.id); setOpenMenuId(null); }} style={menuItemStyle}>
                          <Eye size={14} color="#3b82f6" /> View Details
                        </button>
                        {canManageTask(task) && (
                          <button onClick={() => { openEditTask(task); setOpenMenuId(null); }} style={menuItemStyle}>
                            <Edit2 size={14} color="#f59e0b" /> Edit Task
                          </button>
                        )}
                        <div style={{ height: '1px', background: '#f1f5f9', margin: '2px 0' }} />
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
                            <div style={{ height: '1px', background: '#f1f5f9', margin: '2px 0' }} />
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
                          padding: '2px 7px', borderRadius: '6px', border: '1px solid #e2e8f0',
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
                    <span style={{ padding: '2px 7px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 700, background: pc.bg, color: pc.color }}>
                      {task.priority}
                    </span>
                  )}

                  {/* PL Uploaded Pill */}
                  <button
                    onClick={() => handlePlUploadedToggle(task.id)}
                    style={{
                      padding: '2px 8px', borderRadius: '6px',
                      border: task.pl_uploaded ? '1px solid #a7f3d0' : '1px solid #fecaca',
                      cursor: 'pointer', fontSize: '10.5px', fontWeight: 650,
                      background: task.pl_uploaded ? '#ecfdf5' : '#fef2f2',
                      color: task.pl_uploaded ? '#059669' : '#dc2626',
                      display: 'inline-flex', alignItems: 'center', gap: '3px'
                    }}
                  >
                    PL: {task.pl_uploaded ? '✓ Yes' : '✗ No'}
                  </button>

                  {/* CR Number Monospace Chip */}
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
                        fontFamily: 'ui-monospace, monospace',
                        fontSize: '10.5px', fontWeight: 600, color: '#475569',
                        background: '#f1f5f9', padding: '2px 6px', borderRadius: '5px',
                        border: '1px solid #cbd5e1', cursor: canManageTask(task) ? 'pointer' : 'default',
                        display: 'inline-flex', alignItems: 'center', gap: '3px'
                      }}
                      title="Tap to edit CR Number & Link"
                    >
                      CR: {company.cr_number}
                      {canManageTask(task) && <Edit2 size={9} color="#64748b" />}
                    </span>
                  ) : (
                    canManageTask(task) && company && (
                      <button
                        onClick={() => {
                          setInlineEditCrId(task.id);
                          setInlineEditCrValue('');
                          setInlineEditCrLinkValue('');
                        }}
                        style={{
                          background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '5px',
                          padding: '2px 6px', fontSize: '10px', color: '#64748b', fontWeight: 600,
                          display: 'inline-flex', alignItems: 'center', gap: '3px', cursor: 'pointer'
                        }}
                      >
                        <Plus size={9} /> CR
                      </button>
                    )
                  )}

                  {/* CR Hyperlink Pill (Mobile) */}
                  {company?.cr_link && (
                    <a
                      href={formatExternalUrl(company.cr_link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        borderRadius: '5px',
                        padding: '2px 6px',
                        fontSize: '10.5px',
                        fontWeight: 650,
                        color: '#059669',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        textDecoration: 'none'
                      }}
                      title={`Open CR Link: ${company.cr_link}`}
                    >
                      <ExternalLink size={9.5} /> Link
                    </a>
                  )}
                </div>

                {/* Inline CR edit mini form if activated (Mobile) */}
                {inlineEditCrId === task.id && (
                  <div style={{ background: '#eff6ff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #bfdbfe', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e40af', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <FileSpreadsheet size={12} /> Edit CR Details
                      </span>
                      <button
                        onClick={() => setInlineEditCrId(null)}
                        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '2px' }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <input
                      autoFocus
                      type="text"
                      value={inlineEditCrValue}
                      onChange={e => setInlineEditCrValue(e.target.value)}
                      placeholder="CR Number (e.g. 167145-1)"
                      style={{ width: '100%', padding: '5px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid #93c5fd', background: '#fff', boxSizing: 'border-box' }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && company) saveInlineCrNumber(company.id, task.id);
                        if (e.key === 'Escape') setInlineEditCrId(null);
                      }}
                    />
                    <input
                      type="url"
                      value={inlineEditCrLinkValue}
                      onChange={e => setInlineEditCrLinkValue(e.target.value)}
                      placeholder="CR Link / URL (e.g. https://...)"
                      style={{ width: '100%', padding: '5px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid #93c5fd', background: '#fff', boxSizing: 'border-box' }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && company) saveInlineCrNumber(company.id, task.id);
                        if (e.key === 'Escape') setInlineEditCrId(null);
                      }}
                    />
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '2px' }}>
                      <button
                        onClick={() => setInlineEditCrId(null)}
                        style={{ padding: '4px 10px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                      <button
                        disabled={savingCrTaskId === task.id}
                        onClick={() => { if (company) saveInlineCrNumber(company.id, task.id); }}
                        style={{
                          padding: '4px 12px',
                          border: 'none',
                          background: '#2563eb',
                          color: '#fff',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: savingCrTaskId === task.id ? 'wait' : 'pointer',
                          opacity: savingCrTaskId === task.id ? 0.7 : 1
                        }}
                      >
                        {savingCrTaskId === task.id ? 'Saving...' : 'Save'}
                      </button>
                    </div>
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
                      background: '#f8fafc', padding: '6px 10px', borderRadius: '8px',
                      border: '1px solid #f1f5f9', fontSize: '12px', color: '#334155',
                      lineHeight: 1.4, cursor: canManageTask(task) ? 'pointer' : 'default',
                      position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <span style={{ wordBreak: 'break-word', flex: 1 }}>
                        {task.description}
                      </span>
                      {canManageTask(task) && (
                        <Edit2 size={10} color="#94a3b8" style={{ flexShrink: 0 }} />
                      )}
                    </div>
                    {/* Date badge */}
                    {(() => {
                      const updateDate = descUpdateMap[task.id] || task.created_at;
                      if (!updateDate) return null;
                      const updateTime = new Date(updateDate).getTime();
                      const isRecent = !isNaN(updateTime) && (Date.now() - updateTime < 24 * 60 * 60 * 1000) && (Date.now() >= updateTime - 60000);
                      return (
                        <div style={{ fontSize: '10px', color: isRecent ? '#0284c7' : '#94a3b8', fontWeight: isRecent ? 650 : 500, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          {isRecent && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#0284c7' }} />}
                          Updated: {formatDescDate(updateDate)}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  canManageTask(task) && inlineEditDescId !== task.id && (
                    <div style={{ display: 'flex' }}>
                      <button
                        onClick={() => {
                          setInlineEditDescId(task.id);
                          setInlineEditDescValue('');
                        }}
                        style={{
                          background: 'transparent', border: 'none', padding: '0',
                          fontSize: '11px', color: '#94a3b8', cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: '4px'
                        }}
                      >
                        <Plus size={11} /> Add description
                      </button>
                    </div>
                  )
                )}

                {/* Inline description editor */}
                {inlineEditDescId === task.id && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#f8fafc', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <textarea
                      autoFocus
                      value={inlineEditDescValue}
                      onChange={e => setInlineEditDescValue(e.target.value)}
                      placeholder="Enter task description..."
                      style={{ width: '100%', minHeight: '52px', padding: '6px 8px', fontSize: '12px', borderRadius: '6px', border: '1.5px solid #2563eb', background: '#fff', outline: 'none', fontFamily: 'inherit' }}
                    />
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button onClick={() => setInlineEditDescId(null)} style={{ padding: '3px 8px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                      <button onClick={() => saveInlineDescription(task.id)} style={{ padding: '3px 10px', border: 'none', background: '#2563eb', color: '#fff', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Save</button>
                    </div>
                  </div>
                )}

                {/* Row 4: Single-Line Meta Strip: Assignee, Auditor, Due Date */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  paddingTop: '6px', borderTop: '1px solid #f1f5f9', fontSize: '11.5px', color: '#64748b', gap: '8px'
                }}>
                  {/* Left: Assignee + Auditor */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    {/* Assignee */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                      {isAdminUser ? (
                        <select
                          value={task.assigned_to || ''}
                          onChange={e => handleAssign(task.id, e.target.value)}
                          style={{
                            fontSize: '11px', color: '#0f172a', fontWeight: 600,
                            background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px',
                            padding: '2px 5px', outline: 'none', cursor: 'pointer', maxWidth: '105px'
                          }}
                        >
                          <option value="">👤 Unassigned</option>
                          {partners.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
                        </select>
                      ) : (
                        <span style={{ fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          👤 {(() => {
                            const activePartnerIds = task.assigned_partners && task.assigned_partners.length > 0 
                              ? task.assigned_partners 
                              : (task.assigned_to ? [task.assigned_to] : []);
                            const allNames = activePartnerIds.map((id: string) => partners.find((p: any) => p.id === id)?.username).filter(Boolean);
                            return allNames.length > 0 ? allNames.join(', ') : 'Unassigned';
                          })()}
                        </span>
                      )}
                    </div>

                    {/* Auditor */}
                    {isAdminUser ? (
                      <select
                        value={task.auditor_id || ''}
                        onChange={e => handleAssignAuditor(task.id, e.target.value)}
                        style={{
                          fontSize: '11px', color: '#475569', fontWeight: 500,
                          background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px',
                          padding: '2px 5px', outline: 'none', cursor: 'pointer', maxWidth: '95px'
                        }}
                      >
                        <option value="">🏛️ No Auditor</option>
                        {auditors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    ) : (
                      task.auditor_id && (
                        <span style={{ color: '#475569', fontSize: '11px' }}>
                          🏛️ {auditors.find(a => a.id === task.auditor_id)?.name}
                        </span>
                      )
                    )}
                  </div>

                  {/* Right: Due Date */}
                  <div style={{ flexShrink: 0, fontWeight: 600, fontSize: '11px', color: task.deadline ? '#334155' : '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
                    📅 {task.deadline || 'No date'}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>



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
            <div><strong>Company:</strong> {detailCompany?.company_name || 'Unknown'}</div>
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
                    gap: '3px',
                    color: '#2563eb',
                    fontSize: '12px',
                    textDecoration: 'none',
                    fontWeight: 600,
                    background: '#eff6ff',
                    padding: '2px 8px',
                    borderRadius: '5px',
                    border: '1px solid #bfdbfe'
                  }}
                  title={`Open: ${detailCompany.cr_link}`}
                >
                  <ExternalLink size={12} /> Open CR Link
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
        padding: '8px 12px', border: open ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
        borderRadius: '10px', fontSize: '13px', width: '100%',
        background: '#ffffff', color: '#0f172a', cursor: 'pointer',
        display: 'flex', flexWrap: 'wrap', gap: '5px', minHeight: '40px',
        alignItems: 'center', transition: 'all 0.15s ease',
        boxShadow: open ? '0 0 0 3px rgba(37,99,235,0.1)' : 'none'
      }}>
        {selected.length === 0 ? <span style={{ color: '#94a3b8' }}>{placeholder}</span> :
          selected.map(s => {
            const opt = options.find(o => o.id === s);
            return (
              <span key={s} style={{
                background: '#eff6ff', color: '#1d4ed8', border: '1px solid #dbeafe',
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
          background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px',
          marginTop: '6px', zIndex: 100, maxHeight: '220px', overflowY: 'auto',
          boxShadow: '0 10px 25px rgba(0,0,0,0.08)'
        }}>
          {options.map(opt => (
            <div key={opt.id} onClick={(e) => toggle(opt.id, e)} style={{
              padding: '9px 12px', cursor: 'pointer', display: 'flex',
              alignItems: 'center', gap: '9px',
              background: selected.includes(opt.id) ? '#eff6ff' : 'transparent',
              borderBottom: '1px solid #f8fafc', transition: 'background 0.1s ease'
            }}
              onMouseEnter={e => { if (!selected.includes(opt.id)) e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={e => { if (!selected.includes(opt.id)) e.currentTarget.style.background = 'transparent'; }}
            >
              <input type="checkbox" checked={selected.includes(opt.id)} readOnly style={{ cursor: 'pointer', accentColor: '#2563eb' }} />
              <span style={{ color: selected.includes(opt.id) ? '#1d4ed8' : '#334155', fontSize: '13px', fontWeight: selected.includes(opt.id) ? 600 : 400 }}>{opt.label}</span>
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
      background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '16px', animation: 'fadeIn 0.15s ease-out',
    }} onClick={onClose}>
      <div style={{
        background: '#ffffff', borderRadius: '18px', maxWidth: '820px', width: '100%',
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        animation: 'scaleIn 0.2s ease-out', border: '1px solid #e2e8f0',
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #f1f5f9',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#ffffff',
          borderRadius: '18px 18px 0 0',
        }}>
          <h2 style={{ fontSize: '16px', color: '#0f172a', fontWeight: 700, letterSpacing: '-0.01em', margin: 0, lineHeight: 1.3 }}>{title}</h2>
          <button onClick={onClose} style={{
            background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer', color: '#64748b',
            width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s ease'
          }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fecaca'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
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
      <label style={{ fontWeight: 600, marginBottom: '6px', color: '#334155', fontSize: '12.5px', letterSpacing: '0.01em', display: 'flex', alignItems: 'center', gap: '4px' }}>{label}</label>
      {children}
    </div>
  );
}

const filterStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '12px',
  background: '#ffffff', color: '#1e293b', outline: 'none', transition: 'all 0.15s ease',
  boxShadow: '0 1px 2px rgba(0,0,0,0.02)', fontWeight: 500, flex: '1 1 120px', minWidth: '115px'
};

const compactCell: React.CSSProperties = {
  padding: '9px 7px', fontSize: '12px', verticalAlign: 'middle', color: '#334155',
};

const cellStyle: React.CSSProperties = {
  padding: '9px 7px', fontSize: '12px', verticalAlign: 'middle', color: '#334155',
};

const dropdownStyle: React.CSSProperties = {
  padding: '4px 7px', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '11px',
  width: '100%', minWidth: '100px', cursor: 'pointer', background: '#f8fafc', color: '#1e293b', outline: 'none',
  transition: 'all 0.15s ease', fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '13px',
  width: '100%', background: '#ffffff', color: '#0f172a', outline: 'none',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease', fontWeight: 500,
};

const menuItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '9px 14px',
  background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '12.5px',
  color: '#334155', fontWeight: 500, transition: 'background 0.1s ease', textAlign: 'left',
};

function btnSmStyle(bg: string): React.CSSProperties {
  return {
    padding: '7px 10px', background: bg, color: '#fff', border: 'none', borderRadius: '8px',
    cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.15s ease',
    boxShadow: `0 1px 3px ${bg}40`,
  };
}
