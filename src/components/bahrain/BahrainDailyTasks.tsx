'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Task, User, StatusLog, TaskMessage } from '@/lib/supabase';
import { getSession, isAdmin, getDataCountry } from '@/lib/auth';
import { Plus, X, Eye, Edit2, MessageCircle, Send, CheckCircle2, Search, Filter, Repeat, Trash2, MoreHorizontal, Check } from 'lucide-react';
import { useRef } from 'react';

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
  const canUpdateStatus = isAdminUser || (currentUser?.permissions?.can_update_status ?? true);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [partners, setPartners] = useState<User[]>([]);
  const [dynamicStatuses, setDynamicStatuses] = useState<string[]>(BAHRAIN_STATUSES);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<{id: string, message: string, taskId: string}[]>([]);

  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterPartner, setFilterPartner] = useState('');
  const [search, setSearch] = useState('');

  // Modals
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({
    title: '', priority: 'Medium', deadline: '', description: '', assigned_to: '', assigned_partners: [] as string[], repeat_daily: false, status: ''
  });

  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateBy, setUpdateBy] = useState('');
  const [updateRemarks, setUpdateRemarks] = useState('');
  
  const [chatTask, setChatTask] = useState<Task | null>(null);
  const [messages, setMessages] = useState<TaskMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');

  // Inline edit state
  const [inlineEditDescId, setInlineEditDescId] = useState<string | null>(null);
  const [inlineEditDescValue, setInlineEditDescValue] = useState('');
  const [hoveredDescTaskId, setHoveredDescTaskId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const dataCountry = getDataCountry();

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
    if (!s) return { bg: '#F3F4F6', color: '#6B7280', border: '#D1D5DB' };
    const sl = s.toLowerCase();
    if (sl.includes('closed') || sl.includes('complete') || sl.includes('filed') || sl.includes('done')) return { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0' };
    if (sl.includes('review') || sl.includes('ready')) return { bg: '#F5F3FF', color: '#7C3AED', border: '#DDD6FE' };
    if (sl.includes('progress') || sl.includes('active') || sl.includes('started')) return { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' };
    if (sl.includes('query') || sl.includes('waiting') || sl.includes('pending') || sl.includes('rework') || sl.includes('info')) return { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' };
    if (sl.includes('not started')) return { bg: '#F3F4F6', color: '#6B7280', border: '#D1D5DB' };
    return { bg: '#F3F4F6', color: '#6B7280', border: '#D1D5DB' };
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
      await supabase.from('tasks').update({ assigned_to: assignValue || null }).eq('id', taskId);
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
    } catch (e) {
      console.error(e);
    }
    setInlineEditDescId(null);
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let usersQuery = supabase.from('users').select('*').order('created_at', { ascending: false });
      if (dataCountry) usersQuery = usersQuery.eq('country', dataCountry);

      const statusQuery = dataCountry 
        ? supabase.from('statuses').select('name, active').eq('country', dataCountry) 
        : supabase.from('statuses').select('name, active');

      const tasksQuery = supabase.from('tasks')
        .select('*')
        .eq('is_daily', true)
        .or(`country.eq.${dataCountry || 'Bahrain'},country.is.null`);

      const [usersRes, statusRes, tasksRes] = await Promise.all([
        usersQuery, statusQuery, tasksQuery
      ]);

      const tasksData = tasksRes.data || [];

      // Auto-reset daily repeating tasks
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tasksToCheck = tasksData.filter(t => t.repeat_daily && t.status !== 'Pending');
      
      if (tasksToCheck.length > 0) {
        const taskIds = tasksToCheck.map(t => t.id);
        const { data: logs } = await supabase
          .from('status_log')
          .select('task_id, created_at')
          .in('task_id', taskIds)
          .order('created_at', { ascending: false });
          
        const resetPromises: any[] = [];
        
        for (const task of tasksToCheck) {
          const taskLogs = (logs || []).filter(l => l.task_id === task.id);
          const latestLogDateStr = taskLogs.length > 0 ? taskLogs[0].created_at : task.created_at;
          const latestDate = new Date(latestLogDateStr);
          
          if (latestDate < today) {
            resetPromises.push(
              supabase.from('tasks').update({ status: 'Pending' }).eq('id', task.id)
            );
            resetPromises.push(
              supabase.from('status_log').insert({
                task_id: task.id,
                status: 'Pending',
                remarks: 'Daily auto-reset'
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
      if (dbStatuses.length > 0) {
        setDynamicStatuses(dbStatuses.sort((a, b) => a.localeCompare(b)));
      } else {
        setDynamicStatuses(!dataCountry || dataCountry === 'Bahrain' ? [...BAHRAIN_STATUSES].sort((a, b) => a.localeCompare(b)) : []);
      }

    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [dataCountry]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime messages for notifications
  useEffect(() => {
    if (!currentUser) return;
    const channel = supabase.channel('daily_task_messages_notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_messages' }, async (payload) => {
        const msg = payload.new as TaskMessage;
        if (msg.sender_id === currentUser.id) return;
        
        const { data: task } = await supabase.from('tasks').select('id, title, is_daily, assigned_to, assigned_partners').eq('id', msg.task_id).single();
        if (!task || !task.is_daily) return;

        const isAssigned = task.assigned_to === currentUser.id || (task.assigned_partners && task.assigned_partners.includes(currentUser.id));
        if (isAssigned || isAdminUser) {
          const { data: sender } = await supabase.from('users').select('username').eq('id', msg.sender_id).single();
          const senderName = sender?.username || 'Someone';
          
          const notifId = Date.now().toString();
          setNotifications(prev => [...prev, { id: notifId, message: `${senderName}: ${msg.message.substring(0, 30)}${msg.message.length > 30 ? '...' : ''}`, taskId: msg.task_id }]);
          
          setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== notifId));
          }, 5000);
        }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser, isAdminUser]);

  const filtered = tasks.filter(t => {
    const isAssigned = (t.assigned_partners && t.assigned_partners.includes(currentUser?.id || '')) || t.assigned_to === currentUser?.id;
    if (!isAdminUser && !isAssigned) return false;
    
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterPartner) {
      const pId = filterPartner;
      if (t.assigned_to !== pId && !(t.assigned_partners && t.assigned_partners.includes(pId))) return false;
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
          is_daily: true,
          country: taskCountry,
        };
        if (newTask.status) updatePayload.status = newTask.status;

        const { error } = await supabase.from('tasks').update(updatePayload).eq('id', editingTaskId);
        if (error) { console.error('Update error:', error); alert('Failed to update task: ' + error.message); return; }
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
      await supabase.from('task_messages').delete().eq('task_id', id);
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
    setUpdateRemarks('');
    
    const { data: logs } = await supabase.from('status_log').select('*, updater:users(username)').eq('task_id', id).order('created_at', { ascending: false });
    setStatusLogs(logs || []);
  }

  async function saveStatusUpdate() {
    if (!detailTask) return;
    const oldStatus = detailTask.status;
    const byId = isAdminUser ? updateBy : currentUser?.id;
    
    await supabase.from('tasks').update({ status: updateStatus }).eq('id', detailTask.id);
    await supabase.from('status_log').insert({
      task_id: detailTask.id,
      status: updateStatus,
      updated_by: byId,
      remarks: updateRemarks || `Changed from ${oldStatus} to ${updateStatus}`
    });
    setDetailTask(null);
    loadData();
  }

  async function openChat(task: Task) {
    setChatTask(task);
    const { data } = await supabase.from('task_messages')
      .select('*, sender:users(username, role)')
      .eq('task_id', task.id)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  }

  async function sendMsg(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !chatTask || !currentUser) return;
    const txt = newMessage.trim();
    setNewMessage('');
    
    const tempMsg: any = { id: Date.now().toString(), task_id: chatTask.id, sender_id: currentUser.id, message: txt, created_at: new Date().toISOString(), sender: { username: currentUser.username, role: currentUser.role } };
    setMessages(p => [...p, tempMsg]);
    
    await supabase.from('task_messages').insert({ task_id: chatTask.id, sender_id: currentUser.id, message: txt });
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#7F8C8D' }}>Loading daily tasks...</div>;

  return (
    <div style={{ padding: '0' }}>
      {/* Notifications */}
      <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {notifications.map(n => (
          <div key={n.id} onClick={() => { const t = tasks.find(x=>x.id===n.taskId); if(t) openChat(t); }}
            style={{ background: '#8E44AD', color: 'white', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', animation: 'slideIn 0.3s ease-out' }}>
            <MessageCircle size={18} />
            <div style={{ fontSize: '14px', fontWeight: 500 }}>{n.message}</div>
          </div>
        ))}
      </div>

      <div className="daily-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', padding: '28px 32px', background: 'linear-gradient(135deg, #4c1d95 0%, #6d28d9 50%, #7c3aed 100%)', borderRadius: '20px', boxShadow: '0 4px 20px rgba(109,40,217,0.2)' }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: '24px', fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>Daily Tasks</h2>
          <p style={{ color: '#c4b5fd', fontSize: '14px', margin: '6px 0 0 0' }}>General day-to-day work tasks — not linked to any company</p>
        </div>
        {isAdminUser && (
          <button onClick={() => { setEditingTaskId(null); setNewTask({ title: '', priority: 'Medium', deadline: '', description: '', assigned_to: '', assigned_partners: [], repeat_daily: false, status: '' }); setShowTaskModal(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: '#ffffff', color: '#4c1d95', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', boxShadow: '0 4px 14px rgba(0,0,0,0.15)', transition: 'all 0.2s ease', whiteSpace: 'nowrap' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.15)'; }}>
            <Plus size={16} /> New Daily Task
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="task-filters" style={{ display: 'flex', gap: '14px', marginBottom: '28px', flexWrap: 'wrap', padding: '20px', background: 'rgba(255, 255, 255, 0.65)', backdropFilter: 'blur(10px)', borderRadius: '18px', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#ffffff', padding: '10px 16px', borderRadius: '12px', flex: '1 1 250px', border: '1px solid #cbd5e1', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <Search size={18} color="#94a3b8" />
          <input placeholder="Search title or description..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '14px', color: '#334155', fontWeight: 500 }} />
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
      <div className="task-table-wrap" style={{ overflowX: 'auto', borderRadius: '18px', boxShadow: '0 8px 32px rgba(0,0,0,0.05)', border: '1px solid rgba(226, 232, 240, 0.8)', background: '#ffffff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#ffffff' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              {['ID', 'Title', 'Description', 'Priority', 'Status', 'Due', 'Assigned To', ''].map(h => (
                <th key={h} style={{ padding: '11px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedTasks.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No daily tasks found.</td></tr>
            ) : sortedTasks.map(task => {
              const pc = priorityColor(task.priority);
              const isMenuOpen = openMenuId === task.id;
              
              return (
              <tr key={task.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }} onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={compactCell}><span style={{ fontWeight: 600, color: '#475569', fontSize: '12px' }}>#{task.id.slice(0, 6)}</span></td>
                <td style={compactCell}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 500, fontSize: '12px', color: '#1e293b', maxWidth: '160px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                    {task.repeat_daily && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 8px', borderRadius: '20px', fontSize: '9px', fontWeight: 700, background: 'linear-gradient(135deg, #7c3aed20, #6d28d920)', color: '#7c3aed', border: '1px solid #7c3aed30', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                        <Repeat size={10} /> Repeat
                      </span>
                    )}
                  </div>
                </td>
                <td 
                  style={{...compactCell, position: 'relative'}}
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
                      {hoveredDescTaskId === task.id && isAdminUser && (
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
                      {['Urgent', 'Critical', 'High', 'Medium', 'Low'].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: pc.bg, color: pc.color, whiteSpace: 'nowrap' }}>{task.priority}</span>
                  )}
                </td>
                <td style={compactCell}>
                  {canUpdateStatus ? (() => {
                    const sc = statusColor(task.status);
                    return (
                      <select value={task.status} onChange={e => handleStatusChange(task.id, e.target.value)}
                        style={{ padding: '5px 6px', borderRadius: '8px', border: `1px solid ${sc.border}`, background: sc.bg, color: sc.color, fontWeight: 600, fontSize: '11px', cursor: 'pointer', outline: 'none', minWidth: '120px' }}>
                        {dynamicStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    );
                  })() : (() => {
                    const sc = statusColor(task.status);
                    return <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, whiteSpace: 'nowrap' }}>{task.status}</span>;
                  })()}
                </td>
                <td style={compactCell}><span style={{ fontSize: '12px', color: '#475569', whiteSpace: 'nowrap' }}>{task.deadline || '—'}</span></td>
                <td style={compactCell}>
                  {(() => {
                    const allAssignedIds = Array.from(new Set([task.assigned_to, ...(task.assigned_partners || [])].filter(Boolean)));
                    if (allAssignedIds.length > 1) {
                      return (
                        <span style={{ fontSize: '12px', color: '#334155', fontWeight: 500 }}>
                          {allAssignedIds.map(id => partners.find(p => p.id === id)?.username).filter(Boolean).join(', ')}
                        </span>
                      );
                    }
                    if (isAdminUser) {
                      return (
                        <select value={task.assigned_to || ''} onChange={e => handleAssign(task.id, e.target.value)}
                          style={{ padding: '5px 6px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '11px', color: '#334155', minWidth: '110px', cursor: 'pointer', outline: 'none', fontWeight: 500 }}>
                          <option value="">Unassigned</option>
                          {partners.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
                        </select>
                      );
                    }
                    return (
                      <span style={{ fontSize: '12px', color: '#334155', fontWeight: 500 }}>
                        {partners.find(p => p.id === task.assigned_to)?.username || 'Unassigned'}
                      </span>
                    );
                  })()}
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
                        <button onClick={() => { 
                          setEditingTaskId(task.id); 
                          setNewTask({ title: task.title, priority: task.priority, deadline: task.deadline || '', description: task.description || '', assigned_to: task.assigned_to || '', assigned_partners: task.assigned_partners || [], repeat_daily: task.repeat_daily || false, status: task.status || '' }); 
                          setShowTaskModal(true); 
                          setOpenMenuId(null); 
                        }} style={menuItemStyle}>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: newTask.repeat_daily ? 'linear-gradient(135deg, #7c3aed08, #6d28d910)' : '#f8fafc', borderRadius: '12px', border: newTask.repeat_daily ? '1.5px solid #7c3aed30' : '1.5px solid #e2e8f0', transition: 'all 0.2s ease', cursor: 'pointer' }} onClick={() => setNewTask(p => ({ ...p, repeat_daily: !p.repeat_daily }))}>
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
              </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
                <button onClick={() => setShowTaskModal(false)} style={{ padding: '11px 24px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', transition: 'all 0.15s ease' }} onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'} onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}>Cancel</button>
                <button onClick={saveTask} style={{ padding: '11px 24px', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', boxShadow: '0 4px 14px rgba(109,40,217,0.3)', transition: 'all 0.15s ease' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(109,40,217,0.4)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(109,40,217,0.3)'; }}>Save Task</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailTask && (
        <div style={modalOverlayStyle}>
          <div style={{ ...modalContentStyle, maxWidth: '800px' }}>
            <div style={modalHeaderStyle}>
              <h3>Task Details</h3>
              <button onClick={() => setDetailTask(null)} style={closeBtnStyle}><X size={20} /></button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: '#F8F9F9', padding: '16px', borderRadius: '8px', border: '1px solid #EAEDED' }}>
                <h4 style={{ fontSize: '18px', color: '#2C3E50', marginBottom: '8px' }}>{detailTask.title}</h4>
                <p style={{ fontSize: '14px', color: '#566573', marginBottom: '12px' }}>{detailTask.description || 'No description provided.'}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '13px' }}>
                  <div><strong style={{ color: '#7F8C8D' }}>Status:</strong> {detailTask.status}</div>
                  <div><strong style={{ color: '#7F8C8D' }}>Priority:</strong> {detailTask.priority}</div>
                  <div><strong style={{ color: '#7F8C8D' }}>Deadline:</strong> {detailTask.deadline || 'N/A'}</div>
                </div>
              </div>

              {canUpdateStatus && (
                <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #D5DBDB' }}>
                  <h4 style={{ fontSize: '15px', color: '#2C3E50', marginBottom: '12px' }}>Update Status</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
                    <FormField label="New Status">
                      <select value={updateStatus} onChange={e => setUpdateStatus(e.target.value)} style={inputStyle}>
                        {dynamicStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Updated By">
                      <select value={updateBy} onChange={e => setUpdateBy(e.target.value)} style={inputStyle} disabled={!isAdminUser}>
                        {partners.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
                      </select>
                    </FormField>
                  </div>
                  <FormField label="Remarks">
                    <input value={updateRemarks} onChange={e => setUpdateRemarks(e.target.value)} placeholder="Add a note..." style={inputStyle} />
                  </FormField>
                  <button onClick={saveStatusUpdate} style={{ marginTop: '12px', padding: '8px 16px', background: '#3498DB', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, width: '100%' }}>Update Status</button>
                </div>
              )}

              <div>
                <h4 style={{ fontSize: '15px', color: '#2C3E50', marginBottom: '12px' }}>Status History</h4>
                <div style={{ maxHeight: '200px', overflowY: 'auto', background: '#FDFEFE', border: '1px solid #EAEDED', borderRadius: '8px', padding: '10px' }}>
                  {statusLogs.length === 0 ? <p style={{ fontSize: '13px', color: '#95A5A6', textAlign: 'center' }}>No status updates yet.</p> :
                    statusLogs.map(log => (
                      <div key={log.id} style={{ display: 'flex', gap: '12px', padding: '10px', borderBottom: '1px solid #F2F4F4' }}>
                        <div style={{ color: '#27AE60', marginTop: '2px' }}><CheckCircle2 size={16} /></div>
                        <div>
                          <div style={{ fontSize: '13px', color: '#2C3E50', fontWeight: 500 }}>Changed to <strong>{log.status}</strong> by {log.updater?.username || 'Unknown'}</div>
                          <div style={{ fontSize: '12px', color: '#7F8C8D', marginTop: '2px' }}>{new Date(log.created_at).toLocaleString()}</div>
                          {log.remarks && <div style={{ fontSize: '13px', color: '#566573', marginTop: '4px', background: '#F8F9F9', padding: '6px 10px', borderRadius: '4px' }}>&quot;{log.remarks}&quot;</div>}
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chat Modal */}
      {chatTask && (
        <div style={modalOverlayStyle}>
          <div style={{ ...modalContentStyle, height: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={modalHeaderStyle}>
              <div>
                <h3 style={{ margin: 0 }}>Discussion</h3>
                <span style={{ fontSize: '12px', color: '#7F8C8D' }}>{chatTask.title}</span>
              </div>
              <button onClick={() => setChatTask(null)} style={closeBtnStyle}><X size={20} /></button>
            </div>
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto', background: '#F8F9F9', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#95A5A6', margin: 'auto' }}>No messages yet. Start the conversation!</div>
              ) : (
                messages.map((msg, idx) => {
                  const isMine = msg.sender_id === currentUser?.id;
                  const showHeader = idx === 0 || messages[idx - 1].sender_id !== msg.sender_id;
                  return (
                    <div key={msg.id} style={{ alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                      {showHeader && (
                        <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '4px', textAlign: isMine ? 'right' : 'left' }}>
                          <strong>{msg.sender?.username || 'Unknown'}</strong>
                          {msg.sender?.role?.toLowerCase() === 'admin' && <span style={{ marginLeft: '6px', background: '#E2E8F0', padding: '2px 6px', borderRadius: '10px', fontSize: '10px' }}>Admin</span>}
                        </div>
                      )}
                      <div style={{ background: isMine ? '#8E44AD' : '#fff', color: isMine ? '#fff' : '#333', padding: '10px 14px', borderRadius: isMine ? '14px 14px 2px 14px' : '14px 14px 14px 2px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', fontSize: '14px', lineHeight: '1.4' }}>
                        {msg.message}
                      </div>
                      <div style={{ fontSize: '10px', color: '#95A5A6', marginTop: '4px', textAlign: isMine ? 'right' : 'left' }}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <form onSubmit={sendMsg} style={{ padding: '16px', background: '#fff', borderTop: '1px solid #EAEDED', display: 'flex', gap: '10px' }}>
              <input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Type a message..." style={{ flex: 1, padding: '12px 16px', border: '1px solid #D5DBDB', borderRadius: '24px', outline: 'none', fontSize: '14px' }} />
              <button type="submit" disabled={!newMessage.trim()} style={{ background: newMessage.trim() ? '#8E44AD' : '#D5DBDB', color: '#fff', border: 'none', borderRadius: '50%', width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: newMessage.trim() ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }}>
                <Send size={18} style={{ marginLeft: '2px' }} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '16px' }}>
      <label style={{ fontWeight: 600, marginBottom: '8px', color: '#334155', fontSize: '13px', letterSpacing: '0.01em' }}>{label}</label>
      {children}
    </div>
  );
}

// Inline styles
const thStyle: React.CSSProperties = { padding: '14px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#64748b' };
const tdStyle: React.CSSProperties = { padding: '14px 14px', fontSize: '13px', verticalAlign: 'middle', color: '#334155' };
const filterStyle: React.CSSProperties = { padding: '10px 16px', border: '1px solid #cbd5e1', borderRadius: '12px', fontSize: '13px', background: '#ffffff', color: '#334155', outline: 'none', transition: 'all 0.2s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', fontWeight: 500 };
const inputStyle: React.CSSProperties = { ...filterStyle, padding: '12px 16px', width: '100%' };
const btnSmStyle = (bg: string): React.CSSProperties => ({ padding: '7px 10px', background: bg, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease', boxShadow: `0 1px 3px ${bg}40` });
const compactCell: React.CSSProperties = { padding: '10px 10px', fontSize: '12px', verticalAlign: 'middle', color: '#334155' };
const menuItemStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '13px', color: '#475569', fontWeight: 500, transition: 'background 0.15s' };
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
