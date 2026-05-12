'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSession, isAdmin, getDataCountry } from '@/lib/auth';
import { Plus, Trash2, Edit2, Loader2, Save, X, ToggleLeft, ToggleRight, ChevronDown } from 'lucide-react';

interface TaskTypeRecord { id: string; name: string; active: boolean; }

export default function EditsPage() {
  const [activeTab, setActiveTab] = useState<'statuses' | 'roles' | 'auditors'>('statuses');
  const [loading, setLoading] = useState(true);
  
  const [statuses, setStatuses] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [auditors, setAuditors] = useState<any[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskTypeRecord[]>([]);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editTaskTypeIds, setEditTaskTypeIds] = useState<string[]>([]);
  
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTaskTypeIds, setNewTaskTypeIds] = useState<string[]>([]);
  
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
      let ttQuery = supabase.from('task_types').select('id, name, active').eq('active', true).order('name');
      
      if (country) {
        statusQuery = statusQuery.eq('country', country);
        rolesQuery = rolesQuery.eq('country', country);
        auditorsQuery = auditorsQuery.eq('country', country);
        ttQuery = ttQuery.eq('country', country);
      }
      
      const [statusRes, rolesRes, auditorsRes, ttRes] = await Promise.all([statusQuery, rolesQuery, auditorsQuery, ttQuery]);
      
      if (!statusRes.error) setStatuses(statusRes.data || []);
      if (!rolesRes.error) setRoles(rolesRes.data || []);
      if (!auditorsRes.error) setAuditors(auditorsRes.data || []);
      if (!ttRes.error) setTaskTypes(ttRes.data || []);
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
    // For statuses, default to active and include task type linkage
    if (activeTab === 'statuses') {
      insertData.active = true;
      insertData.task_type_ids = newTaskTypeIds.length > 0 ? newTaskTypeIds : null;
    }
    
    const { error } = await supabase.from(table).insert(insertData);
    
    if (error) {
      alert('Error creating: ' + error.message);
    } else {
      invalidateCache();
      setNewName('');
      setNewTaskTypeIds([]);
      setIsAdding(false);
      loadData();
    }
  }

  async function handleSaveEdit() {
    if (!editName.trim() || !editingId) return;
    const table = activeTab === 'statuses' ? 'statuses' : activeTab === 'roles' ? 'roles' : 'auditors';
    
    const updateData: any = { name: editName.trim() };
    if (activeTab === 'statuses') {
      updateData.task_type_ids = editTaskTypeIds.length > 0 ? editTaskTypeIds : null;
    }

    const { error } = await supabase.from(table).update(updateData).eq('id', editingId);
    
    if (error) {
      alert('Error updating: ' + error.message);
    } else {
      invalidateCache();
      setEditingId(null);
      setEditName('');
      setEditTaskTypeIds([]);
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

  function startEdit(item: any) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditTaskTypeIds(item.task_type_ids || []);
    setIsAdding(false);
  }

  const activeData = activeTab === 'statuses' ? statuses : activeTab === 'roles' ? roles : auditors;

  return (
    <div className="animate-fadeIn">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Edits
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Manage dynamic statuses, roles and auditors for your dashboard.
        </p>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-secondary)' }}>
          {(['statuses', 'roles', 'auditors'] as const).map(tab => (
            <button key={tab}
              onClick={() => { setActiveTab(tab); setIsAdding(false); setEditingId(null); }}
              style={{
                padding: '16px 24px', border: 'none',
                background: activeTab === tab ? 'var(--bg-primary)' : 'transparent',
                borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: activeTab === tab ? 600 : 500,
                fontSize: '15px', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              {tab === 'statuses' ? 'Status Management' : tab === 'roles' ? 'Role Management' : 'Auditor Management'}
            </button>
          ))}
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
              <button className="btn btn-primary" onClick={() => { setIsAdding(true); setNewTaskTypeIds([]); }}>
                <Plus size={16} /> Add {activeTab === 'statuses' ? 'Status' : activeTab === 'roles' ? 'Role' : 'Auditor'}
              </button>
            )}
          </div>

          {/* Add Form */}
          {isAdding && (
            <div style={{ marginBottom: '20px', background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '12px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
                <button className="btn btn-secondary" onClick={() => { setIsAdding(false); setNewName(''); setNewTaskTypeIds([]); }}>
                  Cancel
                </button>
              </div>
              {activeTab === 'statuses' && (
                <div style={{ marginTop: '12px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    Link to Task Types <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(leave empty = applies to all)</span>
                  </label>
                  <TaskTypeMultiSelect
                    taskTypes={taskTypes}
                    selected={newTaskTypeIds}
                    onChange={setNewTaskTypeIds}
                  />
                </div>
              )}
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
                const isActive = item.active !== false;
                const isStatus = activeTab === 'statuses';
                const linkedTTNames = isStatus && item.task_type_ids && item.task_type_ids.length > 0
                  ? item.task_type_ids.map((id: string) => taskTypes.find(t => t.id === id)?.name).filter(Boolean)
                  : [];
                
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
                    <div style={{ flex: 1, marginRight: '16px' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
                        <button onClick={() => { setEditingId(null); setEditTaskTypeIds([]); }} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }} title="Cancel">
                          <X size={18} />
                        </button>
                      </div>
                      {isStatus && (
                        <div style={{ marginTop: '8px' }}>
                          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '4px' }}>
                            Task Types <span style={{ fontWeight: 400 }}>(empty = all)</span>
                          </label>
                          <TaskTypeMultiSelect
                            taskTypes={taskTypes}
                            selected={editTaskTypeIds}
                            onChange={setEditTaskTypeIds}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
                        <div style={{ fontWeight: 500, color: isStatus && !isActive ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
                          {item.name}
                        </div>
                        {isStatus && (
                          <span style={{
                            fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px',
                            background: isActive ? '#ECFDF5' : '#FEF2F2',
                            color: isActive ? '#059669' : '#DC2626',
                            border: `1px solid ${isActive ? '#A7F3D0' : '#FECACA'}`,
                          }}>
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        )}
                        {isStatus && linkedTTNames.length > 0 && (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {linkedTTNames.map((name: string, i: number) => (
                              <span key={i} style={{
                                fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '10px',
                                background: '#EBF5FB', color: '#2980B9', border: '1px solid #AED6F1',
                              }}>
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                        {isStatus && linkedTTNames.length === 0 && (
                          <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                            All types
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0 }}>
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
                          onClick={() => startEdit(item)}
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

// Compact multi-select for linking task types
function TaskTypeMultiSelect({ taskTypes, selected, onChange }: {
  taskTypes: TaskTypeRecord[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(x => x !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const selectedNames = selected.map(id => taskTypes.find(t => t.id === id)?.name).filter(Boolean);

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: '8px 12px', border: '1.5px solid var(--border-light)', borderRadius: '8px',
          background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center',
          gap: '6px', flexWrap: 'wrap', minHeight: '38px', fontSize: '13px',
        }}
      >
        {selectedNames.length === 0 ? (
          <span style={{ color: 'var(--text-tertiary)' }}>All task types (click to link specific types)</span>
        ) : (
          selectedNames.map((name, i) => (
            <span key={i} style={{
              padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
              background: '#EBF5FB', color: '#2980B9', border: '1px solid #AED6F1',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              {name}
              <X size={12} style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); toggle(selected[i]); }} />
            </span>
          ))
        )}
        <ChevronDown size={14} color="var(--text-tertiary)" style={{ marginLeft: 'auto', flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff',
          border: '1px solid var(--border-light)', borderRadius: '8px', marginTop: '4px',
          zIndex: 100, maxHeight: '200px', overflowY: 'auto',
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        }}>
          {taskTypes.length === 0 ? (
            <div style={{ padding: '12px', fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
              No task types found
            </div>
          ) : taskTypes.map(tt => (
            <div key={tt.id}
              onClick={() => toggle(tt.id)}
              style={{
                padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                borderBottom: '1px solid var(--border-light)',
                background: selected.includes(tt.id) ? '#EBF5FB' : 'transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (!selected.includes(tt.id)) e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={e => { if (!selected.includes(tt.id)) e.currentTarget.style.background = 'transparent'; }}
            >
              <input type="checkbox" checked={selected.includes(tt.id)} readOnly style={{ pointerEvents: 'none', accentColor: '#2980B9' }} />
              <span style={{ fontSize: '13px', fontWeight: selected.includes(tt.id) ? 600 : 400, color: 'var(--text-primary)' }}>{tt.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
