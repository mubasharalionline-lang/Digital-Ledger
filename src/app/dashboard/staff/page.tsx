'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, isAdmin, getDataCountry } from '@/lib/auth';
import { getTerminology } from '@/lib/terminology';
import { supabase } from '@/lib/supabase';
import type { User } from '@/lib/supabase';
import {
  Plus,
  X,
  Loader2,
  Users,
  Shield,
  UserCheck,
  Trash2,
  AlertCircle,
  Edit2,
  Link2,
  Search,
  LayoutGrid,
  List as ListIcon,
  Briefcase,
  CheckCircle2,
  Building2,
  Activity,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Calendar,
  Lock,
  User as UserIcon,
  Clock,
  Filter,
} from 'lucide-react';
import { InvitePartnerModal, InviteManagementPanel } from '@/components/InvitePartner';

export default function StaffPage() {
  const [user, setUser] = useState<User | null>(null);
  const [staffList, setStaffList] = useState<(User & { tasks: any[] })[]>([]);
  const [dynamicRoles, setDynamicRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const terms = getTerminology();
  const dataCountry = getDataCountry();

  // Filters & Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [activeView, setActiveView] = useState<'staff' | 'invites'>('staff');

  // Task Preview Modal state
  const [previewMember, setPreviewMember] = useState<(User & { tasks: any[] }) | null>(null);

  // Modal state (Add / Edit User)
  const [showModal, setShowModal] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('Accountant');
  
  // Permissions state
  const [canUpdateStatus, setCanUpdateStatus] = useState(true);
  const [canViewCompanies, setCanViewCompanies] = useState(false);
  const [auditorAccess, setAuditorAccess] = useState<string[]>([]);
  const [allAuditors, setAllAuditors] = useState<any[]>([]);
  const [showAuditorList, setShowAuditorList] = useState(false);
  const [auditorSearch, setAuditorSearch] = useState('');
  
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Invite state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteKey, setInviteKey] = useState(0);

  useEffect(() => {
    const { user: u } = getSession();
    if (!u || !isAdmin(u)) {
      router.push('/dashboard');
      return;
    }
    setUser(u);
    loadStaff();
  }, [router]);

  async function loadStaff() {
    setLoading(true);
    const country = getDataCountry();
    let usersQuery = supabase.from('users').select('id, username, role, country, permissions, created_at').order('created_at', { ascending: false });
    if (country) usersQuery = usersQuery.eq('country', country);

    let tasksQuery = supabase.from('tasks').select('id, title, company_id, assigned_to, assigned_partners, status, priority, deadline, country, is_daily, company:companies(company_name)');
    if (country) tasksQuery = tasksQuery.eq('country', country);

    const [usersRes, tasksRes, rolesRes, auditorsRes] = await Promise.all([
      usersQuery,
      tasksQuery,
      country 
        ? supabase.from('roles').select('name').eq('country', country) 
        : supabase.from('roles').select('name'),
      country
        ? supabase.from('auditors').select('id, name, country').eq('country', country).order('name')
        : supabase.from('auditors').select('id, name, country').order('name')
    ]);

    const users = usersRes.data || [];
    const tasks = tasksRes.data || [];
    const dbRoles = rolesRes.data?.map(r => r.name) || [];
    setAllAuditors(auditorsRes.data || []);
    
    // Fallback to defaults if table is empty or missing
    if (dbRoles.length > 0) {
      setDynamicRoles([...new Set(dbRoles)] as string[]);
      if (!dbRoles.includes(formRole) && dbRoles.length > 0) {
        setFormRole(dbRoles[0]);
      }
    } else {
      setDynamicRoles(['Accountant', 'Secretary', 'Admin', 'CA']);
    }

    const withTasks = users.map(u => ({
      ...u,
      tasks: tasks.filter(t => {
        const isAssigned = t.assigned_to === u.id || (t.assigned_partners && t.assigned_partners.includes(u.id));
        const isNotCompleted = !t.status.toLowerCase().includes('completed');
        return isAssigned && isNotCompleted;
      }),
    }));

    setStaffList(withTasks);
    setLoading(false);
  }

  // Filtered members list
  const filteredStaff = useMemo(() => {
    return staffList.filter(member => {
      const matchesSearch = !searchQuery.trim() || 
        member.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.role.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesRole = roleFilter === 'all' || 
        member.role.toLowerCase() === roleFilter.toLowerCase();

      return matchesSearch && matchesRole;
    });
  }, [staffList, searchQuery, roleFilter]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = staffList.length;
    const totalTasks = staffList.reduce((acc, m) => acc + m.tasks.length, 0);
    const adminCount = staffList.filter(m => m.role?.toLowerCase() === 'admin').length;
    const partnerCount = total - adminCount;
    return { total, totalTasks, adminCount, partnerCount };
  }, [staffList]);

  async function saveUser(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!formUsername.trim() || (!formPassword.trim() && !editUserId)) return;
    setSaving(true);

    const country = getDataCountry();
    let existingQuery = supabase
      .from('users')
      .select('id')
      .eq('username', formUsername.trim());

    if (country) {
      existingQuery = existingQuery.eq('country', country);
    }

    if (editUserId) {
      existingQuery = existingQuery.neq('id', editUserId);
    }

    const { data: existing } = await existingQuery.single();

    if (existing) {
      setFormError('Username already exists in this workspace');
      setSaving(false);
      return;
    }

    const { country: sessionCountry } = getSession();
    
    if (editUserId) {
      const updates: any = {
        username: formUsername.trim(),
        role: formRole,
        permissions: {
          can_update_status: canUpdateStatus,
          can_view_companies: canViewCompanies,
          auditor_access: auditorAccess,
        }
      };
      if (formPassword.trim()) {
        updates.password = formPassword.trim();
      }
      const { error } = await supabase.from('users').update(updates).eq('id', editUserId);
      if (error) {
        setFormError(error.message || 'Error updating user');
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from('users').insert({
        username: formUsername.trim(),
        password: formPassword.trim(),
        role: formRole,
        country: sessionCountry || country || null,
        permissions: {
          can_update_status: canUpdateStatus,
          can_view_companies: canViewCompanies,
          auditor_access: auditorAccess,
        }
      });
      if (error) {
        setFormError(error.message || 'Error creating user');
        setSaving(false);
        return;
      }
    }

    setFormUsername('');
    setFormPassword('');
    setFormRole('Accountant');
    setEditUserId(null);
    setShowModal(false);
    setSaving(false);
    
    sessionStorage.removeItem('dashboard_data_time_v2');
    sessionStorage.removeItem('tasks_data_time');
    
    loadStaff();
  }

  function openCreateModal() {
    setEditUserId(null);
    setFormUsername('');
    setFormPassword('');
    setFormRole('Accountant');
    setCanUpdateStatus(true);
    setCanViewCompanies(false);
    setAuditorAccess([]);
    setShowAuditorList(false);
    setAuditorSearch('');
    setFormError('');
    setShowModal(true);
  }

  function openEditModal(member: User) {
    setEditUserId(member.id);
    setFormUsername(member.username);
    setFormPassword('');
    setFormRole(member.role);
    setCanUpdateStatus(member.permissions?.can_update_status ?? true);
    setCanViewCompanies(member.permissions?.can_view_companies ?? false);
    setAuditorAccess(member.permissions?.auditor_access || []);
    setShowAuditorList((member.permissions?.auditor_access || []).length > 0);
    setAuditorSearch('');
    setFormError('');
    setShowModal(true);
  }

  async function deleteUser(userId: string) {
    if (userId === user?.id) {
      alert('You cannot delete yourself.');
      return;
    }
    if (!confirm('Are you sure you want to remove this partner? All active assignments will be unlinked.')) return;

    await supabase
      .from('partner_invites')
      .update({ status: 'pending', used_by: null, used_at: null })
      .eq('used_by', userId);

    await supabase.from('task_messages').delete().eq('sender_id', userId);

    const { error: delError } = await supabase.from('users').delete().eq('id', userId);
    
    if (delError) {
      alert('Failed to delete user: ' + delError.message);
      return;
    }

    sessionStorage.removeItem('dashboard_data_time_v2');
    sessionStorage.removeItem('tasks_data_time');
    
    setInviteKey(k => k + 1);
    loadStaff();
  }

  // Unique avatar color generator
  const getAvatarGradient = (name: string, index: number) => {
    const gradients = [
      'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
      'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
      'linear-gradient(135deg, #10b981 0%, #047857 100%)',
      'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
      'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
      'linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)',
    ];
    return gradients[index % gradients.length];
  };

  const getRoleBadgeStyle = (roleName: string) => {
    const isAdm = roleName?.toLowerCase() === 'admin';
    if (isAdm) {
      return {
        bg: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
        color: '#6d28d9',
        border: '1px solid #ddd6fe',
        icon: <Shield size={12} color="#7c3aed" />
      };
    }
    return {
      bg: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
      color: '#1d4ed8',
      border: '1px solid #bfdbfe',
      icon: <UserCheck size={12} color="#2563eb" />
    };
  };

  return (
    <div style={{ paddingBottom: '40px' }}>
      {/* ─── Top Header Section ─── */}
      <div className="animate-fadeIn" style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{
              fontSize: '26px', fontWeight: 800,
              color: 'var(--text-primary)', letterSpacing: '-0.03em',
              margin: 0,
            }}>
              {terms.staffPageTitle}
            </h1>
            {dataCountry && (
              <span style={{
                fontSize: '11px', fontWeight: 700, color: '#3b82f6',
                background: '#eff6ff', border: '1px solid #dbeafe',
                padding: '2px 8px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.04em'
              }}>
                {dataCountry}
              </span>
            )}
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Manage team members, roles, access permissions, and monitor active task assignments.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowInviteModal(true)}
            style={{
              padding: '9px 16px',
              borderRadius: '10px',
              border: '1px solid #bfdbfe',
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              color: '#1d4ed8',
              fontSize: '13px',
              fontWeight: 650,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 3px rgba(37,99,235,0.08)'
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 3px 8px rgba(37,99,235,0.15)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(37,99,235,0.08)'; }}
          >
            <Link2 size={15} /> Invite Partner
          </button>
          
          <button
            onClick={openCreateModal}
            style={{
              padding: '9px 18px',
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 650,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
              boxShadow: '0 2px 6px rgba(37,99,235,0.25)'
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(37,99,235,0.35)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(37,99,235,0.25)'; }}
          >
            <Plus size={15} /> {terms.addStaff}
          </button>
        </div>
      </div>

      {/* ─── Executive KPI Stat Cards ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '14px',
        marginBottom: '24px',
      }}>
        {/* Metric 1: Total Partners */}
        <div style={{
          background: '#ffffff',
          borderRadius: '14px',
          padding: '16px 18px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
        }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <Users size={20} color="#2563eb" />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 650, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Partners
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2, marginTop: '2px' }}>
              {loading ? '—' : metrics.total}
            </div>
          </div>
        </div>

        {/* Metric 2: Active Workload */}
        <div style={{
          background: '#ffffff',
          borderRadius: '14px',
          padding: '16px 18px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
        }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
            border: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <Briefcase size={20} color="#d97706" />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 650, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active Tasks
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2, marginTop: '2px' }}>
              {loading ? '—' : metrics.totalTasks}
            </div>
          </div>
        </div>

        {/* Metric 3: Admins */}
        <div style={{
          background: '#ffffff',
          borderRadius: '14px',
          padding: '16px 18px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
        }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
            border: '1px solid #ddd6fe', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <Shield size={20} color="#7c3aed" />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 650, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Admin Users
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2, marginTop: '2px' }}>
              {loading ? '—' : metrics.adminCount}
            </div>
          </div>
        </div>

        {/* Metric 4: Roles Diversity */}
        <div style={{
          background: '#ffffff',
          borderRadius: '14px',
          padding: '16px 18px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
        }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
            border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <UserCheck size={20} color="#059669" />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 650, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Configured Roles
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2, marginTop: '2px' }}>
              {loading ? '—' : dynamicRoles.length}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Tabs & Filters Controls Strip ─── */}
      <div style={{
        background: '#ffffff',
        padding: '14px 18px',
        borderRadius: '14px',
        border: '1px solid #e2e8f0',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        {/* Left: View Tabs (Team Members / Invites) */}
        <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '10px' }}>
          <button
            onClick={() => setActiveView('staff')}
            style={{
              padding: '7px 16px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '12.5px',
              fontWeight: 650,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              background: activeView === 'staff' ? '#ffffff' : 'transparent',
              color: activeView === 'staff' ? '#0f172a' : '#64748b',
              boxShadow: activeView === 'staff' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Users size={14} /> Team Members ({staffList.length})
          </button>
          
          <button
            onClick={() => setActiveView('invites')}
            style={{
              padding: '7px 16px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '12.5px',
              fontWeight: 650,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              background: activeView === 'invites' ? '#ffffff' : 'transparent',
              color: activeView === 'invites' ? '#0f172a' : '#64748b',
              boxShadow: activeView === 'invites' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Link2 size={14} /> Invites
          </button>
        </div>

        {/* Right: Search, Filter & Grid/Table Switcher (When in Team Members tab) */}
        {activeView === 'staff' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: '220px', maxWidth: '300px', flex: 1 }}>
              <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name or role..."
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 32px',
                  fontSize: '12.5px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  outline: 'none',
                  background: '#f8fafc',
                  color: '#0f172a',
                  transition: 'all 0.15s'
                }}
                onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.background = '#ffffff'; }}
                onBlur={e => { e.target.style.borderColor = '#cbd5e1'; e.target.style.background = '#f8fafc'; }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Role Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: '#334155',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="all">All Roles</option>
                {dynamicRoles.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* View Mode Toggle */}
            <div style={{ display: 'flex', gap: '2px', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
              <button
                onClick={() => setViewMode('table')}
                style={{
                  padding: '5px 9px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === 'table' ? '#ffffff' : 'transparent',
                  color: viewMode === 'table' ? '#2563eb' : '#64748b',
                  boxShadow: viewMode === 'table' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="Table View"
              >
                <ListIcon size={15} />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                style={{
                  padding: '5px 9px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === 'cards' ? '#ffffff' : 'transparent',
                  color: viewMode === 'cards' ? '#2563eb' : '#64748b',
                  boxShadow: viewMode === 'cards' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="Cards View"
              >
                <LayoutGrid size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Content Views ─── */}

      {/* Invites Management Tab */}
      {activeView === 'invites' && (
        <div className="card animate-fadeIn" style={{ padding: '24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Partner Invitations</h2>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0, marginTop: '2px' }}>Generate secure tokenized invite links for partner onboarding.</p>
            </div>
            <button
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: '#2563eb',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onClick={() => setShowInviteModal(true)}
            >
              <Plus size={14} /> New Invite
            </button>
          </div>
          <InviteManagementPanel key={inviteKey} />
        </div>
      )}

      {/* Team Members Tab */}
      {activeView === 'staff' && (
        <>
          {loading ? (
            /* Loading State */
            <div style={{ display: 'grid', gap: '12px' }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ height: '70px', borderRadius: '12px', background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
              ))}
            </div>
          ) : filteredStaff.length === 0 ? (
            /* Empty State */
            <div style={{
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              padding: '60px 24px',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Users size={28} color="#3b82f6" />
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                {searchQuery || roleFilter !== 'all' ? 'No matching team members found' : terms.noUsersYet}
              </h3>
              <p style={{ fontSize: '13.5px', color: '#64748b', maxWidth: '400px', margin: '6px auto 20px' }}>
                {searchQuery || roleFilter !== 'all'
                  ? 'Try adjusting your search terms or clearing role filters.'
                  : 'Add your first team member or generate an invite link to collaborate.'}
              </p>
              {searchQuery || roleFilter !== 'all' ? (
                <button
                  onClick={() => { setSearchQuery(''); setRoleFilter('all'); }}
                  style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                >
                  Clear Filters
                </button>
              ) : (
                <button
                  onClick={openCreateModal}
                  style={{ padding: '9px 20px', borderRadius: '10px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 650, fontSize: '13.5px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={16} /> {terms.addFirstUser}
                </button>
              )}
            </div>
          ) : viewMode === 'table' ? (
            /* ─── Mode 1: Table View (Enterprise Aligned Grid) ─── */
            <div style={{
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
            }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 18px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Partner Name
                      </th>
                      <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Role
                      </th>
                      <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Permissions
                      </th>
                      <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Auditor Access
                      </th>
                      <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Workload
                      </th>
                      <th style={{ padding: '12px 18px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStaff.map((member, index) => {
                      const roleStyle = getRoleBadgeStyle(member.role);
                      const isCurrentUser = member.id === user?.id;
                      const hasAuditors = (member.permissions?.auditor_access || []).length > 0;
                      const auditorCount = (member.permissions?.auditor_access || []).length;

                      return (
                        <tr
                          key={member.id}
                          style={{
                            borderBottom: index === filteredStaff.length - 1 ? 'none' : '1px solid #f1f5f9',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#ffffff'; }}
                        >
                          {/* Column 1: Partner Avatar + Name */}
                          <td style={{ padding: '14px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '10px',
                                background: getAvatarGradient(member.username, index),
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '15px',
                                fontWeight: 700,
                                flexShrink: 0,
                                boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                              }}>
                                {member.username.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                                    {member.username}
                                  </span>
                                  {isCurrentUser && (
                                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '1px 6px', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
                                      You
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>
                                  Joined {member.created_at ? new Date(member.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Active'}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Column 2: Role Badge */}
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 9px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 650,
                              background: roleStyle.bg,
                              color: roleStyle.color,
                              border: roleStyle.border
                            }}>
                              {roleStyle.icon}
                              {member.role?.charAt(0).toUpperCase() + member.role?.slice(1)}
                            </span>
                          </td>

                          {/* Column 3: Permissions Chips */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {member.role?.toLowerCase() === 'admin' ? (
                                <span style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 600, background: '#f5f3ff', padding: '2px 7px', borderRadius: '5px', border: '1px solid #ddd6fe' }}>
                                  Full Permissions
                                </span>
                              ) : (
                                <>
                                  <span
                                    title={member.permissions?.can_update_status ? "Can update task status: Enabled" : "Can update task status: Disabled"}
                                    style={{
                                      fontSize: '10.5px', fontWeight: 600,
                                      color: member.permissions?.can_update_status !== false ? '#059669' : '#94a3b8',
                                      background: member.permissions?.can_update_status !== false ? '#ecfdf5' : '#f8fafc',
                                      padding: '2px 6px', borderRadius: '5px',
                                      border: member.permissions?.can_update_status !== false ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                                      display: 'inline-flex', alignItems: 'center', gap: '3px'
                                    }}
                                  >
                                    <Activity size={10} /> Status Update
                                  </span>

                                  <span
                                    title={member.permissions?.can_view_companies ? "Can view assigned companies: Enabled" : "Can view assigned companies: Disabled"}
                                    style={{
                                      fontSize: '10.5px', fontWeight: 600,
                                      color: member.permissions?.can_view_companies ? '#2563eb' : '#94a3b8',
                                      background: member.permissions?.can_view_companies ? '#eff6ff' : '#f8fafc',
                                      padding: '2px 6px', borderRadius: '5px',
                                      border: member.permissions?.can_view_companies ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                                      display: 'inline-flex', alignItems: 'center', gap: '3px'
                                    }}
                                  >
                                    <Building2 size={10} /> Companies
                                  </span>
                                </>
                              )}
                            </div>
                          </td>

                          {/* Column 4: Auditor Access */}
                          <td style={{ padding: '14px 16px' }}>
                            {hasAuditors ? (
                              <span style={{
                                fontSize: '11px', fontWeight: 650, color: '#0f172a',
                                background: '#f1f5f9', border: '1px solid #cbd5e1',
                                padding: '2px 8px', borderRadius: '5px', display: 'inline-flex', alignItems: 'center', gap: '4px'
                              }}>
                                🛡️ {auditorCount} Auditor{auditorCount === 1 ? '' : 's'}
                              </span>
                            ) : (
                              <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>None</span>
                            )}
                          </td>

                          {/* Column 5: Workload / Active Tasks */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: member.tasks.length > 0 ? '#eff6ff' : '#f8fafc',
                                color: member.tasks.length > 0 ? '#1d4ed8' : '#94a3b8',
                                border: member.tasks.length > 0 ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                              }}>
                                {member.tasks.length} active
                              </span>
                              {member.tasks.length > 0 && (
                                <button
                                  onClick={() => setPreviewMember(member)}
                                  style={{
                                    background: 'none', border: 'none', color: '#2563eb',
                                    fontSize: '11.5px', fontWeight: 600, cursor: 'pointer',
                                    padding: '2px 4px', display: 'inline-flex', alignItems: 'center', gap: '2px'
                                  }}
                                  title="View assigned tasks"
                                >
                                  View <ChevronRight size={12} />
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Column 6: Actions */}
                          <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => openEditModal(member)}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  border: '1px solid #cbd5e1',
                                  background: '#ffffff',
                                  color: '#334155',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  transition: 'all 0.15s'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#94a3b8'; e.currentTarget.style.background = '#f8fafc'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#ffffff'; }}
                                title="Edit user details and permissions"
                              >
                                <Edit2 size={12} /> Edit
                              </button>

                              {!isCurrentUser && (
                                <button
                                  onClick={() => deleteUser(member.id)}
                                  style={{
                                    padding: '5px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #fecaca',
                                    background: '#fef2f2',
                                    color: '#dc2626',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    transition: 'all 0.15s'
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = '#fef2f2'; }}
                                  title="Remove partner"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* ─── Mode 2: Clean Cards Grid (Uniform & Balanced) ─── */
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '16px',
            }}>
              {filteredStaff.map((member, index) => {
                const roleStyle = getRoleBadgeStyle(member.role);
                const isCurrentUser = member.id === user?.id;
                const auditorCount = (member.permissions?.auditor_access || []).length;

                return (
                  <div
                    key={member.id}
                    style={{
                      background: '#ffffff',
                      borderRadius: '16px',
                      border: '1px solid #e2e8f0',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                      transition: 'all 0.2s ease',
                      position: 'relative',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.06)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02)'; }}
                  >
                    <div>
                      {/* Card Header: Avatar, Name, Role, Actions */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '12px',
                            background: getAvatarGradient(member.username, index),
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '17px',
                            fontWeight: 700,
                            flexShrink: 0,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                          }}>
                            {member.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                                {member.username}
                              </span>
                              {isCurrentUser && (
                                <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '1px 5px', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
                                  You
                                </span>
                              )}
                            </div>
                            <div style={{ marginTop: '3px' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 7px',
                                borderRadius: '5px',
                                fontSize: '11px',
                                fontWeight: 650,
                                background: roleStyle.bg,
                                color: roleStyle.color,
                                border: roleStyle.border
                              }}>
                                {roleStyle.icon}
                                {member.role?.charAt(0).toUpperCase() + member.role?.slice(1)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Card Top Actions */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={() => openEditModal(member)}
                            style={{
                              padding: '5px',
                              borderRadius: '6px',
                              border: '1px solid #e2e8f0',
                              background: '#f8fafc',
                              color: '#64748b',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            title="Edit"
                          >
                            <Edit2 size={12} />
                          </button>
                          {!isCurrentUser && (
                            <button
                              onClick={() => deleteUser(member.id)}
                              style={{
                                padding: '5px',
                                borderRadius: '6px',
                                border: '1px solid #fee2e2',
                                background: '#fef2f2',
                                color: '#ef4444',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Permissions Tags */}
                      <div style={{ marginBottom: '14px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                          Permissions
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {member.role?.toLowerCase() === 'admin' ? (
                            <span style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 600, background: '#f5f3ff', padding: '2px 7px', borderRadius: '5px', border: '1px solid #ddd6fe' }}>
                              Full Admin Access
                            </span>
                          ) : (
                            <>
                              <span style={{
                                fontSize: '10.5px', fontWeight: 600,
                                color: member.permissions?.can_update_status !== false ? '#059669' : '#94a3b8',
                                background: member.permissions?.can_update_status !== false ? '#ecfdf5' : '#f8fafc',
                                padding: '2px 6px', borderRadius: '5px',
                                border: member.permissions?.can_update_status !== false ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                                display: 'inline-flex', alignItems: 'center', gap: '3px'
                              }}>
                                <Activity size={10} /> Status Update
                              </span>
                              <span style={{
                                fontSize: '10.5px', fontWeight: 600,
                                color: member.permissions?.can_view_companies ? '#2563eb' : '#94a3b8',
                                background: member.permissions?.can_view_companies ? '#eff6ff' : '#f8fafc',
                                padding: '2px 6px', borderRadius: '5px',
                                border: member.permissions?.can_view_companies ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                                display: 'inline-flex', alignItems: 'center', gap: '3px'
                              }}>
                                <Building2 size={10} /> Companies
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Auditor Access Info */}
                      {auditorCount > 0 && (
                        <div style={{ marginBottom: '14px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 650, color: '#475569', background: '#f8fafc', padding: '2px 7px', borderRadius: '5px', border: '1px solid #e2e8f0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            🛡️ {auditorCount} Auditor Access Link{auditorCount === 1 ? '' : 's'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Card Footer: Tasks Workload Button */}
                    <div style={{
                      paddingTop: '12px',
                      borderTop: '1px solid #f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: member.tasks.length > 0 ? '#1e293b' : '#94a3b8' }}>
                        <strong>{member.tasks.length}</strong> active task{member.tasks.length === 1 ? '' : 's'}
                      </div>
                      {member.tasks.length > 0 ? (
                        <button
                          onClick={() => setPreviewMember(member)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: '1px solid #bfdbfe',
                            background: '#eff6ff',
                            color: '#2563eb',
                            fontSize: '11.5px',
                            fontWeight: 650,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                        >
                          View Tasks <ChevronRight size={12} />
                        </button>
                      ) : (
                        <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>No workload</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ─── Task Preview Modal ─── */}
      {previewMember && (
        <div className="modal-overlay" onClick={() => setPreviewMember(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 60, padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '18px',
            maxWidth: '560px',
            width: '100%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 60px rgba(0,0,0,0.18)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden'
          }} onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 22px',
              borderBottom: '1px solid #f1f5f9',
              background: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '15px'
                }}>
                  {previewMember.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                    Tasks for {previewMember.username}
                  </h3>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0, marginTop: '2px' }}>
                    {previewMember.tasks.length} active assigned task{previewMember.tasks.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPreviewMember(null)}
                style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex', color: '#64748b' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal List */}
            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {previewMember.tasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '13px' }}>
                  No active tasks assigned
                </div>
              ) : (
                previewMember.tasks.map(task => (
                  <div
                    key={task.id}
                    onClick={() => {
                      setPreviewMember(null);
                      if (task.company_id) router.push(`/dashboard/companies/${task.company_id}`);
                    }}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      cursor: task.company_id ? 'pointer' : 'default',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.background = '#eff6ff'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                        {task.title}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 650,
                        padding: '2px 7px',
                        borderRadius: '5px',
                        background: '#dbeafe',
                        color: '#1d4ed8',
                        border: '1px solid #bfdbfe'
                      }}>
                        {task.status}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Building2 size={12} color="#94a3b8" />
                        {(task.company as any)?.company_name || 'No Company'}
                      </span>
                      {task.deadline && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b' }}>
                          <Clock size={12} color="#94a3b8" />
                          Due: {task.deadline}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPreviewMember(null)}
                style={{ padding: '7px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Invite Partner Modal ─── */}
      <InvitePartnerModal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        roles={dynamicRoles}
        auditors={allAuditors}
        onCreated={() => setInviteKey(k => k + 1)}
      />

      {/* ─── Add / Edit User Modal ─── */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 60, padding: '20px'
        }} onClick={() => setShowModal(false)}>
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            maxWidth: '520px',
            width: '100%',
            boxShadow: '0 25px 60px rgba(0,0,0,0.18)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden'
          }} onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  {editUserId ? <Edit2 size={18} /> : <UserIcon size={18} />}
                </div>
                <div>
                  <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                    {editUserId ? 'Edit Partner Details' : 'Add New Partner'}
                  </h2>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0, marginTop: '2px' }}>
                    {editUserId ? 'Update credentials and role permissions' : 'Create direct user login credentials'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex', color: '#64748b' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={saveUser} style={{ padding: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#475569', marginBottom: '5px' }}>
                    Username *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. jsmith"
                    value={formUsername}
                    onChange={e => setFormUsername(e.target.value)}
                    required
                    autoFocus
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: '8px',
                      border: '1.5px solid #cbd5e1', fontSize: '13px', outline: 'none', color: '#0f172a'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#475569', marginBottom: '5px' }}>
                    Role
                  </label>
                  <select
                    value={formRole}
                    onChange={e => setFormRole(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: '8px',
                      border: '1.5px solid #cbd5e1', fontSize: '13px', outline: 'none', color: '#0f172a', background: '#fff', cursor: 'pointer'
                    }}
                  >
                    {dynamicRoles.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#475569', marginBottom: '5px' }}>
                  Password {editUserId ? '(Leave blank to keep unchanged)' : '*'}
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input
                    type="password"
                    placeholder={editUserId ? "Enter new password if changing" : "Create password"}
                    value={formPassword}
                    onChange={e => setFormPassword(e.target.value)}
                    required={!editUserId}
                    style={{
                      width: '100%', padding: '8px 12px 8px 32px', borderRadius: '8px',
                      border: '1.5px solid #cbd5e1', fontSize: '13px', outline: 'none', color: '#0f172a'
                    }}
                  />
                </div>
              </div>

              {/* Permissions Switch Group */}
              <div style={{
                background: '#f8fafc',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                marginBottom: '18px'
              }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
                  Access Permissions
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Permission 1: Status Update */}
                  <label style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', background: '#ffffff', borderRadius: '8px',
                    border: '1px solid #e2e8f0', cursor: 'pointer'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Activity size={14} color="#059669" />
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#0f172a' }}>Update Task Status</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Allow updating task status directly from the board</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={canUpdateStatus}
                      onChange={e => setCanUpdateStatus(e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                  </label>

                  {/* Permission 2: View Companies */}
                  <label style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', background: '#ffffff', borderRadius: '8px',
                    border: '1px solid #e2e8f0', cursor: 'pointer'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Building2 size={14} color="#2563eb" />
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#0f172a' }}>View Assigned Companies</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Access company profile pages for assigned tasks</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={canViewCompanies}
                      onChange={e => setCanViewCompanies(e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                  </label>
                </div>

                {/* Auditor Access Collapsible Selector */}
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                  <div
                    onClick={() => setShowAuditorList(!showAuditorList)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      cursor: 'pointer', padding: '4px 0'
                    }}
                  >
                    <span style={{ fontSize: '12.5px', fontWeight: 650, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🛡️ Auditor Access ({auditorAccess.length} selected)
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#2563eb' }}>
                      {showAuditorList ? 'Hide' : 'Configure'}
                    </span>
                  </div>

                  {showAuditorList && (
                    <div style={{
                      marginTop: '8px',
                      background: '#ffffff',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      padding: '8px',
                      maxHeight: '150px',
                      overflowY: 'auto'
                    }}>
                      {allAuditors.length === 0 ? (
                        <div style={{ padding: '8px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
                          No auditors registered in workspace
                        </div>
                      ) : (
                        allAuditors.map(auditor => {
                          const isSelected = auditorAccess.includes(auditor.id);
                          return (
                            <label
                              key={auditor.id}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '6px 8px', borderRadius: '6px',
                                background: isSelected ? '#eff6ff' : 'transparent',
                                cursor: 'pointer', fontSize: '12.5px',
                                marginBottom: '2px'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={e => {
                                  if (e.target.checked) setAuditorAccess(prev => [...prev, auditor.id]);
                                  else setAuditorAccess(prev => prev.filter(id => id !== auditor.id));
                                }}
                              />
                              <span style={{ fontWeight: isSelected ? 650 : 500, color: isSelected ? '#1d4ed8' : '#334155' }}>
                                {auditor.name}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Error Box */}
              {formError && (
                <div style={{
                  padding: '10px 14px', borderRadius: '8px', background: '#fef2f2',
                  border: '1px solid #fecaca', color: '#dc2626', fontSize: '12.5px',
                  marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px'
                }}>
                  <AlertCircle size={15} color="#dc2626" />
                  {formError}
                </div>
              )}

              {/* Modal Buttons */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1',
                    background: '#f8fafc', color: '#475569', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '8px 18px', borderRadius: '8px', border: 'none',
                    background: '#2563eb', color: '#ffffff', fontSize: '13px', fontWeight: 650,
                    cursor: saving ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
                    opacity: saving ? 0.7 : 1
                  }}
                >
                  {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
                  {editUserId ? 'Save Changes' : 'Create Partner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
