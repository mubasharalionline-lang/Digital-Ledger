'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, isAdmin, getDataCountry } from '@/lib/auth';
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
} from 'lucide-react';

export default function StaffPage() {
  const [user, setUser] = useState<User | null>(null);
  const [staffList, setStaffList] = useState<(User & { tasks: any[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('Accountant');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

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
    const dataCountry = getDataCountry();
    let usersQuery = supabase.from('users').select('*').order('created_at', { ascending: false });
    if (dataCountry) usersQuery = usersQuery.eq('country', dataCountry);

    const [usersRes, tasksRes] = await Promise.all([
      usersQuery,
      supabase.from('tasks').select('*, company:companies(company_name)'),
    ]);

    const users = usersRes.data || [];
    const tasks = tasksRes.data || [];

    const withTasks = users.map(u => ({
      ...u,
      tasks: tasks.filter(t => t.assigned_to === u.id && !t.status.toLowerCase().includes('completed')),
    }));

    setStaffList(withTasks);
    setLoading(false);
  }

  async function saveUser(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!formUsername.trim() || (!formPassword.trim() && !editUserId)) return;
    setSaving(true);

    // Check if username already exists for a different user
    let existingQuery = supabase
      .from('users')
      .select('id')
      .eq('username', formUsername.trim());

    if (editUserId) {
      existingQuery = existingQuery.neq('id', editUserId);
    }

    const { data: existing } = await existingQuery.single();

    if (existing) {
      setFormError('Username already exists');
      setSaving(false);
      return;
    }

    const { country } = getSession();
    
    if (editUserId) {
      const updates: any = {
        username: formUsername.trim(),
        role: formRole,
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
        country: country || null,
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
    loadStaff();
  }

  function openCreateModal() {
    setEditUserId(null);
    setFormUsername('');
    setFormPassword('');
    setFormRole('Accountant');
    setFormError('');
    setShowModal(true);
  }

  function openEditModal(member: User) {
    setEditUserId(member.id);
    setFormUsername(member.username);
    setFormPassword(''); // Don't show existing password
    setFormRole(member.role);
    setFormError('');
    setShowModal(true);
  }

  async function deleteUser(userId: string) {
    if (userId === user?.id) {
      alert('You cannot delete yourself.');
      return;
    }
    if (!confirm('Are you sure you want to delete this user?')) return;
    await supabase.from('users').delete().eq('id', userId);
    loadStaff();
  }

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
            Staff Management
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {staffList.length} team members
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal}>
          <Plus size={16} /> Add User
        </button>
      </div>

      {/* Staff Grid */}
      {loading ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px',
        }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton" style={{ height: '140px', borderRadius: '16px' }} />
          ))}
        </div>
      ) : staffList.length === 0 ? (
        <div className="card" style={{ padding: '64px 24px', textAlign: 'center' }}>
          <AlertCircle size={40} style={{ margin: '0 auto 16px', color: 'var(--text-tertiary)', opacity: 0.5 }} />
          <p style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-secondary)' }}>
            No users yet
          </p>
          <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={openCreateModal}>
            <Plus size={16} /> Add First User
          </button>
        </div>
      ) : (
        <div className="stagger-children" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px',
        }}>
          {staffList.map((member, i) => (
            <div key={member.id} className="card" style={{
              padding: '24px',
              position: 'relative',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                marginBottom: '16px',
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#a18cd1'][i % 6]}, ${['#764ba2', '#f5576c', '#00f2fe', '#38f9d7', '#fee140', '#fbc2eb'][i % 6]})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  fontWeight: 600,
                  color: 'white',
                  flexShrink: 0,
                }}>
                  {member.username.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}>
                    {member.username}
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginTop: '4px',
                  }}>
                    {member.role === 'admin' ? (
                      <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#5856d6',
                        background: '#ededfa',
                        padding: '2px 8px',
                        borderRadius: '6px',
                      }}>
                        <Shield size={11} /> Admin
                      </span>
                    ) : (
                      <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'var(--accent)',
                        background: 'var(--accent-light)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                      }}>
                        <UserCheck size={11} /> {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '14px',
                borderTop: '1px solid var(--border-light)',
              }}>
                <div style={{
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                }}>
                  <strong>{member.tasks.length}</strong> tasks assigned
                </div>
                {member.id !== user?.id && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => openEditModal(member)}
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                    >
                      <Edit2 size={12} />
                      Edit
                    </button>
                    <button
                      onClick={() => deleteUser(member.id)}
                      className="btn btn-danger"
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                    >
                      <Trash2 size={12} />
                      Remove
                    </button>
                  </div>
                )}
              </div>

              {member.tasks.length > 0 && (
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>
                    Assigned Tasks
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {member.tasks.map((task) => (
                      <div key={task.id} 
                        onClick={() => router.push(`/dashboard/companies/${task.company_id}`)}
                        className="staff-task-item"
                        style={{
                        background: 'var(--bg-tertiary)',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        border: '1px solid var(--border-light)',
                        cursor: 'pointer',
                      }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                          {task.title}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {(task.company as any)?.company_name || 'No Company'}
                          </span>
                          <span className={`badge ${task.status.toLowerCase().includes('completed') ? 'badge-completed' :
                              task.status.toLowerCase().match(/progress|review|sent|waiting|required/) ? 'badge-in-progress' :
                                'badge-pending'
                            }`} style={{ fontSize: '11px', padding: '2px 6px' }}>
                            {task.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add User Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 24px 0' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 600 }}>{editUserId ? 'Edit User' : 'Add User'}</h2>
              <button onClick={() => setShowModal(false)} style={{
                background: 'var(--bg-tertiary)', border: 'none', borderRadius: '50%',
                width: '32px', height: '32px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer',
              }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={saveUser} style={{ padding: '24px' }}>
              <div style={{ marginBottom: '14px' }}>
                <label className="label">Username *</label>
                <input className="input" type="text" placeholder="Enter username"
                  value={formUsername} onChange={e => setFormUsername(e.target.value)} required autoFocus />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label className="label">Password {editUserId ? '(Leave blank to keep current)' : '*'}</label>
                <input className="input" type="password" placeholder={editUserId ? "Enter new password" : "Enter password"}
                  value={formPassword} onChange={e => setFormPassword(e.target.value)} required={!editUserId} />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label className="label">Role</label>
                <select className="select" value={formRole} onChange={e => setFormRole(e.target.value)}>
                  <option value="Accountant">Accountant</option>
                  <option value="Secretary">Secretary</option>
                  <option value="Admin">Admin</option>
                  <option value="CA">CA</option>
                </select>
              </div>

              {formError && (
                <div className="animate-fadeIn" style={{
                  padding: '10px 14px', borderRadius: '10px', background: '#fff0f0',
                  color: 'var(--danger)', fontSize: '13px', marginBottom: '16px', border: '1px solid #ffd4d4',
                }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={16} />}
                  {editUserId ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .staff-task-item {
          transition: all 0.2s ease;
        }
        .staff-task-item:hover {
          border-color: var(--accent) !important;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
      `}</style>
    </div>
  );
}
