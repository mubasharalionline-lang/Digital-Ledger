'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Task, Company, User, TaskType, StatusLog, TaskMessage } from '@/lib/supabase';
import { getDataCountry, getSession, isAdmin } from '@/lib/auth';
import { BAHRAIN_PRIORITIES, BAHRAIN_STATUSES } from '@/lib/bahrain';
import { Plus, Eye, Trash2, X, Edit2, MessageCircle, Send, MoreHorizontal } from 'lucide-react';

export default function BahrainTasks() {
  const { user: currentUser } = getSession();
  const isAdminUser = isAdmin(currentUser);
  const canUpdateStatus = isAdminUser || (currentUser?.permissions?.can_update_status ?? true);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [partners, setPartners] = useState<User[]>([]);
  const [auditors, setAuditors] = useState<any[]>([]);
  const [dynamicStatuses, setDynamicStatuses] = useState<string[]>(BAHRAIN_STATUSES);
  const [statusObjects, setStatusObjects] = useState<{name: string; task_type_ids: string[] | null}[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<{id: string, message: string, taskId: string}[]>([]);

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
  const [detailCompany, setDetailCompany] = useState<Company | null>(null);
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateBy, setUpdateBy] = useState('');
  const [updateRemarks, setUpdateRemarks] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

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
      } catch (e) {}
    }

    // Fetch fresh data (runs in background if we had cache)
    try {
      let usersQuery = supabase.from('users').select('*').order('created_at', { ascending: false });
      if (dataCountry) {
        usersQuery = usersQuery.eq('country', dataCountry);
      }

      const [compsRes, ttRes, usersRes, statusRes, audRes] = await Promise.all([
        supabase.from('companies').select('*').eq('country', dataCountry || 'Bahrain'),
        supabase.from('task_types').select('*').eq('active', true).eq('country', dataCountry || 'Bahrain'),
        usersQuery,
        dataCountry 
          ? supabase.from('statuses').select('name, active, task_type_ids').eq('country', dataCountry) 
          : supabase.from('statuses').select('name, active, task_type_ids'),
        dataCountry
          ? supabase.from('auditors').select('*').eq('country', dataCountry).order('name')
          : supabase.from('auditors').select('*').order('name')
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
        const { data: t } = await supabase.from('tasks').select('*').in('company_id', companyIds).neq('is_daily', true);
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
  const filtered = tasks.filter(t => {
    const isAssigned = (t.assigned_partners && t.assigned_partners.includes(currentUser?.id || '')) || t.assigned_to === currentUser?.id;
    if (!isAdminUser && !isAssigned) return false;
    
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

  // Listen for realtime task_messages
  useEffect(() => {
    if (!currentUser || tasks.length === 0) return;

    const channel = supabase
      .channel('task_messages_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_messages' },
        (payload) => {
          const newMessage = payload.new as TaskMessage;
          if (newMessage.sender_id === currentUser.id) return; // Don't notify sender

          const relatedTask = tasks.find(t => t.id === newMessage.task_id);
          if (!relatedTask) return;

          const isAssigned = 
            relatedTask.assigned_to === currentUser.id || 
            (relatedTask.assigned_partners && relatedTask.assigned_partners.includes(currentUser.id));

          if (isAssigned) {
            const notifId = Math.random().toString(36).substring(7);
            const shortMsg = newMessage.message.length > 30 ? newMessage.message.substring(0, 30) + '...' : newMessage.message;
            setNotifications(prev => [...prev, {
              id: notifId,
              message: `New message on Task #${relatedTask.id.slice(0, 6)}: "${shortMsg}"`,
              taskId: relatedTask.id
            }]);

            // Auto-hide after 5s
            setTimeout(() => {
              setNotifications(prev => prev.filter(n => n.id !== notifId));
            }, 6000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, tasks]);

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

  // Save new task
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
      .select('*')
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
    if (isAdminUser && dataCountry === 'Bahrain' && task.assigned_to) {
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
  const [chatTask, setChatTask] = useState<Task | null>(null);
  const [taskMessages, setTaskMessages] = useState<TaskMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  async function openChat(task: Task) {
    setChatTask(task);
    setNewMessage('');
    loadMessages(task.id);
  }

  async function loadMessages(taskId: string) {
    const { data: messages, error } = await supabase
      .from('task_messages')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error loading messages:', error);
      return;
    }

    const { user: sessionUser } = getSession();
    
    // Resolve user details
    const enrichedMessages = messages.map(msg => {
      let username = 'Unknown';
      let role = 'staff';
      
      const partner = partners.find(p => p.id === msg.sender_id);
      if (partner) {
        username = partner.username;
        role = partner.role;
      } else if (sessionUser && sessionUser.id === msg.sender_id) {
        username = sessionUser.username;
        role = sessionUser.role;
      }

      return {
        ...msg,
        sender: { username, role }
      };
    });

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
    const sl = s.toLowerCase();
    if (sl.includes('closed') || sl.includes('completed') || sl.includes('filed')) return { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0' };
    if (sl.includes('review') || sl.includes('ready')) return { bg: '#F5F3FF', color: '#7C3AED', border: '#DDD6FE' };
    if (sl.includes('progress') || sl.includes('active')) return { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' };
    if (sl.includes('query') || sl.includes('waiting')) return { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' };
    if (sl.includes('not started')) return { bg: '#F3F4F6', color: '#6B7280', border: '#D1D5DB' };
    return { bg: '#F3F4F6', color: '#6B7280', border: '#D1D5DB' };
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '60px', color: '#7F8C8D' }}>Loading tasks...</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', padding: '28px 32px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)', borderRadius: '20px', boxShadow: '0 4px 20px rgba(15,23,42,0.15)' }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: '24px', fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>Task Management</h2>
          <p style={{ color: '#94a3b8', fontSize: '14px', margin: '6px 0 0 0' }}>Manage, assign, and track all compliance tasks</p>
        </div>
        {isAdminUser && (
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
      <div style={{ display: 'flex', gap: '14px', marginBottom: '28px', flexWrap: 'wrap', padding: '20px', background: 'rgba(255, 255, 255, 0.65)', backdropFilter: 'blur(10px)', borderRadius: '18px', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
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

      {/* Tasks Table */}
      <div style={{ overflowX: 'auto', borderRadius: '18px', boxShadow: '0 8px 32px rgba(0,0,0,0.05)', border: '1px solid rgba(226, 232, 240, 0.8)', background: '#ffffff' }}>
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
                  <td style={compactCell}>
                    <span style={{ fontSize: '11px', color: '#475569', maxWidth: '150px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={task.description || ''}>{task.description || '—'}</span>
                  </td>
                  <td style={compactCell}>
                    <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: pc.bg, color: pc.color, whiteSpace: 'nowrap' }}>{task.priority}</span>
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
                    {isAdminUser ? (
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
                  <td style={{ ...compactCell, position: 'relative', width: '40px' }}>
                    <button onClick={e => { e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : task.id); }}
                      style={{ background: isMenuOpen ? '#f1f5f9' : 'transparent', border: 'none', cursor: 'pointer', borderRadius: '8px', padding: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                      onMouseLeave={e => { if (!isMenuOpen) e.currentTarget.style.background = 'transparent'; }}>
                      <MoreHorizontal size={16} color="#64748b" />
                    </button>
                    {isMenuOpen && (
                      <div style={{ position: 'absolute', top: '100%', right: 0, background: '#fff', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0', zIndex: 50, minWidth: '155px', overflow: 'hidden' }}
                        onClick={e => e.stopPropagation()}>
                        <button onClick={() => { viewDetail(task.id); setOpenMenuId(null); }} style={menuItemStyle}>
                          <Eye size={14} color="#3b82f6" /> View Details
                        </button>
                        <button onClick={() => { openChat(task); setOpenMenuId(null); }} style={menuItemStyle}>
                          <MessageCircle size={14} color="#8b5cf6" /> Messages
                        </button>
                        {isAdminUser && (<>
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
      <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
        <Modal title={editingTaskId ? "Edit Task" : "New Task"} onClose={() => { setShowTaskModal(false); setEditingTaskId(null); }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <FormField label="Company *">
              <select value={newTask.company_id} onChange={e => setNewTask(p => ({ ...p, company_id: e.target.value }))} style={inputStyle}>
                <option value="">Select Company</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </FormField>
            <FormField label="Task Types *">
              <MultiSelect 
                options={taskTypes.filter(t => t.active).map(t => ({id: t.id, label: t.name}))} 
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
              <select value={newTask.auditor_id} onChange={e => setNewTask(p => ({ ...p, auditor_id: e.target.value }))} style={inputStyle}>
                <option value="">Select Auditor</option>
                {auditors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </FormField>
            <FormField label="Due Date *">
              <input type="date" value={newTask.deadline} onChange={e => setNewTask(p => ({ ...p, deadline: e.target.value }))} style={inputStyle} />
            </FormField>
          </div>
          <FormField label="Description">
            <textarea value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} placeholder="Task details..." style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} />
          </FormField>
          <FormField label="Assign To">
            <MultiSelect 
              options={partners.map(p => ({id: p.id, label: p.username}))} 
              selected={newTask.assigned_partners} 
              onChange={vals => setNewTask(p => ({ ...p, assigned_partners: vals }))} 
              placeholder="Select Partners" 
            />
          </FormField>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
            <button onClick={() => setShowTaskModal(false)} style={{ padding: '11px 24px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', transition: 'all 0.15s ease' }} onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'} onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}>Cancel</button>
            <button onClick={saveTask} style={{ padding: '11px 24px', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', boxShadow: '0 4px 14px rgba(16,185,129,0.3)', transition: 'all 0.15s ease' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(16,185,129,0.4)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(16,185,129,0.3)'; }}>Save Task</button>
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
                  <select value={updateBy} onChange={e => setUpdateBy(e.target.value)} style={inputStyle} disabled={!isAdminUser}>
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
                    options={partners.map(p => ({id: p.id, label: p.username}))} 
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
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
      <div onClick={() => setOpen(!open)} style={{ padding: '10px 12px', border: '2px solid #BDC3C7', borderRadius: '6px', fontSize: '14px', width: '100%', background: 'var(--bg-card, #fff)', color: 'var(--text-primary, #333)', cursor: 'pointer', display: 'flex', flexWrap: 'wrap', gap: '4px', minHeight: '42px', alignItems: 'center' }}>
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
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #BDC3C7', borderRadius: '6px', marginTop: '4px', zIndex: 100, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          {options.map(opt => (
            <div key={opt.id} onClick={(e) => toggle(opt.id, e)} style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', background: selected.includes(opt.id) ? '#F4F6F7' : 'transparent', borderBottom: '1px solid #F2F3F4' }}>
              <input type="checkbox" checked={selected.includes(opt.id)} readOnly style={{ cursor: 'pointer' }} />
              <span style={{color: '#2E4053'}}>{opt.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '20px', animation: 'fadeIn 0.2s ease-out',
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '20px', maxWidth: '800px', width: '100%',
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.2), 0 10px 20px rgba(0,0,0,0.1)',
        animation: 'scaleIn 0.25s ease-out', border: '1px solid rgba(226,232,240,0.6)',
      }}>
        <div style={{
          padding: '22px 28px', borderBottom: '1px solid #f1f5f9',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
          borderRadius: '20px 20px 0 0',
        }}>
          <h2 style={{ fontSize: '18px', color: '#0f172a', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{
            background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b',
            width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; }}
          ><X size={18} /></button>
        </div>
        <div style={{ padding: '28px' }}>{children}</div>
      </div>
    </div>
  );
}

// Helper: get statuses relevant for a specific task's task type(s)
// Statuses with null task_type_ids are "universal" (show for all tasks)
// Statuses with specific task_type_ids only show for tasks with matching types
function getStatusesForTask(
  taskTypeIds: string[],
  statusObjects: {name: string; task_type_ids: string[] | null}[],
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
    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '16px' }}>
      <label style={{ fontWeight: 600, marginBottom: '8px', color: '#334155', fontSize: '13px', letterSpacing: '0.01em' }}>{label}</label>
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
  padding: '12px 16px', border: '1px solid #cbd5e1', borderRadius: '12px', fontSize: '14px',
  width: '100%', background: '#ffffff', color: '#0f172a', outline: 'none',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
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
