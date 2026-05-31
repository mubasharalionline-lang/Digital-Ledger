'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Company } from '@/lib/supabase';
import { getDataCountry, getSession, isAdmin } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, X, Building2, Search, FolderOpen, FileText, BarChart3, Settings, ExternalLink, Link as LinkIcon, Pencil } from 'lucide-react';

export default function BahrainCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [quickActionsCompany, setQuickActionsCompany] = useState<Company | null>(null);
  const quickActionsRef = useRef<HTMLDivElement>(null);
  const dataCountry = getDataCountry();
  const router = useRouter();

  const [form, setForm] = useState({ name: '', country: dataCountry || 'Bahrain', tax_registration: '', industry: '', compliance_type: '', google_drive_link: '' });

  // Click-outside handler for Quick Actions panel
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (quickActionsRef.current && !quickActionsRef.current.contains(event.target as Node)) {
        setQuickActionsCompany(null);
      }
    }
    if (quickActionsCompany) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [quickActionsCompany]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { user: currentUser } = getSession();
    const isAdminUser = isAdmin(currentUser);
    
    // Fetch all companies for the country
    let { data } = await supabase.from('companies').select('id, company_name, country, tax_registration, industry, compliance_type, status, google_drive_link, notes, created_at').eq('country', dataCountry || 'Bahrain').order('company_name');
    
    // Partners with can_view_companies see all companies (like admins).
    // Other non-admin users only see companies they have tasks for.
    const canViewCompanies = currentUser?.permissions?.can_view_companies === true;
    if (!isAdminUser && !canViewCompanies && currentUser && data) {
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

    if (form.google_drive_link && !form.google_drive_link.startsWith('https://')) {
      alert('Google Drive link must start with https://');
      return;
    }

    try {
      const { error } = await supabase.from('companies').insert({
        company_name: form.name.trim(),
        country: companyCountry,
        tax_registration: form.tax_registration.trim(),
        industry: form.industry.trim(),
        compliance_type: form.compliance_type.trim(),
        google_drive_link: form.google_drive_link.trim() || null,
        notes: '',
        status: 'Active',
      });
      if (error) { throw error; }
      
      sessionStorage.removeItem('dashboard_data_time_v2');
      sessionStorage.removeItem('tasks_data_time');
      
      setShowModal(false);
      setForm({ name: '', country: companyCountry, tax_registration: '', industry: '', compliance_type: '', google_drive_link: '' });
      loadData();
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this company?')) return;
    await supabase.from('companies').delete().eq('id', id);
    
    sessionStorage.removeItem('dashboard_data_time_v2');
    sessionStorage.removeItem('tasks_data_time');
    
    loadData();
  }

  const filtered = companies.filter(c => !searchTerm || c.company_name.toLowerCase().includes(searchTerm.toLowerCase()));

  const listCell = { padding: '14px 16px', fontSize: '13px', color: '#475569' };
  const Field = ({ label, children }: { label: string, children: React.ReactNode }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>{label}</label>
      {children}
    </div>
  );
  const inpStyle = { padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', outline: 'none' };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <div style={{ width: '44px', height: '44px', border: '3px solid #e2e8f0', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 500 }}>Loading companies...</span>
      </div>
    </div>
  );

  return (
    <div>
      {/* Premium Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '6px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(59,130,246,0.3)' }}>
              <Building2 size={22} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px', margin: 0 }}>Company Management</h2>
              <p style={{ fontSize: '13px', color: '#64748b', fontWeight: 500, marginTop: '2px' }}>{companies.length} {companies.length === 1 ? 'company' : 'companies'} registered</p>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search companies..."
              style={{ padding: '10px 14px 10px 36px', border: '1.5px solid #e2e8f0', borderRadius: '12px', fontSize: '13px', background: '#ffffff', color: '#334155', outline: 'none', transition: 'all 0.2s', width: '220px', fontWeight: 500 }}
            />
          </div>
          {isAdmin(getSession().user) && (
            <button onClick={() => setShowModal(true)} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 22px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff',
              border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
              boxShadow: '0 4px 14px rgba(59,130,246,0.3)', transition: 'all 0.2s ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(59,130,246,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(59,130,246,0.3)'; }}
            >
              <Plus size={16} /> New Company
            </button>
          )}
        </div>
      </div>

      {/* Company List Table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#ffffff', borderRadius: '20px', border: '1px solid #f1f5f9', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
          <Building2 size={48} style={{ color: '#cbd5e1', marginBottom: '16px' }} />
          <p style={{ fontSize: '16px', fontWeight: 600, color: '#64748b' }}>No companies found</p>
          <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>{searchTerm ? 'Try a different search term' : 'Add your first company to get started'}</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: '18px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#ffffff' }}>
            <thead>
              <tr style={{ background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', borderBottom: '2px solid #e2e8f0' }}>
                {['Company', 'Country', 'Tax Registration', 'Industry', 'Compliance', 'Status', ...(isAdmin(getSession().user) ? ['Actions'] : [])].map(h => (
                  <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#64748b', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, idx) => {
                const colors = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#06b6d4','#ec4899','#6366f1','#ef4444'];
                const accent = colors[idx % colors.length];
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s', cursor: 'pointer', position: 'relative' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    onClick={() => setQuickActionsCompany(prev => prev?.id === c.id ? null : c)}
                  >
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: `linear-gradient(135deg, ${accent}, ${accent}dd)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 2px 8px ${accent}30` }}>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>{c.company_name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{c.company_name}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>#{c.id.slice(0, 8)}</div>
                        </div>
                      </div>
                    </td>
                    <td style={listCell}>{c.country}</td>
                    <td style={listCell}>{c.tax_registration || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td style={listCell}>{c.industry || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td style={listCell}>{c.compliance_type || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: '#dcfce7', color: '#059669', border: '1px solid #a7f3d0' }}>
                        {c.status || 'Active'}
                      </span>
                    </td>
                    {isAdmin(getSession().user) && (
                      <td style={{ padding: '14px 16px' }}>
                        <button onClick={(e) => { e.stopPropagation(); remove(c.id); }} style={{
                          display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 14px',
                          background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                          borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                          transition: 'all 0.15s',
                        }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#fef2f2'; }}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </td>
                    )}
                    {/* Quick Actions Panel */}
                    {quickActionsCompany?.id === c.id && (
                      <td colSpan={isAdmin(getSession().user) ? 7 : 6} style={{ padding: 0, position: 'relative' }}>
                        <div ref={quickActionsRef} onClick={e => e.stopPropagation()} style={{
                          position: 'absolute', top: '4px', right: '16px', zIndex: 50,
                          background: '#ffffff', borderRadius: '16px', padding: '8px',
                          boxShadow: '0 12px 40px -8px rgba(15,23,42,0.18), 0 4px 12px -2px rgba(15,23,42,0.08)',
                          border: '1px solid rgba(226,232,240,0.8)', minWidth: '240px',
                          animation: 'fadeIn 0.15s ease-out',
                        }}>
                          {/* Panel Header */}
                          <div style={{ padding: '10px 14px 12px', borderBottom: '1px solid #f1f5f9', marginBottom: '4px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>{c.company_name}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500, marginTop: '2px' }}>Quick Actions</div>
                          </div>

                          {/* View/Edit Action */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/dashboard/companies/${c.id}`);
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
                              padding: '10px 14px', border: 'none', borderRadius: '10px',
                              background: 'transparent', cursor: 'pointer',
                              transition: 'background 0.15s ease', textAlign: 'left',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #f1f5f9' }}>
                              <Pencil size={16} color="#475569" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>View & Edit Company</div>
                              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500, marginTop: '1px' }}>
                                Manage details, staff, and tasks
                              </div>
                            </div>
                          </button>

                          {/* Google Drive Action */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (c.google_drive_link) {
                                window.open(c.google_drive_link, '_blank', 'noopener,noreferrer');
                              }
                              setQuickActionsCompany(null);
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
                              padding: '10px 14px', border: 'none', borderRadius: '10px',
                              background: 'transparent', cursor: c.google_drive_link ? 'pointer' : 'default',
                              transition: 'background 0.15s ease', textAlign: 'left',
                              opacity: c.google_drive_link ? 1 : 0.7,
                            }}
                            onMouseEnter={e => { if (c.google_drive_link) e.currentTarget.style.background = '#f0fdf4'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: c.google_drive_link ? '#f0fdf4' : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: c.google_drive_link ? '1px solid #dcfce7' : '1px solid #f1f5f9' }}>
                              <FolderOpen size={16} color={c.google_drive_link ? '#16a34a' : '#94a3b8'} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: c.google_drive_link ? '#0f172a' : '#475569' }}>Open Google Drive</div>
                              <div style={{ fontSize: '11px', color: c.google_drive_link ? '#16a34a' : '#94a3b8', fontWeight: 500, marginTop: '1px' }}>
                                {c.google_drive_link ? 'Open folder in new tab' : 'No Google Drive linked yet'}
                              </div>
                            </div>
                            {c.google_drive_link && <ExternalLink size={14} color="#94a3b8" />}
                          </button>

                          {/* Future Actions (disabled placeholders) */}
                          {[
                            { id: 'reports', label: 'Reports', icon: <BarChart3 size={16} color="#f59e0b" />, sub: 'Coming soon', iconBg: '#fffbeb', iconBorder: '#fef3c7' },
                          ].map(action => (
                            <div key={action.id} style={{
                              display: 'flex', alignItems: 'center', gap: '12px',
                              padding: '10px 14px', borderRadius: '10px', opacity: 0.65,
                              cursor: 'not-allowed',
                            }}>
                              <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: action.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${action.iconBorder}` }}>
                                {action.icon}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>{action.label}</div>
                                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500, marginTop: '1px' }}>{action.sub}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '0 0 18px 18px', fontSize: '12px', color: '#64748b', fontWeight: 600, borderTop: '1px solid #f1f5f9' }}>
            Showing {filtered.length} of {companies.length} companies
          </div>
        </div>
      )}

      {/* Premium Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px',
          animation: 'fadeIn 0.2s ease-out',
        }} onClick={() => setShowModal(false)}>
          <div style={{
            background: '#ffffff', borderRadius: '20px', maxWidth: '680px', width: '100%',
            maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 25px 60px rgba(0,0,0,0.2), 0 10px 20px rgba(0,0,0,0.1)',
            animation: 'scaleIn 0.25s ease-out', border: '1px solid rgba(226,232,240,0.6)',
          }} onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{
              padding: '22px 28px', borderBottom: '1px solid #f1f5f9',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'linear-gradient(135deg, #eff6ff 0%, #f1f5f9 100%)',
              borderRadius: '20px 20px 0 0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '12px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(59,130,246,0.25)' }}>
                  <Building2 size={18} color="#ffffff" />
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.3px' }}>New Company</h2>
              </div>
              <button onClick={() => setShowModal(false)} style={{
                background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b',
                width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; }}
              ><X size={18} /></button>
            </div>
            <div style={{ padding: '28px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '20px' }}>
                <Field label="Company Name *">
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Acme Corp" style={inpStyle} />
                </Field>
                <Field label="Country">
                  <input value={dataCountry || 'Bahrain'} readOnly style={{ ...inpStyle, background: '#f8fafc', color: '#64748b', cursor: 'not-allowed' }} title="Company will be created in the currently selected country" />
                </Field>
                <Field label="Tax Registration">
                  <input value={form.tax_registration} onChange={e => setForm(p => ({ ...p, tax_registration: e.target.value }))} placeholder="Enter tax registration" style={inpStyle} />
                </Field>
                <Field label="Industry">
                  <input value={form.industry} onChange={e => setForm(p => ({ ...p, industry: e.target.value }))} placeholder="e.g., Finance, Tech" style={inpStyle} />
                </Field>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Compliance Type">
                    <input value={form.compliance_type} onChange={e => setForm(p => ({ ...p, compliance_type: e.target.value }))} placeholder="e.g., VAT, Corporate Tax, Audit" style={inpStyle} />
                  </Field>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Google Drive Folder Link">
                    <div style={{ position: 'relative' }}>
                      <LinkIcon size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      <input
                        value={form.google_drive_link}
                        onChange={e => setForm(p => ({ ...p, google_drive_link: e.target.value }))}
                        placeholder="https://drive.google.com/drive/folders/..."
                        type="url"
                        style={{ ...inpStyle, paddingLeft: '40px' }}
                      />
                    </div>
                    {form.google_drive_link && !form.google_drive_link.startsWith('https://') && (
                      <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: 500, marginTop: '4px', display: 'block' }}>Link must start with https://</span>
                    )}
                  </Field>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
                <button onClick={() => setShowModal(false)} style={{
                  padding: '11px 24px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0',
                  borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', transition: 'all 0.15s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
                >Cancel</button>
                <button onClick={save} style={{
                  padding: '11px 24px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff',
                  border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '14px',
                  boxShadow: '0 4px 14px rgba(59,130,246,0.3)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px',
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(59,130,246,0.4)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(59,130,246,0.3)'; }}
                >
                  <Plus size={16} /> Save Company
                </button>
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
      <label style={{ fontWeight: 600, marginBottom: '8px', color: '#334155', fontSize: '13px', letterSpacing: '0.01em' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const listCell: React.CSSProperties = {
  padding: '14px 16px', fontSize: '13px', fontWeight: 500, color: '#334155', verticalAlign: 'middle',
};

const inpStyle: React.CSSProperties = {
  padding: '12px 16px', border: '1.5px solid #e2e8f0', borderRadius: '12px', fontSize: '14px',
  width: '100%', background: '#ffffff', color: '#0f172a', outline: 'none',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease', fontWeight: 500,
};
