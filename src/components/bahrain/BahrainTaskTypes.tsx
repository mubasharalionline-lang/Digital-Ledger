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
    const { data } = await supabase.from('task_types').select('*').order('created_at', { ascending: false });
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
      const res = await supabase.from('task_types').insert({
        name: form.name,
        category: form.category,
        jurisdiction: form.jurisdiction,
        status_options: form.status_options || null,
        description: form.description || null,
        active: true,
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
    alert(editingId ? 'Task Type updated!' : 'Task Type added!');
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

  if (!isAdminUser) return <div style={{ textAlign: 'center', padding: '60px', color: '#E74C3C', fontSize: '18px', fontWeight: 'bold' }}>Access Denied</div>;

  if (loading) return <div style={{ textAlign: 'center', padding: '60px', color: '#7F8C8D' }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: 'var(--text-primary, #2E4053)', fontSize: '22px', fontWeight: 600 }}>Task Type Management</h2>
        <button onClick={openCreate} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '10px 20px', background: '#5DADE2', color: '#fff',
          border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500, fontSize: '14px',
        }}>
          <Plus size={16} /> New Task Type
        </button>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card, #fff)' }}>
          <thead>
            <tr style={{ background: '#2E4053', color: 'white' }}>
              {['ID', 'Task Type Name', 'Category', 'Default Status Options', 'Jurisdiction', 'Active', 'Actions'].map(h => (
                <th key={h} style={{ padding: '14px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {taskTypes.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#7F8C8D' }}>No task types yet</td></tr>
            ) : taskTypes.map(tt => (
              <tr key={tt.id} style={{ borderBottom: '1px solid var(--border, #ECF0F1)' }}>
                <td style={cell}>{tt.id.slice(0, 6)}</td>
                <td style={cell}><strong>{tt.name}</strong></td>
                <td style={cell}><span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: '#D6EAF8', color: '#3498DB' }}>{tt.category}</span></td>
                <td style={{ ...cell, fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tt.status_options || 'System Default'}</td>
                <td style={cell}>{tt.jurisdiction}</td>
                <td style={cell}>
                  <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: tt.active ? '#D5F4E6' : '#ECF0F1', color: tt.active ? '#27AE60' : '#7F8C8D' }}>
                    {tt.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ ...cell, display: 'flex', gap: '6px' }}>
                  <button onClick={() => openEdit(tt)} style={{
                    padding: '6px 12px', background: '#3498DB', color: '#fff',
                    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
                    display: 'flex', alignItems: 'center', gap: '4px',
                  }}>
                    <Edit2 size={12} /> Edit
                  </button>
                  <button onClick={() => toggle(tt.id, tt.active)} style={{
                    padding: '6px 12px', background: tt.active ? '#F39C12' : '#27AE60', color: '#fff',
                    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
                  }}>
                    {tt.active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => remove(tt.id)} style={{
                    padding: '6px 12px', background: '#E74C3C', color: '#fff',
                    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
                  }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px',
        }}>
          <div style={{
            background: 'var(--bg-card, #fff)', borderRadius: '12px', maxWidth: '700px', width: '100%',
            maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
          }}>
            <div style={{ padding: '20px 25px', borderBottom: '2px solid var(--border, #ECF0F1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '20px', color: '#2E4053' }}>{editingId ? 'Edit Task Type' : 'New Task Type'}</h2>
              <button onClick={() => { setShowModal(false); setEditingId(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', color: '#34495E' }}><X size={22} /></button>
            </div>
            <div style={{ padding: '25px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={labelStyle}>Task Type Name *</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., VAT Return" style={inpStyle} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={labelStyle}>Category *</label>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={inpStyle}>
                    {TASK_TYPE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={labelStyle}>Jurisdiction</label>
                  <select value={form.jurisdiction} onChange={e => setForm(p => ({ ...p, jurisdiction: e.target.value }))} style={inpStyle}>
                    {BAHRAIN_JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '16px' }}>
                <label style={labelStyle}>Default Status Options (comma-separated)</label>
                <input value={form.status_options} onChange={e => setForm(p => ({ ...p, status_options: e.target.value }))} placeholder="e.g., Not Started, In Progress, Filed, Closed" style={inpStyle} />
                <small style={{ color: '#7F8C8D', fontSize: '12px', marginTop: '4px' }}>Leave empty to use system defaults</small>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '16px' }}>
                <label style={labelStyle}>Description</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Details..." style={{ ...inpStyle, minHeight: '80px', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button onClick={() => { setShowModal(false); setEditingId(null); }} style={{ padding: '10px 20px', background: '#BDC3C7', color: '#34495E', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={save} style={{ padding: '10px 20px', background: '#27AE60', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>{editingId ? 'Update' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const cell: React.CSSProperties = { padding: '12px', fontSize: '13px', verticalAlign: 'middle', color: 'var(--text-primary, #333)' };
const labelStyle: React.CSSProperties = { fontWeight: 600, marginBottom: '6px', color: '#34495E', fontSize: '13px' };
const inpStyle: React.CSSProperties = { padding: '10px 12px', border: '2px solid #BDC3C7', borderRadius: '6px', fontSize: '14px', width: '100%', background: 'var(--bg-card, #fff)', color: 'var(--text-primary, #333)' };
