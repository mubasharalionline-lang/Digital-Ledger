'use client';

import { useEffect, useState, useCallback } from 'react';
import { Edit2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { TaskType } from '@/lib/supabase';
import { TASK_TYPE_CATEGORIES, BAHRAIN_JURISDICTIONS } from '@/lib/bahrain';
import { getDataCountry, getSession, isAdmin } from '@/lib/auth';
import { Plus, Trash2, ToggleLeft, ToggleRight, X } from 'lucide-react';

export default function BahrainTaskTypes() {
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', category: 'Tax Filing', jurisdiction: 'All', status_options: '', description: '',
  });

  const { user: currentUser } = getSession();
  const isAdminUser = isAdmin(currentUser);

  const loadData = useCallback(async () => {
    setLoading(true);
    const dataCountry = getDataCountry();
    const { data } = await supabase.from('task_types')
      .select('id, name, category, jurisdiction, status_options, description, active, created_at, country')
      .eq('country', dataCountry || 'Bahrain')
      .order('created_at', { ascending: false });
    setTaskTypes(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function openEdit(tt: TaskType) {
    setEditingId(tt.id);
    setForm({
      name: tt.name,
      category: tt.category || 'Tax Filing',
      jurisdiction: tt.jurisdiction || 'All',
      status_options: tt.status_options || '',
      description: tt.description || '',
    });
    setShowModal(true);
  }

  function openCreate() {
    setEditingId(null);
    setForm({ name: '', category: 'Tax Filing', jurisdiction: 'All', status_options: '', description: '' });
    setShowModal(true);
  }

  async function save() {
    if (!form.name || !form.category) { alert('Please fill required fields'); return; }

    let error;
    if (editingId) {
      const res = await supabase.from('task_types').update({
        name: form.name,
        category: form.category,
        jurisdiction: form.jurisdiction,
        status_options: form.status_options || null,
        description: form.description || null,
      }).eq('id', editingId);
      error = res.error;
    } else {
      const dataCountry = getDataCountry();
      const res = await supabase.from('task_types').insert({
        name: form.name,
        category: form.category,
        jurisdiction: form.jurisdiction,
        status_options: form.status_options || null,
        description: form.description || null,
        active: true,
        country: dataCountry || 'Bahrain'
      });
      error = res.error;
    }

    if (error) { alert('Error: ' + error.message); return; }
    sessionStorage.removeItem('dashboard_data_time_v2');
    sessionStorage.removeItem('tasks_data_time');
    setShowModal(false);
    setEditingId(null);
    setForm({ name: '', category: 'Tax Filing', jurisdiction: 'All', status_options: '', description: '' });
    loadData();
  }

  async function toggle(id: string, current: boolean) {
    await supabase.from('task_types').update({ active: !current }).eq('id', id);
    sessionStorage.removeItem('dashboard_data_time_v2');
    sessionStorage.removeItem('tasks_data_time');
    loadData();
  }

  async function remove(id: string) {
    if (!confirm('Delete this task type?')) return;
    await supabase.from('task_types').delete().eq('id', id);
    sessionStorage.removeItem('dashboard_data_time_v2');
    sessionStorage.removeItem('tasks_data_time');
    loadData();
  }

  if (!isAdminUser) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center', padding: '40px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '16px', color: '#dc2626' }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 700 }}>Access Denied</h2>
        <p style={{ margin: 0, fontSize: '14px' }}>You don't have permission to view this page.</p>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#64748b' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 500 }}>
        <div style={{ width: '18px', height: '18px', border: '2px solid #cbd5e1', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        Loading task types...
      </div>
    </div>
  );

  return (
    <div style={{ paddingBottom: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .action-btn { transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; border: none; cursor: pointer; }
        .action-btn:hover { transform: translateY(-1px); }
        .table-row { transition: all 0.2s ease; border-bottom: 1px solid #f1f5f9; }
        .table-row:hover { background: #f8fafc; }
        .inp-focus:focus { outline: none; border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important; }
      `}</style>
      
      <div style={{ marginBottom: '32px', padding: '32px 36px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #334155 100%)', borderRadius: '24px', color: '#fff', position: 'relative', overflow: 'hidden', boxShadow: '0 8px 32px rgba(15,23,42,0.2)' }}>
        <div style={{ position: 'absolute', top: '-40px', right: '-20px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(59,130,246,0.08)' }} />
        <div style={{ position: 'absolute', bottom: '-60px', right: '100px', width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(139,92,246,0.06)' }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 4px 0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Configuration</p>
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#fff', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>Task Types</h1>
            <p style={{ fontSize: '14px', color: '#cbd5e1', margin: 0 }}>Manage categories, jurisdictions, and workflows for tasks.</p>
          </div>
          <button onClick={openCreate} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '12px 20px', background: '#3b82f6', color: '#fff',
            border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '14px',
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)', transition: 'all 0.2s ease',
          }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
            <Plus size={18} strokeWidth={2.5} /> New Task Type
          </button>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['ID', 'Task Type Name', 'Category', 'Default Status Options', 'Jurisdiction', 'Status', 'Actions'].map((h, i) => (
                  <th key={h} style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {taskTypes.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '60px', color: '#94a3b8', fontSize: '14px' }}>No task types configured yet</td></tr>
              ) : taskTypes.map(tt => (
                <tr key={tt.id} className="table-row">
                  <td style={{ padding: '16px 20px', fontSize: '13px', color: '#64748b', fontFamily: 'monospace' }}>{tt.id.slice(0, 6)}</td>
                  <td style={{ padding: '16px 20px', fontSize: '14px', color: '#0f172a', fontWeight: 600 }}>{tt.name}</td>
                  <td style={{ padding: '16px 20px' }}>
                    <span style={{ display: 'inline-flex', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: '#f1f5f9', color: '#475569' }}>
                      {tt.category}
                    </span>
                  </td>
                  <td style={{ padding: '16px 20px', fontSize: '13px', color: '#64748b', maxWidth: '250px' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tt.status_options ? (
                        <span style={{ background: '#f8fafc', padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>{tt.status_options}</span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>System Default</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px', fontSize: '13px', color: '#475569', fontWeight: 500 }}>{tt.jurisdiction}</td>
                  <td style={{ padding: '16px 20px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: tt.active ? '#ecfdf5' : '#f1f5f9', color: tt.active ? '#059669' : '#64748b' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: tt.active ? '#10b981' : '#94a3b8' }} />
                      {tt.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '16px 20px', display: 'flex', gap: '8px' }}>
                    <button className="action-btn" onClick={() => openEdit(tt)} style={{ background: '#eff6ff', color: '#3b82f6' }} title="Edit">
                      <Edit2 size={15} />
                    </button>
                    <button className="action-btn" onClick={() => toggle(tt.id, tt.active)} style={{ background: tt.active ? '#fff7ed' : '#ecfdf5', color: tt.active ? '#ea580c' : '#059669' }} title={tt.active ? 'Deactivate' : 'Activate'}>
                      {tt.active ? <ToggleLeft size={16} /> : <ToggleRight size={16} />}
                    </button>
                    <button className="action-btn" onClick={() => remove(tt.id)} style={{ background: '#fef2f2', color: '#ef4444' }} title="Delete">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px',
        }}>
          <div style={{
            background: '#fff', borderRadius: '24px', maxWidth: '650px', width: '100%',
            maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ padding: '24px 32px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' }}>{editingId ? 'Edit Task Type' : 'New Task Type'}</h2>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Configure the classification and workflow for this task type.</p>
              </div>
              <button onClick={() => { setShowModal(false); setEditingId(null); }} style={{ background: '#f8fafc', border: 'none', cursor: 'pointer', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ padding: '32px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={labelStyle}>Task Type Name <span style={{ color: '#ef4444' }}>*</span></label>
                  <input className="inp-focus" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., VAT Return" style={inpStyle} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={labelStyle}>Category <span style={{ color: '#ef4444' }}>*</span></label>
                  <select className="inp-focus" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={inpStyle}>
                    {TASK_TYPE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={labelStyle}>Jurisdiction</label>
                  <select className="inp-focus" value={form.jurisdiction} onChange={e => setForm(p => ({ ...p, jurisdiction: e.target.value }))} style={inpStyle}>
                    {BAHRAIN_JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ ...labelStyle, margin: 0 }}>Custom Status Options</label>
                  <span style={{ fontSize: '12px', color: '#64748b', background: '#f8fafc', padding: '2px 8px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>Comma-separated</span>
                </div>
                <input className="inp-focus" value={form.status_options} onChange={e => setForm(p => ({ ...p, status_options: e.target.value }))} placeholder="Not Started, In Progress, Review, Filed, Closed" style={inpStyle} />
                <span style={{ color: '#94a3b8', fontSize: '12px', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#94a3b8' }} /> Leave empty to use system default statuses
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '32px' }}>
                <label style={labelStyle}>Description (Optional)</label>
                <textarea className="inp-focus" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Provide internal details about this task type..." style={{ ...inpStyle, minHeight: '100px', resize: 'vertical', lineHeight: 1.5 }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
                <button onClick={() => { setShowModal(false); setEditingId(null); }} style={{ padding: '12px 24px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}>Cancel</button>
                <button onClick={save} style={{ padding: '12px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>{editingId ? 'Save Changes' : 'Create Task Type'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontWeight: 600, marginBottom: '8px', color: '#475569', fontSize: '13px' };
const inpStyle: React.CSSProperties = { padding: '12px 16px', border: '1px solid #cbd5e1', borderRadius: '12px', fontSize: '14px', width: '100%', background: '#fff', color: '#0f172a', transition: 'all 0.2s' };
