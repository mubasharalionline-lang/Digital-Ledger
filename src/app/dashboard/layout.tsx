'use client';

import React, { useEffect, useState, useCallback, ReactNode, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getSession, clearSession, isAdmin, isSuperAdmin, setSession } from '@/lib/auth';
import { getTerminology } from '@/lib/terminology';
import { supabase } from '@/lib/supabase';
import type { User } from '@/lib/supabase';
import {
  LayoutDashboard, Building2, ListTodo, Users, LogOut,
  ChevronLeft, ChevronRight, Menu, ChevronDown, Settings,
  ClipboardList, Edit, Plus, X, Loader2, Globe, CalendarDays
} from 'lucide-react';
import CountryFlag from '@/components/CountryFlag';
import { initTheme } from '@/lib/theme';

interface NavItem { label: string; href: string; icon: ReactNode; adminOnly?: boolean; }
interface CountryRecord { id: string; code: string; name: string; flag: string; }

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countries, setCountries] = useState<CountryRecord[]>([]);
  const [showAddCountry, setShowAddCountry] = useState(false);
  const [newCountryName, setNewCountryName] = useState('');
  const [newCountryCode, setNewCountryCode] = useState('');
  const [newCountryFlag, setNewCountryFlag] = useState('🌍');
  const [addingCountry, setAddingCountry] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const loadCountries = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('countries').select('id, code, name, flag').order('name');
      if (!error && data && data.length > 0) { setCountries(data); return; }
    } catch {}
    // Fallback if table doesn't exist yet
    setCountries([
      { id: '1', code: 'BH', name: 'Bahrain', flag: '🇧🇭' },
      { id: '2', code: 'NZ', name: 'New Zealand', flag: '🇳🇿' },
      { id: '3', code: 'UAE', name: 'UAE', flag: '🇦🇪' },
    ]);
  }, []);

  useEffect(() => {
    initTheme();
    const { user: u, country: c } = getSession();
    if (!u) { router.push('/'); return; }
    setUser(u);
    setCountry(c);
    loadCountries();

    // Listen for cross-tab session changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'dl_user') {
        // If session was cleared or changed to a different user, reload to sync UI
        const newUserStr = e.newValue;
        if (!newUserStr) {
          router.push('/');
        } else {
          try {
            const newUser = JSON.parse(newUserStr);
            if (newUser.id !== u.id) {
              window.location.reload();
            }
          } catch (err) {
            window.location.reload();
          }
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [router, loadCountries]);

  const handleLogout = () => { clearSession(); router.push('/'); };

  const handleCountrySwitch = (countryName: string) => {
    if (!user) return;
    setSession(user, countryName);
    setCountry(countryName);
    sessionStorage.clear();
    setShowCountryPicker(false);
    window.location.reload();
  };

  const handleAddCountry = async () => {
    if (!newCountryName.trim() || !newCountryCode.trim()) return;
    setAddingCountry(true);
    const countryName = newCountryName.trim();
    
    try {
      // 1. Create the new country
      const { error } = await supabase.from('countries').insert({
        name: countryName,
        code: newCountryCode.trim().toUpperCase(),
        flag: newCountryFlag || '🌍',
      });
      
      if (error) { 
        alert('Error creating country: ' + error.message); 
        setAddingCountry(false);
        return; 
      }

      // 2. Clone Statuses from Bahrain
      const { data: bahrainStatuses } = await supabase.from('statuses').select('*').eq('country', 'Bahrain');
      if (bahrainStatuses && bahrainStatuses.length > 0) {
        const clonedStatuses = bahrainStatuses.map(s => ({
          name: s.name,
          color: s.color,
          order_index: s.order_index,
          active: s.active,
          country: countryName
        }));
        await supabase.from('statuses').insert(clonedStatuses);
      }

      // 3. Clone Task Types from Bahrain
      // Note: We added a 'country' column via SQL to ensure complete data isolation.
      const { data: bahrainTaskTypes } = await supabase.from('task_types').select('*').eq('country', 'Bahrain');
      if (bahrainTaskTypes && bahrainTaskTypes.length > 0) {
        const clonedTaskTypes = bahrainTaskTypes.map(t => ({
          name: t.name,
          category: t.category,
          jurisdiction: t.jurisdiction,
          status_options: t.status_options,
          description: t.description,
          active: t.active,
          country: countryName
        }));
        await supabase.from('task_types').insert(clonedTaskTypes);
      }

      setNewCountryName(''); setNewCountryCode(''); setNewCountryFlag('🌍');
      setShowAddCountry(false);
      await loadCountries();
      handleCountrySwitch(countryName);
    } catch { 
      alert('Failed to create country.'); 
    }
    setAddingCountry(false);
  };

  const currentCountryData = countries.find(c => c.name === country || c.code === country);
  const terms = useMemo(() => getTerminology(country), [country]);

  // Unified nav — same for all countries
  const navItems: NavItem[] = useMemo(() => {
    const canViewCompanies = user?.permissions?.can_view_companies === true;
    return [
      { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={20} /> },
      { label: 'Companies', href: '/dashboard/companies', icon: <Building2 size={20} />, adminOnly: !canViewCompanies },
      { label: 'Tasks', href: '/dashboard/tasks', icon: <ListTodo size={20} /> },
      { label: 'Daily Tasks', href: '/dashboard/daily-tasks', icon: <CalendarDays size={20} /> },
      { label: 'Task Types', href: '/dashboard/task-types', icon: <ClipboardList size={20} />, adminOnly: true },
      { label: terms.staffSingular + 's', href: '/dashboard/staff', icon: <Users size={20} />, adminOnly: true },
      { label: 'Edits', href: '/dashboard/edits', icon: <Edit size={20} />, adminOnly: true },
      { label: 'Settings', href: '/dashboard/settings', icon: <Settings size={20} />, adminOnly: true },
    ];
  }, [terms, user]);

  if (!user) return null;
  const filteredNav = navItems.filter(item => !item.adminOnly || isAdmin(user));

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', background: 'var(--bg-primary)', overflowX: 'hidden' }}>
      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', zIndex: 40, display: 'none' }}
          className="mobile-overlay" />
      )}

      {/* Sidebar */}
      <aside className={`glass sidebar ${mobileOpen ? 'mobile-open' : ''}`}
        style={{
          width: collapsed ? '68px' : '236px', minHeight: '100vh', position: 'fixed',
          left: 0, top: 0, bottom: 0, display: 'flex', flexDirection: 'column',
          background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border)',
          boxShadow: 'var(--card-shadow)',
          transition: 'transform 0.25s cubic-bezier(0.25,0.1,0.25,1), width 0.25s cubic-bezier(0.25,0.1,0.25,1)',
          zIndex: 50, overflow: 'hidden',
        }}>
        {/* Brand / Logo */}
        <div style={{
          padding: collapsed ? '14px 8px' : '14px 16px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
          gap: '10px', minHeight: '56px'
        }}>
          <div style={{ overflow: 'hidden', height: '38px', width: collapsed ? '38px' : '180px', transition: 'width 0.25s ease', position: 'relative' }}>
            <img src="/logo.png" alt="The Digital Ledger"
              style={{
                position: 'absolute', top: 0, left: 0, height: '100%', width: '100%',
                objectFit: collapsed ? 'cover' : 'contain', objectPosition: 'left center',
                transform: collapsed ? 'scale(2.2) translateX(4px)' : 'scale(2.2)',
                transformOrigin: 'left center', transition: 'all 0.25s ease'
              }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
        </div>

        {/* Country Switcher (Super Admin only) */}
        {isSuperAdmin(user) && (
          <div style={{ padding: collapsed ? '8px 6px' : '8px 12px', borderBottom: '1px solid var(--border-light)', position: 'relative' }}>
            <button onClick={() => setShowCountryPicker(!showCountryPicker)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                padding: collapsed ? '8px' : '7px 10px', borderRadius: '10px',
                border: '1px solid var(--border)',
                background: showCountryPicker ? 'var(--accent-light)' : 'var(--bg-tertiary)',
                cursor: 'pointer', transition: 'all 0.15s ease',
                justifyContent: collapsed ? 'center' : 'flex-start', fontFamily: 'inherit',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = showCountryPicker ? 'var(--accent-light)' : 'var(--bg-tertiary)'; }}
              title={collapsed ? `${country || 'Switch Country'}` : undefined}>
              <CountryFlag code={currentCountryData?.code || country || ''} name={currentCountryData?.name || country || ''} flagEmoji={currentCountryData?.flag} size={16} />
              {!collapsed && (
                <>
                  <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentCountryData?.name || country || 'Select Country'}
                  </span>
                  <ChevronDown size={13} color="var(--text-tertiary)" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: showCountryPicker ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </>
              )}
            </button>

            {showCountryPicker && (
              <div className="animate-fadeIn" style={{
                position: 'absolute', top: '100%', left: collapsed ? '8px' : '12px',
                right: collapsed ? '-120px' : '12px', minWidth: collapsed ? '220px' : undefined,
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: '14px', boxShadow: 'var(--card-shadow-hover)',
                zIndex: 999, overflow: 'hidden', marginTop: '6px',
              }}>
                <div onClick={() => setShowCountryPicker(false)} style={{ position: 'fixed', inset: 0, zIndex: -1 }} />
                <div style={{ padding: '6px 0' }}>
                  {countries.map(c => {
                    const isSelected = c.name === country || c.code === country;
                    return (
                      <button key={c.id} onClick={() => handleCountrySwitch(c.name)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                          padding: '9px 14px', border: 'none',
                          background: isSelected ? 'var(--accent-light)' : 'transparent',
                          cursor: 'pointer', fontSize: '13px',
                          fontWeight: isSelected ? 600 : 500,
                          color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                          transition: 'all 0.15s ease', textAlign: 'left', fontFamily: 'inherit',
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <CountryFlag code={c.code} name={c.name} flagEmoji={c.flag} size={18} />
                        <div style={{ flex: 1 }}>
                          <div style={{ lineHeight: 1.2 }}>{c.name}</div>
                          <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', fontWeight: 500 }}>{c.code}</div>
                        </div>
                        {isSelected && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
                {/* Add Country Button */}
                <button onClick={() => { setShowCountryPicker(false); setShowAddCountry(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                    padding: '11px 14px', borderTop: '1px solid var(--border-light)', background: 'var(--bg-tertiary)',
                    cursor: 'pointer', fontSize: '12.5px', fontWeight: 600,
                    color: 'var(--accent)', fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                >
                  <Plus size={14} /> Add New Country
                </button>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav style={{ flex: 1, padding: collapsed ? '10px 6px' : '12px 10px', display: 'flex', flexDirection: 'column', gap: '3px', overflowY: 'auto' }}>
          {filteredNav.map((item, idx) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            const isFirstAdminItem = item.adminOnly && (idx === 0 || !filteredNav[idx - 1]?.adminOnly);
            
            return (
              <React.Fragment key={item.href}>
                {isFirstAdminItem && !collapsed && (
                  <div style={{
                    fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)',
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    padding: '16px 12px 6px 12px'
                  }}>
                    Admin
                  </div>
                )}
                {isFirstAdminItem && collapsed && (
                  <div style={{ height: '1px', background: 'var(--border)', margin: '8px 4px' }} />
                )}
                <button
                  onClick={() => { router.push(item.href); setMobileOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '11px',
                    padding: collapsed ? '10px' : '9px 12px', borderRadius: '10px',
                    border: isActive ? '1px solid var(--accent-light)' : '1px solid transparent',
                    background: isActive ? 'var(--accent-light)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: '13.5px', fontWeight: isActive ? 600 : 500,
                    transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)', textAlign: 'left',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    width: '100%', fontFamily: 'inherit',
                    position: 'relative',
                    boxShadow: isActive ? '0 1px 3px rgba(37, 99, 235, 0.08)' : 'none'
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'var(--bg-tertiary)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }
                  }}
                  title={collapsed ? item.label : undefined}>
                  {isActive && !collapsed && (
                    <span style={{
                      position: 'absolute', left: '-2px', top: '25%', bottom: '25%',
                      width: '3.5px', borderRadius: '0 4px 4px 0', background: 'var(--accent)'
                    }} />
                  )}
                  <span style={{
                    flexShrink: 0, display: 'flex',
                    color: isActive ? 'var(--accent)' : 'var(--text-tertiary)',
                    transition: 'color 0.15s ease'
                  }}>
                    {React.cloneElement(item.icon as React.ReactElement<any>, { size: 18, strokeWidth: isActive ? 2.2 : 1.9 })}
                  </span>
                  {!collapsed && <span style={{ letterSpacing: '-0.01em' }}>{item.label}</span>}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Bottom User & Collapse */}
        <div style={{ padding: '10px', borderTop: '1px solid var(--border-light)', background: 'var(--bg-tertiary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Collapse Button */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between',
              padding: collapsed ? '8px 0' : '8px 12px', borderRadius: '10px',
              border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)',
              cursor: 'pointer', fontSize: '12px', width: '100%',
              transition: 'all 0.15s ease', fontFamily: 'inherit', fontWeight: 600,
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--accent-light)';
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.color = 'var(--accent)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--bg-secondary)';
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
          >
            {!collapsed && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ChevronLeft size={16} color="var(--accent)" />
                <span>Collapse sidebar</span>
              </span>
            )}
            {collapsed ? <ChevronRight size={18} color="var(--accent)" /> : <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: '4px' }}>◀</span>}
          </button>

          {/* User Profile Card */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '9px',
            padding: collapsed ? '8px 4px' : '8px 10px', borderRadius: '12px',
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            justifyContent: collapsed ? 'center' : 'flex-start',
            boxShadow: 'var(--card-shadow)'
          }}>
            <div style={{
              width: '30px', height: '30px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: 700, color: 'white', flexShrink: 0,
              boxShadow: '0 2px 6px rgba(37,99,235,0.25)'
            }}>
              {user.username.charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.username}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px' }}>
                  <span style={{
                    fontSize: '9.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: user.role === 'admin' ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-tertiary)',
                    color: user.role === 'admin' ? '#f59e0b' : 'var(--text-secondary)'
                  }}>
                    {user.role}
                  </span>
                </div>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={handleLogout}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--text-tertiary)',
                  cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)'; e.currentTarget.style.color = '#ef4444'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                title="Sign out">
                <LogOut size={15} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="mobile-header" style={{
        display: 'none', position: 'fixed', top: 0, left: 0, right: 0,
        height: '58px', background: 'var(--bg-secondary)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border)', alignItems: 'center',
        padding: '0 16px', zIndex: 35, justifyContent: 'space-between',
        boxShadow: 'var(--card-shadow)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={() => setMobileOpen(!mobileOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Toggle Menu">
            <Menu size={22} />
          </button>
          <img src="/logo.png" alt="Logo" style={{ height: '28px', objectFit: 'contain' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
        {isAdmin(user) && (
          <button onClick={() => setShowCountryPicker(!showCountryPicker)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-tertiary)', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'inherit' }}>
            <CountryFlag code={currentCountryData?.code || country || ''} name={currentCountryData?.name || country || ''} flagEmoji={currentCountryData?.flag} size={16} />
            <span>{currentCountryData?.code || 'All'}</span>
            <ChevronDown size={12} />
          </button>
        )}
      </div>

      {/* Main Content */}
      <main className="main-content" style={{ flex: 1, minWidth: 0, marginLeft: collapsed ? '68px' : '236px', transition: 'margin-left 0.25s cubic-bezier(0.25,0.1,0.25,1)', padding: '24px 28px', width: '100%', boxSizing: 'border-box' }}>
        {children}
      </main>

      {/* Add Country Modal */}
      {showAddCountry && (
        <div className="modal-overlay" onClick={() => setShowAddCountry(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 24px 0' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={20} color="var(--accent)" /> Add New Country
              </h2>
              <button onClick={() => setShowAddCountry(false)} style={{ background: 'var(--bg-tertiary)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '24px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
                New countries automatically use the unified system with the same dashboard, task management, reports, and partner structure.
              </p>
              <div style={{ marginBottom: '14px' }}>
                <label className="label">Country Name *</label>
                <input className="input" placeholder="e.g. United Kingdom" value={newCountryName} onChange={e => setNewCountryName(e.target.value)} autoFocus />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label className="label">Country Code *</label>
                  <input className="input" placeholder="e.g. UK" value={newCountryCode} onChange={e => setNewCountryCode(e.target.value)} maxLength={4} style={{ textTransform: 'uppercase' }} />
                </div>
                <div>
                  <label className="label">Flag Emoji</label>
                  <input className="input" placeholder="🌍" value={newCountryFlag} onChange={e => setNewCountryFlag(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button className="btn btn-secondary" onClick={() => setShowAddCountry(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleAddCountry} disabled={addingCountry || !newCountryName.trim() || !newCountryCode.trim()}>
                  {addingCountry ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={16} />}
                  Create Country
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media (min-width: 1920px) {
          .main-content { padding: 32px 40px !important; }
        }
        @media (max-width: 1440px) {
          .main-content { padding: 20px 22px !important; }
        }
        @media (max-width: 1200px) {
          .main-content { padding: 18px 16px !important; }
        }
        @media (max-width: 768px) {
          .mobile-overlay { display: block !important; }
          .mobile-header { display: flex !important; }
          .sidebar { transform: translateX(-100%); width: 260px !important; }
          .sidebar.mobile-open { transform: translateX(0); }
          .main-content { margin-left: 0 !important; padding: 68px 12px 24px 12px !important; max-width: 100% !important; }
          .card { padding: 16px !important; }
          .table-container { width: 100%; overflow-x: auto; }
          .dashboard-summary-grid { grid-template-columns: 1fr !important; }
          .modal-content { max-height: 95vh !important; margin: 8px; width: auto !important; max-width: 100% !important; }
          .dashboard-panels-grid { grid-template-columns: 1fr !important; min-width: 0 !important; }
          .dashboard-stats-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
        }
        @media (max-width: 420px) {
          .main-content { padding: 64px 8px 20px 8px !important; }
          .dashboard-stats-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
