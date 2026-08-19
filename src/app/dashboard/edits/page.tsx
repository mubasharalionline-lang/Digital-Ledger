'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSession, isAdmin, getDataCountry } from '@/lib/auth';
import {
  Plus,
  Trash2,
  Edit2,
  Loader2,
  Save,
  X,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  Search,
  CheckCircle2,
  Shield,
  UserCheck,
  SlidersHorizontal,
  Layers,
  Check,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Filter,
  Activity,
  Briefcase,
  AlertCircle
} from 'lucide-react';

interface TaskTypeRecord { id: string; name: string; active: boolean; }

export default function EditsPage() {
  const [activeTab, setActiveTab] = useState<'statuses' | 'roles' | 'auditors'>('statuses');
  const [loading, setLoading] = useState(true);
  
  const [statuses, setStatuses] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [auditors, setAuditors] = useState<any[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskTypeRecord[]>([]);
  
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editTaskTypeIds, setEditTaskTypeIds] = useState<string[]>([]);
  
  // Add state
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTaskTypeIds, setNewTaskTypeIds] = useState<string[]>([]);
  const [savingAction, setSavingAction] = useState(false);
  
  const router = useRouter();
  const dataCountry = getDataCountry();

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
      let statusQuery = supabase.from('statuses').select('id, name, active, task_type_ids, country, created_at').order('created_at', { ascending: true });
      let rolesQuery = supabase.from('roles').select('id, name, country, created_at').order('created_at', { ascending: true });
      let auditorsQuery = supabase.from('auditors').select('id, name, country, created_at').order('created_at', { ascending: true });
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
    setSavingAction(true);
    const country = getDataCountry();
    const table = activeTab === 'statuses' ? 'statuses' : activeTab === 'roles' ? 'roles' : 'auditors';
    
    const insertData: any = {
      name: newName.trim(),
      country: country || null
    };
    
    if (activeTab === 'statuses') {
      insertData.active = true;
      insertData.task_type_ids = newTaskTypeIds.length > 0 && newTaskTypeIds.length < taskTypes.length ? newTaskTypeIds : null;
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
    setSavingAction(false);
  }

  async function handleSaveEdit() {
    if (!editName.trim() || !editingId) return;
    setSavingAction(true);
    const table = activeTab === 'statuses' ? 'statuses' : activeTab === 'roles' ? 'roles' : 'auditors';
    
    const updateData: any = { name: editName.trim() };
    if (activeTab === 'statuses') {
      updateData.task_type_ids = editTaskTypeIds.length > 0 && editTaskTypeIds.length < taskTypes.length ? editTaskTypeIds : null;
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
    setSavingAction(false);
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
    const ids = (item.task_type_ids || []).map((id: string) => id.trim()).filter(Boolean);
    setEditTaskTypeIds(ids.length > 0 ? ids : taskTypes.map(t => t.id));
    setIsAdding(false);
  }

  // Active collection based on tab & search/status filter
  const filteredData = useMemo(() => {
    let list = activeTab === 'statuses' ? statuses : activeTab === 'roles' ? roles : auditors;
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(item => item.name?.toLowerCase().includes(q));
    }

    if (activeTab === 'statuses' && statusFilter !== 'all') {
      if (statusFilter === 'active') {
        list = list.filter(item => item.active !== false);
      } else {
        list = list.filter(item => item.active === false);
      }
    }

    return list;
  }, [activeTab, statuses, roles, auditors, searchQuery, statusFilter]);

  // Tab counts
  const counts = useMemo(() => ({
    statusesTotal: statuses.length,
    statusesActive: statuses.filter(s => s.active !== false).length,
    rolesTotal: roles.length,
    auditorsTotal: auditors.length,
    taskTypesTotal: taskTypes.length,
  }), [statuses, roles, auditors, taskTypes]);

  return (
    <div className="animate-fadeIn" style={{ paddingBottom: '40px' }}>
      {/* ─── Top Header Section ─── */}
      <div style={{
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
              System Configurations & Edits
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
            Configure task statuses, user roles, external auditors, and category associations.
          </p>
        </div>

        <button
          onClick={() => {
            setIsAdding(true);
            setEditingId(null);
            setNewTaskTypeIds(taskTypes.map(t => t.id));
          }}
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
          <Plus size={15} /> Add {activeTab === 'statuses' ? 'Status' : activeTab === 'roles' ? 'Role' : 'Auditor'}
        </button>
      </div>

      {/* ─── Summary Metric Cards ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '14px',
        marginBottom: '24px',
      }}>
        {/* Metric 1: Statuses */}
        <div
          onClick={() => { setActiveTab('statuses'); setIsAdding(false); setEditingId(null); }}
          style={{
            background: activeTab === 'statuses' ? '#ffffff' : '#ffffff',
            borderRadius: '14px',
            padding: '16px 18px',
            border: activeTab === 'statuses' ? '2px solid #2563eb' : '1px solid #e2e8f0',
            boxShadow: activeTab === 'statuses' ? '0 4px 12px rgba(37,99,235,0.1)' : '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <Activity size={20} color="#2563eb" />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 650, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Workflow Statuses
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2, marginTop: '2px' }}>
              {counts.statusesActive} <span style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8' }}>/ {counts.statusesTotal} total</span>
            </div>
          </div>
        </div>

        {/* Metric 2: Roles */}
        <div
          onClick={() => { setActiveTab('roles'); setIsAdding(false); setEditingId(null); }}
          style={{
            background: '#ffffff',
            borderRadius: '14px',
            padding: '16px 18px',
            border: activeTab === 'roles' ? '2px solid #2563eb' : '1px solid #e2e8f0',
            boxShadow: activeTab === 'roles' ? '0 4px 12px rgba(37,99,235,0.1)' : '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
            border: '1px solid #ddd6fe', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <UserCheck size={20} color="#7c3aed" />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 650, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Partner Roles
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2, marginTop: '2px' }}>
              {counts.rolesTotal} <span style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8' }}>roles configured</span>
            </div>
          </div>
        </div>

        {/* Metric 3: Auditors */}
        <div
          onClick={() => { setActiveTab('auditors'); setIsAdding(false); setEditingId(null); }}
          style={{
            background: '#ffffff',
            borderRadius: '14px',
            padding: '16px 18px',
            border: activeTab === 'auditors' ? '2px solid #2563eb' : '1px solid #e2e8f0',
            boxShadow: activeTab === 'auditors' ? '0 4px 12px rgba(37,99,235,0.1)' : '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
            border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <ShieldCheck size={20} color="#059669" />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 650, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              External Auditors
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2, marginTop: '2px' }}>
              {counts.auditorsTotal} <span style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8' }}>auditors linked</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Main Management Card ─── */}
      <div style={{
        background: '#ffffff',
        borderRadius: '18px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        overflow: 'hidden'
      }}>
        {/* Navigation Tabs Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #e2e8f0',
          padding: '14px 20px',
          background: '#f8fafc',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          {/* Segmented Tab Buttons */}
          <div style={{ display: 'flex', gap: '4px', background: '#e2e8f0', padding: '3px', borderRadius: '10px' }}>
            <button
              onClick={() => { setActiveTab('statuses'); setIsAdding(false); setEditingId(null); }}
              style={{
                padding: '7px 16px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '12.5px',
                fontWeight: 650,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: activeTab === 'statuses' ? '#ffffff' : 'transparent',
                color: activeTab === 'statuses' ? '#2563eb' : '#64748b',
                boxShadow: activeTab === 'statuses' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Activity size={14} /> Statuses ({statuses.length})
            </button>

            <button
              onClick={() => { setActiveTab('roles'); setIsAdding(false); setEditingId(null); }}
              style={{
                padding: '7px 16px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '12.5px',
                fontWeight: 650,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: activeTab === 'roles' ? '#ffffff' : 'transparent',
                color: activeTab === 'roles' ? '#2563eb' : '#64748b',
                boxShadow: activeTab === 'roles' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <UserCheck size={14} /> Roles ({roles.length})
            </button>

            <button
              onClick={() => { setActiveTab('auditors'); setIsAdding(false); setEditingId(null); }}
              style={{
                padding: '7px 16px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '12.5px',
                fontWeight: 650,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: activeTab === 'auditors' ? '#ffffff' : 'transparent',
                color: activeTab === 'auditors' ? '#2563eb' : '#64748b',
                boxShadow: activeTab === 'auditors' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <ShieldCheck size={14} /> Auditors ({auditors.length})
            </button>
          </div>

          {/* Search & Active Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'flex-end', minWidth: '220px' }}>
            <div style={{ position: 'relative', minWidth: '180px', maxWidth: '260px', flex: 1 }}>
              <Search size={13} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder={`Search ${activeTab}...`}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px 6px 30px',
                  fontSize: '12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  outline: 'none',
                  background: '#ffffff',
                  color: '#0f172a'
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {activeTab === 'statuses' && (
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#334155',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="all">All States</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            )}
          </div>
        </div>

        {/* Content Container */}
        <div style={{ padding: '24px' }}>
          {/* Add Form Accordion */}
          {isAdding && (
            <div className="animate-fadeIn" style={{
              background: '#f8fafc',
              border: '1.5px solid #bfdbfe',
              borderRadius: '14px',
              padding: '18px 20px',
              marginBottom: '20px',
              boxShadow: '0 4px 14px rgba(37,99,235,0.06)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Plus size={16} color="#2563eb" /> Create New {activeTab === 'statuses' ? 'Status' : activeTab === 'roles' ? 'Role' : 'Auditor'}
                </span>
                <button
                  onClick={() => { setIsAdding(false); setNewName(''); setNewTaskTypeIds([]); }}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: '240px' }}>
                  <input
                    autoFocus
                    placeholder={`Enter ${activeTab === 'statuses' ? 'status name (e.g. Audit Review)' : activeTab === 'roles' ? 'role name (e.g. Tax Specialist)' : 'auditor firm name'}...`}
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: '8px',
                      border: '1.5px solid #cbd5e1', fontSize: '13px', outline: 'none', color: '#0f172a', background: '#ffffff'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => { setIsAdding(false); setNewName(''); setNewTaskTypeIds([]); }}
                    style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#475569', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={!newName.trim() || savingAction}
                    style={{
                      padding: '9px 18px', borderRadius: '8px', border: 'none',
                      background: '#2563eb', color: '#ffffff', fontSize: '13px', fontWeight: 650,
                      cursor: (!newName.trim() || savingAction) ? 'not-allowed' : 'pointer',
                      opacity: (!newName.trim() || savingAction) ? 0.6 : 1,
                      display: 'inline-flex', alignItems: 'center', gap: '6px'
                    }}
                  >
                    {savingAction ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                    Save {activeTab === 'statuses' ? 'Status' : activeTab === 'roles' ? 'Role' : 'Auditor'}
                  </button>
                </div>
              </div>

              {activeTab === 'statuses' && (
                <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
                  <label style={{ fontSize: '12px', fontWeight: 650, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    Linked Task Categories <span style={{ fontWeight: 400, color: '#94a3b8' }}>(Select all or none = Available to all task types)</span>
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

          {/* List Section */}
          {loading ? (
            <div style={{ display: 'grid', gap: '10px' }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ height: '56px', borderRadius: '10px', background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
              ))}
            </div>
          ) : filteredData.length === 0 ? (
            <div style={{
              background: '#f8fafc',
              borderRadius: '14px',
              border: '1px dashed #cbd5e1',
              padding: '48px 24px',
              textAlign: 'center'
            }}>
              <AlertCircle size={36} color="#94a3b8" style={{ margin: '0 auto 10px', opacity: 0.5 }} />
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#334155' }}>
                No {activeTab} found
              </div>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 16px' }}>
                {searchQuery ? 'Try clearing your search query.' : `Create your first custom ${activeTab.slice(0, -1)}.`}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => { setIsAdding(true); setNewTaskTypeIds(taskTypes.map(t => t.id)); }}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#2563eb',
                    color: '#fff', fontSize: '12.5px', fontWeight: 650, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <Plus size={14} /> Add {activeTab === 'statuses' ? 'Status' : activeTab === 'roles' ? 'Role' : 'Auditor'}
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredData.map((item) => {
                const isActive = item.active !== false;
                const isStatus = activeTab === 'statuses';
                const linkedTTNames = isStatus && item.task_type_ids && item.task_type_ids.length > 0
                  ? item.task_type_ids.map((id: string) => taskTypes.find(t => t.id === id.trim())?.name).filter(Boolean)
                  : [];
                
                const isEditing = editingId === item.id;

                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: isEditing ? 'flex-start' : 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: isStatus && !isActive ? '#f8fafc' : '#ffffff',
                      border: isEditing ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                      borderRadius: '12px',
                      boxShadow: isEditing ? '0 4px 14px rgba(37,99,235,0.08)' : '0 1px 2px rgba(0,0,0,0.01)',
                      transition: 'all 0.15s ease',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}
                  >
                    {isEditing ? (
                      /* Inline Edit View */
                      <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                          <input
                            autoFocus
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                            style={{
                              flex: 1, padding: '7px 12px', borderRadius: '8px',
                              border: '1.5px solid #cbd5e1', fontSize: '13px', outline: 'none', color: '#0f172a'
                            }}
                          />
                          <button
                            onClick={handleSaveEdit}
                            disabled={savingAction}
                            style={{
                              padding: '7px 14px', borderRadius: '8px', border: 'none',
                              background: '#2563eb', color: '#fff', fontSize: '12.5px', fontWeight: 650,
                              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                            }}
                          >
                            <Save size={13} /> Save
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setEditTaskTypeIds([]); }}
                            style={{
                              padding: '7px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                              background: '#f8fafc', color: '#475569', fontSize: '12.5px', fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                        {isStatus && (
                          <div style={{ marginTop: '8px' }}>
                            <label style={{ fontSize: '11.5px', fontWeight: 650, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                              Task Categories
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
                      /* Regular Item Row View */
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, flexWrap: 'wrap' }}>
                          {/* Item Icon indicator */}
                          <div style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            background: isStatus ? (isActive ? '#ecfdf5' : '#f1f5f9') : activeTab === 'roles' ? '#f5f3ff' : '#eff6ff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            {isStatus ? (
                              <Activity size={15} color={isActive ? '#059669' : '#94a3b8'} />
                            ) : activeTab === 'roles' ? (
                              <UserCheck size={15} color="#7c3aed" />
                            ) : (
                              <ShieldCheck size={15} color="#2563eb" />
                            )}
                          </div>

                          <span style={{ fontSize: '13.5px', fontWeight: 700, color: isStatus && !isActive ? '#94a3b8' : '#0f172a' }}>
                            {item.name}
                          </span>

                          {/* Status Active Badge */}
                          {isStatus && (
                            <span style={{
                              fontSize: '11px', fontWeight: 650, padding: '2px 8px', borderRadius: '5px',
                              background: isActive ? '#ecfdf5' : '#fef2f2',
                              color: isActive ? '#059669' : '#dc2626',
                              border: `1px solid ${isActive ? '#a7f3d0' : '#fecaca'}`
                            }}>
                              {isActive ? 'Active' : 'Disabled'}
                            </span>
                          )}

                          {/* Linked Task Types Chips */}
                          {isStatus && linkedTTNames.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {linkedTTNames.map((name: string, i: number) => (
                                <span key={i} style={{
                                  fontSize: '10.5px', fontWeight: 600, padding: '2px 7px', borderRadius: '5px',
                                  background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe'
                                }}>
                                  {name}
                                </span>
                              ))}
                            </div>
                          )}

                          {isStatus && linkedTTNames.length === 0 && (
                            <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                              Applies to all task types
                            </span>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                          {isStatus && (
                            <button
                              onClick={() => handleToggleActive(item.id, isActive)}
                              style={{
                                background: 'none', border: 'none',
                                color: isActive ? '#059669' : '#94a3b8',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px'
                              }}
                              title={isActive ? 'Deactivate Status' : 'Activate Status'}
                            >
                              {isActive ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                            </button>
                          )}

                          <button
                            onClick={() => startEdit(item)}
                            style={{
                              padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1',
                              background: '#ffffff', color: '#334155', fontSize: '12px', fontWeight: 600,
                              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                            }}
                            title="Edit"
                          >
                            <Edit2 size={12} /> Edit
                          </button>

                          <button
                            onClick={() => handleDelete(item.id)}
                            style={{
                              padding: '5px 8px', borderRadius: '6px', border: '1px solid #fecaca',
                              background: '#fef2f2', color: '#dc2626', fontSize: '12px', cursor: 'pointer',
                              display: 'inline-flex', alignItems: 'center'
                            }}
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Compact multi-select for linking task types ─────────────────────────
function TaskTypeMultiSelect({ taskTypes, selected, onChange }: {
  taskTypes: TaskTypeRecord[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      return;
    }
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

  const selectAll = () => onChange(taskTypes.map(t => t.id));
  const deselectAll = () => onChange([]);

  const selectedItems = selected.map(id => taskTypes.find(t => t.id === id)).filter(Boolean) as TaskTypeRecord[];

  const filteredTaskTypes = taskTypes.filter(tt => 
    tt.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px',
          background: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center',
          gap: '6px', flexWrap: 'wrap', minHeight: '38px', fontSize: '13px',
          boxShadow: open ? '0 0 0 3px rgba(37,99,235,0.12)' : 'none',
          borderColor: open ? '#2563eb' : '#cbd5e1',
          transition: 'all 0.15s ease',
        }}
      >
        {selectedItems.length === 0 ? (
          <span style={{ color: '#94a3b8' }}>No specific types (Applies to all)</span>
        ) : selectedItems.length === taskTypes.length ? (
          <span style={{ color: '#0f172a', fontWeight: 650 }}>All task types selected ({taskTypes.length})</span>
        ) : (
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', flex: 1 }}>
            {selectedItems.map((item) => (
              <span key={item.id} style={{
                padding: '2px 7px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 600,
                background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                {item.name}
                <X size={12} 
                  style={{ cursor: 'pointer', opacity: 0.6 }} 
                  onClick={e => { 
                    e.stopPropagation(); 
                    toggle(item.id); 
                  }} 
                  onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                />
              </span>
            ))}
          </div>
        )}
        <ChevronDown size={15} color="#94a3b8" style={{ marginLeft: 'auto', flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </div>
      
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: '#ffffff',
          border: '1px solid #cbd5e1', borderRadius: '10px',
          zIndex: 100,
          boxShadow: '0 12px 30px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Search Input */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', position: 'relative' }}>
            <Search size={13} color="#94a3b8" style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text"
              autoFocus
              placeholder="Search task types..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '6px 10px 6px 28px', border: '1px solid #cbd5e1', 
                borderRadius: '6px', fontSize: '12px', outline: 'none', background: '#ffffff',
              }}
              onClick={e => e.stopPropagation()}
            />
          </div>
          
          {/* Actions */}
          <div style={{ 
            padding: '6px 12px', borderBottom: '1px solid #e2e8f0', 
            display: 'flex', justifyContent: 'space-between', fontSize: '11.5px',
            background: '#ffffff' 
          }}>
            <button 
              onClick={(e) => { e.stopPropagation(); selectAll(); }} 
              style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 650, padding: 0 }}
            >
              Select All
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); deselectAll(); }} 
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontWeight: 500, padding: 0 }}
            >
              Clear All
            </button>
          </div>
          
          {/* Options */}
          <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
            {filteredTaskTypes.length === 0 ? (
              <div style={{ padding: '16px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
                No task types match &quot;{searchQuery}&quot;
              </div>
            ) : filteredTaskTypes.map(tt => {
              const isSelected = selected.includes(tt.id);
              return (
                <div key={tt.id}
                  onClick={(e) => { e.stopPropagation(); toggle(tt.id); }}
                  style={{
                    padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                    borderBottom: '1px solid #f1f5f9',
                    background: isSelected ? '#eff6ff' : '#ffffff',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = isSelected ? '#dbeafe' : '#f8fafc'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isSelected ? '#eff6ff' : '#ffffff'; }}
                >
                  <div style={{ 
                    width: '16px', height: '16px', borderRadius: '4px', 
                    border: `1.5px solid ${isSelected ? '#2563eb' : '#cbd5e1'}`,
                    background: isSelected ? '#2563eb' : '#ffffff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {isSelected && <Check size={11} color="#ffffff" strokeWidth={3} />}
                  </div>
                  <span style={{ fontSize: '12.5px', fontWeight: isSelected ? 650 : 500, color: isSelected ? '#1d4ed8' : '#334155' }}>
                    {tt.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
