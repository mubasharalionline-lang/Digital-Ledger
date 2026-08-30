'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getSession, isAdmin, getDataCountry } from '@/lib/auth';
import { getTerminology } from '@/lib/terminology';
import { supabase } from '@/lib/supabase';
import type { User, Company, Task } from '@/lib/supabase';
import { formatDate } from '@/lib/dateUtils';
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
  Clock,
  Briefcase,
  MessageCircle,
  FolderOpen,
  ExternalLink,
  Link as LinkIcon,
} from 'lucide-react';

export default function CompanyDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const terms = getTerminology();
  // Partners with can_view_companies get edit access to company details
  const canEditCompany = (u: User | null) => isAdmin(u) || u?.permissions?.can_view_companies === true;
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

  // Message modal state
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageTaskId, setMessageTaskId] = useState<string | null>(null);
  const [messageContent, setMessageContent] = useState('');
  const [savingMessage, setSavingMessage] = useState(false);

  // Edit Company modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editJob, setEditJob] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editStatus, setEditStatus] = useState('Yet to Start');
  const [editStaffList, setEditStaffList] = useState<{ id: string; role: string; username: string }[]>([]);
  const [editGoogleDriveLink, setEditGoogleDriveLink] = useState('');
  const [editCrNumber, setEditCrNumber] = useState('');
  const [editCrLink, setEditCrLink] = useState('');
  const [savingCompany, setSavingCompany] = useState(false);

  useEffect(() => {
    const { user: u } = getSession();
    if (!u) { router.push('/'); return; }
    setUser(u);
    loadData();
  }, [router, id]);

  async function loadData() {
    setLoading(true);
    const dataCountry = getDataCountry();
    let staffQuery = supabase.from('users').select('id, username, role, country, created_at').neq('role', 'admin');
    if (dataCountry) staffQuery = staffQuery.eq('country', dataCountry);

    const companyPromise = (async () => {
      const res = await supabase.from('companies').select('id, company_name, notes, job, start_date, due_date, status, country, google_drive_link, cr_number, cr_link, created_at').eq('id', id).single();
      if (res.error) {
        return supabase.from('companies').select('id, company_name, notes, job, start_date, due_date, status, country, google_drive_link, cr_number, created_at').eq('id', id).single();
      }
      return res;
    })();

    const [companyRes, tasksRes, staffRes, allStaffRes] = await Promise.all([
      companyPromise,
      supabase.from('tasks')
        .select('*, assignee:users!tasks_assigned_to_fkey(username)')
        .eq('company_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('company_staff').select('*, user:users(id, username)').eq('company_id', id),
      staffQuery,
    ]);

    // Enforce country isolation: if the company belongs to another country, redirect.
    if (companyRes.data && dataCountry && companyRes.data.country !== dataCountry) {
      router.push('/dashboard/companies');
      return;
    }

    const { user: currentUser } = getSession();
    const isAdminUser = isAdmin(currentUser);
    const userAuditorAccess: string[] = currentUser?.permissions?.auditor_access || [];
    
    const rawTasks = tasksRes.data || [];
    let filteredTasks = rawTasks;
    let isCompanyAllowed = true;

    if (!isAdminUser && currentUser) {
      const isTaskAllowed = (t: Task) => {
        const activePartnerIds: string[] = [];
        if (Array.isArray(t.assigned_partners)) {
          t.assigned_partners.forEach(id => {
            if (id && !activePartnerIds.includes(id)) activePartnerIds.push(id);
          });
        }
        if (t.assigned_to && !activePartnerIds.includes(t.assigned_to)) {
          activePartnerIds.push(t.assigned_to);
        }
        const isAssigned = activePartnerIds.includes(currentUser.id) || (currentUser.username ? activePartnerIds.includes(currentUser.username) : false);
        const hasAuditorAccess = t.auditor_id ? userAuditorAccess.includes(t.auditor_id) : false;
        return isAssigned || hasAuditorAccess;
      };
      
      filteredTasks = rawTasks.filter(isTaskAllowed);
      
      const canViewCompanies = currentUser?.permissions?.can_view_companies === true;
      // If there are tasks but none are allowed, and user cannot view all companies, block access
      if (!canViewCompanies && rawTasks.length > 0 && filteredTasks.length === 0) {
        isCompanyAllowed = false;
      }
    }

    if (!isCompanyAllowed) {
      router.push('/dashboard/companies');
      return;
    }

    setCompany(companyRes.data);
    setNotes(companyRes.data?.notes || '');
    setTasks(filteredTasks);
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
    setEditStartDate(company.start_date || '');
    setEditDueDate(company.due_date || '');
    setEditStatus(company.status || 'Yet to Start');
    setEditStaffList(companyStaff.map(cs => ({
      id: cs.user_id,
      role: cs.role,
      username: cs.user?.username || ''
    })));
    setEditGoogleDriveLink(company.google_drive_link || '');
    setEditCrNumber(company.cr_number || '');
    setEditCrLink(company.cr_link || '');
    setShowEditModal(true);
  }

  async function saveCompanyEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim()) return;
    setSavingCompany(true);

    // Validate Google Drive link if provided
    if (editGoogleDriveLink && !editGoogleDriveLink.startsWith('https://')) {
      alert('Google Drive link must start with https://'); return;
    }

    let updatePayload: any = {
      company_name: editName.trim(),
      job: editJob.trim() || null,
      notes: editNotes.trim(),
      start_date: editStartDate || null,
      due_date: editDueDate || null,
      status: editStatus,
      google_drive_link: editGoogleDriveLink.trim() || null,
      cr_number: editCrNumber.trim() || null,
      cr_link: editCrLink.trim() || null,
    };

    let { error } = await supabase.from('companies').update(updatePayload).eq('id', id);
    if (error && (error.message?.includes('cr_link') || (error as any).code === 'PGRST204' || error.message?.includes('column'))) {
      delete updatePayload.cr_link;
      await supabase.from('companies').update(updatePayload).eq('id', id);
    }

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
      country: company?.country || getDataCountry() || 'Bahrain',
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
    const sLower = (status || '').toLowerCase();
    const isCompleted = sLower === 'completed' || sLower === 'complete' || sLower === 'closed' || sLower === 'filed' || sLower === 'done' || sLower.includes('complete') || sLower.includes('closed') || sLower.includes('filed');
    const completedAt = isCompleted ? new Date().toISOString() : null;
    const { error } = await supabase.from('tasks').update({ status, completed_at: completedAt }).eq('id', taskId);
    if (error && (error.message?.includes('completed_at') || error.message?.includes('schema cache'))) {
      await supabase.from('tasks').update({ status }).eq('id', taskId);
    }
    loadData();
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
    loadData();
  }

  async function updateCompanyStatusDirectly(newStatus: string) {
    if (!company) return;
    setCompany({ ...company, status: newStatus });
    await supabase.from('companies').update({ status: newStatus }).eq('id', company.id);
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
    { name: 'WhatsApp Generator', icon: <MessageSquare size={22} />, color: '#25d366', bg: '#e8faf0', link: null },
    { name: 'Confirmations Generator', icon: <FileCheck size={22} />, color: '#5856d6', bg: '#ededfa', link: `/dashboard/companies/${id}/confirmations` },
    { name: 'Letter Generator', icon: <Mail size={22} />, color: '#0071e3', bg: '#e8f4fd', link: null },
    { name: 'Net Worth Certificate', icon: <Award size={22} />, color: '#ff9f0a', bg: '#fff5e5', link: `/dashboard/companies/${id}/net-worth` },
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
      <div className="card animate-fadeIn" style={{ padding: '20px', marginBottom: '24px' }}>
        <div className="page-header-row">
          <div style={{
            width: '40px', height: '40px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #0071e3, #0077ed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Building2 size={20} color="white" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.3 }}>
              {company.company_name}
            </h1>
          </div>
          {company.status && (() => {
            if (!canEditCompany(user)) {
              const s = company.status.toLowerCase();
              let cls = 'badge-pending';
              if (s.includes('completed') || s.includes('done')) cls = 'badge-completed';
              else if (s.includes('progress') || s.includes('review') || s.includes('working') || s.includes('active')) cls = 'badge-in-progress';
              return <span className={`badge ${cls}`}>{company.status}</span>;
            }

            return (
              <select
                className="select"
                value={company.status || 'Yet to Start'}
                onChange={(e) => updateCompanyStatusDirectly(e.target.value)}
                style={{
                  padding: '5px 28px 5px 10px',
                  fontSize: '13px',
                  width: 'auto',
                  borderRadius: '8px',
                  fontWeight: 600,
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-light)',
                }}
              >
                <option value="Yet to Start">Yet to Start</option>
                <option value="In Progress">In Progress</option>
                <option value="Working">Working</option>
                <option value="Review">Review</option>
                <option value="Completed">Completed</option>
                {!['Yet to Start', 'In Progress', 'Working', 'Review', 'Completed'].includes(company.status || '') && (
                  <option value={company.status}>{company.status}</option>
                )}
              </select>
            );
          })()}
          {canEditCompany(user) && (
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              {company.google_drive_link && (
                <button
                  onClick={() => window.open(company.google_drive_link!, '_blank', 'noopener,noreferrer')}
                  className="btn btn-secondary"
                  style={{ padding: '7px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  title="Open Google Drive Folder"
                >
                  <FolderOpen size={14} /> Drive
                </button>
              )}
              {company.cr_link && (
                <button
                  onClick={() => {
                    const url = /^https?:\/\//i.test(company.cr_link!) ? company.cr_link! : `https://${company.cr_link!}`;
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '7px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary)' }}
                  title="Open CR Portal / Link"
                >
                  <ExternalLink size={14} /> CR Link
                </button>
              )}
              <button onClick={openEditModal} className="btn btn-secondary" style={{ padding: '7px 12px', fontSize: '13px' }}>
                <Pencil size={14} /> Edit
              </button>
              {isAdmin(user) && (
                <button onClick={deleteCompany} className="btn btn-danger" style={{ padding: '7px 12px', fontSize: '13px' }}>
                  <Trash2 size={14} /> Delete
                </button>
              )}
            </div>
          )}
        </div>
        {/* Detail meta row */}
        <div className="company-meta-row">
          {company.cr_number && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-tertiary)', padding: '2px 10px', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
              📝 CR: {company.cr_number}
            </span>
          )}
          {company.job && (
            <span className="job-tag"><Briefcase size={11} /> {company.job}</span>
          )}
          {company.start_date && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
              <Calendar size={12} color="var(--success)" /> Start: {formatDate(company.start_date)}
            </span>
          )}
          {company.due_date && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 500,
              color: (new Date(company.due_date) < new Date() && !company.status?.toLowerCase().includes('completed')) ? 'var(--danger)' : 'var(--text-secondary)',
            }}>
              <Clock size={12} color={(new Date(company.due_date) < new Date() && !company.status?.toLowerCase().includes('completed')) ? 'var(--danger)' : 'var(--warning)'} />
              Due: {formatDate(company.due_date)}
              {(new Date(company.due_date) < new Date() && !company.status?.toLowerCase().includes('completed')) && ' (Overdue)'}
            </span>
          )}
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            Created {formatDate(company.created_at)}
          </span>
        </div>
      </div>

      <div className="detail-grid">
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
              {canEditCompany(user) && (
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
                        <select
                          className="select"
                          value={task.status}
                          onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                          disabled={!isAdmin(user) && !(user?.permissions?.can_update_status ?? true) && !((user?.permissions?.auditor_access || []).includes(task.auditor_id || '')) && !(task.assigned_partners && task.assigned_partners.includes(user?.id || '')) && task.assigned_to !== user?.id}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            padding: '3px 26px 3px 8px',
                            fontSize: '12px',
                            width: 'auto',
                            minWidth: '130px',
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
                        {task.deadline && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                            <Calendar size={12} /> {formatDate(task.deadline)}
                          </span>
                        )}
                        {(task.assignee as unknown as User)?.username && (
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            → {(task.assignee as unknown as User).username}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => openMessageModal(task)}
                        style={{
                          background: task.admin_note ? 'var(--accent-light)' : 'var(--bg-tertiary)',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '6px',
                          cursor: 'pointer',
                          color: task.admin_note ? 'var(--accent)' : 'var(--text-secondary)',
                          position: 'relative'
                        }}
                        title={isAdmin(user) ? "Send/Edit Message" : "View Message"}
                      >
                        <MessageCircle size={14} />
                        {task.admin_note && (
                          <span style={{
                            position: 'absolute', top: '-2px', right: '-2px',
                            width: '8px', height: '8px', borderRadius: '50%', background: 'var(--danger)'
                          }} />
                        )}
                      </button>
                      
                      {/* Admin actions */}
                      {isAdmin(user) && (
                        <>
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
                        </>
                      )}
                    </div>
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
              {canEditCompany(user) && !editingNotes && (
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
                  onClick={() => { if (gen.link) router.push(gen.link); }}
                  style={{
                    padding: '16px 14px',
                    borderRadius: '14px',
                    background: gen.link ? `linear-gradient(135deg, ${gen.color}, ${gen.color}dd)` : gen.bg,
                    textAlign: 'center',
                    opacity: gen.link ? 1 : 0.6,
                    cursor: gen.link ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s ease',
                    boxShadow: gen.link ? `0 6px 16px ${gen.color}35` : 'none',
                    border: gen.link ? 'none' : `1px solid ${gen.bg}`,
                    transform: gen.link ? 'translateY(-1px)' : 'none',
                  }}
                  onMouseEnter={e => {
                    if (gen.link) {
                      e.currentTarget.style.transform = 'translateY(-3px)';
                      e.currentTarget.style.boxShadow = `0 8px 24px ${gen.color}45`;
                    }
                  }}
                  onMouseLeave={e => {
                    if (gen.link) {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = `0 6px 16px ${gen.color}35`;
                    }
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '8px',
                    color: gen.link ? '#ffffff' : gen.color,
                  }}>
                    {gen.icon}
                  </div>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: gen.link ? '#ffffff' : gen.color,
                    lineHeight: 1.3,
                  }}>
                    {gen.name}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: gen.link ? 'rgba(255,255,255,0.85)' : 'var(--text-tertiary)',
                    marginTop: '4px',
                  }}>
                    {gen.link ? 'Generate Now' : 'Coming Soon'}
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
              <div style={{ marginBottom: '14px' }}>
                <label className="label">Company Name *</label>
                <input className="input" type="text" placeholder="Enter company name"
                  value={editName} onChange={e => setEditName(e.target.value)} required autoFocus />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label className="label">CR Number</label>
                <input className="input" type="text" placeholder="Enter CR number"
                  value={editCrNumber} onChange={e => setEditCrNumber(e.target.value)} />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label className="label">CR Link / URL</label>
                <input className="input" type="url" placeholder="e.g. https://sijilat.bh/..."
                  value={editCrLink} onChange={e => setEditCrLink(e.target.value)} />
              </div>
              <div style={{ marginBottom: '14px' }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label className="label">Start Date</label>
                  <input className="input" type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} />
                </div>
                <div>
                  <label className="label">Due Date</label>
                  <input className="input" type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
                </div>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label className="label">Status</label>
                <input className="input" type="text" value={editStatus} onChange={e => setEditStatus(e.target.value)} list="edit-company-status" />
                <datalist id="edit-company-status">
                  <option value="Yet to Start" />
                  <option value="In Progress" />
                  <option value="Working" />
                  <option value="Waiting for Documents" />
                  <option value="Under Review" />
                  <option value="Completed" />
                </datalist>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label className="label">Notes</label>
                <textarea className="input" placeholder="Optional notes"
                  value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2} style={{ resize: 'vertical' }} />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label className="label">Google Drive Folder Link</label>
                <div style={{ position: 'relative' }}>
                  <LinkIcon size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                  <input
                    className="input"
                    type="url"
                    placeholder="https://drive.google.com/drive/folders/..."
                    value={editGoogleDriveLink}
                    onChange={e => setEditGoogleDriveLink(e.target.value)}
                    style={{ paddingLeft: '36px' }}
                  />
                </div>
                {editGoogleDriveLink && !editGoogleDriveLink.startsWith('https://') && (
                  <span style={{ fontSize: '11px', color: 'var(--danger)', fontWeight: 500, marginTop: '4px', display: 'block' }}>Link must start with https://</span>
                )}
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label className="label">{terms.assignStaff}</label>
                <select className="select" onChange={handleStaffSelect} defaultValue="" style={{ marginBottom: '12px' }}>
                  <option value="" disabled>{terms.selectStaffMember}</option>
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

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .detail-grid {
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 24px;
        }
        @media (max-width: 900px) {
          .detail-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
