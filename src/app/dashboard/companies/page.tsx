'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, isAdmin, getDataCountry } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { User, Company } from '@/lib/supabase';
import {
  Plus,
  Search,
  Building2,
  ArrowRight,
  X,
  Loader2,
  AlertCircle,
  Briefcase,
  Users,
  ListTodo,
  Calendar,
  Clock,
  CheckCircle2,
} from 'lucide-react';

interface CompanyWithMeta extends Company {
  taskCount?: number;
  activeTaskCount?: number;
  staffCount?: number;
  staffNames?: string[];
  userHasAssignedTask?: boolean;
}

export default function CompaniesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [staffList, setStaffList] = useState<User[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<{ id: string; role: string; username: string }[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formName, setFormName] = useState('');
  const [formJob, setFormJob] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formStatus, setFormStatus] = useState('Yet to Start');
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const { user: u } = getSession();
    if (!u) { router.push('/'); return; }
    setUser(u);
    loadData();
  }, [router]);

  async function loadData() {
    setLoading(true);
    const dataCountry = getDataCountry();

    let companiesQuery = supabase.from('companies').select('*').order('created_at', { ascending: false });
    if (dataCountry) companiesQuery = companiesQuery.eq('country', dataCountry);

    let staffQuery = supabase.from('users').select('*').neq('role', 'admin');
    if (dataCountry) staffQuery = staffQuery.eq('country', dataCountry);

    const [companiesRes, staffRes, tasksRes, companyStaffRes] = await Promise.all([
      companiesQuery,
      staffQuery,
      supabase.from('tasks').select('company_id, status, assigned_to'),
      supabase.from('company_staff').select('company_id, user:users(username)'),
    ]);

    const rawCompanies = companiesRes.data || [];
    const tasks = tasksRes.data || [];
    const companyStaff = companyStaffRes.data || [];

    const enriched: CompanyWithMeta[] = rawCompanies.map(c => {
      const compTasks = tasks.filter(t => t.company_id === c.id);
      const compStaff = companyStaff.filter(cs => cs.company_id === c.id);
      const staffNames = compStaff.map(cs => (cs.user as any)?.username).filter(Boolean);
      const { user: currentUser } = getSession();
      return {
        ...c,
        taskCount: compTasks.length,
        activeTaskCount: compTasks.filter(t => !t.status.toLowerCase().includes('completed')).length,
        staffCount: compStaff.length,
        staffNames: staffNames as string[],
        userHasAssignedTask: compTasks.some(t => t.assigned_to === currentUser?.id),
      };
    });

    setCompanies(enriched);
    setStaffList(staffRes.data || []);
    setLoading(false);
  }

  function resetForm() {
    setFormName('');
    setFormJob('');
    setFormNotes('');
    setFormStartDate('');
    setFormDueDate('');
    setFormStatus('Yet to Start');
    setSelectedStaff([]);
    setShowModal(false);
  }

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);
    const { country } = getSession();

    const { data: newCompany } = await supabase.from('companies').insert({
      company_name: formName.trim(),
      job: formJob.trim() || null,
      notes: formNotes.trim(),
      start_date: formStartDate || null,
      due_date: formDueDate || null,
      status: formStatus,
      country: country || '',
    }).select().single();

    if (newCompany && selectedStaff.length > 0) {
      const staffInserts = selectedStaff.map(s => ({
        company_id: newCompany.id,
        user_id: s.id,
        role: s.role
      }));
      await supabase.from('company_staff').insert(staffInserts);
    }

    resetForm();
    setSaving(false);
    loadData();
  }

  function handleStaffSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const staffId = e.target.value;
    if (!staffId) return;
    const staffMember = staffList.find(s => s.id === staffId);
    if (staffMember && !selectedStaff.some(s => s.id === staffId)) {
      setSelectedStaff([...selectedStaff, { id: staffId, username: staffMember.username, role: 'Accountant' }]);
    }
    e.target.value = '';
  }

  function updateStaffRole(id: string, role: string) {
    setSelectedStaff(selectedStaff.map(s => s.id === id ? { ...s, role } : s));
  }

  function removeStaff(id: string) {
    setSelectedStaff(selectedStaff.filter(s => s.id !== id));
  }

  const getCompanyStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    let badgeClass = 'badge-pending';
    if (s.includes('completed') || s.includes('done')) badgeClass = 'badge-completed';
    else if (s.includes('progress') || s.includes('review') || s.includes('active') || s.includes('working')) badgeClass = 'badge-in-progress';
    return <span className={`badge ${badgeClass}`}>{status}</span>;
  };

  async function updateCompanyStatusDirectly(companyId: string, newStatus: string) {
    setCompanies(companies.map(c => c.id === companyId ? { ...c, status: newStatus } : c));
    await supabase.from('companies').update({ status: newStatus }).eq('id', companyId);
    loadData();
  }

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date() ;
  };

  const filtered = companies.filter(c => {
    const matchesSearch = c.company_name.toLowerCase().includes(search.toLowerCase()) ||
      (c.job && c.job.toLowerCase().includes(search.toLowerCase()));
    if (!matchesSearch) return false;
    if (filterStatus === 'all') return true;
    const s = (c.status || '').toLowerCase();
    if (filterStatus === 'active') return !s.includes('completed') && !s.includes('done');
    if (filterStatus === 'completed') return s.includes('completed') || s.includes('done');
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div className="animate-fadeIn" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div>
          <h1 style={{
            fontSize: '24px', fontWeight: 700,
            color: 'var(--text-primary)', letterSpacing: '-0.02em',
          }}>
            Companies
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {companies.length} total companies
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {isAdmin(user) && (
            <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
              <Plus size={16} /> Add Company
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="animate-fadeIn" style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '180px', maxWidth: '300px' }}>
          <Search size={16} style={{
            position: 'absolute', left: '12px', top: '50%',
            transform: 'translateY(-50%)', color: 'var(--text-tertiary)',
          }} />
          <input
            className="input"
            type="text"
            placeholder="Search companies or jobs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
        </div>
        <div className="tab-group">
          {['all', 'active', 'completed'].map(tab => (
            <button
              key={tab}
              className={`tab-btn ${filterStatus === tab ? 'active' : ''}`}
              onClick={() => setFilterStatus(tab)}
              style={{ textTransform: 'capitalize' }}
            >
              {tab === 'all' ? 'All' : tab === 'active' ? 'Active' : 'Done'}
            </button>
          ))}
        </div>
      </div>

      {/* Companies List — Full Detail Cards */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: '120px', borderRadius: '16px' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card animate-fadeIn" style={{ padding: '64px 24px', textAlign: 'center' }}>
          <AlertCircle size={40} style={{ margin: '0 auto 16px', color: 'var(--text-tertiary)', opacity: 0.5 }} />
          <p style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-secondary)' }}>
            {search ? 'No companies match your search' : 'No companies yet'}
          </p>
          {isAdmin(user) && !search && (
            <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => { resetForm(); setShowModal(true); }}>
              <Plus size={16} /> Create Your First Company
            </button>
          )}
        </div>
      ) : (
        <div className="stagger-children" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map((company) => {
            const overdue = isOverdue(company.due_date) && !(company.status || '').toLowerCase().includes('completed');

            return (
              <div
                key={company.id}
                className="card"
                style={{
                  padding: '18px 20px',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  borderLeft: overdue ? '3px solid var(--danger)' : company.status?.toLowerCase().includes('completed') ? '3px solid var(--success)' : '3px solid var(--accent)',
                }}
                onClick={() => router.push(`/dashboard/companies/${company.id}`)}
              >
                {/* Row 1: Name + Status */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '10px',
                  flexWrap: 'wrap',
                }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #e8f4fd, #d4ecfb)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Building2 size={18} color="var(--accent)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {company.company_name}
                    </h3>
                  </div>
                  {company.status && (() => {
                    if (!isAdmin(user)) return getCompanyStatusBadge(company.status);
                    
                    return (
                      <div onClick={(e) => e.stopPropagation()}>
                        <select
                          className="select"
                          value={company.status || 'Yet to Start'}
                          onChange={(e) => updateCompanyStatusDirectly(company.id, e.target.value)}
                          style={{
                            padding: '4px 24px 4px 10px',
                            fontSize: '12px',
                            width: 'auto',
                            borderRadius: '8px',
                            fontWeight: 600,
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border-light)'
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
                      </div>
                    );
                  })()}
                  <ArrowRight size={16} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
                </div>

                {/* Row 2: Metadata grid */}
                <div style={{
                  display: 'flex',
                  gap: '16px',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  paddingLeft: '50px',
                }}>
                  {/* Job */}
                  {company.job && (
                    <span className="job-tag">
                      <Briefcase size={10} />
                      {company.job}
                    </span>
                  )}

                  {/* Start Date */}
                  {company.start_date && (
                    <span style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      fontWeight: 500,
                    }}>
                      <Calendar size={12} color="var(--success)" />
                      Start: {new Date(company.start_date).toLocaleDateString()}
                    </span>
                  )}

                  {/* Due Date */}
                  {company.due_date && (
                    <span style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      color: overdue ? 'var(--danger)' : 'var(--text-secondary)',
                      fontWeight: overdue ? 600 : 500,
                    }}>
                      <Clock size={12} color={overdue ? 'var(--danger)' : 'var(--warning)'} />
                      Due: {new Date(company.due_date).toLocaleDateString()}
                      {overdue && ' (Overdue)'}
                    </span>
                  )}

                  {/* Divider */}
                  {(company.job || company.start_date || company.due_date) && (company.taskCount! > 0 || company.staffCount! > 0) && (
                    <span style={{ width: '1px', height: '14px', background: 'var(--border-light)' }} />
                  )}

                  {/* Tasks */}
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    color: 'var(--text-tertiary)',
                    fontWeight: 500,
                  }}>
                    <ListTodo size={12} />
                    {company.activeTaskCount || 0} active / {company.taskCount || 0} tasks
                  </span>

                  {/* Staff */}
                  {company.staffCount! > 0 && (
                    <span style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      color: 'var(--text-tertiary)',
                      fontWeight: 500,
                    }}>
                      <Users size={12} />
                      {company.staffNames?.join(', ')}
                    </span>
                  )}
                </div>

                {/* Row 3: Notes (if any) */}
                {company.notes && (
                  <p style={{
                    fontSize: '12px',
                    color: 'var(--text-tertiary)',
                    lineHeight: 1.4,
                    marginTop: '8px',
                    paddingLeft: '50px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {company.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Company Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 24px 0',
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Add Company</h2>
              <button onClick={resetForm} style={{
                background: 'var(--bg-tertiary)', border: 'none', borderRadius: '50%',
                width: '32px', height: '32px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer',
              }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={createCompany} style={{ padding: '24px' }}>
              <div style={{ marginBottom: '14px' }}>
                <label className="label">Company Name *</label>
                <input className="input" type="text" placeholder="Enter company name"
                  value={formName} onChange={e => setFormName(e.target.value)} required autoFocus />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="label">Job</label>
                <input className="input" type="text" placeholder="e.g. Bookkeeping, Tax Return..."
                  value={formJob} onChange={e => setFormJob(e.target.value)} list="job-suggestions" />
                <datalist id="job-suggestions">
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
                  <input className="input" type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)} />
                </div>
                <div>
                  <label className="label">Due Date</label>
                  <input className="input" type="date" value={formDueDate} onChange={e => setFormDueDate(e.target.value)} />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="label">Status</label>
                <input className="input" type="text" value={formStatus} onChange={e => setFormStatus(e.target.value)} list="company-status-options" />
                <datalist id="company-status-options">
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
                <textarea className="input" placeholder="Optional notes..." value={formNotes}
                  onChange={e => setFormNotes(e.target.value)} rows={2} style={{ resize: 'vertical' }} />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label className="label">Assign Staff</label>
                <select className="select" onChange={handleStaffSelect} defaultValue="" style={{ marginBottom: '10px' }}>
                  <option value="" disabled>Select a staff member...</option>
                  {staffList.filter(s => !selectedStaff.some(sel => sel.id === s.id)).map(s => (
                    <option key={s.id} value={s.id}>{s.username}</option>
                  ))}
                </select>
                {selectedStaff.length > 0 && (
                  <div style={{
                    border: '1px solid var(--border-light)', borderRadius: '8px', padding: '10px',
                    display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-secondary)',
                  }}>
                    {selectedStaff.map(staff => (
                      <div key={staff.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                        background: 'var(--bg-primary)', padding: '8px 12px', borderRadius: '8px',
                        border: '1px solid var(--border-light)',
                      }}>
                        <span style={{ fontSize: '14px', fontWeight: 500 }}>{staff.username}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <select className="select" value={staff.role} onChange={e => updateStaffRole(staff.id, e.target.value)}
                            style={{ padding: '4px 28px 4px 8px', fontSize: '13px', width: 'auto' }}>
                            <option value="Accountant">Accountant</option>
                            <option value="Secretary">Secretary</option>
                          </select>
                          <button type="button" onClick={() => removeStaff(staff.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={16} />}
                  Create Company
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
