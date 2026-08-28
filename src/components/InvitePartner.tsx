'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getSession, getDataCountry } from '@/lib/auth';
import { formatDate } from '@/lib/dateUtils';
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
    return `Welcome to DigitalLedger 👋\n\nYou have been invited to create your secure DigitalLedger account.\n\nComplete your signup using the link below:\n\n${generatedLink}\n\nThis secure invite link will automatically expire after your account is created.`;
  }

  function copyMessage() {
    navigator.clipboard.writeText(getInviteMessage());
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  }

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)',
      backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 60, padding: '20px'
    }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{
        maxWidth: '520px', width: '100%', borderRadius: '20px', overflow: 'hidden',
        boxShadow: '0 25px 60px rgba(0,0,0,0.18)', border: '1px solid #e2e8f0', background: '#ffffff'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)',
          borderBottom: '1px solid #f1f5f9'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <UserPlus size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                {generatedLink ? 'Invite Link Generated' : 'Invite Partner'}
              </h2>
              <p style={{ fontSize: '12px', color: '#64748b', margin: 0, marginTop: '2px' }}>
                {generatedLink ? 'Share this secure link with your partner' : 'Generate an onboarding signup token'}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px',
            padding: '6px', cursor: 'pointer', display: 'flex', color: '#64748b'
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
                <CheckCircle2 size={32} color="#16a34a" style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#166534', margin: 0 }}>
                  Invite link is ready!
                </p>
                <p style={{ fontSize: '12.5px', color: '#15803d', marginTop: '4px', margin: 0 }}>
                  Share this single-use link with your partner to securely register.
                </p>
              </div>

              {/* Professional Invite Message */}
              <div style={{
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px',
                padding: '14px', marginBottom: '16px',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  Invitation Message Preview
                </div>
                <pre style={{
                  fontSize: '12px', color: '#334155', lineHeight: 1.6,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  margin: 0, fontFamily: 'inherit',
                  maxHeight: '160px', overflowY: 'auto',
                }}>
                  {getInviteMessage()}
                </pre>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={copyMessage}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none',
                    background: '#2563eb', color: '#fff', fontSize: '13px', fontWeight: 650,
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                >
                  {copiedMessage ? <Check size={16} /> : <Copy size={16} />}
                  {copiedMessage ? 'Copied Message!' : 'Copy Full Message'}
                </button>
                <button
                  onClick={copyLink}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: '10px', border: '1px solid #cbd5e1',
                    background: '#f8fafc', color: '#334155', fontSize: '13px', fontWeight: 650,
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                >
                  {copied ? <Check size={16} /> : <Link2 size={16} />}
                  {copied ? 'Copied Link!' : 'Copy Link Only'}
                </button>
              </div>

              {/* Config summary */}
              <div style={{
                marginTop: '18px', padding: '12px 14px', background: '#f8fafc',
                borderRadius: '10px', border: '1px solid #e2e8f0',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                  Configured Access Rights
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={tagBadge}><ShieldCheck size={11} /> {role}</span>
                  <span style={tagBadge}><Globe size={11} /> {getDataCountry() || 'Bahrain'}</span>
                  {canUpdateStatus && <span style={greenBadge}>Status Updates</span>}
                  {canViewCompanies && <span style={greenBadge}>View Companies</span>}
                  {auditorAccess.length > 0 && (
                    <span style={greenBadge}>{auditorAccess.length} Auditor(s)</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ─── Configuration Form ─── */
            <div>
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px', lineHeight: 1.5 }}>
                Configure the partner&apos;s role and permissions. A unique tokenized signup link will be created.
              </p>

              {/* Role */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#475569', marginBottom: '5px' }}>
                  Assigned Role *
                </label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: '8px',
                    border: '1.5px solid #cbd5e1', fontSize: '13px', outline: 'none', color: '#0f172a', background: '#fff', cursor: 'pointer'
                  }}
                >
                  {roles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Permissions */}
              <div style={{
                background: '#f8fafc', padding: '16px',
                borderRadius: '12px', marginBottom: '18px', border: '1px solid #e2e8f0'
              }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
                  Permissions & Capabilities
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', background: '#ffffff', borderRadius: '8px',
                    border: '1px solid #e2e8f0', cursor: 'pointer'
                  }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#0f172a' }}>Can update task status</span>
                    <input type="checkbox" checked={canUpdateStatus} onChange={e => setCanUpdateStatus(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                  </label>

                  <label style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', background: '#ffffff', borderRadius: '8px',
                    border: '1px solid #e2e8f0', cursor: 'pointer'
                  }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#0f172a' }}>Can view assigned companies</span>
                    <input type="checkbox" checked={canViewCompanies} onChange={e => setCanViewCompanies(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                  </label>
                </div>

                {/* Auditor Access */}
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                  <div
                    onClick={() => setShowAuditors(!showAuditors)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: '12.5px', fontWeight: 650, color: '#334155' }}>
                      🛡️ Auditor Access ({auditorAccess.length} selected)
                    </span>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#2563eb' }}>
                      {showAuditors ? 'Hide' : 'Configure'}
                    </span>
                  </div>
                  {showAuditors && (
                    <div style={{
                      maxHeight: '140px', overflowY: 'auto', background: '#ffffff',
                      padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '8px'
                    }}>
                      {auditors.length === 0 ? (
                        <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '6px' }}>No auditors found</div>
                      ) : auditors.map(a => {
                        const isChecked = auditorAccess.includes(a.id);
                        return (
                          <label key={a.id} style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '5px 6px', cursor: 'pointer', borderRadius: '5px',
                            background: isChecked ? '#eff6ff' : 'transparent', fontSize: '12.5px',
                            marginBottom: '2px'
                          }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={e => {
                                if (e.target.checked) setAuditorAccess(prev => [...prev, a.id]);
                                else setAuditorAccess(prev => prev.filter(id => id !== a.id));
                              }}
                            />
                            <span style={{ fontWeight: isChecked ? 650 : 500, color: isChecked ? '#1d4ed8' : '#334155' }}>{a.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={saving}
                  style={{
                    padding: '8px 18px', borderRadius: '8px', border: 'none',
                    background: '#2563eb', color: '#ffffff', fontSize: '13px', fontWeight: 650,
                    cursor: saving ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
                    opacity: saving ? 0.7 : 1
                  }}
                >
                  {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Link2 size={14} />}
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
    if (!confirm('Delete this invite token?')) return;
    await supabase.from('partner_invites').delete().eq('id', id);
    loadInvites();
  }

  async function handleRegenerate(invite: Invite) {
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
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} color="#2563eb" />
      </div>
    );
  }

  if (invites.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
        <Link2 size={36} style={{ opacity: 0.4, margin: '0 auto 12px' }} />
        <p style={{ fontSize: '14px', fontWeight: 600, color: '#64748b' }}>No active invitations</p>
        <p style={{ fontSize: '12.5px', color: '#94a3b8', margin: '4px 0 0' }}>Click &quot;New Invite&quot; to generate an onboarding signup token.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {invites.map(inv => {
        const sc = statusColor(inv.status);
        return (
          <div key={inv.id} style={{
            padding: '14px 18px', background: '#ffffff',
            border: '1px solid #e2e8f0', borderRadius: '12px',
            display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
            justifyContent: 'space-between',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '220px' }}>
              {/* Icon */}
              <div style={{
                width: '38px', height: '38px', borderRadius: '10px',
                background: inv.status === 'pending' ? 'linear-gradient(135deg, #fffbeb, #fef3c7)' :
                  inv.status === 'used' ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)' :
                  'linear-gradient(135deg, #fef2f2, #fee2e2)',
                border: `1px solid ${sc.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {inv.status === 'pending' ? <Clock size={17} color="#d97706" /> :
                 inv.status === 'used' ? <CheckCircle2 size={17} color="#059669" /> :
                 <AlertCircle size={17} color="#dc2626" />}
              </div>

              {/* Info */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: '13.5px', color: '#0f172a' }}>{inv.role}</span>
                  <span style={{
                    fontSize: '11px', fontWeight: 650, padding: '2px 7px', borderRadius: '5px',
                    background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                    textTransform: 'capitalize',
                  }}>{inv.status}</span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Created {formatDate(inv.created_at)}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  by {inv.created_by} · {inv.country}
                  {inv.used_at && ` · Used ${formatDate(inv.used_at)}`}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              {inv.status === 'pending' && (
                <>
                  <button
                    onClick={() => copyLink(inv)}
                    style={{
                      padding: '5px 12px', borderRadius: '6px', border: '1px solid #cbd5e1',
                      background: '#f8fafc', color: '#1e293b', fontSize: '12px', fontWeight: 600,
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                    }}
                  >
                    {copiedId === inv.id ? <Check size={13} color="#059669" /> : <Copy size={13} />}
                    {copiedId === inv.id ? 'Copied' : 'Copy Link'}
                  </button>
                  <button
                    onClick={() => handleRegenerate(inv)}
                    style={{
                      padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1',
                      background: '#ffffff', color: '#475569', fontSize: '12px', cursor: 'pointer'
                    }}
                    title="Regenerate Token"
                  >
                    <RefreshCw size={13} />
                  </button>
                  <button
                    onClick={() => handleExpire(inv.id)}
                    style={{
                      padding: '5px 8px', borderRadius: '6px', border: '1px solid #fecaca',
                      background: '#fef2f2', color: '#dc2626', fontSize: '12px', cursor: 'pointer'
                    }}
                    title="Expire Invite"
                  >
                    <X size={13} />
                  </button>
                </>
              )}
              {inv.status !== 'pending' && (
                <button
                  onClick={() => handleDelete(inv.id)}
                  style={{
                    padding: '5px 8px', borderRadius: '6px', border: '1px solid #fecaca',
                    background: '#fef2f2', color: '#dc2626', fontSize: '12px', cursor: 'pointer'
                  }}
                  title="Delete Record"
                >
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
