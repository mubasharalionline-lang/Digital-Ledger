'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { User, Company } from '@/lib/supabase';
import {
  Plus,
  Search,
  Building2,
  StickyNote,
  ArrowRight,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';

export default function CompaniesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [staffList, setStaffList] = useState<User[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<{ id: string; role: string; username: string }[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formName, setFormName] = useState('');
  const [formNotes, setFormNotes] = useState('');
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
    const [companiesRes, staffRes] = await Promise.all([
      supabase.from('companies').select('*').order('created_at', { ascending: false }),
      supabase.from('users').select('*').eq('role', 'staff')
    ]);
    setCompanies(companiesRes.data || []);
    setStaffList(staffRes.data || []);
    setLoading(false);
  }

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);
    const { country } = getSession();
    
    // Insert company
    const { data: newCompany, error } = await supabase.from('companies').insert({
      company_name: formName.trim(),
      notes: formNotes.trim(),
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

    setFormName('');
    setFormNotes('');
    setSelectedStaff([]);
    setShowModal(false);
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
    e.target.value = ''; // reset select
  }

  function updateStaffRole(id: string, role: string) {
    setSelectedStaff(selectedStaff.map(s => s.id === id ? { ...s, role } : s));
  }

  function removeStaff(id: string) {
    setSelectedStaff(selectedStaff.filter(s => s.id !== id));
  }

  const filtered = companies.filter(c =>
    c.company_name.toLowerCase().includes(search.toLowerCase())
  );

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
            fontSize: '28px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
          }}>
            Companies
          </h1>
          <p style={{
            fontSize: '15px',
            color: 'var(--text-secondary)',
            marginTop: '4px',
          }}>
            {companies.length} total companies
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-tertiary)',
            }} />
            <input
              className="input"
              type="text"
              placeholder="Search companies..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: '36px', width: '220px' }}
            />
          </div>

          {isAdmin(user) && (
            <button
              className="btn btn-primary"
              onClick={() => setShowModal(true)}
            >
              <Plus size={16} />
              Add Company
            </button>
          )}
        </div>
      </div>

      {/* Companies Grid */}
      {loading ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '16px',
        }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="skeleton" style={{ height: '160px', borderRadius: '16px' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card animate-fadeIn" style={{
          padding: '64px 24px',
          textAlign: 'center',
        }}>
          <AlertCircle size={40} style={{ margin: '0 auto 16px', color: 'var(--text-tertiary)', opacity: 0.5 }} />
          <p style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-secondary)' }}>
            {search ? 'No companies match your search' : 'No companies yet'}
          </p>
          {isAdmin(user) && !search && (
            <button
              className="btn btn-primary"
              style={{ marginTop: '16px' }}
              onClick={() => setShowModal(true)}
            >
              <Plus size={16} />
              Create Your First Company
            </button>
          )}
        </div>
      ) : (
        <div className="stagger-children" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '16px',
        }}>
          {filtered.map((company) => (
            <div
              key={company.id}
              className="card"
              style={{
                padding: '24px',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
              }}
              onClick={() => router.push(`/dashboard/companies/${company.id}`)}
            >
              <div style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: '60px',
                height: '60px',
                background: 'linear-gradient(135deg, #e8f4fd, #d4ecfb)',
                borderRadius: '0 16px 0 30px',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'flex-end',
                padding: '10px',
              }}>
                <Building2 size={18} color="var(--accent)" />
              </div>

              <h3 style={{
                fontSize: '17px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '8px',
                paddingRight: '50px',
              }}>
                {company.company_name}
              </h3>

              {company.notes && (
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '6px',
                  marginBottom: '12px',
                }}>
                  <StickyNote size={14} color="var(--text-tertiary)" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <p style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.4,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {company.notes}
                  </p>
                </div>
              )}

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                marginTop: '12px',
                color: 'var(--accent)',
                fontSize: '13px',
                fontWeight: 500,
              }}>
                View Details <ArrowRight size={14} style={{ marginLeft: '4px' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Company Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '24px 24px 0',
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Add Company</h2>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: 'var(--bg-tertiary)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={createCompany} style={{ padding: '24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label className="label">Company Name *</label>
                <input
                  className="input"
                  type="text"
                  placeholder="Enter company name"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label className="label">Quick Notes</label>
                <textarea
                  className="input"
                  placeholder="Optional notes about this company"
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  rows={2}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label className="label">Assign Staff</label>
                <select className="select" onChange={handleStaffSelect} defaultValue="" style={{ marginBottom: '12px' }}>
                  <option value="" disabled>Select a staff member...</option>
                  {staffList.filter(s => !selectedStaff.some(sel => sel.id === s.id)).map(s => (
                    <option key={s.id} value={s.id}>{s.username}</option>
                  ))}
                </select>

                {selectedStaff.length > 0 && (
                  <div style={{ 
                    border: '1px solid var(--border-light)', 
                    borderRadius: '8px', 
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    background: 'var(--bg-secondary)'
                  }}>
                    {selectedStaff.map(staff => (
                      <div key={staff.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        background: 'var(--bg-primary)',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)'
                      }}>
                        <span style={{ fontSize: '14px', fontWeight: 500 }}>{staff.username}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <select 
                            className="select" 
                            value={staff.role} 
                            onChange={(e) => updateStaffRole(staff.id, e.target.value)}
                            style={{ padding: '4px 8px', fontSize: '13px', width: 'auto' }}
                          >
                            <option value="Accountant">Accountant</option>
                            <option value="Secretary">Secretary</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => removeStaff(staff.id)}
                            style={{
                              background: 'none', border: 'none', color: 'var(--danger)',
                              cursor: 'pointer', padding: '4px', display: 'flex'
                            }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
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
