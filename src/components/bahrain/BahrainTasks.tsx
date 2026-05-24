'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Task, Company, User, TaskType, StatusLog, TaskMessage } from '@/lib/supabase';
import { getDataCountry, getSession, isAdmin } from '@/lib/auth';
import { BAHRAIN_PRIORITIES, BAHRAIN_STATUSES } from '@/lib/bahrain';
import { Plus, Eye, Trash2, X, Edit2, MessageCircle, Send, MoreHorizontal, Clock, CheckCircle2, Check, BarChart3, PieChart, Activity, ArrowRight, TrendingUp, Building2 } from 'lucide-react';

export default function BahrainTasks() {
  const { user: currentUser } = getSession();
  const isAdminUser = isAdmin(currentUser);
  const userAuditorAccess: string[] = currentUser?.permissions?.auditor_access || [];
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
  const [filterTaskType, setFilterTaskType] = useState(searchParams.get('taskType') || '');
  const [search, setSearch] = useState(searchParams.get('search') || '');

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
  // Stat card modal states
  const [showRecentModal, setShowRecentModal] = useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [showTaskTypeModal, setShowTaskTypeModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [recentActivityLogs, setRecentActivityLogs] = useState<any[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [detailCompany, setDetailCompany] = useState<Company | null>(null);
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);

  // --- Chat Feature States ---
  const [chatTask, setChatTask] = useState<Task | null>(null);
  const [taskMessages, setTaskMessages] = useState<TaskMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateBy, setUpdateBy] = useState('');
  const [updateRemarks, setUpdateRemarks] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

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

      const [compsRes, ttRes, usersRes, statusRes, audRes] = await Promise.all([
        supabase.from('companies').select('id, company_name, notes, country, created_at').eq('country', dataCountry || 'Bahrain'),
        supabase.from('task_types').select('id, name, category, jurisdiction, status_options, active, created_at').eq('active', true).eq('country', dataCountry || 'Bahrain'),
        usersQuery,
        dataCountry
          ? supabase.from('statuses').select('name, active, task_type_ids').eq('country', dataCountry)
          : supabase.from('statuses').select('name, active, task_type_ids'),
        dataCountry
          ? supabase.from('auditors').select('id, name, country').eq('country', dataCountry).order('name')
          : supabase.from('auditors').select('id, name, country').order('name')
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

      const companyIds = companyList.map(c => c.id);
      let taskList: Task[] = [];
      if (companyIds.length > 0) {
        const { data: t } = await supabase.from('tasks').select('id, title, company_id, assigned_to, assigned_partners, status, priority, deadline, admin_note, task_type_id, task_type_ids, auditor_id, description, is_daily, country, created_at').in('company_id', companyIds).neq('is_daily', true);
        taskList = t || [];
      }

      setCompanies(companyList);
      setTaskTypes(ttList);
      setPartners(usersList);
      setAuditors(audList);
      setTasks(taskList);

      sessionStorage.setItem(cacheKey, JSON.stringify({
        companies: companyList,
        taskTypes: ttList,
        partners: usersList,
        auditors: audList,
        tasks: taskList,
        dynamicStatuses: resolvedStatuses,
        statusObjects: sObjs
      }));
      sessionStorage.setItem(cacheTimeKey, Date.now().toString());

    } catch (err) {
      console.error('Load error:', err);
    }
    setLoading(false);
  }, [dataCountry]);

  useEffect(() => { loadData(); }, [loadData]);

  // Close action menu when clicking outside
  useEffect(() => {
    if (!openMenuId) return;
    const handleClick = () => setOpenMenuId(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [openMenuId]);

  // Filter tasks
  // Determine if the user is actively looking for completed tasks via filter or search
  const isCompletedFilterActive = filterStatus && (filterStatus.toLowerCase() === 'complete' || filterStatus.toLowerCase() === 'completed');
  const isSearchActive = search.trim().length > 0;

  const filtered = tasks.filter(t => {
    const sl = (t.status || '').toLowerCase();
    // Hide completed tasks by default, but show them when the user
    // explicitly filters by a completed status or uses the search bar
    if ((sl === 'complete' || sl === 'completed') && !isCompletedFilterActive && !isSearchActive) {
      return false;
    }

    const isAssigned = (t.assigned_partners && t.assigned_partners.includes(currentUser?.id || '')) || t.assigned_to === currentUser?.id;
    const hasAuditorAccess = (currentUser?.permissions?.auditor_access || []).includes(t.auditor_id || '');
    if (!isAdminUser && !isAssigned && !hasAuditorAccess) return false;

    if (filterStatus && t.status !== filterStatus) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterCompany && t.company_id !== filterCompany) return false;
    if (filterPartner) {
      const hasPartner = (t.assigned_partners && t.assigned_partners.includes(filterPartner)) || t.assigned_to === filterPartner;
      if (!hasPartner) return false;
    }
    // Task Type filter
    if (filterTaskType) {
      const ttIds = t.task_type_ids && t.task_type_ids.length > 0 ? t.task_type_ids : (t.task_type_id ? t.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : []);
      if (!ttIds.includes(filterTaskType)) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      const ttIds = t.task_type_ids && t.task_type_ids.length > 0 ? t.task_type_ids : (t.task_type_id ? t.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : []);
      const comp = companies.find(c => c.id === t.company_id);
      const matchTitle = t.title?.toLowerCase().includes(s);
      const matchDesc = t.description?.toLowerCase().includes(s);
      const matchType = ttIds.some(id => taskTypes.find(x => x.id === id)?.name.toLowerCase().includes(s));
      const matchCompany = comp?.company_name?.toLowerCase().includes(s);
      const matchStatus = t.status?.toLowerCase().includes(s);
      const matchPriority = t.priority?.toLowerCase().includes(s);
      const matchId = t.id?.toLowerCase().includes(s);
      if (!matchTitle && !matchDesc && !matchType && !matchCompany && !matchStatus && !matchPriority && !matchId) return false;
    }
    return true;
  }).sort((a, b) => (a.status || '').localeCompare(b.status || ''));

  // --- Unread message tracking ---
  const [unreadTasks, setUnreadTasks] = useState<string[]>([]);
  const chatTaskRef = useRef(chatTask);
  useEffect(() => {
    chatTaskRef.current = chatTask;
  }, [chatTask]);


  // Get last-read timestamps from localStorage
  function getLastReadMap(): Record<string, string> {
    try {
      const raw = localStorage.getItem('task_last_read');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function markTaskRead(taskId: string) {
    const map = getLastReadMap();
    map[taskId] = new Date().toISOString();
    localStorage.setItem('task_last_read', JSON.stringify(map));
    setUnreadTasks(prev => {
      const next = prev.filter(id => id !== taskId);
      return next;
    });
  }

  function addUnreadTask(taskId: string) {
    setUnreadTasks(prev => {
      if (prev.includes(taskId)) return prev;
      return [...prev, taskId];
    });
  }

  // Check for openChat or openDesc URL param
  useEffect(() => {
    const openChatId = searchParams.get('openChat');
    const openDescId = searchParams.get('openDesc');
    
    if (openChatId && tasks.length > 0 && !chatTask) {
      const task = tasks.find(t => t.id === openChatId);
      if (task) {
        openChat(task);
      }
      // Remove it from URL so refreshing doesn't reopen it unnecessarily
      const url = new URL(window.location.href);
      url.searchParams.delete('openChat');
      window.history.replaceState({}, '', url);
    }

    if (openDescId && tasks.length > 0 && !detailTask) {
      viewDetail(openDescId);
      const url = new URL(window.location.href);
      url.searchParams.delete('openDesc');
      window.history.replaceState({}, '', url);
    }
  }, [searchParams, tasks, chatTask, detailTask]);

  // On load: scan for unread messages across all visible tasks
  useEffect(() => {
    if (!currentUser || tasks.length === 0) return;
    const taskIds = tasks.map(t => t.id);
    if (taskIds.length === 0) return;

    (async () => {
      const lastReadMap = getLastReadMap();
      const { data: allMsgs } = await supabase
        .from('task_messages')
        .select('task_id, sender_id, created_at')
        .in('task_id', taskIds)
        .neq('sender_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (!allMsgs || allMsgs.length === 0) {
        setUnreadTasks([]);
        return;
      }

      const unread: string[] = [];
      for (const msg of allMsgs) {
        if (unread.includes(msg.task_id)) continue;
        const lastRead = lastReadMap[msg.task_id];
        if (!lastRead || new Date(msg.created_at) > new Date(lastRead)) {
          unread.push(msg.task_id);
        }
      }
      setUnreadTasks(unread);
    })();
  }, [currentUser, tasks]);


  // Keep a ref to tasks so the realtime callback always reads the latest
  // without re-creating the subscription on every task state change.
  const tasksRef = useRef(tasks);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  // Listen for realtime task_messages
  useEffect(() => {
    if (!currentUser || tasksRef.current.length === 0) return;

    const channel = supabase
      .channel('task_messages_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_messages' },
        (payload) => {
          const newMessage = payload.new as TaskMessage;
          if (newMessage.sender_id === currentUser.id) return;

          const relatedTask = tasksRef.current.find(t => t.id === newMessage.task_id);
          if (!relatedTask) return;

          const isAssigned = isAdminUser ||
            relatedTask.assigned_to === currentUser.id ||
            (relatedTask.assigned_partners && relatedTask.assigned_partners.includes(currentUser.id)) ||
            userAuditorAccess.includes(relatedTask.auditor_id || '');

          if (isAssigned) {
            if (chatTaskRef.current && chatTaskRef.current.id === newMessage.task_id) {
              const map = getLastReadMap();
              map[newMessage.task_id] = new Date().toISOString();
              localStorage.setItem('task_last_read', JSON.stringify(map));
              loadMessages(newMessage.task_id);
            } else {
              addUnreadTask(newMessage.task_id);

              const notifId = Math.random().toString(36).substring(7);
              const shortMsg = newMessage.message.length > 30 ? newMessage.message.substring(0, 30) + '...' : newMessage.message;
              setNotifications(prev => [...prev, {
                id: notifId,
                message: `New message on Task #${relatedTask.id.slice(0, 6)}: "${shortMsg}"`,
                taskId: relatedTask.id
              }]);

              setTimeout(() => {
                setNotifications(prev => prev.filter(n => n.id !== notifId));
              }, 6000);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, isAdminUser]);


  // Inline status update
  async function handleStatusChange(taskId: string, newStatus: string) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;
    const previousStatus = task.status;

    const { data, error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId).select();
    if (error) { console.error('Status update error:', error); return; }
    if (!data || data.length === 0) {
      alert('Update blocked by Supabase Row Level Security (RLS). Ask Admin to run the database fix script.');
      return;
    }

    // Always use the actual logged-in user for accurate tracking
    const { user } = getSession();
    const updaterId = user?.id || null;

    await supabase.from('status_log').insert({
      task_id: taskId,
      status: newStatus,
      updated_by: updaterId,
      remarks: `${previousStatus} → ${newStatus}`,
    });

    sessionStorage.removeItem('tasks_data_time');
    sessionStorage.removeItem('dashboard_data_time_v2');

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
  }

  async function handlePriorityChange(taskId: string, newPriority: string) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.priority === newPriority) return;

    const { data, error } = await supabase.from('tasks').update({ priority: newPriority }).eq('id', taskId).select();
    if (error) { console.error('Priority update error:', error); return; }
    if (!data || data.length === 0) {
      alert('Update blocked by Supabase Row Level Security (RLS).');
      return;
    }

    sessionStorage.removeItem('tasks_data_time');
    sessionStorage.removeItem('dashboard_data_time_v2');

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, priority: newPriority } : t));
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
  async function handleAssign(taskId: string, partnerId: string) {
    const assignValue = partnerId && partnerId.length > 0 ? partnerId : null;
    const { data, error } = await supabase.from('tasks').update({ assigned_to: assignValue }).eq('id', taskId).select();
    if (error) { console.error('Assign error:', error); alert('Error assigning: ' + error.message); return; }
    if (!data || data.length === 0) {
      alert('Assignment blocked by Supabase Row Level Security (RLS).');
      return;
    }

    if (assignValue) {
      const partner = partners.find(p => p.id === assignValue);
      await supabase.from('status_log').insert({
        task_id: taskId,
        status: tasks.find(t => t.id === taskId)?.status || 'Unknown',
        updated_by: assignValue,
        remarks: `Task assigned to ${partner?.username || 'Unknown'}`,
      });
    }

    sessionStorage.removeItem('tasks_data_time');
    sessionStorage.removeItem('dashboard_data_time_v2');

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, assigned_to: assignValue || '', assigned_partners: assignValue ? [assignValue] : [] } : t));
  }

  // Inline auditor assignment
  async function handleAssignAuditor(taskId: string, auditorId: string) {
    const assignValue = auditorId && auditorId.length > 0 ? auditorId : null;
    const { data, error } = await supabase.from('tasks').update({ auditor_id: assignValue }).eq('id', taskId).select();
    if (error) { console.error('Assign auditor error:', error); alert('Error assigning auditor: ' + error.message); return; }
    if (!data || data.length === 0) {
      alert('Assignment blocked by Supabase Row Level Security (RLS).');
      return;
    }
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, auditor_id: assignValue } : t));
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
      sessionStorage.removeItem('tasks_data_time');
      sessionStorage.removeItem('dashboard_data_time_v2');
    }
    setInlineEditDescId(null);
  }

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
      if (oldTask && oldTask.status !== firstStatus) {
        const { user } = getSession();
        await supabase.from('status_log').insert({
          task_id: editingTaskId,
          status: firstStatus,
          updated_by: user?.id || null,
          remarks: `Status updated via Edit Form`,
        });
      }
    }

    setShowTaskModal(false);
    setEditingTaskId(null);
    setNewTask({ company_id: '', task_type_id: '', task_type_ids: [], priority: 'Medium', status: '', auditor_id: '', deadline: '', description: '', assigned_to: '', assigned_partners: [] });

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
    const fullRemarks = updateRemarks
      ? `${transitionNote} | ${updateRemarks}`
      : transitionNote;

    const { error: e2 } = await supabase.from('status_log').insert({
      task_id: detailTask.id,
      status: updateStatus,
      updated_by: actualUpdaterId,
      remarks: fullRemarks,
    });
    if (e2) console.error('Log error:', e2);

    setDetailTask(null);
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

      sessionStorage.removeItem('tasks_data_time');
      sessionStorage.removeItem('dashboard_data_time_v2');
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err: any) {
      console.error('Delete exception:', err);
      alert('Exception during delete: ' + err.message);
    }
  }

  // --- Chat Feature ---

  async function openChat(task: Task) {
    markTaskRead(task.id);
    setChatTask(task);
    setNewMessage('');
    loadMessages(task.id);
  }

  async function loadMessages(taskId: string) {
    const { data: messages, error } = await supabase
      .from('task_messages')
      .select('*, sender:users!sender_id(username, role)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading messages:', error);
      return;
    }

    const enrichedMessages = messages.map(msg => ({
      ...msg,
      sender: msg.sender || { username: 'Unknown', role: 'staff' }
    }));

    setTaskMessages(enrichedMessages as any);
  }

  useEffect(() => {
    if (chatTask && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [taskMessages, chatTask]);

  async function sendMessage() {
    if (!newMessage.trim() || !chatTask) return;
    const { user: sessionUser } = getSession();
    if (!sessionUser) return;

    const { error } = await supabase.from('task_messages').insert({
      task_id: chatTask.id,
      sender_id: sessionUser.id,
      message: newMessage.trim()
    });

    if (error) {
      alert('Failed to send message: ' + error.message);
      return;
    }

    setNewMessage('');
    loadMessages(chatTask.id);
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
    <div>
      {/* Header */}
      <div className="task-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', padding: '28px 32px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)', borderRadius: '20px', boxShadow: '0 4px 20px rgba(15,23,42,0.15)' }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: '24px', fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>Task Management</h2>
          <p style={{ color: '#94a3b8', fontSize: '14px', margin: '6px 0 0 0' }}>Manage, assign, and track all compliance tasks</p>
        </div>
        {(isAdminUser || userAuditorAccess.length > 0) && (
          <button
            onClick={() => { setEditingTaskId(null); setNewTask({ company_id: '', task_type_id: '', task_type_ids: [], priority: 'Medium', status: '', auditor_id: '', deadline: '', description: '', assigned_to: '', assigned_partners: [] }); setShowTaskModal(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '12px 24px', background: '#ffffff', color: '#0f172a',
              border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '14px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.15)', transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.15)'; }}
          >
            <Plus size={16} /> New Task
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="task-filters" style={{ display: 'flex', gap: '14px', marginBottom: '28px', flexWrap: 'wrap', padding: '20px', background: 'rgba(255, 255, 255, 0.65)', backdropFilter: 'blur(10px)', borderRadius: '18px', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={filterStyle}>
          <option value="">All Status</option>
          {(() => {
            const allStatuses = new Set<string>(dynamicStatuses);
            // For Bahrain keep aggregating legacy task statuses, for other countries strictly sync with Edits section
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
        <select value={filterPartner} onChange={e => setFilterPartner(e.target.value)} style={filterStyle}>
          <option value="">All Partners</option>
          {partners.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
        </select>
        <select value={filterTaskType} onChange={e => setFilterTaskType(e.target.value)} style={filterStyle}>
          <option value="">All Task Types</option>
          {taskTypes.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tasks..."
          style={{ ...filterStyle, flex: 1, minWidth: '180px' }}
        />
        {(filterStatus || filterPriority || filterCompany || filterPartner || filterTaskType || search) && (
          <button
            onClick={() => { setFilterStatus(''); setFilterPriority(''); setFilterCompany(''); setFilterPartner(''); setFilterTaskType(''); setSearch(''); }}
            style={{ padding: '10px 18px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', transition: 'all 0.15s ease' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fef2f2'; }}
          >
            <X size={14} /> Clear Filters
          </button>
        )}
      </div>

      {/* ─── 4 Compact Stat Cards ─── */}
      {isAdminUser && (
      <div className="task-stat-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
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
                // Group by task_id, get latest per task, take top 20
                const taskMap = new Map<string, any>();
                logs.forEach((log: any) => {
                  if (tasks.some(t => t.id === log.task_id)) {
                    if (!taskMap.has(log.task_id)) taskMap.set(log.task_id, log);
                  }
                });
                const top20 = Array.from(taskMap.values()).slice(0, 20);
                // Fetch missing user information
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

                // Enrich with task + user info
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
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)', transition: 'all 0.2s ease',
            display: 'flex', alignItems: 'center', gap: '14px',
          }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(59,130,246,0.12)'; e.currentTarget.style.borderColor = '#93c5fd'; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
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
            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>Last 7 days · Click to view</div>
          </div>
          <ArrowRight size={16} color="#94a3b8" />
        </div>

        {/* Card 2: Completed Tasks */}
        <div
          onClick={() => setShowCompletedModal(true)}
          style={{
            background: '#ffffff', borderRadius: '14px', padding: '16px 18px',
            border: '1px solid #e2e8f0', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)', transition: 'all 0.2s ease',
            display: 'flex', alignItems: 'center', gap: '14px',
          }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(16,185,129,0.12)'; e.currentTarget.style.borderColor = '#6ee7b7'; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
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
            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>Total completed · Click to view</div>
          </div>
          <ArrowRight size={16} color="#94a3b8" />
        </div>

        {/* Card 3: All Task Types */}
        <div
          onClick={() => setShowTaskTypeModal(true)}
          style={{
            background: '#ffffff', borderRadius: '14px', padding: '16px 18px',
            border: '1px solid #e2e8f0', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)', transition: 'all 0.2s ease',
            display: 'flex', alignItems: 'center', gap: '14px',
          }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(139,92,246,0.12)'; e.currentTarget.style.borderColor = '#c4b5fd'; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
        >
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #ede9fe, #ddd6fe)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BarChart3 size={20} color="#7c3aed" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Task Types</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
              {taskTypes.filter(t => t.active).length}
            </div>
            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>Distribution · Click to view</div>
          </div>
          <ArrowRight size={16} color="#94a3b8" />
        </div>

        {/* Card 4: Status Distribution */}
        <div
          onClick={() => setShowStatusModal(true)}
          style={{
            background: '#ffffff', borderRadius: '14px', padding: '16px 18px',
            border: '1px solid #e2e8f0', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)', transition: 'all 0.2s ease',
            display: 'flex', alignItems: 'center', gap: '14px',
          }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(249,115,22,0.12)'; e.currentTarget.style.borderColor = '#fdba74'; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
        >
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #ffedd5, #fed7aa)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <PieChart size={20} color="#ea580c" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Status Overview</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
              {(() => {
                const statusSet = new Set<string>();
                tasks.forEach(t => { if (t.status) statusSet.add(t.status); });
                return statusSet.size;
              })()}
            </div>
            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>Statuses · Click to view</div>
          </div>
          <ArrowRight size={16} color="#94a3b8" />
        </div>
      </div>
      )}

      {/* ─── Recently Modified Modal ─── */}
      {showRecentModal && (
        <Modal title="Recently Modified Tasks (Latest 20)" onClose={() => setShowRecentModal(false)}>
          {recentLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading activity history...</div>
          ) : recentActivityLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No recent activity found</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '65vh', overflowY: 'auto' }}>
              {recentActivityLogs.map((log: any, i: number) => (
                <div key={log.id || i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '12px',
                  padding: '14px 16px', background: '#f8fafc', borderRadius: '12px',
                  border: '1px solid #f1f5f9', transition: 'all 0.15s', cursor: 'pointer',
                }}
                  title="Click to view task details"
                  onClick={() => { setShowRecentModal(false); if (log.task_id) viewDetail(log.task_id); }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.borderColor = '#bfdbfe'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#f1f5f9'; }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                    <Activity size={14} color="#2563eb" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                        #{log.task_id?.slice(0, 6)} — {log.company?.company_name || 'Unknown Company'}
                      </span>
                      <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#475569', marginBottom: '3px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: '#eff6ff', color: '#2563eb', marginRight: '6px' }}>{log.status}</span>
                      {log.remarks && <span style={{ color: '#64748b' }}>{log.remarks}</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>By: {log.updaterName}</div>
                  </div>
                  <ArrowRight size={14} color="#93c5fd" style={{ flexShrink: 0, marginTop: '8px' }} />
                </div>
              ))}
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
                      {['ID', 'Company', 'Task Type', 'Status', 'Priority', 'Due Date'].map(h => (
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

      {/* ─── Status Distribution Modal ─── */}
      {showStatusModal && (
        <Modal title="Status Distribution" onClose={() => setShowStatusModal(false)}>
          {(() => {
            const statusCount: Record<string, number> = {};
            tasks.forEach(t => {
              const s = t.status || 'Unknown';
              statusCount[s] = (statusCount[s] || 0) + 1;
            });
            const total = tasks.length;
            const entries = Object.entries(statusCount)
              .map(([name, count]) => ({ name, count }))
              .sort((a, b) => b.count - a.count);

            const statusBarColors: Record<string, string> = {};
            const defaultColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];
            entries.forEach((e, i) => {
              const sl = e.name.toLowerCase();
              if (sl.includes('complete') || sl.includes('closed') || sl.includes('filed') || sl.includes('done')) statusBarColors[e.name] = '#059669';
              else if (sl.includes('progress') || sl.includes('active')) statusBarColors[e.name] = '#2563eb';
              else if (sl.includes('pending') || sl.includes('waiting') || sl.includes('query')) statusBarColors[e.name] = '#d97706';
              else if (sl.includes('review') || sl.includes('ready')) statusBarColors[e.name] = '#7c3aed';
              else if (sl.includes('not started')) statusBarColors[e.name] = '#94a3b8';
              else statusBarColors[e.name] = defaultColors[i % defaultColors.length];
            });

            return (
              <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {entries.map((entry) => {
                    const pct = total > 0 ? ((entry.count / total) * 100) : 0;
                    const color = statusBarColors[entry.name];
                    return (
                      <div key={entry.name} onClick={() => { setShowStatusModal(false); setFilterStatus(entry.name); }}
                        style={{ cursor: 'pointer', padding: '10px 12px', borderRadius: '10px', transition: 'all 0.15s', border: '1px solid transparent' }}
                        title={`Click to filter by "${entry.name}"`}
                        onMouseEnter={e => { e.currentTarget.style.background = '#fff7ed'; e.currentTarget.style.borderColor = '#fed7aa'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{entry.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{entry.count} ({pct.toFixed(1)}%)</span>
                            <ArrowRight size={12} color="#fdba74" />
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
                  Total: {total} task{total !== 1 ? 's' : ''} across {entries.length} status{entries.length !== 1 ? 'es' : ''}
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* Tasks Table */}
      <div className="task-table-wrap" style={{ overflowX: 'auto', borderRadius: '18px', boxShadow: '0 8px 32px rgba(0,0,0,0.05)', border: '1px solid rgba(226, 232, 240, 0.8)', background: '#ffffff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#ffffff' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              {['ID', 'Company', 'Task Type', 'Description', 'Priority', 'Due', 'Status', 'Auditor', 'Assigned To', ''].map(h => (
                <th key={h} style={{ padding: '11px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No tasks found</td></tr>
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
              const hasUnread = unreadTasks.includes(task.id);

              return (
                <tr key={task.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }} onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={compactCell}><span style={{ fontWeight: 600, color: '#475569', fontSize: '12px' }}>#{task.id.slice(0, 6)}</span></td>
                  <td style={compactCell}><span style={{ fontWeight: 500, fontSize: '12px', color: '#1e293b', maxWidth: '130px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company?.company_name || 'Unknown'}</span></td>
                  <td style={compactCell}>
                    {ttNames.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                        {ttNames.map((name, i) => (
                          <span key={i} style={{ padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, background: '#EBF5FB', color: '#2980B9', border: '1px solid #AED6F1', whiteSpace: 'nowrap' }}>{name}</span>
                        ))}
                      </div>
                    ) : <span style={{ fontSize: '11px', color: '#94a3b8' }}>—</span>}
                  </td>
                  <td
                    style={{ ...compactCell, position: 'relative' }}
                    onMouseEnter={() => setHoveredDescTaskId(task.id)}
                    onMouseLeave={() => setHoveredDescTaskId(null)}
                  >
                    {inlineEditDescId === task.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '180px', position: 'absolute', zIndex: 10, background: '#fff', padding: '8px', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', top: '50%', transform: 'translateY(-50%)', left: '10px' }}>
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
                            color: '#1e293b'
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
                            style={{ padding: '4px 8px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 600 }}
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
                        <span style={{ fontSize: '11px', color: '#475569', maxWidth: '150px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={task.description || ''}>
                          {task.description || '—'}
                        </span>
                        {hoveredDescTaskId === task.id && canManageTask(task) && (
                          <button
                            onClick={() => {
                              setInlineEditDescId(task.id);
                              setInlineEditDescValue(task.description || '');
                            }}
                            style={{
                              background: '#eff6ff',
                              border: '1px solid #bfdbfe',
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
                            onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; }}
                          >
                            <Edit2 size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={compactCell}>
                    {canUpdateStatus ? (
                      <select value={task.priority} onChange={e => handlePriorityChange(task.id, e.target.value)}
                        style={{ padding: '4px 6px', borderRadius: '8px', border: 'none', background: pc.bg, color: pc.color, fontWeight: 700, fontSize: '10px', cursor: 'pointer', outline: 'none' }}>
                        {BAHRAIN_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    ) : (
                      <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: pc.bg, color: pc.color, whiteSpace: 'nowrap' }}>{task.priority}</span>
                    )}
                  </td>
                  <td style={compactCell}><span style={{ fontSize: '12px', color: '#475569', whiteSpace: 'nowrap' }}>{task.deadline || '—'}</span></td>
                  <td style={compactCell}>
                    {canUpdateStatus ? (() => {
                      const sc = statusColor(task.status);
                      return (
                        <select value={task.status} onChange={e => handleStatusChange(task.id, e.target.value)}
                          style={{ padding: '5px 6px', borderRadius: '8px', border: `1px solid ${sc.border}`, background: sc.bg, color: sc.color, fontWeight: 600, fontSize: '11px', cursor: 'pointer', outline: 'none', minWidth: '120px' }}>
                          {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      );
                    })() : (() => {
                      const sc = statusColor(task.status);
                      return <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, whiteSpace: 'nowrap' }}>{task.status}</span>;
                    })()}
                  </td>
                  <td style={compactCell}>
                    {isAdminUser ? (
                      <select value={task.auditor_id || ''} onChange={e => handleAssignAuditor(task.id, e.target.value)}
                        style={{ padding: '5px 6px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '11px', color: '#334155', minWidth: '110px', cursor: 'pointer', outline: 'none', fontWeight: 500 }}>
                        <option value="">No Auditor</option>
                        {auditors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    ) : (
                      <span style={{ fontSize: '12px', color: '#475569', fontWeight: 500 }}>{auditors.find(a => a.id === task.auditor_id)?.name || '—'}</span>
                    )}
                  </td>
                  <td style={compactCell}>
                    {canManageTask(task) ? (
                      <select value={task.assigned_to || ''} onChange={e => handleAssign(task.id, e.target.value)}
                        style={{ padding: '5px 6px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '11px', color: '#334155', minWidth: '110px', cursor: 'pointer', outline: 'none', fontWeight: 500 }}>
                        <option value="">Unassigned</option>
                        {partners.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
                      </select>
                    ) : (
                      <span style={{ fontSize: '12px' }}>
                        {(task.assigned_partners && task.assigned_partners.length > 0)
                          ? task.assigned_partners.map(id => partners.find(p => p.id === id)?.username).filter(Boolean).join(', ')
                          : (partners.find(p => p.id === task.assigned_to)?.username || 'Unassigned')}
                      </span>
                    )}
                  </td>
                  <td style={{ ...compactCell, position: 'relative', width: '44px' }}>
                    <button onClick={e => { e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : task.id); }}
                      style={{
                        background: isMenuOpen ? '#f1f5f9' : 'transparent',
                        border: 'none',
                        cursor: 'pointer', borderRadius: '8px', padding: '6px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s ease', position: 'relative',
                        marginLeft: 'auto',
                        marginRight: '4px',
                        width: '32px',
                        height: '32px',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                      onMouseLeave={e => { if (!isMenuOpen) { e.currentTarget.style.background = 'transparent'; } }}>
                      <MoreHorizontal size={18} color="#64748b" />
                      {hasUnread && (
                        <span style={{
                          position: 'absolute',
                          top: '3px',
                          right: '3px',
                          width: '6px',
                          height: '6px',
                          background: '#f43f5e',
                          borderRadius: '50%',
                          boxShadow: '0 0 0 2px #ffffff',
                        }} />
                      )}
                    </button>
                    {isMenuOpen && (
                      <div style={{ position: 'absolute', top: '100%', right: 0, background: '#fff', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0', zIndex: 50, minWidth: '165px', overflow: 'hidden' }}
                        onClick={e => e.stopPropagation()}>
                        <button onClick={() => { viewDetail(task.id); setOpenMenuId(null); }} style={menuItemStyle}>
                          <Eye size={14} color="#3b82f6" /> View Details
                        </button>
                        <button onClick={() => { openChat(task); setOpenMenuId(null); }} style={{ ...menuItemStyle, display: 'flex', alignItems: 'center' }}>
                          <MessageCircle size={14} color="#8b5cf6" style={{ marginRight: '8px' }} />
                          <span style={{ fontWeight: 500 }}>Messages</span>
                          {hasUnread && (
                            <span style={{
                              marginLeft: 'auto',
                              width: '6px',
                              height: '6px',
                              background: '#f43f5e',
                              borderRadius: '50%',
                            }} />
                          )}
                        </button>
                        {canManageTask(task) && (<>
                          <button onClick={() => { openEditTask(task); setOpenMenuId(null); }} style={menuItemStyle}>
                            <Edit2 size={14} color="#f59e0b" /> Edit Task
                          </button>
                          <div style={{ height: '1px', background: '#f1f5f9', margin: '2px 0' }} />
                          <button onClick={() => { deleteTask(task.id); setOpenMenuId(null); }} style={{ ...menuItemStyle, color: '#ef4444' }}>
                            <Trash2 size={14} color="#ef4444" /> Delete
                          </button>
                        </>)}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Notifications overlay */}
      <div className="task-notifications" style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {notifications.map(n => (
          <div key={n.id} className="animate-fadeIn" style={{
            background: 'linear-gradient(135deg, #1E293B, #334155)', color: '#fff',
            padding: '16px 20px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '350px', cursor: 'pointer',
            border: '1px solid #475569'
          }} onClick={() => {
            const t = tasks.find(tk => tk.id === n.taskId);
            if (t) openChat(t);
            setNotifications(prev => prev.filter(notif => notif.id !== n.id));
          }}>
            <MessageCircle size={20} color="#60A5FA" />
            <div style={{ fontSize: '14px', fontWeight: 500, lineHeight: 1.4, flex: 1 }}>{n.message}</div>
            <button onClick={(e) => { e.stopPropagation(); setNotifications(prev => prev.filter(notif => notif.id !== n.id)); }}
              style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '4px' }}>
              <X size={16} />
            </button>
          </div>
        ))}
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
              {(isAdminUser || (detailTask && canManageTask(detailTask))) && (
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
      {/* Chat Modal */}
      {chatTask && (
        <Modal title={`Task Discussion: #${chatTask.id.slice(0, 6)}`} onClose={() => setChatTask(null)}>
          <div style={{
            display: 'flex', flexDirection: 'column', height: '60vh', minHeight: '400px',
            background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden'
          }}>
            {/* Messages Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {taskMessages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94A3B8', marginTop: 'auto', marginBottom: 'auto' }}>
                  No messages yet. Start the conversation!
                </div>
              ) : (
                taskMessages.map((msg, i) => {
                  const isMine = msg.sender_id === currentUser?.id;
                  const senderRole = msg.sender?.role || 'staff';
                  const showHeader = i === 0 || taskMessages[i - 1].sender_id !== msg.sender_id;

                  return (
                    <div key={msg.id} style={{ alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                      {showHeader && (
                        <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '4px', marginLeft: isMine ? 0 : '12px', marginRight: isMine ? '12px' : 0, textAlign: isMine ? 'right' : 'left' }}>
                          <strong>{msg.sender?.username || 'Unknown'}</strong>
                          {senderRole?.toLowerCase() === 'admin' && <span style={{ marginLeft: '6px', background: '#E2E8F0', padding: '2px 6px', borderRadius: '10px', fontSize: '10px' }}>Admin</span>}
                        </div>
                      )}
                      <div style={{
                        background: isMine ? '#3B82F6' : '#FFFFFF',
                        color: isMine ? '#FFFFFF' : '#1E293B',
                        padding: '10px 16px',
                        borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        border: isMine ? 'none' : '1px solid #E2E8F0',
                        fontSize: '14px',
                        lineHeight: '1.5'
                      }}>
                        {msg.message}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px', textAlign: isMine ? 'right' : 'left', marginLeft: isMine ? 0 : '12px', marginRight: isMine ? '12px' : 0 }}>
                        {new Date(msg.created_at).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div style={{ padding: '16px', background: '#FFFFFF', borderTop: '1px solid #E2E8F0', display: 'flex', gap: '12px' }}>
              <input
                type="text"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                style={{ flex: 1, padding: '12px 16px', border: '1px solid #CBD5E1', borderRadius: '24px', fontSize: '14px', outline: 'none' }}
              />
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim()}
                style={{
                  background: newMessage.trim() ? '#3B82F6' : '#94A3B8',
                  color: '#FFFFFF', border: 'none', borderRadius: '50%', width: '44px', height: '44px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: newMessage.trim() ? 'pointer' : 'not-allowed',
                  transition: 'background 0.2s'
                }}
              >
                <Send size={18} style={{ marginLeft: '2px' }} />
              </button>
            </div>
          </div>
        </Modal>
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
      <div onClick={() => setOpen(!open)} style={{ padding: '10px 12px', border: '2px solid #BDC3C7', borderRadius: '6px', fontSize: '14px', width: '100%', background: 'var(--bg-card, #fff)', color: 'var(--text-primary, #333)', cursor: 'pointer', display: 'flex', flexWrap: 'wrap', gap: '4px', minHeight: '42px', alignItems: 'center' }}>
        {selected.length === 0 ? <span style={{ color: '#7F8C8D' }}>{placeholder}</span> :
          selected.map(s => {
            const opt = options.find(o => o.id === s);
            return (
              <span key={s} style={{ background: '#5DADE2', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {opt?.label || s}
                <X size={12} onClick={(e) => toggle(s, e)} style={{ cursor: 'pointer' }} />
              </span>
            );
          })
        }
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #BDC3C7', borderRadius: '6px', marginTop: '4px', zIndex: 100, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          {options.map(opt => (
            <div key={opt.id} onClick={(e) => toggle(opt.id, e)} style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', background: selected.includes(opt.id) ? '#F4F6F7' : 'transparent', borderBottom: '1px solid #F2F3F4' }}>
              <input type="checkbox" checked={selected.includes(opt.id)} readOnly style={{ cursor: 'pointer' }} />
              <span style={{ color: '#2E4053' }}>{opt.label}</span>
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
      background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '12px', animation: 'fadeIn 0.2s ease-out',
    }} onClick={onClose}>
      <div style={{
        background: '#ffffff', borderRadius: '20px', maxWidth: '800px', width: '100%',
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.2), 0 10px 20px rgba(0,0,0,0.1)',
        animation: 'scaleIn 0.25s ease-out', border: '1px solid rgba(226,232,240,0.6)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          padding: '18px 20px', borderBottom: '1px solid #f1f5f9',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
          borderRadius: '20px 20px 0 0',
        }}>
          <h2 style={{ fontSize: '16px', color: '#0f172a', fontWeight: 700, letterSpacing: '-0.3px', margin: 0, lineHeight: 1.3 }}>{title}</h2>
          <button onClick={onClose} style={{
            background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b',
            width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s ease', flexShrink: 0, marginLeft: '12px',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; }}
          ><X size={18} /></button>
        </div>
        <div style={{ padding: '20px' }}>{children}</div>
      </div>
    </div>
  );
}

// Helper: get statuses relevant for a specific task's task type(s)
// Statuses with null task_type_ids are "universal" (show for all tasks)
// Statuses with specific task_type_ids only show for tasks with matching types
function getStatusesForTask(
  taskTypeIds: string[],
  statusObjects: { name: string; task_type_ids: string[] | null }[],
  fallbackStatuses: string[]
): string[] {
  // If no status objects loaded yet, return all statuses
  if (statusObjects.length === 0) return [...fallbackStatuses];

  // If task has no task type selected, show all statuses
  if (!taskTypeIds || taskTypeIds.length === 0) {
    return [...new Set(statusObjects.map(s => s.name))].sort((a, b) => a.localeCompare(b));
  }

  // Filter: show statuses that are universal (null) OR linked to any of the task's types
  const filtered = statusObjects.filter(s => {
    if (!s.task_type_ids || s.task_type_ids.length === 0) return true; // universal
    return s.task_type_ids.some(id => taskTypeIds.includes(id));
  });

  return [...new Set(filtered.map(s => s.name))].sort((a, b) => a.localeCompare(b));
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '4px' }}>
      <label style={{ fontWeight: 600, marginBottom: '8px', color: '#1e293b', fontSize: '13px', letterSpacing: '0.01em', display: 'flex', alignItems: 'center', gap: '4px' }}>{label}</label>
      {children}
    </div>
  );
}

const filterStyle: React.CSSProperties = {
  padding: '10px 16px', border: '1px solid #cbd5e1', borderRadius: '12px', fontSize: '13px',
  background: '#ffffff', color: '#334155', outline: 'none', transition: 'all 0.2s ease',
  boxShadow: '0 2px 4px rgba(0,0,0,0.02)', fontWeight: 500
};

const compactCell: React.CSSProperties = {
  padding: '10px 10px', fontSize: '12px', verticalAlign: 'middle', color: '#334155',
};

const cellStyle: React.CSSProperties = {
  padding: '10px 10px', fontSize: '12px', verticalAlign: 'middle', color: '#334155',
};

const dropdownStyle: React.CSSProperties = {
  padding: '5px 6px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '11px',
  width: '100%', minWidth: '120px', cursor: 'pointer', background: '#f8fafc', color: '#334155', outline: 'none',
  transition: 'all 0.2s ease', fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  padding: '12px 16px', border: '1.5px solid #e2e8f0', borderRadius: '12px', fontSize: '14px',
  width: '100%', background: '#ffffff', color: '#0f172a', outline: 'none',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease', fontWeight: 500,
};

const menuItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 14px',
  background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px',
  color: '#334155', fontWeight: 500, transition: 'background 0.1s ease', textAlign: 'left',
};

function btnSmStyle(bg: string): React.CSSProperties {
  return {
    padding: '7px 10px', background: bg, color: '#fff', border: 'none', borderRadius: '8px',
    cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.15s ease',
    boxShadow: `0 1px 3px ${bg}40`,
  };
}
