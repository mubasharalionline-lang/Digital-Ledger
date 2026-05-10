'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Task, User, StatusLog, TaskMessage } from '@/lib/supabase';
import { getSession, isAdmin, getDataCountry } from '@/lib/auth';
import { Plus, X, Eye, Edit2, MessageCircle, Send, CheckCircle2, Search, Filter } from 'lucide-react';
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
    title: '', priority: 'Medium', deadline: '', description: '', assigned_to: '', assigned_partners: [] as string[]
  });

  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateBy, setUpdateBy] = useState('');
  const [updateRemarks, setUpdateRemarks] = useState('');
  
  const [chatTask, setChatTask] = useState<Task | null>(null);
  const [messages, setMessages] = useState<TaskMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');

  const dataCountry = getDataCountry();

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
        .eq('country', dataCountry || 'Bahrain');

      const [usersRes, statusRes, tasksRes] = await Promise.all([
        usersQuery, statusQuery, tasksQuery
      ]);

      setPartners(usersRes.data || []);
      setTasks(tasksRes.data || []);

      const dbStatuses = statusRes.data?.filter(s => s.active !== false).map(s => s.name) || [];
      if (dbStatuses.length > 0) {
        setDynamicStatuses(dbStatuses.sort((a, b) => a.localeCompare(b)));
      } else {
        setDynamicStatuses(BAHRAIN_STATUSES);
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
    
    if (editingTaskId) {
      await supabase.from('tasks').update({
        title: newTask.title,
        priority: newTask.priority,
        deadline: newTask.deadline || null,
        description: newTask.description,
        assigned_to: newTask.assigned_to || null,
        assigned_partners: newTask.assigned_partners,
      }).eq('id', editingTaskId);
    } else {
      await supabase.from('tasks').insert({
        title: newTask.title,
        priority: newTask.priority,
        status: 'Pending',
        deadline: newTask.deadline || null,
        description: newTask.description,
        assigned_to: newTask.assigned_to || null,
        assigned_partners: newTask.assigned_partners,
        country: taskCountry,
        is_daily: true,
      });
    }
    setShowTaskModal(false);
    loadData();
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
    <div style={{ padding: '20px' }}>
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', padding: '28px 32px', background: 'linear-gradient(135deg, #4c1d95 0%, #6d28d9 50%, #7c3aed 100%)', borderRadius: '20px', boxShadow: '0 4px 20px rgba(109,40,217,0.2)' }}>
        <div>
          <h2 style={{ color: '#ffffff', fontSize: '24px', fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>Daily Tasks</h2>
          <p style={{ color: '#c4b5fd', fontSize: '14px', margin: '6px 0 0 0' }}>General day-to-day work tasks — not linked to any company</p>
        </div>
        {isAdminUser && (
          <button onClick={() => { setEditingTaskId(null); setNewTask({ title: '', priority: 'Medium', deadline: '', description: '', assigned_to: '', assigned_partners: [] }); setShowTaskModal(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: '#ffffff', color: '#4c1d95', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', boxShadow: '0 4px 14px rgba(0,0,0,0.15)', transition: 'all 0.2s ease' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.15)'; }}>
            <Plus size={16} /> New Daily Task
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap', background: '#ffffff', padding: '18px 22px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-tertiary)', padding: '8px 12px', borderRadius: '8px', flex: '1 1 200px' }}>
          <Search size={16} color="#7F8C8D" />
          <input placeholder="Search title or description..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '13px', color: 'var(--text-primary)' }} />
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
            <option value="">All Partners</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03)', border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#ffffff' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Title</th>
              <th style={thStyle}>Assigned</th>
              <th style={thStyle}>Priority</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Deadline</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedTasks.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#7F8C8D' }}>No daily tasks found.</td></tr>
            ) : sortedTasks.map(task => (
              <tr key={task.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={tdStyle}>{task.id.slice(0, 6)}</td>
                <td style={tdStyle}><strong>{task.title}</strong></td>
                <td style={tdStyle}>
                  {task.assigned_to ? partners.find(p => p.id === task.assigned_to)?.username : 'Unassigned'}
                  {task.assigned_partners && task.assigned_partners.length > 0 && (
                    <span style={{ display: 'block', fontSize: '11px', color: '#7F8C8D', marginTop: '2px' }}>
                      + {task.assigned_partners.length} more
                    </span>
                  )}
                </td>
                <td style={tdStyle}>
                  <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: task.priority === 'High' ? '#FADBD8' : task.priority === 'Medium' ? '#FCF3CF' : '#D5F5E3', color: task.priority === 'High' ? '#E74C3C' : task.priority === 'Medium' ? '#F39C12' : '#27AE60' }}>
                    {task.priority}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: '#E8F8F5', color: '#117A65' }}>
                    {task.status}
                  </span>
                </td>
                <td style={tdStyle}>{task.deadline || '-'}</td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => viewDetail(task.id)} style={btnSmStyle('#5DADE2')}><Eye size={14} /></button>
                    <button onClick={() => openChat(task)} style={btnSmStyle('#8E44AD')}><MessageCircle size={14} /></button>
                    {isAdminUser && (
                      <button onClick={() => { setEditingTaskId(task.id); setNewTask({ title: task.title, priority: task.priority, deadline: task.deadline, description: task.description || '', assigned_to: task.assigned_to, assigned_partners: task.assigned_partners || [] }); setShowTaskModal(true); }} style={btnSmStyle('#F39C12')}><Edit2 size={14} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <FormField label="Priority">
                    <select value={newTask.priority} onChange={e => setNewTask(p => ({ ...p, priority: e.target.value }))} style={inputStyle}>
                      <option>High</option><option>Medium</option><option>Low</option>
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
                          {log.remarks && <div style={{ fontSize: '13px', color: '#566573', marginTop: '4px', background: '#F8F9F9', padding: '6px 10px', borderRadius: '4px' }}>"{log.remarks}"</div>}
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
const filterStyle: React.CSSProperties = { padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', background: '#ffffff', color: '#334155', outline: 'none', flex: '1 1 140px', transition: 'all 0.15s ease' };
const inputStyle: React.CSSProperties = { padding: '11px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', width: '100%', background: '#ffffff', color: '#0f172a', outline: 'none', transition: 'border-color 0.15s ease, box-shadow 0.15s ease' };
const btnSmStyle = (bg: string): React.CSSProperties => ({ padding: '7px 10px', background: bg, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease', boxShadow: `0 1px 3px ${bg}40` });
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
