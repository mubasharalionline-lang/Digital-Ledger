'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { User } from '@/lib/supabase';
import { Settings, Lock, Loader2, Save, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    const { user: u } = getSession();
    if (!u) {
      router.push('/');
      return;
    }
    setUser(u);
  }, [router]);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: 'Please fill in all password fields' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'New password must be at least 6 characters' });
      return;
    }

    setLoading(true);

    try {
      // First verify the current password
      const { data: userData, error: verifyError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user?.id)
        .eq('password', currentPassword)
        .single();

      if (verifyError || !userData) {
        setMessage({ type: 'error', text: 'Current password is incorrect' });
        setLoading(false);
        return;
      }

      // Update the password
      const { error: updateError } = await supabase
        .from('users')
        .update({ password: newPassword })
        .eq('id', user?.id);

      if (updateError) throw updateError;

      setMessage({ type: 'success', text: 'Password successfully updated' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error('Error changing password:', err);
      setMessage({ type: 'error', text: 'Failed to update password. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;

  return (
    <div>
      {/* Header */}
      <div className="animate-fadeIn" style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '28px',
      }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #e8f4fd, #d4ecfb)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent)',
        }}>
          <Settings size={22} />
        </div>
        <div>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
          }}>
            Account Settings
          </h1>
          <p style={{
            fontSize: '14px',
            color: 'var(--text-secondary)',
            marginTop: '2px',
          }}>
            Manage your personal preferences and security
          </p>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '24px',
      }}>
        {/* Profile Info Card (Read Only) */}
        <div className="card animate-slideUp">
          <div style={{
            padding: '20px',
            borderBottom: '1px solid var(--border-light)',
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Profile Information</h2>
          </div>
          <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: '16px' }}>
              <label className="label">Username</label>
              <div style={{
                padding: '10px 14px',
                background: 'var(--bg-tertiary)',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                color: 'var(--text-secondary)',
                fontSize: '14px',
                fontWeight: 500,
              }}>
                {user.username}
              </div>
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <label className="label">Role</label>
              <div style={{
                padding: '10px 14px',
                background: 'var(--bg-tertiary)',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                color: 'var(--text-secondary)',
                fontSize: '14px',
                fontWeight: 500,
                textTransform: 'capitalize',
              }}>
                {user.role}
              </div>
            </div>

            {user.country && (
              <div style={{ marginBottom: '16px' }}>
                <label className="label">Country</label>
                <div style={{
                  padding: '10px 14px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  color: 'var(--text-secondary)',
                  fontSize: '14px',
                  fontWeight: 500,
                }}>
                  {user.country}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Change Password Card */}
        <div className="card animate-slideUp" style={{ animationDelay: '0.1s' }}>
          <div style={{
            padding: '20px',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <Lock size={18} color="var(--accent)" />
            <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Change Password</h2>
          </div>
          
          <form onSubmit={handlePasswordChange} style={{ padding: '20px' }}>
            {message && (
              <div style={{
                padding: '12px 16px',
                borderRadius: '8px',
                background: message.type === 'error' ? '#fff0f0' : '#e8f8ec',
                color: message.type === 'error' ? 'var(--danger)' : 'var(--success)',
                fontSize: '13px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '20px',
              }}>
                {message.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                {message.text}
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label className="label">Current Password</label>
              <input
                type="password"
                className="input"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <label className="label">New Password</label>
              <input
                type="password"
                className="input"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 characters)"
              />
            </div>
            
            <div style={{ marginBottom: '24px' }}>
              <label className="label">Confirm New Password</label>
              <input
                type="password"
                className="input"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
              disabled={loading || !currentPassword || !newPassword || !confirmPassword}
            >
              {loading ? (
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <Save size={18} />
              )}
              Update Password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
