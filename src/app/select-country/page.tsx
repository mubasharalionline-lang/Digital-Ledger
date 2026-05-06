'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, setSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Globe, Plus, X, Loader2 } from 'lucide-react';

interface CountryRecord { id: string; code: string; name: string; flag: string; }

export default function SelectCountryPage() {
  const [user, setUser] = useState<any>(null);
  const [countries, setCountries] = useState<CountryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newFlag, setNewFlag] = useState('🌍');
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const { user: u } = getSession();
    if (!u) { router.push('/'); return; }
    setUser(u);
    loadCountries();
  }, [router]);

  async function loadCountries() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('countries').select('*').order('name');
      if (!error && data && data.length > 0) { setCountries(data); setLoading(false); return; }
    } catch {}
    setCountries([
      { id: '1', code: 'BH', name: 'Bahrain', flag: '🇧🇭' },
      { id: '2', code: 'NZ', name: 'New Zealand', flag: '🇳🇿' },
    ]);
    setLoading(false);
  }

  function selectCountry(name: string) {
    if (!user) return;
    setSession(user, name);
    sessionStorage.clear();
    router.push('/dashboard');
  }

  async function handleAddCountry() {
    if (!newName.trim() || !newCode.trim()) return;
    setAdding(true);
    try {
      const { error } = await supabase.from('countries').insert({
        name: newName.trim(), code: newCode.trim().toUpperCase(), flag: newFlag || '🌍',
      });
      if (error) { alert('Error: ' + error.message); setAdding(false); return; }
      setNewName(''); setNewCode(''); setNewFlag('🌍'); setShowAdd(false);
      await loadCountries();
    } catch { alert('Failed to add country.'); }
    setAdding(false);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)', padding: '20px' }}>
      <div className="animate-scaleIn" style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)', borderRadius: '24px', padding: '40px', maxWidth: '480px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, #e8f4fd, #dbeafe)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 4px 12px rgba(0,113,227,0.15)' }}>
            <Globe size={32} color="#0071e3" />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.02em' }}>Select Country</h1>
          <p style={{ fontSize: '14px', color: '#6e6e73', marginTop: '6px' }}>Choose the country to manage</p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}><Loader2 size={24} className="spin" color="var(--accent)" /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {countries.map(c => (
              <button key={c.id} onClick={() => selectCountry(c.name)} style={{
                display: 'flex', alignItems: 'center', gap: '14px', width: '100%',
                padding: '16px 20px', border: '2px solid #e8e8ed', borderRadius: '14px',
                background: '#fff', cursor: 'pointer', fontSize: '16px', fontWeight: 500,
                color: '#1d1d1f', transition: 'all 0.2s ease', fontFamily: 'inherit',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#0071e3'; e.currentTarget.style.background = '#f0f6ff'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e8e8ed'; e.currentTarget.style.background = '#fff'; }}>
                <span style={{ fontSize: '28px' }}>{c.flag}</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: '12px', color: '#86868b', fontWeight: 400 }}>{c.code}</div>
                </div>
              </button>
            ))}
            <button onClick={() => setShowAdd(true)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              width: '100%', padding: '14px', border: '2px dashed #d2d2d7', borderRadius: '14px',
              background: 'transparent', cursor: 'pointer', fontSize: '14px', fontWeight: 600,
              color: '#0071e3', transition: 'all 0.2s ease', fontFamily: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#0071e3'; e.currentTarget.style.background = '#f0f6ff'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#d2d2d7'; e.currentTarget.style.background = 'transparent'; }}>
              <Plus size={16} /> Add New Country
            </button>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 24px 0' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Add New Country</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: 'var(--bg-tertiary)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ padding: '24px' }}>
              <p style={{ fontSize: '13px', color: '#6e6e73', marginBottom: '20px' }}>New countries automatically use the unified system with dashboard, tasks, reports, and partner management.</p>
              <div style={{ marginBottom: '14px' }}><label className="label">Country Name *</label><input className="input" placeholder="e.g. United Kingdom" value={newName} onChange={e => setNewName(e.target.value)} autoFocus /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div><label className="label">Code *</label><input className="input" placeholder="UK" value={newCode} onChange={e => setNewCode(e.target.value)} maxLength={4} style={{ textTransform: 'uppercase' }} /></div>
                <div><label className="label">Flag Emoji</label><input className="input" placeholder="🌍" value={newFlag} onChange={e => setNewFlag(e.target.value)} /></div>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleAddCountry} disabled={adding || !newName.trim() || !newCode.trim()}>
                  {adding ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={16} />}
                  Create Country
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
