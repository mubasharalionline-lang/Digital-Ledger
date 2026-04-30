'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { User, Company, Task } from '@/lib/supabase';
import {
  ArrowLeft,
  Building2,
  Plus,
  X,
  Loader2,
  Save,
  StickyNote,
  ListTodo,
  MessageSquare,
  FileCheck,
  Mail,
  Award,
  Pencil,
  Trash2,
  Calendar,
} from 'lucide-react';

export default function CompanyDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [companyStaff, setCompanyStaff] = useState<any[]>([]);
  const [allStaff, setAllStaff] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // Task modal
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskStatus, setTaskStatus] = useState('Yet to Start');
  const [taskPriority, setTaskPriority] = useState('medium');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [savingTask, setSavingTask] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  // Edit Company modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editJob, setEditJob] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStaffList, setEditStaffList] = useState<{ id: string; role: string; username: string }[]>([]);
  const [savingCompany, setSavingCompany] = useState(false);

  useEffect(() => {
    const { user: u } = getSession();
    if (!u) { router.push('/'); return; }
    setUser(u);
    loadData();
  }, [router, id]);

  async function loadData() {
    setLoading(true);
    const [companyRes, tasksRes, staffRes, allStaffRes] = await Promise.all([
      supabase.from('companies').select('*').eq('id', id).single(),
      supabase.from('tasks')
        .select('*, assignee:users!tasks_assigned_to_fkey(username)')
        .eq('company_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('company_staff').select('*, user:users(id, username)').eq('company_id', id),
      supabase.from('users').select('*').eq('role', 'staff'),
    ]);
    setCompany(companyRes.data);
    setNotes(companyRes.data?.notes || '');
    setTasks(tasksRes.data || []);
    setCompanyStaff(staffRes.data || []);
    setAllStaff(allStaffRes.data || []);
    setLoading(false);
  }

  async function saveNotes() {
    setSavingNotes(true);
    await supabase.from('companies').update({ notes }).eq('id', id);
    setEditingNotes(false);
    setSavingNotes(false);
  }

  async function deleteCompany() {
    if (!confirm('Are you sure you want to delete this company? All associated tasks and staff assignments will be deleted.')) return;
    await supabase.from('companies').delete().eq('id', id);
    router.push('/dashboard/companies');
  }

  function openEditModal() {
    if (!company) return;
    setEditName(company.company_name);
    setEditJob(company.job || '');
    setEditNotes(company.notes || '');
    setEditStaffList(companyStaff.map(cs => ({
      id: cs.user_id,
      role: cs.role,
      username: cs.user?.username || ''
    })));
    setShowEditModal(true);
  }

  async function saveCompanyEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim()) return;
    setSavingCompany(true);

    await supabase.from('companies').update({
      company_name: editName.trim(),
      job: editJob.trim(),
      notes: editNotes.trim(),
    }).eq('id', id);

    // Delete old staff links
    await supabase.from('company_staff').delete().eq('company_id', id);

    // Insert new staff links
    if (editStaffList.length > 0) {
      const staffInserts = editStaffList.map(s => ({
        company_id: id as string,
        user_id: s.id,
        role: s.role
      }));
      await supabase.from('company_staff').insert(staffInserts);
    }

    setSavingCompany(false);
    setShowEditModal(false);
    loadData();
  }

  function handleStaffSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const staffId = e.target.value;
    if (!staffId) return;
    const staffMember = allStaff.find(s => s.id === staffId);
    if (staffMember && !editStaffList.some(s => s.id === staffId)) {
      setEditStaffList([...editStaffList, { id: staffId, username: staffMember.username, role: 'Accountant' }]);
    }
    e.target.value = '';
  }

  function updateStaffRole(staffId: string, role: string) {
    setEditStaffList(editStaffList.map(s => s.id === staffId ? { ...s, role } : s));
  }

  function removeStaff(staffId: string) {
    setEditStaffList(editStaffList.filter(s => s.id !== staffId));
  }

  async function saveTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setSavingTask(true);

    const payload = {
      title: taskTitle.trim(),
      company_id: id as string,
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

    resetTaskForm();
    setSavingTask(false);
    loadData();
  }

  function resetTaskForm() {
    setTaskTitle('');
    setTaskAssignee('');
    setTaskStatus('Yet to Start');
    setTaskPriority('medium');
    setTaskDeadline('');
    setEditingTaskId(null);
    setShowTaskModal(false);
  }

  function editTask(task: Task) {
    setTaskTitle(task.title);
    setTaskAssignee(task.assigned_to || '');
    setTaskStatus(task.status);
    setTaskPriority(task.priority);
    setTaskDeadline(task.deadline || '');
    setEditingTaskId(task.id);
    setShowTaskModal(true);
  }

  async function deleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return;
    await supabase.from('tasks').delete().eq('id', taskId);
    loadData();
  }

  async function updateTaskStatus(taskId: string, status: string) {
    await supabase.from('tasks').update({ status }).eq('id', taskId);
    loadData();
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

  const generators = [
    { name: 'WhatsApp Generator', icon: <MessageSquare size={22} />, color: '#25d366', bg: '#e8faf0' },
    { name: 'Confirmation Generator', icon: <FileCheck size={22} />, color: '#5856d6', bg: '#ededfa' },
    { name: 'Letter Generator', icon: <Mail size={22} />, color: '#0071e3', bg: '#e8f4fd' },
    { name: 'Net Worth Certificate', icon: <Award size={22} />, color: '#ff9f0a', bg: '#fff5e5' },
  ];

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ height: '24px', width: '100px', marginBottom: '24px' }} />
        <div className="skeleton" style={{ height: '200px', borderRadius: '16px', marginBottom: '24px' }} />
        <div className="skeleton" style={{ height: '300px', borderRadius: '16px' }} />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
        <p>Company not found</p>
        <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => router.push('/dashboard/companies')}>
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Back */}
      <button
        className="animate-fadeIn"
        onClick={() => router.push('/dashboard/companies')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '14px',
          color: 'var(--accent)',
          fontWeight: 500,
          marginBottom: '20px',
          fontFamily: 'inherit',
        }}
      >
        <ArrowLeft size={16} />
        Back to Companies
      </button>

      {/* Company Header */}
      <div className="card animate-fadeIn" style={{
        padding: '28px',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #0071e3, #0077ed)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Building2 size={24} color="white" />
        </div>
        <div>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
          }}>
            {company.company_name}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
            Created {new Date(company.created_at).toLocaleDateString()}
          </p>
        </div>
        {isAdmin(user) && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button
              onClick={openEditModal}
              className="btn btn-secondary"
              style={{ padding: '8px 16px', fontSize: '14px', gap: '8px' }}
            >
              <Pencil size={14} />
              Edit
            </button>
            <button
              onClick={deleteCompany}
              className="btn btn-danger"
              style={{ padding: '8px 16px', fontSize: '14px', gap: '8px', background: '#fff0f0', color: 'var(--danger)', border: 'none' }}
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 340px',
        gap: '24px',
      }}>
        {/* Left column */}
        <div>
          {/* Tasks */}
          <div className="card animate-slideUp" style={{ overflow: 'hidden', marginBottom: '24px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-light)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ListTodo size={18} color="var(--accent)" />
                <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Tasks</h2>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '8px',
                  background: 'var(--bg-tertiary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}>
                  {tasks.length}
                </span>
              </div>
              {isAdmin(user) && (
                <button className="btn btn-primary" style={{ padding: '8px 14px', fontSize: '13px' }}
                  onClick={() => { resetTaskForm(); setShowTaskModal(true); }}>
                  <Plus size={14} /> Add Task
                </button>
              )}
            </div>

            {tasks.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                No tasks yet
              </div>
            ) : (
              <div>
                {tasks.map((task) => (
                  <div key={task.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '16px 24px',
                    borderBottom: '1px solid var(--border-light)',
                    transition: 'var(--transition)',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                        {task.title}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {getPriorityBadge(task.priority)}
                        {getStatusBadge(task.status)}
                        {task.deadline && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                            <Calendar size={12} /> {new Date(task.deadline).toLocaleDateString()}
                          </span>
                        )}
                        {(task.assignee as unknown as User)?.username && (
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            → {(task.assignee as unknown as User).username}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Staff can update status */}
                    {!isAdmin(user) && task.assigned_to === user?.id && (
                      <input
                        className="input"
                        type="text"
                        value={task.status}
                        onChange={e => updateTaskStatus(task.id, e.target.value)}
                        list="status-options"
                        style={{ width: '140px', fontSize: '13px', padding: '6px 10px' }}
                      />
                    )}

                    {/* Admin actions */}
                    {isAdmin(user) && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => editTask(task)}
                          style={{
                            background: 'var(--bg-tertiary)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '6px',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => deleteTask(task.id)}
                          style={{
                            background: '#fff0f0',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '6px',
                            cursor: 'pointer',
                            color: 'var(--danger)',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div>
          {/* Notes */}
          <div className="card animate-slideUp" style={{ padding: '20px', marginBottom: '24px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <StickyNote size={16} color="var(--warning)" />
                <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Quick Notes</h3>
              </div>
              {isAdmin(user) && !editingNotes && (
                <button
                  onClick={() => setEditingNotes(true)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    fontFamily: 'inherit',
                  }}
                >
                  Edit
                </button>
              )}
            </div>

            {editingNotes ? (
              <div>
                <textarea
                  className="input"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={4}
                  style={{ resize: 'vertical', marginBottom: '10px' }}
                  placeholder="Add notes about this company..."
                />
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}
                    onClick={() => { setEditingNotes(false); setNotes(company.notes || ''); }}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '13px' }}
                    onClick={saveNotes} disabled={savingNotes}>
                    {savingNotes ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <p style={{
                fontSize: '14px',
                color: notes ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}>
                {notes || 'No notes added yet.'}
              </p>
            )}
          </div>

          {/* Generators */}
          <div className="card animate-slideUp" style={{ padding: '20px' }}>
            <h3 style={{
              fontSize: '15px',
              fontWeight: 600,
              marginBottom: '14px',
              color: 'var(--text-primary)',
            }}>
              Generators
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {generators.map((gen, i) => (
                <div
                  key={i}
                  style={{
                    padding: '16px 14px',
                    borderRadius: '14px',
                    background: gen.bg,
                    textAlign: 'center',
                    opacity: 0.7,
                    cursor: 'not-allowed',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '8px',
                    color: gen.color,
                  }}>
                    {gen.icon}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: gen.color,
                    lineHeight: 1.3,
                  }}>
                    {gen.name}
                  </div>
                  <div style={{
                    fontSize: '10px',
                    color: 'var(--text-tertiary)',
                    marginTop: '4px',
                  }}>
                    Coming Soon
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Task Modal */}
      {showTaskModal && (
        <div className="modal-overlay" onClick={resetTaskForm}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '24px 24px 0',
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: 600 }}>
                {editingTaskId ? 'Edit Task' : 'Add Task'}
              </h2>
              <button onClick={resetTaskForm} style={{
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
                <label className="label">Assign To</label>
                <select className="select" value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)}>
                  <option value="">Unassigned</option>
                  {companyStaff.map(s => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.user?.username} ({s.role})
                    </option>
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
                <button type="button" className="btn btn-secondary" onClick={resetTaskForm}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingTask}>
                  {savingTask ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={16} />}
                  {editingTaskId ? 'Update Task' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Company Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 24px 0' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Edit Company</h2>
              <button onClick={() => setShowEditModal(false)} style={{
                background: 'var(--bg-tertiary)', border: 'none', borderRadius: '50%',
                width: '32px', height: '32px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer',
              }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={saveCompanyEdit} style={{ padding: '24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label className="label">Company Name *</label>
                <input className="input" type="text" placeholder="Enter company name"
                  value={editName} onChange={e => setEditName(e.target.value)} required autoFocus />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label className="label">Job</label>
                <input className="input" type="text" placeholder="Enter or select job type"
                  value={editJob} onChange={e => setEditJob(e.target.value)} list="edit-job-suggestions" />
                <datalist id="edit-job-suggestions">
                  <option value="Bookkeeping" />
                  <option value="Financial Accounts & P&L" />
                  <option value="Financials" />
                  <option value="Financials & Returns" />
                  <option value="Financials & Tax" />
                  <option value="GST Return" />
                  <option value="Rental" />
                  <option value="Rentals & Returns" />
                  <option value="Tax Return" />
                </datalist>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label className="label">Quick Notes</label>
                <textarea className="input" placeholder="Optional notes"
                  value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2} style={{ resize: 'vertical' }} />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label className="label">Assign Staff</label>
                <select className="select" onChange={handleStaffSelect} defaultValue="" style={{ marginBottom: '12px' }}>
                  <option value="" disabled>Select a staff member...</option>
                  {allStaff.filter(s => !editStaffList.some(sel => sel.id === s.id)).map(s => (
                    <option key={s.id} value={s.id}>{s.username}</option>
                  ))}
                </select>

                {editStaffList.length > 0 && (
                  <div style={{ 
                    border: '1px solid var(--border-light)', borderRadius: '8px', padding: '12px',
                    display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--bg-secondary)'
                  }}>
                    {editStaffList.map(staff => (
                      <div key={staff.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                        background: 'var(--bg-primary)', padding: '8px 12px', borderRadius: '6px',
                        border: '1px solid var(--border-light)'
                      }}>
                        <span style={{ fontSize: '14px', fontWeight: 500 }}>{staff.username}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <select className="select" value={staff.role} onChange={(e) => updateStaffRole(staff.id, e.target.value)}
                            style={{ padding: '4px 8px', fontSize: '13px', width: 'auto' }}>
                            <option value="Accountant">Accountant</option>
                            <option value="Secretary">Secretary</option>
                          </select>
                          <button type="button" onClick={() => removeStaff(staff.id)} style={{
                            background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px'
                          }}>
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingCompany}>
                  {savingCompany ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
