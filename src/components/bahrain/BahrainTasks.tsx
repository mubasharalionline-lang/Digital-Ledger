'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Task, Company, User, TaskType, StatusLog } from '@/lib/supabase';
import { getDataCountry, getSession, isAdmin } from '@/lib/auth';
import { BAHRAIN_PRIORITIES, BAHRAIN_STATUSES } from '@/lib/bahrain';
import { Plus, Eye, Trash2, X, Edit2 } from 'lucide-react';

export default function BahrainTasks() {
  const { user: currentUser } = getSession();
  const isAdminUser = isAdmin(currentUser);
  const canUpdateStatus = isAdminUser || (currentUser?.permissions?.can_update_status ?? true);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [partners, setPartners] = useState<User[]>([]);
  const [dynamicStatuses, setDynamicStatuses] = useState<string[]>(BAHRAIN_STATUSES);
  const [loading, setLoading] = useState(true);

  const searchParams = useSearchParams();

  // Filters
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '');
  const [filterPriority, setFilterPriority] = useState(searchParams.get('priority') || '');
  const [filterCompany, setFilterCompany] = useState(searchParams.get('company') || '');
  const [filterPartner, setFilterPartner] = useState(searchParams.get('partner') || '');
  const [search, setSearch] = useState(searchParams.get('search') || '');

  // New Task modal
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({
    company_id: '', task_type_id: '', task_type_ids: [] as string[], priority: 'Medium', deadline: '', description: '', assigned_to: '', assigned_partners: [] as string[]
  });

  // Task Detail modal
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [detailCompany, setDetailCompany] = useState<Company | null>(null);
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateBy, setUpdateBy] = useState('');
  const [updateRemarks, setUpdateRemarks] = useState('');

  const dataCountry = getDataCountry();

  const loadData = useCallback(async () => {
    // Try to load from cache first for instant UI response
    const cacheKey = 'tasks_data_cache';
    const cacheTimeKey = 'tasks_data_time';
    const cachedData = sessionStorage.getItem(cacheKey);
    const cacheTime = sessionStorage.getItem(cacheTimeKey);
    
    let useCache = false;

    if (cachedData && cacheTime) {
      const isFresh = Date.now() - parseInt(cacheTime) < 5 * 60 * 1000; // 5 mins TTL
      if (isFresh) {
        try {
          const parsed = JSON.parse(cachedData);
          setCompanies(parsed.companies);
          setTasks(parsed.tasks);
          setTaskTypes(parsed.taskTypes);
          setPartners(parsed.partners);
          setLoading(false);
          useCache = true;
        } catch (e) {}
      }
    }

    if (useCache) return; // Skip expensive DB queries if cache is fresh!

    try {
      let usersQuery = supabase.from('users').select('*').order('created_at', { ascending: false });
      if (dataCountry) {
        usersQuery = usersQuery.eq('country', dataCountry);
      }

      // Fire all independent queries simultaneously
      const [compsRes, ttRes, usersRes, statusRes] = await Promise.all([
        supabase.from('companies').select('*').eq('country', dataCountry || 'Bahrain'),
        supabase.from('task_types').select('*').eq('active', true),
        usersQuery,
        dataCountry 
          ? supabase.from('statuses').select('name, active').eq('country', dataCountry) 
          : supabase.from('statuses').select('name, active')
      ]);

      const companyList = compsRes.data || [];
      const ttList = ttRes.data || [];
      const usersList = usersRes.data || [];
      // Only include active statuses (active !== false handles missing column gracefully)
      const dbStatuses = statusRes.data
        ?.filter(s => s.active !== false)
        .map(s => s.name) || [];
      
      if (dbStatuses.length > 0) {
        setDynamicStatuses([...new Set(dbStatuses)] as string[]);
      } else {
        setDynamicStatuses(BAHRAIN_STATUSES);
      }

      // Fetch tasks (depends on companyIds)
      const companyIds = companyList.map(c => c.id);
      let taskList: Task[] = [];
      if (companyIds.length > 0) {
        const { data: t } = await supabase.from('tasks').select('*').in('company_id', companyIds);
        taskList = t || [];
      }
      
      setCompanies(companyList);
      setTaskTypes(ttList);
      setPartners(usersList);
      setTasks(taskList);

      // Save to cache
      sessionStorage.setItem(cacheKey, JSON.stringify({
        companies: companyList,
        taskTypes: ttList,
        partners: usersList,
        tasks: taskList
      }));
      sessionStorage.setItem('tasks_data_time', Date.now().toString());

    } catch (err) {
      console.error('Load error:', err);
    }
    setLoading(false);
  }, [dataCountry]);

  useEffect(() => { loadData(); }, [loadData]);

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
    if (search) {
      const s = search.toLowerCase();
      const ttIds = t.task_type_id ? t.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : [];
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
  });

  // Inline status update
  async function handleStatusChange(taskId: string, newStatus: string) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;

    const { data, error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId).select();
    if (error) { console.error('Status update error:', error); return; }
    if (!data || data.length === 0) {
      alert('Update blocked by Supabase Row Level Security (RLS). Ask Admin to run the database fix script.');
      return;
    }
    
    const { user } = getSession();
    // In Bahrain, Admins act on behalf of the assigned partner for status updates
    let updaterId = user?.id || null;
    if (isAdminUser && dataCountry === 'Bahrain' && task.assigned_to) {
      updaterId = task.assigned_to;
    }

    await supabase.from('status_log').insert({
      task_id: taskId,
      status: newStatus,
      updated_by: updaterId,
      remarks: `Status changed from ${task.status} to ${newStatus}`,
    });

    sessionStorage.removeItem('tasks_data_time');
    sessionStorage.removeItem('dashboard_data_time_v2');

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
  }

  function openEditTask(task: Task) {
    setEditingTaskId(task.id);
    const existingTypeIds = task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : [];
    setNewTask({
      company_id: task.company_id || '',
      task_type_id: task.task_type_id || '',
      task_type_ids: existingTypeIds,
      priority: task.priority || 'Medium',
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

  // Save new task
  async function saveTask() {
    const typeIds = newTask.task_type_ids || [];
    if (!newTask.company_id || typeIds.length === 0 || !newTask.deadline) {
      alert('Please fill all required fields (Company, at least one Task Type, and Due Date)');
      return;
    }

    // Use the first selected task type for backward-compatible fields
    const firstTt = taskTypes.find(t => t.id === typeIds[0]);
    const firstStatus = firstTt?.status_options ? firstTt.status_options.split(',')[0].trim() : 'Not Started';
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
        task_type_id: typeIds.join(','),
        priority: newTask.priority,
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
        task_type_id: typeIds.join(','),
        priority: newTask.priority,
        deadline: newTask.deadline,
        description: desc,
        assigned_to: assignTo,
        assigned_partners: assignArray,
        status: firstStatus,
      }).select().single();
      resultError = error;
      resultData = data;
    }

    if (resultError) { console.error('Save task error:', resultError); alert('Error: ' + resultError.message); return; }

    // Status log for new tasks
    if (!editingTaskId) {
      const { user } = getSession();
      await supabase.from('status_log').insert({
        task_id: resultData.id,
        status: firstStatus,
        updated_by: user?.id || null,
        remarks: 'Task created',
      });
    }

    setShowTaskModal(false);
    setEditingTaskId(null);
    setNewTask({ company_id: '', task_type_id: '', task_type_ids: [], priority: 'Medium', deadline: '', description: '', assigned_to: '', assigned_partners: [] });
    
    sessionStorage.removeItem('tasks_data_time');
    sessionStorage.removeItem('dashboard_data_time_v2');
    
    loadData();
    alert(editingTaskId ? 'Task updated successfully!' : 'Task created successfully!');
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
    const byVal = updateBy && updateBy.length > 0 ? updateBy : null;
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
    const { error: e2 } = await supabase.from('status_log').insert({
      task_id: detailTask.id,
      status: updateStatus,
      updated_by: byVal,
      remarks: updateRemarks || null,
    });
    if (e2) console.error('Log error:', e2);

    alert('Status updated!');
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h2 style={{ color: '#111827', fontSize: '26px', fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>Task Management</h2>
          <p style={{ color: '#6B7280', fontSize: '14px', margin: '4px 0 0 0' }}>Manage, assign, and track all compliance tasks</p>
        </div>
        {isAdminUser && (
          <button
            onClick={() => { setEditingTaskId(null); setNewTask({ company_id: '', task_type_id: '', task_type_ids: [], priority: 'Medium', deadline: '', description: '', assigned_to: '', assigned_partners: [] }); setShowTaskModal(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '11px 24px', background: 'linear-gradient(135deg, #3B82F6, #2563EB)', color: '#fff',
              border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '14px',
              boxShadow: '0 4px 14px rgba(59,130,246,0.35)', transition: 'all 0.2s ease',
            }}
          >
            <Plus size={16} /> New Task
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap', padding: '16px 20px', background: '#F9FAFB', borderRadius: '14px', border: '1px solid #E5E7EB' }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={filterStyle}>
          <option value="">All Status</option>
          {(() => {
            const allStatuses = new Set<string>(dynamicStatuses);
            tasks.forEach(t => { if (t.status) allStatuses.add(t.status); });
            taskTypes.forEach(tt => {
              if (tt.status_options) tt.status_options.split(',').map(s => s.trim()).filter(Boolean).forEach(s => allStatuses.add(s));
            });
            return Array.from(allStatuses).map(s => <option key={s} value={s}>{s}</option>);
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
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tasks..."
          style={{ ...filterStyle, flex: 1, minWidth: '180px' }}
        />
      </div>

      {/* Tasks Table */}
      <div style={{ overflowX: 'auto', borderRadius: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)', border: '1px solid #E5E7EB' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card, #fff)' }}>
          <thead>
            <tr style={{ background: 'linear-gradient(135deg, #1E293B, #334155)', color: 'white' }}>
              {['Task ID', 'Company', 'Type', 'Description', 'Priority', 'Due Date', 'Status', 'Assigned To', 'Actions'].map(h => (
                <th key={h} style={{ padding: '14px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#7F8C8D' }}>No tasks found</td></tr>
            ) : filtered.map(task => {
              const company = companies.find(c => c.id === task.company_id);
              const ttIds = task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : [];
              const ttNames = ttIds.map(id => taskTypes.find(t => t.id === id)?.name).filter(Boolean);
              const primaryTt = taskTypes.find(t => t.id === ttIds[0]);
              const statusOptions = primaryTt?.status_options ? primaryTt.status_options.split(',').map(s => s.trim()) : dynamicStatuses;
              const pc = priorityColor(task.priority);

              return (
                <tr key={task.id} style={{ borderBottom: '1px solid var(--border, #ECF0F1)' }}>
                  <td style={cellStyle}><strong>#{task.id.slice(0, 6)}</strong></td>
                  <td style={cellStyle}>{company?.company_name || 'Unknown'}</td>
                  <td style={cellStyle}>
                    {ttNames.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {ttNames.map((name, i) => (
                          <span key={i} style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: '#EBF5FB', color: '#2980B9', border: '1px solid #AED6F1' }}>{name}</span>
                        ))}
                      </div>
                    ) : task.title}
                  </td>
                  <td style={{ ...cellStyle, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.description || '-'}</td>
                  <td style={cellStyle}>
                    <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: pc.bg, color: pc.color }}>{task.priority}</span>
                  </td>
                  <td style={cellStyle}>{task.deadline}</td>
                  <td style={cellStyle}>
                    {canUpdateStatus ? (
                      (() => {
                        const sc = statusColor(task.status);
                        return (
                          <select
                            value={task.status}
                            onChange={e => handleStatusChange(task.id, e.target.value)}
                            style={{ ...dropdownStyle, background: sc.bg, color: sc.color, border: `1.5px solid ${sc.border}`, fontWeight: 600, fontSize: '12px' }}
                          >
                            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        );
                      })()
                    ) : (
                      (() => {
                        const sc = statusColor(task.status);
                        return <span style={{ padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{task.status}</span>;
                      })()
                    )}
                  </td>
                  <td style={cellStyle}>
                    {isAdminUser ? (
                      <select
                        value={task.assigned_to || ''}
                        onChange={e => handleAssign(task.id, e.target.value)}
                        style={dropdownStyle}
                      >
                        <option value="">Unassigned</option>
                        {partners.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
                      </select>
                    ) : (
                      <span>
                        {(task.assigned_partners && task.assigned_partners.length > 0) 
                          ? task.assigned_partners.map(id => partners.find(p => p.id === id)?.username).filter(Boolean).join(', ') 
                          : (partners.find(p => p.id === task.assigned_to)?.username || 'Unassigned')}
                      </span>
                    )}
                  </td>
                  <td style={{ ...cellStyle, display: 'flex', gap: '6px' }}>
                    <button onClick={() => viewDetail(task.id)} style={btnSmStyle('#5DADE2')}><Eye size={14} /></button>
                    {isAdminUser && (
                      <>
                        <button onClick={() => openEditTask(task)} style={btnSmStyle('#F39C12')}><Edit2 size={14} /></button>
                        <button onClick={() => deleteTask(task.id)} style={btnSmStyle('#E74C3C')}><Trash2 size={14} /></button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button onClick={() => setShowTaskModal(false)} style={{ padding: '10px 20px', background: '#BDC3C7', color: '#34495E', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
            <button onClick={saveTask} style={{ padding: '10px 20px', background: '#27AE60', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Save Task</button>
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
              const ids = detailTask.task_type_id ? detailTask.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : [];
              const names = ids.map(id => taskTypes.find(t => t.id === id)?.name).filter(Boolean);
              return names.length > 0 ? names.join(', ') : detailTask.title;
            })()}</div>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button onClick={() => setDetailTask(null)} style={{ padding: '10px 20px', background: '#BDC3C7', color: '#34495E', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Close</button>
            {canUpdateStatus && (
              <button onClick={submitStatusUpdate} style={{ padding: '10px 20px', background: '#27AE60', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Update Status</button>
            )}
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
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '20px',
    }}>
      <div style={{
        background: 'var(--bg-card, #fff)', borderRadius: '12px', maxWidth: '800px', width: '100%',
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{ padding: '20px 25px', borderBottom: '2px solid var(--border, #ECF0F1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '20px', color: '#2E4053', fontWeight: 600 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', color: '#34495E' }}><X size={22} /></button>
        </div>
        <div style={{ padding: '25px' }}>{children}</div>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '12px' }}>
      <label style={{ fontWeight: 600, marginBottom: '6px', color: '#34495E', fontSize: '13px' }}>{label}</label>
      {children}
    </div>
  );
}

const filterStyle: React.CSSProperties = {
  padding: '10px 14px', border: '2px solid #BDC3C7', borderRadius: '6px', fontSize: '14px', background: 'var(--bg-card, #fff)', color: 'var(--text-primary, #333)',
};

const cellStyle: React.CSSProperties = {
  padding: '12px', fontSize: '13px', verticalAlign: 'middle', color: 'var(--text-primary, #333)',
};

const dropdownStyle: React.CSSProperties = {
  padding: '7px 10px', border: '2px solid #BDC3C7', borderRadius: '6px', fontSize: '12px',
  width: '100%', cursor: 'pointer', background: 'var(--bg-card, #fff)', color: 'var(--text-primary, #333)',
};

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', border: '2px solid #BDC3C7', borderRadius: '6px', fontSize: '14px',
  width: '100%', background: 'var(--bg-card, #fff)', color: 'var(--text-primary, #333)',
};

function btnSmStyle(bg: string): React.CSSProperties {
  return {
    padding: '6px 10px', background: bg, color: '#fff', border: 'none', borderRadius: '6px',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
  };
}
