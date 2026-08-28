'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Task, User, StatusLog } from '@/lib/supabase';
import { getSession, isAdmin, getDataCountry } from '@/lib/auth';
import {
  Plus, X, Eye, Edit2, CheckCircle2, Search, Filter, Repeat, Trash2, MoreHorizontal, Check,
  Calendar, Clock, Users, Tag, FileText, Activity, AlertTriangle, Hash, Sparkles, ListTodo
} from 'lucide-react';
import { formatDate, formatDateTime } from '@/lib/dateUtils';

// Fixed array of statuses so it alphabetically sorts correctly
const BAHRAIN_STATUSES = [
  'Awaiting Info',
  'Awaiting Mgt Approval',
  'Awaiting Partner Info',
  'Awaiting Signatures',
  'Completed',
  'Draft / Under Review',
  'Draft Sent',
  'Information Required',
  'Pending',
  'Query Answered',
  'Query from QA',
  'Query raised',
  'Rework',
  'Review QA',
  'Started'
].sort();

export default function BahrainDailyTasks() {
  const { user: currentUser } = getSession();
  const isAdminUser = isAdmin(currentUser);
  const searchParams = useSearchParams();
  const canUpdateStatus = isAdminUser || (currentUser?.permissions?.can_update_status ?? true);

  const getActivePartnerIds = (t: { assigned_partners?: string[] | null; assigned_to?: string | null }): string[] => {
    const ids: string[] = [];
    if (Array.isArray(t.assigned_partners)) {
      t.assigned_partners.forEach(id => {
        if (id && !ids.includes(id)) ids.push(id);
      });
    }
    if (t.assigned_to && !ids.includes(t.assigned_to)) {
      ids.push(t.assigned_to);
    }
    return ids;
  };

  const [tasks, setTasks] = useState<Task[]>([]);
  const [partners, setPartners] = useState<User[]>([]);
  const [dynamicStatuses, setDynamicStatuses] = useState<string[]>(BAHRAIN_STATUSES);
  const [loading, setLoading] = useState(true);


  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterPartner, setFilterPartner] = useState('');
  const [search, setSearch] = useState('');

  // Modals
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({
    title: '', priority: 'Medium', deadline: '', description: '', assigned_to: '', assigned_partners: [] as string[], repeat_daily: false, repeat_monthly: false, status: ''
  });

  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateBy, setUpdateBy] = useState('');
  const [updatePartners, setUpdatePartners] = useState<string[]>([]);
  const [updateRemarks, setUpdateRemarks] = useState('');
  
  // Inline edit state
  const [inlineEditDescId, setInlineEditDescId] = useState<string | null>(null);
  const [inlineEditDescValue, setInlineEditDescValue] = useState('');
  const [hoveredDescTaskId, setHoveredDescTaskId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top?: number, bottom?: number, right: number, maxHeight?: string }>({ top: 0, right: 0 });

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

  const dataCountry = getDataCountry();

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

  const priorityColor = (p: string) => {
    if (!isDark) {
      switch (p) {
        case 'Urgent':
        case 'Critical': return { bg: '#E74C3C', color: '#fff' };
        case 'High': return { bg: '#F39C12', color: '#fff' };
        case 'Medium': return { bg: '#3498DB', color: '#fff' };
        case 'Low': return { bg: '#95A5A6', color: '#fff' };
        default: return { bg: '#95A5A6', color: '#fff' };
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
        text: 'var(--text-secondary, #64748b)',
        bg: 'var(--bg-tertiary, #f1f5f9)',
        border: 'var(--border, #e2e8f0)',
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
      if (!s) return { bg: 'var(--bg-tertiary, #f1f5f9)', color: 'var(--text-secondary, #64748b)', border: 'var(--border, #e2e8f0)', dot: '#94a3b8', glow: 'none' };
      const sl = s.trim().toLowerCase();
      if (sl === 'completed' || sl === 'done' || sl.includes('submitted')) return { bg: '#ecfdf5', color: '#065f46', border: '#a7f3d0', dot: '#10b981', glow: 'none' };
      if (sl === 'closed') return { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0', dot: '#16a34a', glow: 'none' };
      if (sl === 'filed' || sl.includes('file')) return { bg: '#ecfeff', color: '#0e7490', border: '#a5f3fc', dot: '#06b6d4', glow: 'none' };
      if (sl.includes('received') || sl.includes('accepted')) return { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0', dot: '#22c55e', glow: 'none' };
      if (sl.includes('query') || sl.includes('info') || sl.includes('question') || sl.includes('letter') || sl.includes('confirmation')) return { bg: '#fefce8', color: '#854d0e', border: '#fef08a', dot: '#eab308', glow: 'none' };
      if (sl.includes('review') || sl.includes('auditor') || sl.includes('approval') || sl.includes('validation')) return { bg: '#faf5ff', color: '#6b21a8', border: '#e9d5ff', dot: '#a855f7', glow: 'none' };
      if (sl.includes('payment') || sl.includes('financial') || sl.includes('billing') || sl.includes('invoice') || sl.includes('xero')) return { bg: '#eef2ff', color: '#3730a3', border: '#c7d2fe', dot: '#6366f1', glow: 'none' };
      if (sl === 'in progress' || sl === 'progress' || sl.includes('progress') || sl.includes('progess') || sl === 'active' || sl === 'started' || sl === 'running') return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', dot: '#3b82f6', glow: 'none' };
      if (sl.includes('checklist')) return { bg: '#f0fdfa', color: '#115e59', border: '#99f6e4', dot: '#14b8a6', glow: 'none' };
      if (sl === 'overdue' || sl === 'urgent' || sl === 'high' || sl === 'rework' || sl === 'blocked' || sl.includes('reject')) return { bg: '#fef2f2', color: '#991b1b', border: '#fecaca', dot: '#ef4444', glow: 'none' };
      if (sl === 'pending' || sl.includes('yet to start') || sl.includes('not started') || sl.includes('hold') || sl.includes('waiting') || sl.includes('awaited')) return { bg: '#fffbeb', color: '#b45309', border: '#fde68a', dot: '#f59e0b', glow: 'none' };
      if (sl === 'new' || sl === 'created') return { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe', dot: '#3b82f6', glow: 'none' };
      return { bg: 'var(--bg-tertiary, #f1f5f9)', color: 'var(--text-secondary, #64748b)', border: 'var(--border, #e2e8f0)', dot: '#94a3b8', glow: 'none' };
    }

    if (!s) return { bg: 'rgba(148, 163, 184, 0.12)', color: 'var(--text-tertiary, #94a3b8)', border: 'var(--border, rgba(148, 163, 184, 0.24))', dot: '#94a3b8', glow: 'none' };
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

  async function handleStatusChange(taskId: string, newStatus: string) {
    if (!canUpdateStatus) return;
    try {
      await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);
      await supabase.from('status_log').insert({
        task_id: taskId,
        status: newStatus,
        remarks: 'Quick status update'
      });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
      // Invalidate caches so other pages (Staff, Dashboard) fetch fresh data
      sessionStorage.removeItem('dashboard_data_time_v2');
      sessionStorage.removeItem('tasks_data_time');
      sessionStorage.removeItem('daily_tasks_data_time');
    } catch (e) {
      console.error(e);
    }
  }

  async function handlePriorityChange(taskId: string, newPriority: string) {
    if (!canUpdateStatus) return;
    try {
      await supabase.from('tasks').update({ priority: newPriority }).eq('id', taskId);
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, priority: newPriority } : t));
    } catch (e) {
      console.error(e);
    }
  }

  async function handleAssign(taskId: string, assignValue: string) {
    if (!isAdminUser) return;
    try {
      const oldTask = tasks.find(t => t.id === taskId);
      const oldAssignee = oldTask?.assigned_to || '';
      
      await supabase.from('tasks').update({ assigned_to: assignValue || null }).eq('id', taskId);
      
      const oldName = partners.find(p => p.id === oldAssignee)?.username || 'Unassigned';
      const newName = partners.find(p => p.id === assignValue)?.username || 'Unassigned';
      if (oldAssignee !== assignValue) {
         await supabase.from('status_log').insert({
           task_id: taskId,
           status: oldTask?.status || 'Pending',
           updated_by: currentUser?.id,
           remarks: `Assignment updated: ${oldName} → ${newName}`
         });
      }

      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, assigned_to: assignValue } : t));
    } catch (e) {
      console.error(e);
    }
  }

  async function saveInlineDescription(taskId: string) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    if (inlineEditDescValue === task.description) {
      setInlineEditDescId(null);
      return;
    }
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, description: inlineEditDescValue } : t));
    try {
      await supabase.from('tasks').update({ description: inlineEditDescValue }).eq('id', taskId);
      if (currentUser) {
        await supabase.from('status_log').insert({
          task_id: taskId,
          status: task.status || 'Unknown',
          updated_by: currentUser.id,
          remarks: `Description updated to: ${inlineEditDescValue}`
        });
      }
    } catch (e) {
      console.error(e);
    }
    setInlineEditDescId(null);
  }

  const loadData = useCallback(async () => {
    const cacheKey = 'daily_tasks_data_cache';
    const cacheTimeKey = 'daily_tasks_data_time';
    const cachedData = sessionStorage.getItem(cacheKey);
    const cacheTime = sessionStorage.getItem(cacheTimeKey);

    let hadCache = false;

    // Show cached data instantly for zero-wait UI
    if (cachedData && cacheTime) {
      const age = Date.now() - parseInt(cacheTime);
      try {
        const parsed = JSON.parse(cachedData);
        setPartners(parsed.partners || []);
        setTasks(parsed.tasks || []);
        if (parsed.dynamicStatuses && parsed.dynamicStatuses.length > 0) {
          setDynamicStatuses(parsed.dynamicStatuses);
        }
        setLoading(false);
        hadCache = true;
        // If cache is fresh (< 2 min), skip network entirely
        if (age < 2 * 60 * 1000) return;
      } catch (e) { }
    }

    setLoading(true);
    try {
      let usersQuery = supabase.from('users').select('id, username, role, country, permissions, created_at').order('created_at', { ascending: false });
      if (dataCountry) usersQuery = usersQuery.eq('country', dataCountry);

      const statusQuery = dataCountry 
        ? supabase.from('statuses').select('name, active').eq('country', dataCountry) 
        : supabase.from('statuses').select('name, active');

      const tasksQuery = supabase.from('tasks')
        .select('id, title, company_id, assigned_to, assigned_partners, status, priority, deadline, admin_note, description, is_daily, repeat_daily, repeat_monthly, country, created_at')
        .eq('is_daily', true)
        .eq('country', dataCountry || 'Bahrain')
        .order('created_at', { ascending: false });

      const [usersRes, statusRes, tasksRes] = await Promise.all([
        usersQuery, statusQuery, tasksQuery
      ]);

      const tasksData = tasksRes.data || [];

      // Auto-reset daily repeating tasks
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tasksToCheck = tasksData.filter(t => (t.repeat_daily || t.repeat_monthly) && t.status !== 'Pending');
      
      if (tasksToCheck.length > 0) {
        const taskIds = tasksToCheck.map(t => t.id);
        const { data: logs } = await supabase
          .from('status_log')
          .select('task_id, created_at')
          .in('task_id', taskIds)
          .order('created_at', { ascending: false });
          
        const resetPromises: any[] = [];
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        
        for (const task of tasksToCheck) {
          const taskLogs = (logs || []).filter(l => l.task_id === task.id);
          const latestLogDateStr = taskLogs.length > 0 ? taskLogs[0].created_at : task.created_at;
          const latestDate = new Date(latestLogDateStr);
          
          let shouldReset = false;
          let remarks = '';
          
          if (task.repeat_daily && latestDate < today) {
            shouldReset = true;
            remarks = 'Daily auto-reset';
          } else if (task.repeat_monthly && (latestDate.getMonth() !== currentMonth || latestDate.getFullYear() !== currentYear)) {
            shouldReset = true;
            remarks = 'Monthly auto-reset';
          }
          
          if (shouldReset) {
            resetPromises.push(
              supabase.from('tasks').update({ status: 'Pending' }).eq('id', task.id)
            );
            resetPromises.push(
              supabase.from('status_log').insert({
                task_id: task.id,
                status: 'Pending',
                remarks: remarks
              })
            );
            task.status = 'Pending';
          }
        }
        
        if (resetPromises.length > 0) {
          await Promise.all(resetPromises);
        }
      }

      setPartners(usersRes.data || []);
      setTasks(tasksData);

      const dbStatuses = statusRes.data?.filter(s => s.active !== false).map(s => s.name) || [];
      const resolvedStatuses = dbStatuses.length > 0
        ? [...new Set(dbStatuses)].sort((a: string, b: string) => a.localeCompare(b))
        : (!dataCountry || dataCountry === 'Bahrain' ? [...BAHRAIN_STATUSES].sort((a, b) => a.localeCompare(b)) : []);
      if (dbStatuses.length > 0) {
        setDynamicStatuses(resolvedStatuses);
      } else {
        setDynamicStatuses(resolvedStatuses);
      }

      // Save cache
      sessionStorage.setItem(cacheKey, JSON.stringify({
        partners: usersRes.data || [],
        tasks: tasksData,
        dynamicStatuses: resolvedStatuses,
      }));
      sessionStorage.setItem(cacheTimeKey, Date.now().toString());

    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [dataCountry]);

  useEffect(() => { loadData(); }, [loadData]);

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


  const filtered = tasks.filter(t => {
    const activePartnerIds = getActivePartnerIds(t);

    const isAssigned = activePartnerIds.includes(currentUser?.id || '') || (currentUser?.username ? activePartnerIds.includes(currentUser.username) : false);
    if (!isAdminUser && !isAssigned) return false;
    
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterPartner) {
      if (!activePartnerIds.includes(filterPartner)) return false;
    }
    
    if (search) {
      const q = search.toLowerCase();
      return t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q) || t.admin_note?.toLowerCase().includes(q);
    }
    return true;
  });

  const sortedTasks = [...filtered].sort((a, b) => a.status.localeCompare(b.status));

  async function saveTask() {
    if (!newTask.title) { alert('Title is required'); return; }
    
    const taskCountry = dataCountry || 'Bahrain';
    
    try {
      if (editingTaskId) {
        const updatePayload: any = {
          title: newTask.title,
          priority: newTask.priority,
          deadline: newTask.deadline || null,
          description: newTask.description,
          assigned_to: newTask.assigned_to || null,
          assigned_partners: newTask.assigned_partners,
          repeat_daily: newTask.repeat_daily,
          repeat_monthly: newTask.repeat_monthly,
          is_daily: true,
          country: taskCountry,
        };
        if (newTask.status) updatePayload.status = newTask.status;

        // Check for changes to log
        const oldTask = tasks.find(t => t.id === editingTaskId);
        const { error } = await supabase.from('tasks').update(updatePayload).eq('id', editingTaskId);
        if (error) { console.error('Update error:', error); alert('Failed to update task: ' + error.message); return; }

        if (oldTask) {
           let remarksArr = [];
           if (newTask.status && oldTask.status !== newTask.status) {
             remarksArr.push(`Status updated from ${oldTask.status} to ${newTask.status}`);
           }
           
           const oldAssign = oldTask.assigned_partners || (oldTask.assigned_to ? [oldTask.assigned_to] : []);
           const newAssign = newTask.assigned_partners || (newTask.assigned_to ? [newTask.assigned_to] : []);
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
                status: newTask.status || oldTask.status,
                updated_by: currentUser?.id,
                remarks: remarksArr.join(' | ')
              });
           }
        }
      } else {
        const { error } = await supabase.from('tasks').insert({
          title: newTask.title,
          priority: newTask.priority,
          status: newTask.status || 'Pending',
          deadline: newTask.deadline || null,
          description: newTask.description,
          assigned_to: newTask.assigned_to || null,
          assigned_partners: newTask.assigned_partners,
          repeat_daily: newTask.repeat_daily,
          repeat_monthly: newTask.repeat_monthly,
          country: taskCountry,
          is_daily: true
        });
        if (error) { console.error('Insert error:', error); alert('Failed to create task: ' + error.message); return; }
      }
      setShowTaskModal(false);
      setEditingTaskId(null);
      await loadData();
    } catch (err) {
      console.error('Save task error:', err);
      alert('An unexpected error occurred while saving the task.');
    }
  }

  async function deleteTask(id: string) {
    if (!confirm('Are you sure you want to delete this daily task? This cannot be undone.')) return;
    try {
      await supabase.from('status_log').delete().eq('task_id', id);
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) { alert('Failed to delete: ' + error.message); return; }
      await loadData();
    } catch (err) {
      console.error('Delete error:', err);
      alert('An error occurred while deleting the task.');
    }
  }

  async function viewDetail(id: string) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    setDetailTask(task);
    
    if (isAdminUser && dataCountry === 'Bahrain' && task.assigned_to) {
      setUpdateBy(task.assigned_to);
    } else {
      setUpdateBy(currentUser?.id || '');
    }
    setUpdateStatus(task.status);
    setUpdatePartners(task.assigned_partners || (task.assigned_to ? [task.assigned_to] : []));
    setUpdateRemarks('');
    
    const { data: logs } = await supabase.from('status_log').select('*, updater:users(username)').eq('task_id', id).order('created_at', { ascending: false });
    setStatusLogs(logs || []);
  }

  async function saveStatusUpdate() {
    if (!detailTask) return;
    const oldStatus = detailTask.status;
    const byId = isAdminUser ? updateBy : currentUser?.id;
    
    const updatePayload: any = { status: updateStatus };
    if (isAdminUser) {
      updatePayload.assigned_partners = updatePartners;
      updatePayload.assigned_to = updatePartners.length > 0 ? updatePartners[0] : null;
    }

    await supabase.from('tasks').update(updatePayload).eq('id', detailTask.id);
    
    let remarks = updateRemarks;
    if (!remarks) {
      if (oldStatus !== updateStatus) {
        remarks = `Changed from ${oldStatus} to ${updateStatus}`;
      } else {
        remarks = 'Updated task details';
      }
    }

    await supabase.from('status_log').insert({
      task_id: detailTask.id,
      status: updateStatus,
      updated_by: byId,
      remarks: remarks
    });
    sessionStorage.removeItem('bahrain_daily_tasks_cache_v1');
    sessionStorage.removeItem('tasks_data_time');
    setDetailTask(null);
    loadData();
  }



  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#7F8C8D' }}>Loading daily tasks...</div>;

  return (
    <div style={{ padding: '0' }}>


      <div className="daily-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', padding: '28px 32px', background: 'linear-gradient(135deg, #4c1d95 0%, #6d28d9 50%, #7c3aed 100%)', borderRadius: '20px', boxShadow: '0 4px 20px rgba(109,40,217,0.2)' }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: '24px', fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>Daily Tasks</h2>
          <p style={{ color: '#c4b5fd', fontSize: '14px', margin: '6px 0 0 0' }}>General day-to-day work tasks — not linked to any company</p>
        </div>
        {isAdminUser && (
          <button onClick={() => { setEditingTaskId(null); setNewTask({ title: '', priority: 'Medium', deadline: '', description: '', assigned_to: '', assigned_partners: [], repeat_daily: false, repeat_monthly: false, status: '' }); setShowTaskModal(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: '#ffffff', color: '#4c1d95', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', boxShadow: '0 4px 14px rgba(0,0,0,0.15)', transition: 'all 0.2s ease', whiteSpace: 'nowrap' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.15)'; }}>
            <Plus size={16} /> New Daily Task
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="task-filters" style={{ display: 'flex', gap: '10px', marginBottom: '22px', flexWrap: 'wrap', padding: '16px 18px', background: 'rgba(255, 255, 255, 0.65)', backdropFilter: 'blur(10px)', borderRadius: '18px', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#ffffff', padding: '9px 14px', borderRadius: '12px', flex: '2 1 220px', minWidth: '180px', border: '1px solid #cbd5e1', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <Search size={16} color="#94a3b8" />
          <input placeholder="Search title or description..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '13px', color: '#334155', fontWeight: 500 }} />
        </div>
        
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={filterStyle}>
          <option value="">All Statuses</option>
          {dynamicStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={filterStyle}>
          <option value="">All Priorities</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        
        {isAdminUser && (
          <select value={filterPartner} onChange={e => setFilterPartner(e.target.value)} style={filterStyle}>
            <option value="">All Assignees</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
          </select>
        )}
      </div>

      {/* Tasks Table */}
      <div className="task-table-wrap" style={{ width: '100%', overflowX: 'auto', borderRadius: '18px', boxShadow: 'var(--card-shadow, 0 8px 32px rgba(0,0,0,0.05))', border: '1px solid var(--border, rgba(226, 232, 240, 0.8))', background: 'var(--bg-card, #ffffff)', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', minWidth: '960px', borderCollapse: 'collapse', background: 'var(--bg-card, #ffffff)', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: isDark ? 'var(--bg-tertiary)' : '#f8fafc', borderBottom: '2px solid var(--border, #e2e8f0)' }}>
              {[
                { id: 'id', label: 'ID', width: '68px', minWidth: '68px', align: 'left' },
                { id: 'title', label: 'Title', width: '20%', minWidth: '160px', align: 'left' },
                { id: 'description', label: 'Description', width: '22%', minWidth: '170px', align: 'left' },
                { id: 'priority', label: 'Priority', width: '95px', minWidth: '95px', align: 'left' },
                { id: 'status', label: 'Status', width: '155px', minWidth: '150px', align: 'left' },
                { id: 'deadline', label: 'Due Date', width: '115px', minWidth: '110px', align: 'left' },
                { id: 'assigned_to', label: 'Assigned To', width: '160px', minWidth: '150px', align: 'left' },
                { id: 'actions', label: '', width: '45px', minWidth: '45px', align: 'center' },
              ].map(col => (
                <th
                  key={col.id}
                  style={{
                    padding: col.id === 'actions' ? '11px 4px' : '11px 10px',
                    textAlign: col.align as any,
                    fontSize: '10.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'var(--text-secondary, #64748b)',
                    whiteSpace: 'nowrap',
                    width: col.width,
                    minWidth: col.minWidth,
                    boxSizing: 'border-box'
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedTasks.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary, #94a3b8)' }}>No daily tasks found.</td></tr>
            ) : sortedTasks.map(task => {
              const pc = priorityColor(task.priority);
              const isMenuOpen = openMenuId === task.id;
              
              return (
              <tr key={task.id} style={{ borderBottom: '1px solid var(--border, #f1f5f9)', transition: 'background 0.15s ease' }} onMouseEnter={e => e.currentTarget.style.background = isDark ? 'var(--bg-tertiary)' : '#fafbfc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ ...compactCell, width: '68px', minWidth: '68px' }}><span style={{ fontWeight: 600, color: 'var(--text-secondary, #475569)', fontSize: '12px', fontFamily: 'ui-monospace, monospace' }}>#{task.id.slice(0, 6)}</span></td>
                <td style={{ ...compactCell, width: '20%', minWidth: '160px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 500, fontSize: '12px', color: 'var(--text-primary, #1e293b)', maxWidth: '160px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                    {task.repeat_daily && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 8px', borderRadius: '20px', fontSize: '9px', fontWeight: 700, background: 'linear-gradient(135deg, #7c3aed20, #6d28d920)', color: '#7c3aed', border: '1px solid #7c3aed30', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                        <Repeat size={10} /> Repeat
                      </span>
                    )}
                    {task.repeat_monthly && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 8px', borderRadius: '20px', fontSize: '9px', fontWeight: 700, background: 'linear-gradient(135deg, #2563eb20, #1d4ed820)', color: '#2563eb', border: '1px solid #2563eb30', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                        <Repeat size={10} /> Monthly
                      </span>
                    )}
                  </div>
                </td>
                <td 
                  style={{ ...compactCell, width: '22%', minWidth: '170px', position: 'relative' }}
                  onMouseEnter={() => setHoveredDescTaskId(task.id)}
                  onMouseLeave={() => setHoveredDescTaskId(null)}
                >
                  {inlineEditDescId === task.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '180px', position: 'absolute', zIndex: 10, background: 'var(--bg-card, #fff)', padding: '8px', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: '1px solid var(--border, #e2e8f0)', top: '50%', transform: 'translateY(-50%)', left: '10px' }}>
                      <textarea
                        autoFocus
                        value={inlineEditDescValue}
                        onChange={e => setInlineEditDescValue(e.target.value)}
                        style={{
                          width: '100%',
                          minHeight: '60px',
                          padding: '6px',
                          fontSize: '11px',
                          borderRadius: '6px',
                          border: '1px solid #3b82f6',
                          outline: 'none',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                          color: 'var(--text-primary, #1e293b)',
                          background: 'var(--bg-primary, #ffffff)'
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
                          style={{ padding: '4px 8px', border: '1px solid var(--border, #e2e8f0)', background: 'var(--bg-tertiary, #f8fafc)', color: 'var(--text-secondary, #64748b)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 600 }}
                          title="Cancel (Esc)"
                        >
                          <X size={12} /> Cancel
                        </button>
                        <button
                          onClick={() => saveInlineDescription(task.id)}
                          style={{ padding: '4px 8px', border: 'none', background: '#3b82f6', color: '#fff', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 600 }}
                          title="Save (Ctrl+Enter)"
                        >
                          <Check size={12} /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', minHeight: '24px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary, #475569)', maxWidth: '160px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.description || '—'}
                      </span>
                      {hoveredDescTaskId === task.id && isAdminUser && (
                        <button
                          onClick={() => {
                            setInlineEditDescId(task.id);
                            setInlineEditDescValue(task.description || '');
                          }}
                          style={{
                            background: isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff',
                            border: isDark ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid #bfdbfe',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            padding: '3px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#3b82f6',
                            transition: 'all 0.15s ease'
                          }}
                          title="Edit Description"
                          onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(59, 130, 246, 0.25)' : '#dbeafe'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff'; }}
                        >
                          <Edit2 size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </td>
                <td style={{ ...compactCell, width: '95px', minWidth: '95px' }}>
                  {canUpdateStatus ? (
                    <select value={task.priority} onChange={e => handlePriorityChange(task.id, e.target.value)}
                      style={{ width: '100%', maxWidth: '85px', padding: '4px 6px', borderRadius: '8px', border: 'none', background: pc.bg, color: pc.color, fontWeight: 700, fontSize: '10.5px', cursor: 'pointer', outline: 'none', boxSizing: 'border-box' }}>
                      {['Urgent', 'Critical', 'High', 'Medium', 'Low'].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: pc.bg, color: pc.color, whiteSpace: 'nowrap' }}>{task.priority}</span>
                  )}
                </td>
                <td style={{ ...compactCell, width: '155px', minWidth: '150px' }}>
                  {canUpdateStatus ? (() => {
                    const sc = statusColor(task.status);
                    return (
                      <select value={task.status} onChange={e => handleStatusChange(task.id, e.target.value)}
                        style={{
                          width: '100%',
                          maxWidth: '145px',
                          padding: '4px 8px',
                          borderRadius: '8px',
                          border: `1.5px solid ${sc.border}`,
                          background: sc.bg,
                          color: sc.color,
                          fontWeight: 800,
                          fontSize: '11px',
                          cursor: 'pointer',
                          outline: 'none',
                          boxShadow: isDark ? sc.glow : 'none',
                          boxSizing: 'border-box'
                        }}
                      >
                        {dynamicStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    );
                  })() : (() => {
                    const sc = statusColor(task.status);
                    return (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 9px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 800,
                        background: sc.bg,
                        color: sc.color,
                        border: `1.5px solid ${sc.border}`,
                        whiteSpace: 'nowrap',
                        boxShadow: isDark ? sc.glow : 'none',
                        maxWidth: '145px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: sc.dot, boxShadow: isDark ? `0 0 8px ${sc.dot}` : 'none', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.status}</span>
                      </span>
                    );
                  })()}
                </td>
                <td style={{ ...compactCell, width: '115px', minWidth: '110px' }}>
                  <span style={{
                    fontSize: '11.5px',
                    color: isDark ? '#fb923c' : '#c2410c',
                    fontWeight: 650,
                    whiteSpace: 'nowrap',
                    fontFamily: 'ui-monospace, monospace',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    {task.deadline ? formatDate(task.deadline) : <span style={{ color: 'var(--text-tertiary, #94a3b8)' }}>—</span>}
                  </span>
                </td>
                <td style={{ ...compactCell, width: '160px', minWidth: '150px' }}>
                  {(() => {
                    const allAssignedIds = getActivePartnerIds(task);
                    const assignedPartners = allAssignedIds.map(id => partners.find(p => p.id === id)).filter((p): p is typeof partners[number] => Boolean(p));

                    if (isAdminUser) {
                      const selectedPartner = partners.find(p => p.id === task.assigned_to);
                      const pCol = getPartnerColor(selectedPartner?.username || selectedPartner?.id);
                      return (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', width: '100%', maxWidth: '150px' }}>
                          {selectedPartner && (
                            <div style={{
                              width: '18px', height: '18px', borderRadius: '50%',
                              background: pCol.avatarBg,
                              color: '#ffffff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '9.5px', fontWeight: 800, flexShrink: 0,
                              boxShadow: isDark ? `0 0 8px ${pCol.border}` : 'none'
                            }}>
                              {selectedPartner.username.substring(0, 1).toUpperCase()}
                            </div>
                          )}
                          <select
                            value={task.assigned_to || ''}
                            onChange={e => handleAssign(task.id, e.target.value)}
                            style={{
                              width: '100%',
                              maxWidth: selectedPartner ? '125px' : '145px',
                              padding: '4px 8px',
                              borderRadius: '8px',
                              border: task.assigned_to ? `1.5px solid ${pCol.border}` : '1px solid var(--border)',
                              background: task.assigned_to ? pCol.bg : 'var(--bg-tertiary)',
                              color: task.assigned_to ? pCol.text : 'var(--text-secondary)',
                              fontSize: '11.5px',
                              fontWeight: 750,
                              cursor: 'pointer',
                              outline: 'none',
                              boxShadow: (task.assigned_to && isDark) ? `0 0 8px ${pCol.bg}` : 'none',
                              boxSizing: 'border-box'
                            }}
                          >
                            <option value="">👤 Unassigned</option>
                            {partners.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
                          </select>
                        </div>
                      );
                    }

                    if (assignedPartners.length > 0) {
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                          {assignedPartners.map(p => {
                            const pCol = getPartnerColor(p.username || p.id);
                            return (
                              <span
                                key={p.id}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  fontSize: '11px',
                                  fontWeight: 750,
                                  color: pCol.text,
                                  background: pCol.bg,
                                  border: `1.5px solid ${pCol.border}`,
                                  padding: '3px 8px',
                                  borderRadius: '7px',
                                  whiteSpace: 'nowrap',
                                  boxShadow: isDark ? `0 0 8px ${pCol.bg}` : 'none'
                                }}
                                title={p.username}
                              >
                                <span style={{
                                  width: '14px', height: '14px', borderRadius: '50%',
                                  background: pCol.avatarBg, color: '#ffffff',
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '8.5px', fontWeight: 800, flexShrink: 0
                                }}>
                                  {p.username.substring(0, 1).toUpperCase()}
                                </span>
                                {p.username}
                              </span>
                            );
                          })}
                        </div>
                      );
                    }

                    return <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Unassigned</span>;
                  })()}
                </td>
                <td style={{ ...compactCell, position: 'relative', width: '45px', minWidth: '45px', textAlign: 'center' }}>
                  <button onClick={e => { 
                    e.stopPropagation(); 
                    if (isMenuOpen) {
                      setOpenMenuId(null);
                    } else {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const menuHeight = 160;
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
                      background: isMenuOpen ? 'var(--bg-tertiary, #f1f5f9)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer', borderRadius: '8px', padding: '6px',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s ease', position: 'relative',
                      width: '32px',
                      height: '32px',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = isDark ? 'var(--bg-tertiary)' : '#f1f5f9'}
                    onMouseLeave={e => { if (!isMenuOpen) e.currentTarget.style.background = 'transparent'; }}>
                    <MoreHorizontal size={16} color="var(--text-secondary, #64748b)" />
                  </button>
                  {isMenuOpen && typeof window !== 'undefined' && createPortal(
                    <div style={{ position: 'fixed', top: menuPos.top, bottom: menuPos.bottom, right: menuPos.right, maxHeight: menuPos.maxHeight || 'none', overflowY: 'auto', background: 'var(--bg-card, #fff)', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid var(--border, #e2e8f0)', zIndex: 9999, minWidth: '155px' }}
                      onClick={e => e.stopPropagation()}>
                      <button onClick={() => { viewDetail(task.id); setOpenMenuId(null); }} style={menuItemStyle}>
                        <Eye size={14} color="#3b82f6" /> View Details
                      </button>

                      {isAdminUser && (<>
                        <button onClick={() => { 
                          setEditingTaskId(task.id); 
                          setNewTask({ title: task.title, priority: task.priority, deadline: task.deadline || '', description: task.description || '', assigned_to: task.assigned_to || '', assigned_partners: task.assigned_partners || [], repeat_daily: task.repeat_daily || false, repeat_monthly: task.repeat_monthly || false, status: task.status || '' }); 
                          setShowTaskModal(true); 
                          setOpenMenuId(null); 
                        }} style={menuItemStyle}>
                          <Edit2 size={14} color="#f59e0b" /> Edit Task
                        </button>
                        <div style={{ height: '1px', background: 'var(--border, #f1f5f9)', margin: '2px 0' }} />
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

      {/* New/Edit Modal */}
      {showTaskModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={modalHeaderStyle}>
              <h3>{editingTaskId ? 'Edit Daily Task' : 'New Daily Task'}</h3>
              <button onClick={() => setShowTaskModal(false)} style={closeBtnStyle}><X size={20} /></button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                <FormField label="Task Title *">
                  <input value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} style={inputStyle} />
                </FormField>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <FormField label="Priority">
                    <select value={newTask.priority} onChange={e => setNewTask(p => ({ ...p, priority: e.target.value }))} style={inputStyle}>
                      <option>High</option><option>Medium</option><option>Low</option>
                    </select>
                  </FormField>
                  <FormField label="Status">
                    <select value={newTask.status} onChange={e => setNewTask(p => ({ ...p, status: e.target.value }))} style={inputStyle}>
                      <option value="">Default (Auto)</option>
                      {dynamicStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Deadline">
                    <input type="date" value={newTask.deadline} onChange={e => setNewTask(p => ({ ...p, deadline: e.target.value }))} style={inputStyle} />
                  </FormField>
                </div>
                <FormField label="Primary Assignee">
                  <select value={newTask.assigned_to} onChange={e => setNewTask(p => ({ ...p, assigned_to: e.target.value }))} style={inputStyle}>
                    <option value="">Unassigned</option>
                    {partners.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
                  </select>
                </FormField>
                <FormField label="Additional Assignees">
                  <MultiSelect options={partners.filter(p => p.id !== newTask.assigned_to).map(p => ({ id: p.id, label: p.username }))} selected={newTask.assigned_partners || []} onChange={v => setNewTask(p => ({ ...p, assigned_partners: v }))} placeholder="Select additional partners..." />
                </FormField>
                <FormField label="Description">
                  <textarea value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} style={{ ...inputStyle, minHeight: '80px' }} />
                </FormField>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: newTask.repeat_daily ? 'linear-gradient(135deg, #7c3aed08, #6d28d910)' : '#f8fafc', borderRadius: '12px', border: newTask.repeat_daily ? '1.5px solid #7c3aed30' : '1.5px solid #e2e8f0', transition: 'all 0.2s ease', cursor: 'pointer' }} onClick={() => setNewTask(p => ({ ...p, repeat_daily: !p.repeat_daily, repeat_monthly: !p.repeat_daily ? false : p.repeat_monthly }))}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: newTask.repeat_daily ? 'linear-gradient(135deg, #7c3aed, #6d28d9)' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease' }}>
                        <Repeat size={16} color={newTask.repeat_daily ? '#ffffff' : '#94a3b8'} />
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Repeat Daily</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '1px' }}>Task resets automatically every day</div>
                      </div>
                    </div>
                    <div style={{ width: '44px', height: '24px', borderRadius: '12px', background: newTask.repeat_daily ? 'linear-gradient(135deg, #7c3aed, #6d28d9)' : '#cbd5e1', position: 'relative', transition: 'all 0.25s ease', boxShadow: newTask.repeat_daily ? '0 2px 8px rgba(124,58,237,0.3)' : 'none' }}>
                      <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#ffffff', position: 'absolute', top: '2px', left: newTask.repeat_daily ? '22px' : '2px', transition: 'all 0.25s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
                    </div>
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: newTask.repeat_monthly ? 'linear-gradient(135deg, #2563eb08, #1d4ed810)' : '#f8fafc', borderRadius: '12px', border: newTask.repeat_monthly ? '1.5px solid #2563eb30' : '1.5px solid #e2e8f0', transition: 'all 0.2s ease', cursor: 'pointer' }} onClick={() => setNewTask(p => ({ ...p, repeat_monthly: !p.repeat_monthly, repeat_daily: !p.repeat_monthly ? false : p.repeat_daily }))}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: newTask.repeat_monthly ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease' }}>
                        <Repeat size={16} color={newTask.repeat_monthly ? '#ffffff' : '#94a3b8'} />
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Repeat Monthly</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '1px' }}>Task resets automatically every month</div>
                      </div>
                    </div>
                    <div style={{ width: '44px', height: '24px', borderRadius: '12px', background: newTask.repeat_monthly ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : '#cbd5e1', position: 'relative', transition: 'all 0.25s ease', boxShadow: newTask.repeat_monthly ? '0 2px 8px rgba(37,99,235,0.3)' : 'none' }}>
                      <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#ffffff', position: 'absolute', top: '2px', left: newTask.repeat_monthly ? '22px' : '2px', transition: 'all 0.25s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
                    </div>
                  </div>
                </div>
              </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
                <button onClick={() => setShowTaskModal(false)} style={{ padding: '11px 24px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', transition: 'all 0.15s ease' }} onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'} onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}>Cancel</button>
                <button onClick={saveTask} style={{ padding: '11px 24px', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', boxShadow: '0 4px 14px rgba(109,40,217,0.3)', transition: 'all 0.15s ease' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(109,40,217,0.4)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(109,40,217,0.3)'; }}>Save Task</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Daily Task Detail Modal */}
      {detailTask && (() => {
        const sc = statusColor(detailTask.status);
        const pc = priorityColor(detailTask.priority);
        const isOverdue = !!(
          detailTask.deadline &&
          new Date(detailTask.deadline).getTime() < new Date().setHours(0, 0, 0, 0) &&
          !['completed', 'closed', 'filed', 'done'].includes((detailTask.status || '').toLowerCase())
        );

        // Resolve assigned partners
        const activePartnerIds = getActivePartnerIds(detailTask);
        const activePartnerObjects = activePartnerIds
          .map(id => partners.find(p => p.id === id))
          .filter((p): p is typeof partners[number] => Boolean(p));

        return (
          <div style={modalOverlayStyle} onClick={() => setDetailTask(null)}>
            <div
              style={{
                ...modalContentStyle,
                maxWidth: '680px',
                background: 'var(--bg-card, #ffffff)',
                border: '1px solid var(--border)'
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header Bar */}
              <div style={{
                padding: '18px 24px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: isDark ? 'var(--bg-tertiary)' : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                borderRadius: '20px 20px 0 0'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '11px',
                    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    boxShadow: '0 4px 12px rgba(124,58,237,0.3)',
                    flexShrink: 0
                  }}>
                    <ListTodo size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 750, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                      Daily Task Details
                    </h3>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', fontFamily: 'ui-monospace, monospace', marginTop: '2px' }}>
                      Task #{detailTask.id}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setDetailTask(null)}
                  style={{
                    background: isDark ? 'var(--bg-secondary)' : '#ffffff',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'var(--bg-card)' : '#f1f5f9'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isDark ? 'var(--bg-secondary)' : '#ffffff'; }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body */}
              <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '18px', maxHeight: 'calc(90vh - 85px)', overflowY: 'auto' }}>
                
                {/* 1. Hero Info Banner */}
                <div style={{
                  background: isDark ? 'var(--bg-tertiary)' : '#f8fafc',
                  padding: '18px',
                  borderRadius: '14px',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h4 style={{ fontSize: '17px', fontWeight: 750, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em', wordBreak: 'break-word' }}>
                        {detailTask.title}
                      </h4>
                      {detailTask.country && (
                        <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: '4px', fontWeight: 600 }}>
                          Region: {detailTask.country}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{
                        padding: '4px 11px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: 750,
                        background: sc.bg,
                        color: sc.color,
                        border: `1.5px solid ${sc.border}`,
                        boxShadow: sc.glow,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: sc.dot, boxShadow: `0 0 6px ${sc.dot}` }} />
                        {detailTask.status}
                      </span>

                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: pc.bg,
                        color: pc.color
                      }}>
                        {detailTask.priority}
                      </span>

                      {detailTask.repeat_daily && (
                        <span style={{
                          padding: '4px 9px',
                          borderRadius: '20px',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          background: 'linear-gradient(135deg, #7c3aed20, #6d28d920)',
                          color: '#7c3aed',
                          border: '1px solid #7c3aed30',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <Repeat size={11} /> Repeat Daily
                        </span>
                      )}

                      {detailTask.repeat_monthly && (
                        <span style={{
                          padding: '4px 9px',
                          borderRadius: '20px',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          background: 'linear-gradient(135deg, #2563eb20, #1d4ed820)',
                          color: '#2563eb',
                          border: '1px solid #2563eb30',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <Repeat size={11} /> Repeat Monthly
                        </span>
                      )}

                      {isOverdue && (
                        <span style={{
                          padding: '4px 9px',
                          borderRadius: '20px',
                          fontSize: '10.5px',
                          fontWeight: 750,
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          ⚠️ Overdue
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Structured Metadata Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                  
                  {/* Card A: Assigned Team */}
                  <div style={{
                    background: isDark ? 'var(--bg-tertiary)' : '#ffffff',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Users size={13} color="var(--accent, #7c3aed)" /> Assigned Partners
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {activePartnerObjects.length > 0 ? (
                        activePartnerObjects.map(p => {
                          const pCol = getPartnerColor(p.username || p.id);
                          return (
                            <div
                              key={p.id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '3px 8px 3px 4px',
                                borderRadius: '20px',
                                background: isDark ? pCol.bg : '#f8fafc',
                                border: `1px solid ${pCol.border}`,
                                color: isDark ? pCol.text : '#334155'
                              }}
                            >
                              <div style={{
                                width: '18px',
                                height: '18px',
                                borderRadius: '50%',
                                background: pCol.avatarBg,
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '9px',
                                fontWeight: 800
                              }}>
                                {p.username.charAt(0).toUpperCase()}
                              </div>
                              <span style={{ fontSize: '11.5px', fontWeight: 650 }}>{p.username}</span>
                            </div>
                          );
                        })
                      ) : (
                        <span style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                          No partners assigned
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card B: Dates & Schedule */}
                  <div style={{
                    background: isDark ? 'var(--bg-tertiary)' : '#ffffff',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Calendar size={13} color="var(--accent, #7c3aed)" /> Dates & Schedule
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                      <div>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: '10.5px', fontWeight: 600 }}>Due Date:</div>
                        <div style={{ fontWeight: 650, color: isOverdue ? '#ef4444' : 'var(--text-primary)', fontFamily: 'ui-monospace, monospace', marginTop: '1px' }}>
                          {formatDate(detailTask.deadline)}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: '10.5px', fontWeight: 600 }}>Created:</div>
                        <div style={{ color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace', marginTop: '1px' }}>
                          {formatDate(detailTask.created_at)}
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* 3. Description & Notes Card */}
                <div style={{
                  background: isDark ? 'var(--bg-tertiary)' : '#ffffff',
                  borderRadius: '12px',
                  padding: '16px',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileText size={13} color="var(--accent, #7c3aed)" /> Task Notes & Description
                  </div>
                  <div style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: isDark ? 'var(--bg-secondary)' : '#f8fafc',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                    lineHeight: '1.6',
                    color: detailTask.description ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    fontStyle: detailTask.description ? 'normal' : 'italic',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: '180px',
                    overflowY: 'auto'
                  }}>
                    {detailTask.description || 'No description or remarks added yet.'}
                  </div>
                </div>

                {/* 4. Activity & Status History Timeline */}
                <div style={{
                  background: isDark ? 'var(--bg-tertiary)' : '#ffffff',
                  borderRadius: '12px',
                  padding: '16px',
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Activity size={14} color="var(--accent, #7c3aed)" /> Status History & Audit Log
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 650, color: 'var(--text-tertiary)', background: isDark ? 'var(--bg-secondary)' : '#f1f5f9', padding: '2px 8px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                      {statusLogs.length} {statusLogs.length === 1 ? 'event' : 'events'}
                    </span>
                  </div>

                  {statusLogs.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12.5px', background: isDark ? 'var(--bg-secondary)' : '#f8fafc', borderRadius: '8px' }}>
                      No status updates recorded yet.
                    </div>
                  ) : (
                    <div style={{ position: 'relative', paddingLeft: '28px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ position: 'absolute', left: '10px', top: '8px', bottom: '8px', width: '2px', background: 'var(--border)' }} />
                      {statusLogs.map((log) => {
                        const logSc = statusColor(log.status);
                        const updaterName = (log as any).updater?.username || 'System';
                        return (
                          <div key={log.id} style={{ position: 'relative' }}>
                            <div style={{
                              position: 'absolute',
                              left: '-23px',
                              top: '4px',
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              background: logSc.dot,
                              border: '2px solid var(--bg-card, #ffffff)',
                              boxShadow: `0 0 0 2px ${logSc.border}`
                            }} />
                            <div style={{
                              background: isDark ? 'var(--bg-secondary)' : '#f8fafc',
                              padding: '10px 14px',
                              borderRadius: '8px',
                              border: '1px solid var(--border)'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  fontSize: '10.5px',
                                  fontWeight: 750,
                                  background: logSc.bg,
                                  color: logSc.color,
                                  border: `1px solid ${logSc.border}`
                                }}>
                                  {log.status}
                                </span>
                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500, fontFamily: 'ui-monospace, monospace' }}>
                                  {formatDateTime(log.created_at)}
                                </div>
                              </div>
                              {log.remarks && (
                                <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', marginTop: '6px', lineHeight: '1.4', wordBreak: 'break-word' }}>
                                  {log.remarks}
                                </div>
                              )}
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span>Updated by:</span>
                                <strong style={{ color: 'var(--text-primary)' }}>{updaterName}</strong>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 5. Update Status & Assignments (if permitted) */}
                {canUpdateStatus && (
                  <div style={{
                    background: isDark ? 'var(--bg-tertiary)' : 'linear-gradient(135deg, #faf5ff 0%, #f8fafc 100%)',
                    borderRadius: '12px',
                    padding: '18px',
                    border: isDark ? '1px solid var(--border)' : '1px solid #f3e8ff',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px'
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.05em', color: isDark ? 'var(--text-primary)' : '#6b21a8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Edit2 size={14} color={isDark ? '#c084fc' : '#7c3aed'} /> Update Task Status & Team
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                      <FormField label="New Status *">
                        <select value={updateStatus} onChange={e => setUpdateStatus(e.target.value)} style={inputStyle}>
                          {dynamicStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </FormField>

                      <FormField label="Updated By">
                        <select value={updateBy} onChange={e => setUpdateBy(e.target.value)} style={inputStyle} disabled={!isAdminUser}>
                          {!partners.some(p => p.id === updateBy) && updateBy && (
                            <option value={updateBy}>{currentUser?.username || 'Current User'}</option>
                          )}
                          {partners.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
                        </select>
                      </FormField>
                    </div>

                    {isAdminUser && (
                      <FormField label="Assign Partners (Team)">
                        <MultiSelect
                          options={partners.map(p => ({ id: p.id, label: p.username }))}
                          selected={updatePartners}
                          onChange={setUpdatePartners}
                          placeholder="Select Partners"
                        />
                      </FormField>
                    )}

                    <FormField label="Remarks / Progress Notes (Optional)">
                      <textarea
                        value={updateRemarks}
                        onChange={e => setUpdateRemarks(e.target.value)}
                        placeholder="Add brief remarks or notes..."
                        style={{ ...inputStyle, minHeight: '75px', resize: 'vertical' }}
                      />
                    </FormField>
                  </div>
                )}

                {/* 6. Footer Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => setDetailTask(null)}
                    style={{
                      padding: '9px 20px',
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '13px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Close
                  </button>
                  {canUpdateStatus && (
                    <button
                      type="button"
                      onClick={saveStatusUpdate}
                      style={{
                        padding: '9px 22px',
                        background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: '13px',
                        boxShadow: '0 4px 14px rgba(124,58,237,0.3)',
                        transition: 'all 0.15s ease',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Check size={14} /> Update Status
                    </button>
                  )}
                </div>

              </div>
            </div>
          </div>
        );
      })()}


    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '16px' }}>
      <label style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary, #334155)', fontSize: '13px', letterSpacing: '0.01em' }}>{label}</label>
      {children}
    </div>
  );
}

// Inline styles
const thStyle: React.CSSProperties = { padding: '14px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-secondary, #64748b)' };
const tdStyle: React.CSSProperties = { padding: '14px 14px', fontSize: '13px', verticalAlign: 'middle', color: 'var(--text-primary, #334155)' };
const filterStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid var(--border, #cbd5e1)', borderRadius: '12px', fontSize: '12.5px', background: 'var(--bg-primary, #ffffff)', color: 'var(--text-primary, #334155)', outline: 'none', transition: 'all 0.2s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', fontWeight: 500, flex: '1 1 130px', minWidth: '115px' };
const inputStyle: React.CSSProperties = { ...filterStyle, padding: '10px 14px', width: '100%' };
const btnSmStyle = (bg: string): React.CSSProperties => ({ padding: '6px 9px', background: bg, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease', boxShadow: `0 1px 3px ${bg}40` });
const compactCell: React.CSSProperties = { padding: '10px 10px', fontSize: '12px', verticalAlign: 'middle', color: 'var(--text-primary, #334155)', boxSizing: 'border-box' };
const menuItemStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '13px', color: 'var(--text-secondary, #475569)', fontWeight: 500, transition: 'background 0.15s' };
const modalOverlayStyle: React.CSSProperties = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', animation: 'fadeIn 0.2s ease-out' };
const modalContentStyle: React.CSSProperties = { background: '#ffffff', borderRadius: '20px', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.2), 0 10px 20px rgba(0,0,0,0.1)', animation: 'scaleIn 0.25s ease-out', border: '1px solid rgba(226,232,240,0.6)' };
const modalHeaderStyle: React.CSSProperties = { padding: '22px 28px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', borderRadius: '20px 20px 0 0' };
const closeBtnStyle: React.CSSProperties = { background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease' };

function MultiSelect({ options, selected, onChange, placeholder }: { options: {id: string, label: string}[], selected: string[], onChange: (val: string[]) => void, placeholder: string }) {
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
      <div onClick={() => setOpen(!open)} style={{ padding: '10px 12px', border: '2px solid var(--border)', borderRadius: '6px', fontSize: '14px', width: '100%', background: '#ffffff', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', flexWrap: 'wrap', gap: '4px', minHeight: '42px', alignItems: 'center' }}>
        {selected.length === 0 ? <span style={{color: '#7F8C8D'}}>{placeholder}</span> : 
          selected.map(s => {
            const opt = options.find(o => o.id === s);
            return (
              <span key={s} style={{background: '#5DADE2', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px'}}>
                {opt?.label || s} 
                <X size={12} onClick={(e) => toggle(s, e)} style={{cursor: 'pointer'}} />
              </span>
            );
          })
        }
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid var(--border)', borderRadius: '6px', marginTop: '4px', zIndex: 100, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          {options.map(o => (
            <div key={o.id} onClick={(e) => toggle(o.id, e)} style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-light)' }}>
              <input type="checkbox" checked={selected.includes(o.id)} readOnly style={{ pointerEvents: 'none' }} />
              <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{o.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
