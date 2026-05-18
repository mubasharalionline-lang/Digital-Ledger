'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { setSession } from '@/lib/auth';
import {
  Loader2, User, Mail, Lock, ArrowRight, AlertCircle,
  CheckCircle2, ShieldCheck, Globe, KeyRound,
} from 'lucide-react';

interface InviteData {
  id: string;
  token: string;
  role: string;
  country: string;
  permissions: any;
  status: string;
  created_at: string;
}

export default function InviteSignupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const router = useRouter();

  useEffect(() => {
    loadInvite();
  }, [token]);

  async function loadInvite() {
    setLoading(true);
    const { data, error } = await supabase
      .from('partner_invites')
      .select('*')
      .eq('token', token)
      .single();

    if (error || !data) {
      setInvalid(true);
      setLoading(false);
      return;
    }

    if (data.status !== 'pending') {
      setInvalid(true);
      setLoading(false);
      return;
    }

    setInvite(data);
    setLoading(false);
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Username and password are required');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!invite) return;
    setSubmitting(true);

    try {
      // Check username uniqueness in the same country
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('username', username.trim())
        .eq('country', invite.country)
        .single();

      if (existing) {
        setError('Username already exists in this country. Please choose another.');
        setSubmitting(false);
        return;
      }

      // Create the user with all the predefined invite settings
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          username: username.trim(),
          password: password.trim(),
          role: invite.role,
          country: invite.country,
          email: email.trim() || null,
          organization: name.trim() || null,
          permissions: invite.permissions,
        })
        .select()
        .single();

      if (insertError) {
        setError(insertError.message || 'Failed to create account');
        setSubmitting(false);
        return;
      }

      // Mark invite as used
      await supabase
        .from('partner_invites')
        .update({
          status: 'used',
          used_by: newUser.id,
          used_at: new Date().toISOString(),
        })
        .eq('id', invite.id);

      setSuccess(true);

      // Auto-login the new user
      setTimeout(() => {
        setSession(newUser, invite.country);
        router.push('/dashboard');
      }, 2000);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Loading ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={containerStyle}>
        <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', color: '#3b82f6' }} />
        <style>{spinKeyframes}</style>
      </div>
    );
  }

  // ─── Invalid / Expired ───────────────────────────────────────────
  if (invalid || !invite) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', padding: '48px 32px' }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #fef2f2, #fee2e2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <AlertCircle size={32} color="#ef4444" />
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              Invalid or Expired Invite
            </h1>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.6, maxWidth: '320px', margin: '0 auto' }}>
              This invite link is no longer valid. It may have already been used or has expired.
              Please contact your administrator for a new invite.
            </p>
          </div>
        </div>
        <style>{spinKeyframes}</style>
      </div>
    );
  }

  // ─── Success ─────────────────────────────────────────────────────
  if (success) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', padding: '48px 32px' }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <CheckCircle2 size={32} color="#10b981" />
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              Account Created Successfully!
            </h1>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.6 }}>
              Your account has been set up with all the predefined access and permissions.
              Redirecting you to the dashboard...
            </p>
            <div style={{ marginTop: '20px' }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: '#3b82f6' }} />
            </div>
          </div>
        </div>
        <style>{spinKeyframes}</style>
      </div>
    );
  }

  // ─── Signup Form ─────────────────────────────────────────────────
  return (
    <div style={containerStyle}>
      {/* Decorative blobs */}
      <div style={{
        position: 'fixed', top: '-20%', right: '-10%', width: '500px', height: '500px',
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed', bottom: '-15%', left: '-8%', width: '400px', height: '400px',
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: '460px' }}>
        {/* Invite details banner */}
        <div style={{
          background: 'linear-gradient(135deg, #1e293b, #334155)',
          borderRadius: '20px 20px 0 0',
          padding: '28px 32px',
          color: 'white',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <KeyRound size={20} />
            </div>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em' }}>
                Partner Invitation
              </h1>
              <p style={{ fontSize: '13px', opacity: 0.7, marginTop: '2px' }}>
                Complete your account setup
              </p>
            </div>
          </div>

          <div style={{
            display: 'flex', gap: '12px', flexWrap: 'wrap',
          }}>
            <div style={tagStyle}>
              <ShieldCheck size={13} />
              <span>{invite.role}</span>
            </div>
            <div style={tagStyle}>
              <Globe size={13} />
              <span>{invite.country}</span>
            </div>
          </div>
        </div>

        {/* Signup form card */}
        <div style={{
          ...cardStyle,
          borderRadius: '0 0 20px 20px',
          borderTop: 'none',
        }}>
          <form onSubmit={handleSignup} style={{ padding: '28px 32px' }}>
            <div style={{ marginBottom: '18px' }}>
              <label style={labelStyle}>Full Name</label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={iconStyle} />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Enter your full name"
                  style={{ ...inputStyle, paddingLeft: '40px' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={labelStyle}>Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={iconStyle} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{ ...inputStyle, paddingLeft: '40px' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={labelStyle}>Username <span style={{ color: '#ef4444' }}>*</span></label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={iconStyle} />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Choose a username"
                  style={{ ...inputStyle, paddingLeft: '40px' }}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
              <div>
                <label style={labelStyle}>Password <span style={{ color: '#ef4444' }}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={iconStyle} />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min 6 chars"
                    style={{ ...inputStyle, paddingLeft: '40px' }}
                    required
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Confirm Password <span style={{ color: '#ef4444' }}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={iconStyle} />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter"
                    style={{ ...inputStyle, paddingLeft: '40px' }}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Permissions preview */}
            <div style={{
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px',
              padding: '14px 16px', marginBottom: '20px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Pre-configured Access
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {invite.permissions?.can_update_status && (
                  <span style={permBadge}>✓ Update Status</span>
                )}
                {invite.permissions?.can_view_companies && (
                  <span style={permBadge}>✓ View Companies</span>
                )}
                {invite.permissions?.can_message && (
                  <span style={permBadge}>✓ Messaging</span>
                )}
                {invite.permissions?.auditor_access?.length > 0 && (
                  <span style={permBadge}>✓ {invite.permissions.auditor_access.length} Auditor(s)</span>
                )}
                {!invite.permissions?.can_update_status && !invite.permissions?.can_view_companies &&
                 !invite.permissions?.can_message && (!invite.permissions?.auditor_access || invite.permissions.auditor_access.length === 0) && (
                  <span style={{ ...permBadge, background: '#fef3c7', color: '#92400e' }}>Default Access</span>
                )}
              </div>
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: '10px',
                background: '#fff0f0', color: '#ef4444',
                fontSize: '13px', marginBottom: '16px', border: '1px solid #ffd4d4',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <AlertCircle size={15} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%', padding: '13px 20px', fontSize: '15px', fontWeight: 600,
                background: '#3b82f6', color: 'white', border: 'none', borderRadius: '12px',
                cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: '8px',
                opacity: submitting ? 0.7 : 1, transition: 'all 0.2s ease',
                fontFamily: 'inherit',
              }}
            >
              {submitting ? (
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <>
                  Create Account
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            <p style={{
              textAlign: 'center', fontSize: '12px', color: '#94a3b8', marginTop: '16px', lineHeight: 1.5,
            }}>
              By creating an account, your role, permissions, and country access will be automatically configured.
            </p>
          </form>
        </div>

        <p style={{
          textAlign: 'center', fontSize: '12px', color: '#94a3b8', marginTop: '20px',
        }}>
          © {new Date().getFullYear()} Digital Ledger. All rights reserved.
        </p>
      </div>

      <style>{spinKeyframes}</style>
    </div>
  );
}

// ─── Shared styles ─────────────────────────────────────────────────
const spinKeyframes = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 50%, #d5dbe6 100%)',
  padding: '20px',
};

const cardStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.97)',
  borderRadius: '20px',
  boxShadow: '0 12px 40px rgba(0,0,0,0.1)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 500,
  color: '#475569',
  marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  fontSize: '14px',
  fontFamily: 'inherit',
  background: '#fff',
  color: '#0f172a',
  outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s',
};

const iconStyle: React.CSSProperties = {
  position: 'absolute',
  left: '14px',
  top: '50%',
  transform: 'translateY(-50%)',
  color: '#94a3b8',
};

const tagStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '4px 12px',
  borderRadius: '8px',
  background: 'rgba(255,255,255,0.12)',
  fontSize: '12px',
  fontWeight: 500,
};

const permBadge: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: '6px',
  fontSize: '11px',
  fontWeight: 500,
  background: '#ecfdf5',
  color: '#065f46',
  border: '1px solid #a7f3d0',
};
