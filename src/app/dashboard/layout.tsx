'use client';

import { useEffect, useState, ReactNode, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getSession, clearSession, isAdmin, setSession } from '@/lib/auth';
import { getTerminology } from '@/lib/terminology';
import { isBahrainMode } from '@/lib/bahrain';
import type { User } from '@/lib/supabase';
import {
  LayoutDashboard,
  Building2,
  ListTodo,
  Users,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  Globe,
  ChevronDown,
  Settings,
  ClipboardList,
  BarChart3,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  adminOnly?: boolean;
}

const countries = [
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿' },
  { code: 'BH', name: 'Bahrain', flag: '🇧🇭' },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const { user: u, country: c } = getSession();
    if (!u) {
      router.push('/');
      return;
    }
    setUser(u);
    setCountry(c);
  }, [router]);

  const handleLogout = () => {
    clearSession();
    router.push('/');
  };

  const handleCountrySwitch = (countryName: string) => {
    if (!user) return;
    setSession(user, countryName);
    setCountry(countryName);
    setShowCountryPicker(false);
    // Force reload to refresh all data with new country filter
    window.location.reload();
  };

  const currentCountryData = countries.find(c =>
    c.name === country || c.code === country
  );

  const terms = useMemo(() => getTerminology(country), [country]);

  const bahrainMode = useMemo(() => isBahrainMode(country), [country]);

  const navItems: NavItem[] = useMemo(() => {
    if (bahrainMode) {
      const canViewCompanies = user?.permissions?.can_view_companies === true;
      return [
        { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={20} /> },
        { label: 'Companies', href: '/dashboard/companies', icon: <Building2 size={20} />, adminOnly: !canViewCompanies },
        { label: 'Tasks', href: '/dashboard/tasks', icon: <ListTodo size={20} /> },
        { label: 'Task Types', href: '/dashboard/task-types', icon: <ClipboardList size={20} />, adminOnly: true },
        { label: 'Partners', href: '/dashboard/staff', icon: <Users size={20} />, adminOnly: true },
        { label: 'Reports', href: '/dashboard/reports', icon: <BarChart3 size={20} />, adminOnly: true },
        { label: 'Settings', href: '/dashboard/settings', icon: <Settings size={20} />, adminOnly: true },
      ];
    }
    return [
      { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={20} /> },
      { label: 'Companies', href: '/dashboard/companies', icon: <Building2 size={20} /> },
      { label: 'Tasks', href: '/dashboard/tasks', icon: <ListTodo size={20} /> },
      { label: terms.staffSingular, href: '/dashboard/staff', icon: <Users size={20} />, adminOnly: true },
      { label: 'Settings', href: '/dashboard/settings', icon: <Settings size={20} /> },
    ];
  }, [terms, bahrainMode, user]);

  if (!user) return null;

  const filteredNav = navItems.filter(item => !item.adminOnly || isAdmin(user));

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.3)',
            backdropFilter: 'blur(4px)',
            zIndex: 40,
            display: 'none',
          }}
          className="mobile-overlay"
        />
      )}


      {/* Sidebar */}
      <aside
        className={`glass sidebar ${mobileOpen ? 'mobile-open' : ''}`}
        style={{
          width: collapsed ? '72px' : '260px',
          minHeight: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border-light)',
          transition: 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1), width 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)',
          zIndex: 50,
          overflow: 'hidden',
        }}
      >
        {/* Logo */}
        <div style={{
          padding: collapsed ? '20px 16px' : '20px 24px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          minHeight: '72px',
        }}>
          <div style={{ overflow: 'hidden', height: '60px', display: 'flex', alignItems: 'center', width: collapsed ? '40px' : '200px', transition: 'width 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)' }}>
            <img 
              src="/logo.png" 
              alt="The Digital Ledger" 
              style={{ 
                height: '100%', 
                width: '100%',
                objectFit: collapsed ? 'cover' : 'contain', 
                objectPosition: 'left center',
                transform: collapsed ? 'scale(2.2) translateX(4px)' : 'scale(2.2)',
                transformOrigin: 'left center',
                transition: 'all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)'
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        </div>

        {/* Country Switcher (Admin only) */}
        {isAdmin(user) && (
          <div style={{
            padding: collapsed ? '8px' : '8px 12px',
            borderBottom: '1px solid var(--border-light)',
            position: 'relative',
          }}>
            <button
              onClick={() => setShowCountryPicker(!showCountryPicker)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: collapsed ? '8px' : '8px 12px',
                borderRadius: '10px',
                border: '1px solid var(--border-light)',
                background: showCountryPicker ? 'var(--accent-light)' : 'var(--bg-tertiary)',
                cursor: 'pointer',
                transition: 'var(--transition)',
                justifyContent: collapsed ? 'center' : 'flex-start',
                fontFamily: 'inherit',
              }}
              title={collapsed ? `${country || 'Switch Country'}` : undefined}
            >
              <span style={{ fontSize: '16px', flexShrink: 0 }}>
                {currentCountryData?.flag || '🌍'}
              </span>
              {!collapsed && (
                <>
                  <span style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    flex: 1,
                    textAlign: 'left',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {currentCountryData?.name || country || 'Select Country'}
                  </span>
                  <ChevronDown
                    size={14}
                    color="var(--text-tertiary)"
                    style={{
                      flexShrink: 0,
                      transition: 'transform 0.2s',
                      transform: showCountryPicker ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  />
                </>
              )}
            </button>

            {/* Dropdown */}
            {showCountryPicker && (
              <div
                className="animate-fadeIn"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: collapsed ? '8px' : '12px',
                  right: collapsed ? '-100px' : '12px',
                  minWidth: collapsed ? '180px' : undefined,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '12px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                  zIndex: 999,
                  overflow: 'hidden',
                  marginTop: '4px',
                }}
              >
                {/* Close overlay inside dropdown context */}
                <div
                  onClick={() => setShowCountryPicker(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: -1 }}
                />
                {countries.map(c => {
                  const isSelected = c.name === country || c.code === country;
                  return (
                    <button
                      key={c.code}
                      onClick={() => handleCountrySwitch(c.name)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        width: '100%',
                        padding: '10px 14px',
                        border: 'none',
                        background: isSelected ? 'var(--accent-light)' : 'transparent',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: isSelected ? 600 : 400,
                        color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                        transition: 'var(--transition)',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                        borderBottom: '1px solid var(--border-light)',
                      }}
                    >
                      <span style={{ fontSize: '18px' }}>{c.flag}</span>
                      <div>
                        <div>{c.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 400 }}>
                          {c.code}
                        </div>
                      </div>
                      {isSelected && (
                        <span style={{
                          marginLeft: 'auto',
                          width: '8px', height: '8px',
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          flexShrink: 0,
                        }} />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav style={{
          flex: 1,
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          {filteredNav.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <button
                key={item.href}
                onClick={() => {
                  router.push(item.href);
                  setMobileOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: collapsed ? '12px' : '10px 14px',
                  borderRadius: '12px',
                  border: 'none',
                  background: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? 'white' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: isActive ? 600 : 500,
                  transition: 'var(--transition)',
                  textAlign: 'left',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  width: '100%',
                  fontFamily: 'inherit',
                }}
                title={collapsed ? item.label : undefined}
              >
                <span style={{ flexShrink: 0, display: 'flex' }}>{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div style={{
          padding: '12px',
          borderTop: '1px solid var(--border-light)',
        }}>
          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: '12px',
              padding: collapsed ? '10px' : '10px 14px',
              borderRadius: '12px',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              fontSize: '13px',
              width: '100%',
              transition: 'var(--transition)',
              fontFamily: 'inherit',
            }}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            {!collapsed && <span>Collapse</span>}
          </button>

          {/* User info & Logout */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: collapsed ? '10px' : '10px 14px',
            borderRadius: '12px',
            background: 'var(--bg-tertiary)',
            marginTop: '8px',
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              fontWeight: 600,
              color: 'white',
              flexShrink: 0,
            }}>
              {user.username.charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {user.username}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: 'var(--text-tertiary)',
                  textTransform: 'capitalize',
                }}>
                  {user.role}
                </div>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={handleLogout}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-tertiary)',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'flex',
                  transition: 'var(--transition)',
                }}
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div
        className="mobile-header"
        style={{
          display: 'none',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '56px',
          background: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border-light)',
          alignItems: 'center',
          padding: '0 16px',
          zIndex: 30,
          justifyContent: 'space-between',
        }}
      >
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            color: 'var(--text-primary)',
          }}
        >
          <Menu size={22} />
        </button>

        {/* Mobile Country Switcher (Admin only) */}
        {isAdmin(user) && (
          <button
            onClick={() => setShowCountryPicker(!showCountryPicker)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              background: 'var(--bg-secondary)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
            }}
          >
            <span>{currentCountryData?.flag || '🌍'}</span>
            {currentCountryData?.code || 'All'}
            <ChevronDown size={12} />
          </button>
        )}
      </div>

      {/* Mobile Country Dropdown */}
      {showCountryPicker && (
        <div
          className="animate-fadeIn"
          style={{
            position: 'fixed',
            top: '60px',
            right: '16px',
            width: '200px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-light)',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
            zIndex: 60,
            overflow: 'hidden',
            display: 'none',
          }}
          >

          {countries.map(c => {
            const isSelected = c.name === country;
            return (
              <button
                key={c.code}
                onClick={() => handleCountrySwitch(c.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '10px 14px',
                  border: 'none',
                  background: isSelected ? 'var(--accent-light)' : 'transparent',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: isSelected ? 600 : 400,
                  color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                  fontFamily: 'inherit',
                  borderBottom: '1px solid var(--border-light)',
                }}
              >
                <span style={{ fontSize: '18px' }}>{c.flag}</span>
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content */}
      <main className="main-content" style={{
        flex: 1,
        marginLeft: collapsed ? '72px' : '260px',
        transition: 'margin-left 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)',
        padding: '32px',
        maxWidth: '1400px',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {children}
      </main>

      <style jsx global>{`
        @media (max-width: 768px) {
          .mobile-overlay {
            display: block !important;
          }
          .mobile-header {
            display: flex !important;
          }
          .sidebar {
            transform: translateX(-100%);
            width: 260px !important;
          }
          .sidebar.mobile-open {
            transform: translateX(0);
          }
          .main-content {
            margin-left: 0 !important;
            padding: 72px 16px 24px 16px !important;
          }
          .card {
            padding: 16px !important;
          }
          .table-container {
            width: 100%;
            overflow-x: auto;
          }
          /* Fix dashboard summary cards layout */
          .dashboard-summary-grid {
            grid-template-columns: 1fr !important;
          }
          /* Ensure modal behaves correctly */
          .modal-content {
            max-height: 95vh !important;
            margin: 16px;
            width: auto !important;
          }
        }
      `}</style>
    </div>
  );
}
