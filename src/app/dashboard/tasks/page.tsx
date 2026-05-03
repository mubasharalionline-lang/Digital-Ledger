'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, isAdmin, getDataCountry } from '@/lib/auth';
import { getTerminology } from '@/lib/terminology';
import { isBahrainMode } from '@/lib/bahrain';
import BahrainTasks from '@/components/bahrain/BahrainTasks';
import { supabase } from '@/lib/supabase';
import type { User, Task, Company } from '@/lib/supabase';
import {
  Search,
  Filter,
  Plus,
  X,
  Loader2,
  ListTodo,
  Calendar,
  Pencil,
  Trash2,
  Building2,
  MessageCircle,
} from 'lucide-react';

export default function TasksPage() {
  // Bahrain gets a different tasks view
  const { country: sessionCountry } = getSession();
  if (isBahrainMode(sessionCountry)) {
    return <BahrainTasks />;
  }

  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const router = useRouter();
  const terms = getTerminology();


  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCompany, setTaskCompany] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskStatus, setTaskStatus] = useState('Yet to Start');
  const [taskPriority, setTaskPriority] = useState('medium');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [savingTask, setSavingTask] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  // Message modal state
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageTaskId, setMessageTaskId] = useState<string | null>(null);
  const [messageContent, setMessageContent] = useState('');
  const [savingMessage, setSavingMessage] = useState(false);

  useEffect(() => {
    const { user: u } = getSession();
    if (!u) { router.push('/'); return; }
    setUser(u);
    loadData(u);
  }, [router]);

  async function loadData(currentUser: User) {
    setLoading(true);
    const dataCountry = getDataCountry();

    let taskQuery = supabase
      .from('tasks')
      .select('*, company:companies(company_name, country, job), assignee:users!tasks_assigned_to_fkey(username)')
      .order('created_at', { ascending: false });

    if (!isAdmin(currentUser)) {
      taskQuery = taskQuery.eq('assigned_to', currentUser.id);
    }

    let companiesQuery = supabase.from('companies').select('*').order('company_name');
    if (dataCountry) companiesQuery = companiesQuery.eq('country', dataCountry);

    let staffQuery = supabase.from('users').select('*').neq('role', 'admin');
    if (dataCountry) staffQuery = staffQuery.eq('country', dataCountry);

    const [tasksRes, companiesRes, staffRes] = await Promise.all([
      taskQuery,
      companiesQuery,
      staffQuery,
    ]);

    let allTasks = tasksRes.data || [];
    // Filter tasks by country
    if (dataCountry) {
      allTasks = allTasks.filter(t => (t.company as any)?.country === dataCountry);
    }

    setTasks(allTasks);
    setCompanies(companiesRes.data || []);
    setStaff(staffRes.data || []);
    setLoading(false);
  }

  function resetForm() {
    setTaskTitle('');
    setTaskCompany('');
    setTaskAssignee('');
    setTaskStatus('Yet to Start');
    setTaskPriority('medium');
    setTaskDeadline('');
    setEditingTaskId(null);
    setShowModal(false);
  }

  async function saveTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim() || !taskCompany) return;
    setSavingTask(true);

    const payload = {
      title: taskTitle.trim(),
      company_id: taskCompany,
      assigned_to: taskAssignee || null,
      status: taskStatus,
      priority: taskPriority,
      deadline: taskDeadline || null,
    };

    if (editingTaskId) {
      await supabase.from('tasks').update(payload).eq('id', editingTaskId);
    } else {
      await supabase.from('tasks').insert(payload);
    }

    resetForm();
    setSavingTask(false);
    if (user) loadData(user);
  }

  function editTask(task: Task) {
    setTaskTitle(task.title);
    setTaskCompany(task.company_id);
    setTaskAssignee(task.assigned_to || '');
    setTaskStatus(task.status);
    setTaskPriority(task.priority);
    setTaskDeadline(task.deadline || '');
    setEditingTaskId(task.id);
    setShowModal(true);
  }

  async function deleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return;
    await supabase.from('tasks').delete().eq('id', taskId);
    if (user) loadData(user);
  }

  async function updateStatus(taskId: string, status: string) {
    await supabase.from('tasks').update({ status }).eq('id', taskId);
    if (user) loadData(user);
  }

  function openMessageModal(task: Task) {
    setMessageTaskId(task.id);
    setMessageContent(task.admin_note || '');
    setShowMessageModal(true);
  }

  async function saveMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!messageTaskId) return;
    setSavingMessage(true);
    await supabase.from('tasks').update({ admin_note: messageContent }).eq('id', messageTaskId);
    setShowMessageModal(false);
    setSavingMessage(false);
    if (user) loadData(user);
  }

  const getStatusBadge = (status: string) => {
    let badgeClass = 'badge-pending';
    const s = status.toLowerCase();
    if (s.includes('completed')) badgeClass = 'badge-completed';
    else if (s.includes('progress') || s.includes('review') || s.includes('sent') || s.includes('waiting') || s.includes('required')) badgeClass = 'badge-in-progress';
    return <span className={`badge ${badgeClass}`}>{status}</span>;
  };

  const getPriorityBadge = (priority: string) => {
    const map: Record<string, string> = { high: 'badge-high', medium: 'badge-medium', low: 'badge-low' };
    return <span className={`badge ${map[priority]}`} style={{ textTransform: 'capitalize' }}>{priority}</span>;
  };

  const filtered = tasks.filter(t => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div className="animate-fadeIn" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div>
          <h1 style={{
            fontSize: '28px', fontWeight: 700,
            color: 'var(--text-primary)', letterSpacing: '-0.02em',
          }}>
            {isAdmin(user) ? 'All Tasks' : 'My Tasks'}
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {filtered.length} of {tasks.length} tasks
          </p>
        </div>
        {isAdmin(user) && (
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
            <Plus size={16} /> Create Task
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="animate-fadeIn" style={{
        display: 'flex',
        gap: '10px',
        marginBottom: '20px',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '320px' }}>
          <Search size={16} style={{
            position: 'absolute', left: '12px', top: '50%',
            transform: 'translateY(-50%)', color: 'var(--text-tertiary)',
          }} />
          <input
            className="input"
            type="text"
            placeholder="Search tasks..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Filter size={16} color="var(--text-tertiary)" />
          <select className="select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ width: '150px', padding: '8px 12px', fontSize: '13px' }}>
            <option value="all">All Status</option>
            <option value="Yet to Start">Yet to Start</option>
            <option value="In Progress">In Progress</option>
            <option value="Waiting for Documents">Waiting for Documents</option>
            <option value="Xero Access Required">Xero Access Required</option>
            <option value="IRD Number Required">IRD Number Required</option>
            <option value="Queries Sent">Queries Sent</option>
            <option value="Completed">Completed</option>
            <option value="Sent for Review 1">Sent for Review 1</option>
            <option value="Sent for Review 2">Sent for Review 2</option>
            <option value="Sent for Review 3">Sent for Review 3</option>
          </select>
          <select className="select" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            style={{ width: '130px', padding: '8px 12px', fontSize: '13px' }}>
            <option value="all">All Priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Task Table */}
      {loading ? (
        <div className="skeleton" style={{ height: '400px', borderRadius: '16px' }} />
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: '64px 24px', textAlign: 'center' }}>
          <ListTodo size={40} style={{ margin: '0 auto 16px', color: 'var(--text-tertiary)', opacity: 0.5 }} />
          <p style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-secondary)' }}>
            {search || filterStatus !== 'all' || filterPriority !== 'all' ? 'No tasks match your filters' : 'No tasks yet'}
          </p>
        </div>
      ) : (
        <div className="card animate-slideUp" style={{ overflow: 'hidden' }}>
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Company</th>
                  {isAdmin(user) && <th>Assigned To</th>}
                  <th>Priority</th>
                  <th>Deadline</th>
                  <th>Status</th>
                  <th style={{ width: '100px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((task) => (
                  <tr key={task.id}>
                    <td style={{ fontWeight: 500 }}>{task.title}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                        <Building2 size={14} />
                        {(task.company as unknown as Company)?.company_name || '—'}
                      </div>
                    </td>
                    {isAdmin(user) && (
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {(task.assignee as unknown as User)?.username || '—'}
                      </td>
                    )}
                    <td>{getPriorityBadge(task.priority)}</td>
                    <td>
                      {task.deadline ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                          <Calendar size={13} /> {new Date(task.deadline).toLocaleDateString()}
                        </div>
                      ) : '—'}
                    </td>
                    <td>
                      <select
                        className="select"
                        value={task.status}
                        onChange={(e) => updateStatus(task.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={!isAdmin(user) && task.assigned_to !== user?.id}
                        style={{
                          padding: '4px 28px 4px 8px',
                          fontSize: '12px',
                          width: 'auto',
                          minWidth: '140px',
                          borderRadius: '8px',
                          fontWeight: 500,
                        }}
                      >
                        <option value="Yet to Start">Yet to Start</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Waiting for Documents">Waiting for Documents</option>
                        <option value="Xero Access Required">Xero Access Required</option>
                        <option value="IRD Number Required">IRD Number Required</option>
                        <option value="Queries Sent">Queries Sent</option>
                        <option value="Sent for Review 1">Sent for Review 1</option>
                        <option value="Sent for Review 2">Sent for Review 2</option>
                        <option value="Sent for Review 3">Sent for Review 3</option>
                        <option value="Completed">Completed</option>
                        {!['Yet to Start', 'In Progress', 'Waiting for Documents', 'Xero Access Required',
                          'IRD Number Required', 'Queries Sent', 'Sent for Review 1', 'Sent for Review 2',
                          'Sent for Review 3', 'Completed'].includes(task.status) && (
                          <option value={task.status}>{task.status}</option>
                        )}
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => openMessageModal(task)} style={{
                          background: task.admin_note ? 'var(--accent-light)' : 'var(--bg-tertiary)',
                          border: 'none', borderRadius: '8px',
                          padding: '6px', cursor: 'pointer', 
                          color: task.admin_note ? 'var(--accent)' : 'var(--text-secondary)',
                          position: 'relative'
                        }} title={isAdmin(user) ? "Send/Edit Message" : "View Message"}>
                          <MessageCircle size={14} />
                          {task.admin_note && (
                            <span style={{
                              position: 'absolute', top: '-2px', right: '-2px',
                              width: '8px', height: '8px', borderRadius: '50%', background: 'var(--danger)'
                            }} />
                          )}
                        </button>
                        {isAdmin(user) && (
                          <>
                            <button onClick={() => editTask(task)} style={{
                              background: 'var(--bg-tertiary)', border: 'none', borderRadius: '8px',
                              padding: '6px', cursor: 'pointer', color: 'var(--text-secondary)',
                            }} title="Edit Task">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => deleteTask(task.id)} style={{
                              background: '#fff0f0', border: 'none', borderRadius: '8px',
                              padding: '6px', cursor: 'pointer', color: 'var(--danger)',
                            }} title="Delete Task">
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Task Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 24px 0' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 600 }}>
                {editingTaskId ? 'Edit Task' : 'Create Task'}
              </h2>
              <button onClick={resetForm} style={{
                background: 'var(--bg-tertiary)', border: 'none', borderRadius: '50%',
                width: '32px', height: '32px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer',
              }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={saveTask} style={{ padding: '24px' }}>
              <div style={{ marginBottom: '14px' }}>
                <label className="label">Task Title *</label>
                <input className="input" type="text" placeholder="Enter task title"
                  value={taskTitle} onChange={e => setTaskTitle(e.target.value)} required autoFocus />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label className="label">Company *</label>
                <select className="select" value={taskCompany} onChange={e => setTaskCompany(e.target.value)} required>
                  <option value="">Select company</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.company_name}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label className="label">Assign To</label>
                <select className="select" value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)}>
                  <option value="">Unassigned</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>{s.username} ({s.role})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label className="label">Status</label>
                  <input className="input" type="text" value={taskStatus} onChange={e => setTaskStatus(e.target.value)} list="status-options" />
                  <datalist id="status-options">
                    <option value="Yet to Start" />
                    <option value="In Progress" />
                    <option value="Waiting for Documents" />
                    <option value="Xero Access Required" />
                    <option value="IRD Number Required" />
                    <option value="Queries Sent" />
                    <option value="Completed" />
                    <option value="Sent for Review 1" />
                    <option value="Sent for Review 2" />
                    <option value="Sent for Review 3" />
                  </datalist>
                </div>
                <div>
                  <label className="label">Priority</label>
                  <select className="select" value={taskPriority} onChange={e => setTaskPriority(e.target.value)}>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label className="label">Deadline</label>
                <input className="input" type="date" value={taskDeadline} onChange={e => setTaskDeadline(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingTask}>
                  {savingTask ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={16} />}
                  {editingTaskId ? 'Update Task' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Message Modal */}
      {showMessageModal && (
        <div className="modal-overlay" onClick={() => setShowMessageModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 24px 0' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageCircle size={20} color="var(--accent)" />
                Task Message
              </h2>
              <button onClick={() => setShowMessageModal(false)} style={{
                background: 'var(--bg-tertiary)', border: 'none', borderRadius: '50%',
                width: '32px', height: '32px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer',
              }}>
                <X size={16} />
              </button>
            </div>
            {isAdmin(user) ? (
              <form onSubmit={saveMessage} style={{ padding: '24px' }}>
                <div style={{ marginBottom: '20px' }}>
                  <label className="label">Message to {terms.staffSingular}</label>
                  <textarea className="input" placeholder={`Enter private message/notes for the assigned ${terms.staffSingular.toLowerCase()}...`}
                    value={messageContent} onChange={e => setMessageContent(e.target.value)} rows={5} style={{ resize: 'vertical' }} autoFocus />
                  <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                    This message is only visible to you and the assigned {terms.staffSingular.toLowerCase()}.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowMessageModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={savingMessage}>
                    {savingMessage ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : 'Save Message'}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ padding: '24px' }}>
                {messageContent ? (
                  <div style={{
                    padding: '16px',
                    background: 'var(--bg-secondary)',
                    borderRadius: '12px',
                    border: '1px solid var(--border-light)',
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap'
                  }}>
                    {messageContent}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-tertiary)' }}>
                    No messages from admin yet.
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowMessageModal(false)}>Close</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
