'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Company } from '@/lib/supabase';
import { getDataCountry, getSession, isAdmin } from '@/lib/auth';
import { Plus, Trash2, X } from 'lucide-react';

export default function BahrainCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const dataCountry = getDataCountry();

  const [form, setForm] = useState({
    name: '', country: dataCountry || 'Bahrain', tax_registration: '', industry: '', fy_end: '', compliance_type: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const { user: currentUser } = getSession();
    const isAdminUser = isAdmin(currentUser);
    
    // Fetch all companies for the country
    let { data } = await supabase.from('companies').select('*').eq('country', dataCountry || 'Bahrain').order('company_name');
    
    // If not admin, only show companies they have tasks for
    if (!isAdminUser && currentUser && data) {
      const { data: userTasks } = await supabase.from('tasks').select('company_id').eq('assigned_to', currentUser.id);
      if (userTasks) {
        const assignedCompanyIds = new Set(userTasks.map(t => t.company_id));
        data = data.filter(c => assignedCompanyIds.has(c.id));
      } else {
        data = []; // No tasks, no companies
      }
    }
    
    setCompanies(data || []);
    setLoading(false);
  }, [dataCountry]);

  useEffect(() => { loadData(); }, [loadData]);

  async function save() {
    // Always use the current data country — strict separation
    const companyCountry = dataCountry || 'Bahrain';
    if (!form.name) { alert('Please fill required fields'); return; }
    const { error } = await supabase.from('companies').insert({
      company_name: form.name,
      country: companyCountry,
      tax_registration: form.tax_registration || null,
      industry: form.industry || null,
      fy_end: form.fy_end || null,
      compliance_type: form.compliance_type || null,
      notes: '',
      status: 'Active',
    });
    if (error) { alert('Error: ' + error.message); return; }
    
    sessionStorage.removeItem('dashboard_data_time_v2');
    sessionStorage.removeItem('tasks_data_time');
    
    setShowModal(false);
    setForm({ name: '', country: dataCountry || 'Bahrain', tax_registration: '', industry: '', fy_end: '', compliance_type: '' });
    loadData();
    alert('Company added!');
  }

  async function remove(id: string) {
    if (!confirm('Delete this company?')) return;
    await supabase.from('companies').delete().eq('id', id);
    
    sessionStorage.removeItem('dashboard_data_time_v2');
    sessionStorage.removeItem('tasks_data_time');
    
    loadData();
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '60px', color: '#7F8C8D' }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: 'var(--text-primary, #2E4053)', fontSize: '22px', fontWeight: 600 }}>Company Management</h2>
        {isAdmin(getSession().user) && (
          <button onClick={() => setShowModal(true)} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 20px', background: '#5DADE2', color: '#fff',
            border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500,
          }}>
            <Plus size={16} /> New Company
          </button>
        )}
      </div>

      <div style={{ overflowX: 'auto', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card, #fff)' }}>
          <thead>
            <tr style={{ background: '#2E4053', color: 'white' }}>
              {['ID', 'Company Name', 'Country', 'Tax Registration', 'Industry', 'FY End', 'Status', 'Actions'].map(h => (
                <th key={h} style={{ padding: '14px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#7F8C8D' }}>No companies yet</td></tr>
            ) : companies.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border, #ECF0F1)' }}>
                <td style={cell}>{c.id.slice(0, 6)}</td>
                <td style={cell}>{c.company_name}</td>
                <td style={cell}>{c.country}</td>
                <td style={cell}>{c.tax_registration || '-'}</td>
                <td style={cell}>{c.industry || '-'}</td>
                <td style={cell}>{c.fy_end || '-'}</td>
                <td style={cell}>
                  <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: '#D5F4E6', color: '#27AE60' }}>
                    {c.status || 'Active'}
                  </span>
                </td>
                <td style={cell}>
                  {isAdmin(getSession().user) ? (
                    <button onClick={() => remove(c.id)} style={{
                      padding: '6px 12px', background: '#E74C3C', color: '#fff',
                      border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
                    }}>Delete</button>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#7F8C8D' }}>No actions</span>
                  )}
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
              <h2 style={{ fontSize: '20px', color: '#2E4053' }}>New Company</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#34495E' }}><X size={22} /></button>
            </div>
            <div style={{ padding: '25px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <Field label="Company Name *">
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} style={inpStyle} />
                </Field>
                <Field label="Country">
                  <input value={dataCountry || 'Bahrain'} readOnly style={{ ...inpStyle, background: '#F3F4F6', color: '#6B7280', cursor: 'not-allowed' }} title="Company will be created in the currently selected country" />
                </Field>
                <Field label="Tax Registration">
                  <input value={form.tax_registration} onChange={e => setForm(p => ({ ...p, tax_registration: e.target.value }))} style={inpStyle} />
                </Field>
                <Field label="Industry">
                  <input value={form.industry} onChange={e => setForm(p => ({ ...p, industry: e.target.value }))} style={inpStyle} />
                </Field>
                <Field label="Financial Year End">
                  <input value={form.fy_end} onChange={e => setForm(p => ({ ...p, fy_end: e.target.value }))} placeholder="e.g., 31-Dec" style={inpStyle} />
                </Field>
                <Field label="Compliance Type">
                  <input value={form.compliance_type} onChange={e => setForm(p => ({ ...p, compliance_type: e.target.value }))} placeholder="e.g., VAT, Corporate Tax" style={inpStyle} />
                </Field>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button onClick={() => setShowModal(false)} style={{ padding: '10px 20px', background: '#BDC3C7', color: '#34495E', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={save} style={{ padding: '10px 20px', background: '#27AE60', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label style={{ fontWeight: 600, marginBottom: '6px', color: '#34495E', fontSize: '13px' }}>{label}</label>
      {children}
    </div>
  );
}

const cell: React.CSSProperties = { padding: '12px', fontSize: '13px', verticalAlign: 'middle', color: 'var(--text-primary, #333)' };
const inpStyle: React.CSSProperties = { padding: '10px 12px', border: '2px solid #BDC3C7', borderRadius: '6px', fontSize: '14px', width: '100%', background: 'var(--bg-card, #fff)', color: 'var(--text-primary, #333)' };
