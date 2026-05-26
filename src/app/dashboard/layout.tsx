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
  ClipboardList, BarChart3, Edit, Plus, X, Loader2, Globe, CalendarDays
} from 'lucide-react';

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
    const { user: u, country: c } = getSession();
    if (!u) { router.push('/'); return; }
    setUser(u);
    setCountry(c);
    loadCountries();
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
      { label: 'Reports', href: '/dashboard/reports', icon: <BarChart3 size={20} />, adminOnly: true },
      { label: 'Edits', href: '/dashboard/edits', icon: <Edit size={20} />, adminOnly: true },
      { label: 'Settings', href: '/dashboard/settings', icon: <Settings size={20} />, adminOnly: true },
    ];
  }, [terms, user]);

  if (!user) return null;
  const filteredNav = navItems.filter(item => !item.adminOnly || isAdmin(user));

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', zIndex: 40, display: 'none' }}
          className="mobile-overlay" />
      )}

      {/* Sidebar */}
      <aside className={`glass sidebar ${mobileOpen ? 'mobile-open' : ''}`}
        style={{
          width: collapsed ? '64px' : '220px', minHeight: '100vh', position: 'fixed',
          left: 0, top: 0, bottom: 0, display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--border-light)',
          transition: 'transform 0.3s cubic-bezier(0.25,0.1,0.25,1), width 0.3s cubic-bezier(0.25,0.1,0.25,1)',
          zIndex: 50, overflow: 'hidden',
        }}>
        <div style={{ padding: collapsed ? '12px 10px' : '12px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '10px', minHeight: '52px' }}>
          <div style={{ overflow: 'hidden', height: '36px', width: collapsed ? '36px' : '170px', transition: 'width 0.3s cubic-bezier(0.25,0.1,0.25,1)', position: 'relative' }}>
            <img src="/logo.png" alt="The Digital Ledger"
              style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: '100%', objectFit: collapsed ? 'cover' : 'contain', objectPosition: 'left center', transform: collapsed ? 'scale(2.2) translateX(4px)' : 'scale(2.2)', transformOrigin: 'left center', transition: 'all 0.3s cubic-bezier(0.25,0.1,0.25,1)' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
        </div>

        {/* Country Switcher (Super Admin only) */}
        {isSuperAdmin(user) && (
          <div style={{ padding: collapsed ? '6px' : '6px 10px', borderBottom: '1px solid var(--border-light)', position: 'relative' }}>
            <button onClick={() => setShowCountryPicker(!showCountryPicker)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
                padding: collapsed ? '6px' : '6px 10px', borderRadius: '8px',
                border: '1px solid var(--border-light)',
                background: showCountryPicker ? 'var(--accent-light)' : 'var(--bg-tertiary)',
                cursor: 'pointer', transition: 'var(--transition)',
                justifyContent: collapsed ? 'center' : 'flex-start', fontFamily: 'inherit',
              }}
              title={collapsed ? `${country || 'Switch Country'}` : undefined}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>{currentCountryData?.flag || '🌍'}</span>
              {!collapsed && (
                <>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentCountryData?.name || country || 'Select Country'}
                  </span>
                  <ChevronDown size={14} color="var(--text-tertiary)" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: showCountryPicker ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </>
              )}
            </button>

            {showCountryPicker && (
              <div className="animate-fadeIn" style={{
                position: 'absolute', top: '100%', left: collapsed ? '8px' : '12px',
                right: collapsed ? '-100px' : '12px', minWidth: collapsed ? '200px' : undefined,
                background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
                borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                zIndex: 999, overflow: 'hidden', marginTop: '4px',
              }}>
                <div onClick={() => setShowCountryPicker(false)} style={{ position: 'fixed', inset: 0, zIndex: -1 }} />
                {countries.map(c => {
                  const isSelected = c.name === country || c.code === country;
                  return (
                    <button key={c.id} onClick={() => handleCountrySwitch(c.name)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                        padding: '10px 14px', border: 'none',
                        background: isSelected ? 'var(--accent-light)' : 'transparent',
                        cursor: 'pointer', fontSize: '13px',
                        fontWeight: isSelected ? 600 : 400,
                        color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                        transition: 'var(--transition)', textAlign: 'left', fontFamily: 'inherit',
                        borderBottom: '1px solid var(--border-light)',
                      }}>
                      <span style={{ fontSize: '18px' }}>{c.flag}</span>
                      <div>
                        <div>{c.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 400 }}>{c.code}</div>
                      </div>
                      {isSelected && <span style={{ marginLeft: 'auto', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                    </button>
                  );
                })}
                {/* Add Country Button */}
                <button onClick={() => { setShowCountryPicker(false); setShowAddCountry(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                    padding: '10px 14px', border: 'none', background: 'var(--bg-tertiary)',
                    cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                    color: 'var(--accent)', fontFamily: 'inherit',
                  }}>
                  <Plus size={14} /> Add New Country
                </button>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {filteredNav.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <button key={item.href}
                onClick={() => { router.push(item.href); setMobileOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: collapsed ? '9px' : '8px 12px', borderRadius: '10px', border: 'none',
                  background: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? 'white' : 'var(--text-secondary)',
                  cursor: 'pointer', fontSize: '13px', fontWeight: isActive ? 600 : 500,
                  transition: 'var(--transition)', textAlign: 'left',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  width: '100%', fontFamily: 'inherit',
                }}
                title={collapsed ? item.label : undefined}>
                <span style={{ flexShrink: 0, display: 'flex' }}>{React.cloneElement(item.icon as React.ReactElement<any>, { size: 18 })}</span>
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Bottom */}
        <div style={{ padding: '8px', borderTop: '1px solid var(--border-light)' }}>
          <button onClick={() => setCollapsed(!collapsed)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: '8px', padding: collapsed ? '8px' : '6px 10px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '12px', width: '100%', transition: 'var(--transition)', fontFamily: 'inherit', fontWeight: 500 }}>
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            {!collapsed && <span>Collapse</span>}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: collapsed ? '8px' : '8px 10px', borderRadius: '10px', background: 'var(--bg-tertiary)', marginTop: '6px', justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, #667eea, #764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600, color: 'white', flexShrink: 0 }}>
              {user.username.charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.username}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>{user.role}</div>
              </div>
            )}
            {!collapsed && (
              <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '4px', borderRadius: '6px', display: 'flex', transition: 'var(--transition)' }} title="Sign out">
                <LogOut size={14} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="mobile-header" style={{ display: 'none', position: 'fixed', top: 0, left: 0, right: 0, height: '56px', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border-light)', alignItems: 'center', padding: '0 16px', zIndex: 30, justifyContent: 'space-between' }}>
        <button onClick={() => setMobileOpen(!mobileOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', color: 'var(--text-primary)' }}>
          <Menu size={22} />
        </button>
        {isAdmin(user) && (
          <button onClick={() => setShowCountryPicker(!showCountryPicker)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'inherit' }}>
            <span>{currentCountryData?.flag || '🌍'}</span>
            {currentCountryData?.code || 'All'}
            <ChevronDown size={12} />
          </button>
        )}
      </div>

      {/* Main Content */}
      <main className="main-content" style={{ flex: 1, marginLeft: collapsed ? '64px' : '220px', transition: 'margin-left 0.3s cubic-bezier(0.25,0.1,0.25,1)', padding: '24px 28px', maxWidth: '1400px', width: '100%', boxSizing: 'border-box' }}>
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
