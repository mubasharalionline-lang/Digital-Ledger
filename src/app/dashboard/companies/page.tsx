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
    loadCompanies();
  }, [router]);

  async function loadCompanies() {
    setLoading(true);
    const { data } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false });
    setCompanies(data || []);
    setLoading(false);
  }

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);
    const { country } = getSession();
    await supabase.from('companies').insert({
      company_name: formName.trim(),
      notes: formNotes.trim(),
      country: country || '',
    });
    setFormName('');
    setFormNotes('');
    setShowModal(false);
    setSaving(false);
    loadCompanies();
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
              <div style={{ marginBottom: '24px' }}>
                <label className="label">Quick Notes</label>
                <textarea
                  className="input"
                  placeholder="Optional notes about this company"
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
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
