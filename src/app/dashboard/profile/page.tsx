'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, setSession, getDataCountry, isAdmin } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { User, Auditor } from '@/lib/supabase';
import { getStoredTheme, applyTheme, ThemeMode } from '@/lib/theme';
import CountryFlag from '@/components/CountryFlag';
import { formatDate } from '@/lib/dateUtils';
import {
  User as UserIcon,
  Lock,
  KeyRound,
  Shield,
  Sun,
  Moon,
  Laptop,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Save,
  Loader2,
  Sparkles,
  Check,
  Building2,
  CalendarCheck2,
  BarChart3,
  Layers,
  ShieldCheck,
  CheckCheck
} from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [country, setCountry] = useState<string>('Bahrain');
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>('light');
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeToast, setThemeToast] = useState<string | null>(null);

  // Password fields state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Accessible Auditors list
  const [accessibleAuditorNames, setAccessibleAuditorNames] = useState<string[]>([]);

  useEffect(() => {
    const { user: u, country: c } = getSession();
    if (!u) {
      router.push('/');
      return;
    }
    setUser(u);
    const activeCountry = c || getDataCountry() || u.country || 'Bahrain';
    setCountry(activeCountry);
    setCurrentTheme(getStoredTheme());

    // Fetch fresh user data and auditors from Supabase
    async function loadFreshData() {
      if (!u) return;
      try {
        const { data: dbUser } = await supabase
          .from('users')
          .select('*')
          .eq('id', u.id)
          .maybeSingle();

        if (dbUser) {
          const freshUser: User = { ...u, ...dbUser };
          setUser(freshUser);
          setSession(freshUser, activeCountry);
          if (dbUser.permissions?.theme) {
            setCurrentTheme(dbUser.permissions.theme as ThemeMode);
            applyTheme(dbUser.permissions.theme as ThemeMode);
          }

          // Load accessible auditor names if any
          const auditorIds: string[] = dbUser.permissions?.auditor_access || [];
          if (auditorIds.length > 0) {
            const { data: auds } = await supabase
              .from('auditors')
              .select('id, name')
              .in('id', auditorIds);
            if (auds) {
              setAccessibleAuditorNames(auds.map(a => a.name));
            }
          }
        }
      } catch (err) {
        console.error('Error loading fresh profile data:', err);
      }
    }

    loadFreshData();

    const handleThemeChange = (e: any) => {
      if (e.detail?.theme) setCurrentTheme(e.detail.theme);
    };
    window.addEventListener('app-theme-changed', handleThemeChange);
    return () => window.removeEventListener('app-theme-changed', handleThemeChange);
  }, [router]);

  // Handle Theme Selection & Permanent Persistence
  const handleSelectTheme = async (mode: ThemeMode) => {
    setCurrentTheme(mode);
    applyTheme(mode);
    setThemeSaving(true);

    if (user) {
      try {
        const updatedPermissions = {
          ...(user.permissions || {}),
          theme: mode,
        };

        const { error } = await supabase
          .from('users')
          .update({ permissions: updatedPermissions })
          .eq('id', user.id);

        if (!error) {
          const updatedUser: User = { ...user, permissions: updatedPermissions };
          setUser(updatedUser);
          setSession(updatedUser, country);
        }
      } catch (err) {
        console.warn('Could not save theme preference to user record:', err);
      } finally {
        setThemeSaving(false);
      }
    }

    setThemeToast(`Theme changed to ${mode === 'system' ? 'System default' : mode + ' mode'}`);
    setTimeout(() => setThemeToast(null), 3000);
  };

  // Handle Independent Password Change
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (!user) return;

    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setPasswordMessage({ type: 'error', text: 'Please fill in all password fields.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match. Please verify.' });
      return;
    }

    if (newPassword.length < 5) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 5 characters long.' });
      return;
    }

    setPasswordLoading(true);

    try {
      // 1. Verify current password matches DB
      const { data: verified, error: verifyErr } = await supabase
        .from('users')
        .select('id, password')
        .eq('id', user.id)
        .eq('password', currentPassword.trim())
        .maybeSingle();

      if (verifyErr || !verified) {
        setPasswordMessage({ type: 'error', text: 'Current password is incorrect. Please try again.' });
        setPasswordLoading(false);
        return;
      }

      // 2. Update to new password
      const { error: updateErr } = await supabase
        .from('users')
        .update({ password: newPassword.trim() })
        .eq('id', user.id);

      if (updateErr) {
        setPasswordMessage({ type: 'error', text: `Failed to update password: ${updateErr.message}` });
        setPasswordLoading(false);
        return;
      }

      // Clear input fields and show success alert
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage({
        type: 'success',
        text: 'Your password has been changed successfully!'
      });
      setTimeout(() => setPasswordMessage(null), 6000);
    } catch (err: any) {
      setPasswordMessage({ type: 'error', text: err.message || 'An unexpected error occurred.' });
    } finally {
      setPasswordLoading(false);
    }
  };

  if (!user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-secondary)' }}>
        <Loader2 className="animate-spin" size={24} color="var(--accent)" />
      </div>
    );
  }

  const isAdminUser = isAdmin(user);
  const perms = user.permissions || {};
  const hasAuditorAccess = (perms.auditor_access || []).length > 0;

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '22px' }}>
      
      {/* ─── Page Header ─── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <UserIcon size={24} color="var(--accent)" />
            <span>My Profile</span>
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Manage your personal account credentials, change password, and configure your appearance theme.
          </p>
        </div>

        {country && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '10px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--card-shadow)',
            fontSize: '13px',
            fontWeight: 650,
            color: 'var(--text-primary)'
          }}>
            <CountryFlag name={country} size={18} />
            <span>{country} Workspace</span>
          </div>
        )}
      </div>

      {/* ─── Profile & Account Overview Card ─── */}
      <div className="card glass" style={{
        background: 'var(--bg-secondary)',
        borderRadius: '18px',
        border: '1px solid var(--border)',
        boxShadow: 'var(--card-shadow)',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '22px 24px',
          borderBottom: '1px solid var(--border-light)',
          background: 'var(--bg-tertiary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* User Avatar */}
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              fontWeight: 800,
              boxShadow: '0 4px 12px rgba(37,99,235,0.28)'
            }}>
              {user.username.charAt(0).toUpperCase()}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  {user.username}
                </h2>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  background: isAdminUser ? 'rgba(245, 158, 11, 0.15)' : 'var(--accent-light)',
                  color: isAdminUser ? '#f59e0b' : 'var(--accent)',
                  border: isAdminUser ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)'
                }}>
                  <Shield size={11} /> {user.role || 'Partner'}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Member since {user.created_at ? formatDate(user.created_at) : 'Active'} · Region: <strong>{user.country || country}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#15803d',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              padding: '4px 10px',
              borderRadius: '20px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <CheckCircle2 size={12} color="#16a34a" /> Account Active
            </span>
          </div>
        </div>

        {/* Assigned Permissions & Access Summary */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{
            fontSize: '11.5px',
            fontWeight: 750,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '10px'
          }}>
            Assigned Permissions & Workspace Scope
          </div>

          {isAdminUser ? (
            <div style={{
              padding: '12px 16px',
              borderRadius: '10px',
              background: 'var(--accent-light)',
              border: '1px solid rgba(37,99,235,0.2)',
              color: 'var(--accent)',
              fontSize: '13px',
              fontWeight: 650,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <ShieldCheck size={16} />
              Full Administrator Controller Access — You have full rights to manage staff, tasks, companies, and reports.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '8px'
              }}>
                <div style={{ fontSize: '12px', color: perms.can_update_status !== false ? '#10b981' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCheck size={14} color={perms.can_update_status !== false ? '#10b981' : '#94a3b8'} />
                  Status Updates: {perms.can_update_status !== false ? 'Enabled' : 'Disabled'}
                </div>
                <div style={{ fontSize: '12px', color: perms.can_view_companies ? '#2563eb' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building2 size={14} color={perms.can_view_companies ? '#2563eb' : '#94a3b8'} />
                  Company Directory: {perms.can_view_companies ? 'Enabled' : 'Disabled'}
                </div>
                <div style={{ fontSize: '12px', color: perms.can_create_tasks ? '#10b981' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={14} color={perms.can_create_tasks ? '#10b981' : '#94a3b8'} />
                  Create Tasks: {perms.can_create_tasks ? 'Enabled' : 'Disabled'}
                </div>
                <div style={{ fontSize: '12px', color: (perms.can_view_daily_tasks || perms.can_manage_daily_tasks) ? '#d97706' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CalendarCheck2 size={14} color={(perms.can_view_daily_tasks || perms.can_manage_daily_tasks) ? '#d97706' : '#94a3b8'} />
                  Daily Tasks: {(perms.can_view_daily_tasks || perms.can_manage_daily_tasks) ? 'Enabled' : 'Disabled'}
                </div>
                <div style={{ fontSize: '12px', color: perms.can_view_reports ? '#7c3aed' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <BarChart3 size={14} color={perms.can_view_reports ? '#7c3aed' : '#94a3b8'} />
                  Reports Dashboard: {perms.can_view_reports ? 'Enabled' : 'Disabled'}
                </div>
                <div style={{ fontSize: '12px', color: perms.can_export_data !== false ? '#0284c7' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={14} color={perms.can_export_data !== false ? '#0284c7' : '#94a3b8'} />
                  Excel Data Export: {perms.can_export_data !== false ? 'Enabled' : 'Disabled'}
                </div>
              </div>

              {/* Auditor Access Highlight */}
              <div style={{
                marginTop: '4px',
                padding: '10px 14px',
                borderRadius: '10px',
                background: hasAuditorAccess ? 'rgba(37,99,235,0.06)' : 'var(--bg-tertiary)',
                border: hasAuditorAccess ? '1px solid rgba(37,99,235,0.2)' : '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={16} color={hasAuditorAccess ? '#2563eb' : '#64748b'} />
                  <span style={{ fontSize: '12.5px', fontWeight: 650, color: hasAuditorAccess ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    Auditor View Access:
                  </span>
                  <span style={{ fontSize: '12.5px', color: hasAuditorAccess ? 'var(--accent)' : 'var(--text-tertiary)', fontWeight: hasAuditorAccess ? 700 : 500 }}>
                    {hasAuditorAccess
                      ? `${perms.auditor_access?.length} Auditor(s) Granted`
                      : 'None assigned (direct tasks only)'}
                  </span>
                </div>
                {accessibleAuditorNames.length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {accessibleAuditorNames.map(name => (
                      <span key={name} style={{
                        fontSize: '11px',
                        fontWeight: 650,
                        padding: '2px 7px',
                        borderRadius: '5px',
                        background: '#dbeafe',
                        color: '#1d4ed8',
                        border: '1px solid #bfdbfe'
                      }}>
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Two-Column Layout: Theme Settings & Password Change ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '22px'
      }}>

        {/* ─── Card A: Theme Preferences (Light / Dark Toggle) ─── */}
        <div className="card glass" style={{
          background: 'var(--bg-secondary)',
          borderRadius: '18px',
          border: '1px solid var(--border)',
          boxShadow: 'var(--card-shadow)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '18px 22px',
            borderBottom: '1px solid var(--border-light)',
            background: 'var(--bg-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Sun size={18} color="var(--accent)" />
              <div>
                <h3 style={{ fontSize: '15.5px', fontWeight: 750, color: 'var(--text-primary)', margin: 0 }}>
                  Theme & Display Appearance
                </h3>
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Toggle between Light and Dark interface mode
                </div>
              </div>
            </div>

            {themeToast && (
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '6px' }}>
                ✓ Saved
              </span>
            )}
          </div>

          <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '0 0 4px 0', lineHeight: 1.5 }}>
              Choose your preferred visual theme. Your choice is automatically saved to your partner profile and applied across every view.
            </p>

            {/* Option 1: Light Mode */}
            <div
              onClick={() => handleSelectTheme('light')}
              style={{
                border: currentTheme === 'light' ? '2px solid #2563eb' : '1px solid var(--border)',
                borderRadius: '12px',
                padding: '14px 16px',
                cursor: 'pointer',
                background: currentTheme === 'light' ? 'var(--accent-light)' : 'var(--bg-secondary)',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: currentTheme === 'light' ? '0 3px 10px rgba(37,99,235,0.12)' : 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: currentTheme === 'light' ? '#2563eb' : 'var(--bg-tertiary)',
                  color: currentTheme === 'light' ? '#ffffff' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Sun size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 750, color: 'var(--text-primary)' }}>
                    Light Theme
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '1px' }}>
                    Crisp white backgrounds and clean contrast
                  </div>
                </div>
              </div>

              {currentTheme === 'light' && (
                <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={13} strokeWidth={3} />
                </span>
              )}
            </div>

            {/* Option 2: Dark Mode */}
            <div
              onClick={() => handleSelectTheme('dark')}
              style={{
                border: currentTheme === 'dark' ? '2px solid #3b82f6' : '1px solid var(--border)',
                borderRadius: '12px',
                padding: '14px 16px',
                cursor: 'pointer',
                background: currentTheme === 'dark' ? 'var(--accent-light)' : 'var(--bg-secondary)',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: currentTheme === 'dark' ? '0 3px 10px rgba(59,130,246,0.18)' : 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: currentTheme === 'dark' ? '#3b82f6' : 'var(--bg-tertiary)',
                  color: currentTheme === 'dark' ? '#ffffff' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Moon size={19} />
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 750, color: 'var(--text-primary)' }}>
                    Dark Theme
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '1px' }}>
                    Dark slate surfaces, reduced eye strain in low light
                  </div>
                </div>
              </div>

              {currentTheme === 'dark' && (
                <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={13} strokeWidth={3} />
                </span>
              )}
            </div>

            {/* Option 3: System Mode */}
            <div
              onClick={() => handleSelectTheme('system')}
              style={{
                border: currentTheme === 'system' ? '2px solid #8b5cf6' : '1px solid var(--border)',
                borderRadius: '12px',
                padding: '14px 16px',
                cursor: 'pointer',
                background: currentTheme === 'system' ? 'rgba(139, 92, 246, 0.1)' : 'var(--bg-secondary)',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: currentTheme === 'system' ? '0 3px 10px rgba(139,92,246,0.15)' : 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: currentTheme === 'system' ? '#8b5cf6' : 'var(--bg-tertiary)',
                  color: currentTheme === 'system' ? '#ffffff' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Laptop size={19} />
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 750, color: 'var(--text-primary)' }}>
                    System Preference
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '1px' }}>
                    Matches your OS or device light/dark configuration
                  </div>
                </div>
              </div>

              {currentTheme === 'system' && (
                <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#8b5cf6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={13} strokeWidth={3} />
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ─── Card B: Change Password ─── */}
        <div className="card glass" style={{
          background: 'var(--bg-secondary)',
          borderRadius: '18px',
          border: '1px solid var(--border)',
          boxShadow: 'var(--card-shadow)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '18px 22px',
            borderBottom: '1px solid var(--border-light)',
            background: 'var(--bg-tertiary)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <KeyRound size={18} color="var(--accent)" />
            <div>
              <h3 style={{ fontSize: '15.5px', fontWeight: 750, color: 'var(--text-primary)', margin: 0 }}>
                Change Account Password
              </h3>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Independently update your partner login credentials
              </div>
            </div>
          </div>

          <form onSubmit={handlePasswordSubmit} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
            
            {passwordMessage && (
              <div style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: passwordMessage.type === 'error' ? '#fef2f2' : '#f0fdf4',
                border: `1px solid ${passwordMessage.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
                color: passwordMessage.type === 'error' ? '#dc2626' : '#15803d',
                fontSize: '12.5px',
                fontWeight: 650,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                {passwordMessage.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                <span>{passwordMessage.text}</span>
              </div>
            )}

            {/* Current Password */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: 'var(--text-secondary)', marginBottom: '5px' }}>
                Current Password *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showCurrentPass ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                  required
                  style={{
                    width: '100%',
                    padding: '9px 36px 9px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid var(--border)',
                    fontSize: '13px',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    background: 'var(--bg-secondary)',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPass(!showCurrentPass)}
                  style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '4px'
                  }}
                  title={showCurrentPass ? 'Hide password' : 'Show password'}
                >
                  {showCurrentPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: 'var(--text-secondary)', marginBottom: '5px' }}>
                New Password *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNewPass ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min. 5 characters"
                  required
                  style={{
                    width: '100%',
                    padding: '9px 36px 9px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid var(--border)',
                    fontSize: '13px',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    background: 'var(--bg-secondary)',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '4px'
                  }}
                  title={showNewPass ? 'Hide password' : 'Show password'}
                >
                  {showNewPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: 'var(--text-secondary)', marginBottom: '5px' }}>
                Confirm New Password *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirmPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  style={{
                    width: '100%',
                    padding: '9px 36px 9px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid var(--border)',
                    fontSize: '13px',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    background: 'var(--bg-secondary)',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPass(!showConfirmPass)}
                  style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '4px'
                  }}
                  title={showConfirmPass ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
              <button
                type="submit"
                disabled={passwordLoading || !currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()}
                style={{
                  width: '100%',
                  padding: '11px 18px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  fontSize: '13.5px',
                  fontWeight: 650,
                  cursor: (passwordLoading || !currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (passwordLoading || !currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) ? 0.6 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
                  transition: 'all 0.15s ease'
                }}
              >
                {passwordLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Updating Password...</span>
                  </>
                ) : (
                  <>
                    <Lock size={15} />
                    <span>Save New Password</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
