'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getSession, getDataCountry } from '@/lib/auth';
import {
  X, Loader2, Copy, CheckCircle2, RefreshCw,
  Link2, ShieldCheck, Globe, Clock, Check,
  Trash2, AlertCircle, UserPlus, ExternalLink,
} from 'lucide-react';

interface Auditor { id: string; name: string; }
interface Invite {
  id: string; token: string; role: string; country: string;
  permissions: any; status: string; created_by: string;
  used_by: string | null; used_at: string | null; created_at: string;
}

// ─── Generate Invite Modal ────────────────────────────────────────
export function InvitePartnerModal({
  open, onClose, roles, auditors, onCreated,
}: {
  open: boolean; onClose: () => void;
  roles: string[]; auditors: Auditor[];
  onCreated: () => void;
}) {
  const [role, setRole] = useState(roles[0] || 'Accountant');
  const [canUpdateStatus, setCanUpdateStatus] = useState(true);
  const [canViewCompanies, setCanViewCompanies] = useState(false);
  const [canMessage, setCanMessage] = useState(false);
  const [auditorAccess, setAuditorAccess] = useState<string[]>([]);
  const [showAuditors, setShowAuditors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  useEffect(() => {
    if (open) {
      setRole(roles[0] || 'Accountant');
      setCanUpdateStatus(true);
      setCanViewCompanies(false);
      setCanMessage(false);
      setAuditorAccess([]);
      setShowAuditors(false);
      setGeneratedLink('');
      setCopied(false);
    }
  }, [open, roles]);

  async function handleGenerate() {
    setSaving(true);
    const country = getDataCountry();
    const { user } = getSession();
    const token = generateToken();

    const { error } = await supabase.from('partner_invites').insert({
      token,
      role,
      country: country || 'Bahrain',
      permissions: {
        can_update_status: canUpdateStatus,
        can_view_companies: canViewCompanies,
        can_message: canMessage,
        auditor_access: auditorAccess,
      },
      status: 'pending',
      created_by: user?.username || 'admin',
    });

    if (error) {
      alert('Error creating invite: ' + error.message);
      setSaving(false);
      return;
    }

    const link = `${window.location.origin}/invite/${token}`;
    setGeneratedLink(link);
    setSaving(false);
    onCreated();
  }

  function copyLink() {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function getInviteMessage() {
    return `You've been invited to join Digital Ledger. Please use the link below to set up your account:\n\n${generatedLink}\n\nYour role and permissions have been pre-configured. This link expires after signup.`;
  }

  function copyMessage() {
    navigator.clipboard.writeText(getInviteMessage());
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  }

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        {/* Header */}
        <div style={{
          padding: '24px 24px 0', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserPlus size={20} color="var(--accent)" />
            {generatedLink ? 'Invite Link Ready' : 'Invite Partner'}
          </h2>
          <button onClick={onClose} style={{
            background: 'var(--bg-tertiary)', border: 'none', borderRadius: '50%',
            width: '32px', height: '32px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer',
          }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '24px' }}>
          {generatedLink ? (
            /* ─── Link Generated View ─── */
            <div>
              <div style={{
                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px',
                padding: '16px', marginBottom: '20px', textAlign: 'center',
              }}>
                <CheckCircle2 size={32} color="#22c55e" style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#166534' }}>
                  Invite link generated successfully!
                </p>
                <p style={{ fontSize: '12px', color: '#15803d', marginTop: '4px' }}>
                  Share this link with your partner to onboard them.
                </p>
              </div>

              {/* Professional Invite Message */}
              <div style={{
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px',
                padding: '16px', marginBottom: '16px',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                  Invitation Message
                </div>
                <pre style={{
                  fontSize: '12px', color: '#334155', lineHeight: 1.6,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  margin: 0, fontFamily: 'inherit',
                  maxHeight: '200px', overflowY: 'auto',
                }}>
                  {getInviteMessage()}
                </pre>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button onClick={copyMessage} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  {copiedMessage ? <Check size={16} /> : <Copy size={16} />}
                  {copiedMessage ? 'Copied!' : 'Copy Message'}
                </button>
                <button onClick={copyLink} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                  {copied ? <Check size={16} /> : <Link2 size={16} />}
                  {copied ? 'Copied!' : 'Copy Link Only'}
                </button>
              </div>

              {/* Config summary */}
              <div style={{
                marginTop: '20px', padding: '14px', background: '#f8fafc',
                borderRadius: '10px', border: '1px solid #e2e8f0',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  Configured Access
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={tagBadge}><ShieldCheck size={11} /> {role}</span>
                  <span style={tagBadge}><Globe size={11} /> {getDataCountry()}</span>
                  {canUpdateStatus && <span style={greenBadge}>Status Updates</span>}
                  {canViewCompanies && <span style={greenBadge}>View Companies</span>}
                  {canMessage && <span style={greenBadge}>Messaging</span>}
                  {auditorAccess.length > 0 && (
                    <span style={greenBadge}>{auditorAccess.length} Auditor(s)</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ─── Configuration Form ─── */
            <div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
                Configure the role and permissions. A secure invite link will be generated that the partner can use to create their account.
              </p>

              {/* Role */}
              <div style={{ marginBottom: '16px' }}>
                <label className="label">Role *</label>
                <select className="select" value={role} onChange={e => setRole(e.target.value)}>
                  {roles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Permissions */}
              <div style={{
                background: 'var(--bg-tertiary)', padding: '16px',
                borderRadius: '12px', marginBottom: '16px',
              }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Permissions</h4>
                <label style={checkboxLabel}>
                  <input type="checkbox" checked={canUpdateStatus} onChange={e => setCanUpdateStatus(e.target.checked)} />
                  <span style={{ fontSize: '14px' }}>Can update task status</span>
                </label>
                <label style={checkboxLabel}>
                  <input type="checkbox" checked={canViewCompanies} onChange={e => setCanViewCompanies(e.target.checked)} />
                  <span style={{ fontSize: '14px' }}>Can view assigned companies</span>
                </label>
                <label style={{ ...checkboxLabel, marginBottom: '16px' }}>
                  <input type="checkbox" checked={canMessage} onChange={e => setCanMessage(e.target.checked)} />
                  <span style={{ fontSize: '14px' }}>Can send/receive messages</span>
                </label>

                {/* Auditor Access */}
                <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
                  <div
                    onClick={() => setShowAuditors(!showAuditors)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: showAuditors ? '10px' : '0' }}
                  >
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>Auditor Access ({auditorAccess.length})</span>
                    <span style={{ fontSize: '18px', color: 'var(--text-tertiary)' }}>{showAuditors ? '−' : '+'}</span>
                  </div>
                  {showAuditors && (
                    <div style={{
                      maxHeight: '140px', overflowY: 'auto', background: 'var(--bg-primary)',
                      padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)',
                    }}>
                      {auditors.length === 0 ? (
                        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>No auditors found</div>
                      ) : auditors.map(a => (
                        <label key={a.id} style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '6px 4px', cursor: 'pointer',
                          borderBottom: '1px solid var(--border-light)', fontSize: '13px',
                        }}>
                          <input
                            type="checkbox"
                            checked={auditorAccess.includes(a.id)}
                            onChange={e => {
                              if (e.target.checked) setAuditorAccess(prev => [...prev, a.id]);
                              else setAuditorAccess(prev => prev.filter(id => id !== a.id));
                            }}
                          />
                          <span>{a.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" onClick={handleGenerate} disabled={saving}>
                  {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Link2 size={16} />}
                  Generate Invite Link
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Invite Management Panel ──────────────────────────────────────
export function InviteManagementPanel() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => { loadInvites(); }, []);

  async function loadInvites() {
    setLoading(true);
    const country = getDataCountry();
    let query = supabase.from('partner_invites').select('*').order('created_at', { ascending: false });
    if (country) query = query.eq('country', country);
    const { data } = await query;
    setInvites(data || []);
    setLoading(false);
  }

  async function handleExpire(id: string) {
    await supabase.from('partner_invites').update({ status: 'expired' }).eq('id', id);
    loadInvites();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this invite?')) return;
    await supabase.from('partner_invites').delete().eq('id', id);
    loadInvites();
  }

  async function handleRegenerate(invite: Invite) {
    // Expire old one and create a new one with same config
    await supabase.from('partner_invites').update({ status: 'expired' }).eq('id', invite.id);
    const token = generateToken();
    await supabase.from('partner_invites').insert({
      token, role: invite.role, country: invite.country,
      permissions: invite.permissions, status: 'pending',
      created_by: invite.created_by,
    });
    loadInvites();
  }

  function copyLink(invite: Invite) {
    const link = `${window.location.origin}/invite/${invite.token}`;
    navigator.clipboard.writeText(link);
    setCopiedId(invite.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const statusColor = (s: string) => {
    if (s === 'pending') return { bg: '#fef3c7', color: '#92400e', border: '#fde68a' };
    if (s === 'used') return { bg: '#ecfdf5', color: '#065f46', border: '#a7f3d0' };
    return { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' };
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} color="var(--accent)" />
      </div>
    );
  }

  if (invites.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
        <Link2 size={32} style={{ opacity: 0.4, marginBottom: '12px' }} />
        <p style={{ fontSize: '14px' }}>No invites yet. Click &quot;Invite Partner&quot; to create one.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {invites.map(inv => {
        const sc = statusColor(inv.status);
        return (
          <div key={inv.id} style={{
            padding: '16px', background: 'var(--bg-secondary)',
            border: '1px solid var(--border-light)', borderRadius: '12px',
            display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
          }}>
            {/* Icon */}
            <div style={{
              width: '40px', height: '40px', borderRadius: '10px',
              background: inv.status === 'pending' ? 'linear-gradient(135deg, #fef3c7, #fde68a)' :
                inv.status === 'used' ? 'linear-gradient(135deg, #ecfdf5, #a7f3d0)' :
                'linear-gradient(135deg, #fef2f2, #fecaca)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {inv.status === 'pending' ? <Clock size={18} color="#92400e" /> :
               inv.status === 'used' ? <CheckCircle2 size={18} color="#065f46" /> :
               <AlertCircle size={18} color="#991b1b" />}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: '160px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{inv.role}</span>
                <span style={{
                  fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px',
                  background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                  textTransform: 'capitalize',
                }}>{inv.status}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                  {new Date(inv.created_at).toLocaleDateString()}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                by {inv.created_by} · {inv.country}
                {inv.used_at && ` · Used ${new Date(inv.used_at).toLocaleDateString()}`}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              {inv.status === 'pending' && (
                <>
                  <button onClick={() => copyLink(inv)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                    {copiedId === inv.id ? <Check size={13} /> : <Copy size={13} />}
                    {copiedId === inv.id ? 'Copied' : 'Copy'}
                  </button>
                  <button onClick={() => handleRegenerate(inv)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '12px' }} title="Regenerate">
                    <RefreshCw size={13} />
                  </button>
                  <button onClick={() => handleExpire(inv.id)} className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '12px' }} title="Expire">
                    <X size={13} />
                  </button>
                </>
              )}
              {inv.status !== 'pending' && (
                <button onClick={() => handleDelete(inv.id)} className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '12px' }} title="Delete">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Reload helper for parent
export function useInviteReload() {
  const [key, setKey] = useState(0);
  return { key, reload: () => setKey(k => k + 1) };
}

// ─── Helpers ──────────────────────────────────────────────────────
function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const array = new Uint8Array(48);
  crypto.getRandomValues(array);
  for (let i = 0; i < 48; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

const checkboxLabel: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px',
  marginBottom: '8px', cursor: 'pointer',
};

const tagBadge: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '4px',
  padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
  background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
};

const greenBadge: React.CSSProperties = {
  padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 500,
  background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0',
};
