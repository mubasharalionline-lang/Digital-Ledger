'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSession, isAdmin, getDataCountry } from '@/lib/auth';
import { Plus, Trash2, Edit2, Loader2, Save, X, ToggleLeft, ToggleRight } from 'lucide-react';

export default function EditsPage() {
  const [activeTab, setActiveTab] = useState<'statuses' | 'roles' | 'auditors'>('statuses');
  const [loading, setLoading] = useState(true);
  
  const [statuses, setStatuses] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [auditors, setAuditors] = useState<any[]>([]);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  
  const router = useRouter();

  useEffect(() => {
    const { user } = getSession();
    if (!user || !isAdmin(user)) {
      router.push('/dashboard');
      return;
    }
    loadData();
  }, [router]);

  async function loadData() {
    setLoading(true);
    const country = getDataCountry();
    
    try {
      let statusQuery = supabase.from('statuses').select('*').order('created_at', { ascending: true });
      let rolesQuery = supabase.from('roles').select('*').order('created_at', { ascending: true });
      let auditorsQuery = supabase.from('auditors').select('*').order('created_at', { ascending: true });
      
      if (country) {
        statusQuery = statusQuery.eq('country', country);
        rolesQuery = rolesQuery.eq('country', country);
        auditorsQuery = auditorsQuery.eq('country', country);
      }
      
      const [statusRes, rolesRes, auditorsRes] = await Promise.all([statusQuery, rolesQuery, auditorsQuery]);
      
      if (!statusRes.error) setStatuses(statusRes.data || []);
      if (!rolesRes.error) setRoles(rolesRes.data || []);
      if (!auditorsRes.error) setAuditors(auditorsRes.data || []);
    } catch (e) {
      console.log('Error loading data, tables might not exist yet.');
    }
    
    setLoading(false);
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    const country = getDataCountry();
    const table = activeTab === 'statuses' ? 'statuses' : activeTab === 'roles' ? 'roles' : 'auditors';
    
    const insertData: any = {
      name: newName.trim(),
      country: country || null
    };
    // For statuses, default to active
    if (activeTab === 'statuses') {
      insertData.active = true;
    }
    
    const { error } = await supabase.from(table).insert(insertData);
    
    if (error) {
      alert('Error creating: ' + error.message);
    } else {
      invalidateCache();
      setNewName('');
      setIsAdding(false);
      loadData();
    }
  }

  async function handleSaveEdit() {
    if (!editName.trim() || !editingId) return;
    const table = activeTab === 'statuses' ? 'statuses' : activeTab === 'roles' ? 'roles' : 'auditors';
    
    const { error } = await supabase.from(table).update({
      name: editName.trim()
    }).eq('id', editingId);
    
    if (error) {
      alert('Error updating: ' + error.message);
    } else {
      invalidateCache();
      setEditingId(null);
      setEditName('');
      loadData();
    }
  }

  async function handleToggleActive(id: string, currentActive: boolean) {
    const { error } = await supabase.from('statuses').update({
      active: !currentActive
    }).eq('id', id);
    
    if (error) {
      alert('Error toggling status: ' + error.message);
    } else {
      invalidateCache();
      loadData();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    const table = activeTab === 'statuses' ? 'statuses' : activeTab === 'roles' ? 'roles' : 'auditors';
    
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) alert('Error deleting: ' + error.message);
    else {
      invalidateCache();
      loadData();
    }
  }

  function invalidateCache() {
    sessionStorage.removeItem('tasks_data_time');
    sessionStorage.removeItem('dashboard_data_time_v2');
  }

  const activeData = activeTab === 'statuses' ? statuses : activeTab === 'roles' ? roles : auditors;

  return (
    <div className="animate-fadeIn">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Edits
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Manage dynamic statuses and roles for your dashboard.
        </p>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-secondary)' }}>
          <button
            onClick={() => { setActiveTab('statuses'); setIsAdding(false); setEditingId(null); }}
            style={{
              padding: '16px 24px',
              border: 'none',
              background: activeTab === 'statuses' ? 'var(--bg-primary)' : 'transparent',
              borderBottom: activeTab === 'statuses' ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === 'statuses' ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'statuses' ? 600 : 500,
              fontSize: '15px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Status Management
          </button>
          <button
            onClick={() => { setActiveTab('roles'); setIsAdding(false); setEditingId(null); }}
            style={{
              padding: '16px 24px',
              border: 'none',
              background: activeTab === 'roles' ? 'var(--bg-primary)' : 'transparent',
              borderBottom: activeTab === 'roles' ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === 'roles' ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'roles' ? 600 : 500,
              fontSize: '15px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Role Management
          </button>
          <button
            onClick={() => { setActiveTab('auditors'); setIsAdding(false); setEditingId(null); }}
            style={{
              padding: '16px 24px',
              border: 'none',
              background: activeTab === 'auditors' ? 'var(--bg-primary)' : 'transparent',
              borderBottom: activeTab === 'auditors' ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === 'auditors' ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'auditors' ? 600 : 500,
              fontSize: '15px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Auditor Management
          </button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Header & Add Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {activeTab === 'statuses' ? 'Statuses' : activeTab === 'roles' ? 'Roles' : 'Auditors'}
              {activeTab === 'statuses' && (
                <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: '8px' }}>
                  ({statuses.filter(s => s.active !== false).length} active / {statuses.length} total)
                </span>
              )}
            </h2>
            {!isAdding && (
              <button className="btn btn-primary" onClick={() => setIsAdding(true)}>
                <Plus size={16} /> Add {activeTab === 'statuses' ? 'Status' : activeTab === 'roles' ? 'Role' : 'Auditor'}
              </button>
            )}
          </div>

          {/* Add Form */}
          {isAdding && (
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '12px', alignItems: 'center' }}>
              <input
                className="input"
                autoFocus
                placeholder={`Enter new ${activeTab === 'statuses' ? 'status' : activeTab === 'roles' ? 'role' : 'auditor'} name...`}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                style={{ flex: 1, margin: 0 }}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
              <button className="btn btn-primary" onClick={handleAdd} disabled={!newName.trim()}>
                Save
              </button>
              <button className="btn btn-secondary" onClick={() => { setIsAdding(false); setNewName(''); }}>
                Cancel
              </button>
            </div>
          )}

          {/* List */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <Loader2 size={24} className="spin" color="var(--accent)" />
            </div>
          ) : activeData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
              No {activeTab === 'statuses' ? 'statuses' : activeTab === 'roles' ? 'roles' : 'auditors'} found. Click &quot;Add&quot; to create one.
              <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--danger)' }}>
                Note: You may need to run the database SQL script if you see this right after the feature was added.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {activeData.map((item) => {
                const isActive = item.active !== false; // default to true if column doesn't exist yet
                const isStatus = activeTab === 'statuses';
                
                return (
                <div key={item.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: isStatus && !isActive ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                  border: `1px solid ${isStatus && !isActive ? 'var(--border-light)' : 'var(--border-light)'}`,
                  borderRadius: '8px',
                  opacity: isStatus && !isActive ? 0.6 : 1,
                  transition: 'all 0.2s ease'
                }}>
                  {editingId === item.id ? (
                    <div style={{ display: 'flex', gap: '10px', flex: 1, alignItems: 'center', marginRight: '16px' }}>
                      <input
                        className="input"
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        style={{ flex: 1, margin: 0, padding: '6px 12px' }}
                        onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                      />
                      <button onClick={handleSaveEdit} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }} title="Save">
                        <Save size={18} />
                      </button>
                      <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }} title="Cancel">
                        <X size={18} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ fontWeight: 500, color: isStatus && !isActive ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
                          {item.name}
                        </div>
                        {isStatus && (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '10px',
                            background: isActive ? '#ECFDF5' : '#FEF2F2',
                            color: isActive ? '#059669' : '#DC2626',
                            border: `1px solid ${isActive ? '#A7F3D0' : '#FECACA'}`,
                          }}>
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        {/* Active/Deactivate toggle for statuses only */}
                        {isStatus && (
                          <button
                            onClick={() => handleToggleActive(item.id, isActive)}
                            style={{ 
                              background: 'none', border: 'none', 
                              color: isActive ? '#059669' : '#9CA3AF', 
                              cursor: 'pointer',
                              transition: 'color 0.2s'
                            }}
                            title={isActive ? 'Deactivate' : 'Activate'}
                          >
                            {isActive ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                          </button>
                        )}
                        <button
                          onClick={() => { setEditingId(item.id); setEditName(item.name); setIsAdding(false); }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )})}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
