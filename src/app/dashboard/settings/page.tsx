'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, getDataCountry, isAdmin } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { User } from '@/lib/supabase';
import { getStoredTheme, applyTheme, ThemeMode } from '@/lib/theme';
import {
  getTaskColumns,
  saveTaskColumns,
  resetTaskColumns,
  applyColumnsToAllCountries,
  TaskColumnConfig,
  TaskColumnId
} from '@/lib/taskColumns';
import CountryFlag from '@/components/CountryFlag';
import {
  Settings,
  Lock,
  Loader2,
  Save,
  AlertCircle,
  CheckCircle2,
  Moon,
  Sun,
  Laptop,
  User as UserIcon,
  Shield,
  Globe,
  KeyRound,
  Sparkles,
  Check,
  Eye,
  EyeOff,
  Activity,
  Building2,
  Columns3,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  SlidersHorizontal,
  Copy,
  Layers
} from 'lucide-react';

interface CountryOption {
  id: string;
  name: string;
  code?: string;
  flag?: string;
}

const DEFAULT_COUNTRIES: CountryOption[] = [
  { id: '1', code: 'BH', name: 'Bahrain', flag: '🇧🇭' },
  { id: '2', code: 'AE', name: 'UAE', flag: '🇦🇪' },
  { id: '3', code: 'OM', name: 'Oman', flag: '🇴🇲' },
  { id: '4', code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
  { id: '5', code: 'KW', name: 'Kuwait', flag: '🇰🇼' },
  { id: '6', code: 'QA', name: 'Qatar', flag: '🇶🇦' },
  { id: '7', code: 'NZ', name: 'New Zealand', flag: '🇳🇿' },
  { id: '8', code: 'PK', name: 'Pakistan', flag: '🇵🇰' },
  { id: '9', code: 'US', name: 'USA', flag: '🇺🇸' },
  { id: '10', code: 'GB', name: 'UK', flag: '🇬🇧' },
];

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>('light');
  
  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Column Settings State
  const [countriesList, setCountriesList] = useState<CountryOption[]>(DEFAULT_COUNTRIES);
  const [selectedColumnCountry, setSelectedColumnCountry] = useState<string>('Bahrain');
  const [columnsConfig, setColumnsConfig] = useState<TaskColumnConfig[]>([]);
  const [columnSaveMessage, setColumnSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [columnSaving, setColumnSaving] = useState(false);

  const router = useRouter();
  const dataCountry = getDataCountry();

  useEffect(() => {
    const { user: u, country: c } = getSession();
    if (!u) {
      router.push('/');
      return;
    }
    setUser(u);
    const activeCountry = c || getDataCountry() || u.country || 'Bahrain';
    setCountry(activeCountry);
    setSelectedColumnCountry(activeCountry);
    setColumnsConfig(getTaskColumns(activeCountry));
    setCurrentTheme(getStoredTheme());

    // Load available countries
    async function loadCountries() {
      try {
        const { data, error } = await supabase.from('countries').select('id, code, name, flag').order('name');
        if (!error && data && data.length > 0) {
          setCountriesList(data);
        }
      } catch (e) {
        console.error('Error fetching countries:', e);
      }
    }
    loadCountries();

    const handleThemeChange = (e: any) => {
      if (e.detail?.theme) setCurrentTheme(e.detail.theme);
    };
    window.addEventListener('app-theme-changed', handleThemeChange);
    return () => window.removeEventListener('app-theme-changed', handleThemeChange);
  }, [router]);

  // When switching country in column settings tab
  const handleSelectColumnCountry = (targetCountry: string) => {
    setSelectedColumnCountry(targetCountry);
    setColumnsConfig(getTaskColumns(targetCountry));
    setColumnSaveMessage(null);
  };

  const handleToggleColumn = (colId: TaskColumnId) => {
    setColumnsConfig(prev =>
      prev.map(col => {
        if (col.id === colId) {
          return { ...col, visible: !col.visible };
        }
        return col;
      })
    );
    setColumnSaveMessage(null);
  };

  const handleMoveColumn = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === columnsConfig.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const next = [...columnsConfig];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;

    setColumnsConfig(next);
    setColumnSaveMessage(null);
  };

  const handleShowAllColumns = () => {
    setColumnsConfig(prev => prev.map(col => ({ ...col, visible: true })));
    setColumnSaveMessage(null);
  };

  const handleHideOptionalColumns = () => {
    // Keep core columns: Company, Task Type, Priority, Status, Actions
    const coreIds: TaskColumnId[] = ['company', 'task_type', 'priority', 'status', 'actions'];
    setColumnsConfig(prev => prev.map(col => ({ ...col, visible: coreIds.includes(col.id) })));
    setColumnSaveMessage(null);
  };

  const handleSaveColumns = () => {
    setColumnSaving(true);
    saveTaskColumns(selectedColumnCountry, columnsConfig);
    setTimeout(() => {
      setColumnSaving(false);
      setColumnSaveMessage({
        type: 'success',
        text: `Column settings successfully saved for ${selectedColumnCountry}!`
      });
      setTimeout(() => setColumnSaveMessage(null), 4000);
    }, 200);
  };

  const handleResetColumns = () => {
    if (window.confirm(`Reset column settings for ${selectedColumnCountry} to default layout?`)) {
      const defaults = resetTaskColumns(selectedColumnCountry);
      setColumnsConfig(defaults);
      setColumnSaveMessage({
        type: 'success',
        text: `Reset ${selectedColumnCountry} column settings to defaults.`
      });
      setTimeout(() => setColumnSaveMessage(null), 3000);
    }
  };

  const handleApplyToAllCountries = () => {
    if (window.confirm(`Apply this column configuration (${selectedColumnCountry}) to all countries? This will update settings across every country.`)) {
      const countryNames = countriesList.map(c => c.name);
      applyColumnsToAllCountries(columnsConfig, countryNames);
      setColumnSaveMessage({
        type: 'success',
        text: `Applied column layout to all ${countryNames.length} countries successfully!`
      });
      setTimeout(() => setColumnSaveMessage(null), 4000);
    }
  };

  const handleThemeSelect = (theme: ThemeMode) => {
    setCurrentTheme(theme);
    applyTheme(theme);
  };

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: 'Please fill in all password fields.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'New password must be at least 6 characters.' });
      return;
    }

    setLoading(true);

    try {
      // Verify current password
      const { data: userData, error: verifyError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user?.id)
        .eq('password', currentPassword)
        .single();

      if (verifyError || !userData) {
        setMessage({ type: 'error', text: 'Current password is incorrect.' });
        setLoading(false);
        return;
      }

      // Update password
      const { error: updateError } = await supabase
        .from('users')
        .update({ password: newPassword })
        .eq('id', user?.id);

      if (updateError) throw updateError;

      setMessage({ type: 'success', text: 'Password successfully updated.' });
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

  const visibleColumnCount = columnsConfig.filter(c => c.visible).length;

  return (
    <div className="animate-fadeIn" style={{ paddingBottom: '40px' }}>
      {/* ─── Top Header ─── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '28px',
        flexWrap: 'wrap',
        gap: '14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            border: '1px solid #bfdbfe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#2563eb',
            flexShrink: 0
          }}>
            <Settings size={22} />
          </div>
          <div>
            <h1 style={{
              fontSize: '26px',
              fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '-0.03em',
              margin: 0,
            }}>
              Settings & Preferences
            </h1>
            <p style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              marginTop: '3px',
              margin: 0,
            }}>
              Manage appearance, country-specific task table columns, profile credentials, and security.
            </p>
          </div>
        </div>

        {dataCountry && (
          <span style={{
            fontSize: '12px', fontWeight: 700, color: '#3b82f6',
            background: 'var(--accent-light)', border: '1px solid #bfdbfe',
            padding: '4px 12px', borderRadius: '8px', textTransform: 'uppercase', letterSpacing: '0.04em'
          }}>
            📍 {dataCountry}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* ─── 1. Task Management Column Settings Card ─── */}
        <div className="card" style={{
          background: 'var(--bg-secondary)',
          borderRadius: '18px',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          boxShadow: 'var(--card-shadow)'
        }}>
          <div style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-light)',
            background: 'var(--bg-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <SlidersHorizontal size={19} color="#2563eb" />
              <div>
                <h2 style={{ fontSize: '16.5px', fontWeight: 750, color: 'var(--text-primary)', margin: 0 }}>
                  Task Management Column Settings
                </h2>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Choose which columns are visible and arrange their exact order for each country.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: '11.5px',
                fontWeight: 700,
                color: visibleColumnCount > 0 ? '#1d4ed8' : '#dc2626',
                background: visibleColumnCount > 0 ? '#eff6ff' : '#fef2f2',
                border: visibleColumnCount > 0 ? '1px solid #bfdbfe' : '1px solid #fecaca',
                padding: '3px 10px',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Columns3 size={13} />
                {visibleColumnCount} of {columnsConfig.length} Columns Visible
              </span>
            </div>
          </div>

          <div style={{ padding: '24px' }}>
            {/* Country Selector Tabs */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '10px'
              }}>
                Select Country to Customize Columns
              </label>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                overflowX: 'auto',
                paddingBottom: '6px',
                WebkitOverflowScrolling: 'touch'
              }}>
                {countriesList.map(c => {
                  const isSelected = selectedColumnCountry === c.name;
                  return (
                    <button
                      key={c.id || c.name}
                      type="button"
                      onClick={() => handleSelectColumnCountry(c.name)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        borderRadius: '10px',
                        border: isSelected ? '2px solid #2563eb' : '1px solid var(--border)',
                        background: isSelected ? 'var(--accent-light)' : 'var(--bg-secondary)',
                        color: isSelected ? '#1d4ed8' : 'var(--text-primary)',
                        fontSize: '13px',
                        fontWeight: isSelected ? 750 : 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected ? '0 2px 8px rgba(37,99,235,0.12)' : 'none',
                        flexShrink: 0
                      }}
                    >
                      <CountryFlag name={c.name} code={c.code} flagEmoji={c.flag} style={{ width: '18px', height: '13px', borderRadius: '2px' }} />
                      <span>{c.name}</span>
                      {isSelected && (
                        <span style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: '#2563eb',
                          marginLeft: '2px'
                        }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notification Banner */}
            {columnSaveMessage && (
              <div style={{
                padding: '12px 16px',
                borderRadius: '10px',
                background: columnSaveMessage.type === 'error' ? '#fef2f2' : '#ecfdf5',
                border: `1px solid ${columnSaveMessage.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
                color: columnSaveMessage.type === 'error' ? '#dc2626' : '#059669',
                fontSize: '13px',
                fontWeight: 650,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '18px',
                animation: 'fadeIn 0.2s ease'
              }}>
                {columnSaveMessage.type === 'error' ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
                {columnSaveMessage.text}
              </div>
            )}

            {/* Quick Action Toolbar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
              marginBottom: '16px',
              padding: '10px 14px',
              background: 'var(--bg-tertiary)',
              borderRadius: '12px',
              border: '1px solid var(--border-light)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleShowAllColumns}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '7px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '11.5px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  title="Show all 12 columns"
                >
                  Show All
                </button>
                <button
                  type="button"
                  onClick={handleHideOptionalColumns}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '7px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    fontSize: '11.5px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  title="Keep only essential columns"
                >
                  Essential Only
                </button>
                <button
                  type="button"
                  onClick={handleResetColumns}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '7px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-secondary)',
                    color: '#dc2626',
                    fontSize: '11.5px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease'
                  }}
                  title={`Reset ${selectedColumnCountry} to default layout`}
                >
                  <RotateCcw size={12} />
                  Reset to Defaults
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleApplyToAllCountries}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid #bfdbfe',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'all 0.15s ease'
                  }}
                  title="Apply current column order and visibility to every country in the system"
                >
                  <Copy size={13} />
                  Apply to All Countries
                </button>

                <button
                  type="button"
                  onClick={handleSaveColumns}
                  disabled={columnSaving}
                  style={{
                    padding: '6px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: columnSaving ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {columnSaving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
                  Save Changes
                </button>
              </div>
            </div>

            {/* Column List with Drag/Move & Visibility Controls */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              marginBottom: '20px'
            }}>
              {columnsConfig.map((col, index) => {
                const isFirst = index === 0;
                const isLast = index === columnsConfig.length - 1;

                return (
                  <div
                    key={col.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: col.visible ? '1.5px solid var(--border)' : '1px dashed var(--border)',
                      background: col.visible ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                      opacity: col.visible ? 1 : 0.65,
                      transition: 'all 0.15s ease',
                      gap: '12px'
                    }}
                  >
                    {/* Left: Reorder Arrows + Position Badge + Checkbox + Title */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                      {/* Reorder Buttons */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => handleMoveColumn(index, 'up')}
                          disabled={isFirst}
                          style={{
                            width: '24px',
                            height: '18px',
                            borderRadius: '4px',
                            border: '1px solid var(--border)',
                            background: isFirst ? 'transparent' : 'var(--bg-secondary)',
                            color: isFirst ? 'var(--text-tertiary)' : 'var(--text-primary)',
                            cursor: isFirst ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            transition: 'all 0.1s ease'
                          }}
                          title="Move Left / Earlier in table"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveColumn(index, 'down')}
                          disabled={isLast}
                          style={{
                            width: '24px',
                            height: '18px',
                            borderRadius: '4px',
                            border: '1px solid var(--border)',
                            background: isLast ? 'transparent' : 'var(--bg-secondary)',
                            color: isLast ? 'var(--text-tertiary)' : 'var(--text-primary)',
                            cursor: isLast ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            transition: 'all 0.1s ease'
                          }}
                          title="Move Right / Later in table"
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>

                      {/* Position Index Badge */}
                      <span style={{
                        width: '28px',
                        height: '24px',
                        borderRadius: '6px',
                        background: col.visible ? 'linear-gradient(135deg, #eff6ff, #dbeafe)' : 'var(--bg-tertiary)',
                        color: col.visible ? '#1d4ed8' : 'var(--text-tertiary)',
                        border: col.visible ? '1px solid #bfdbfe' : '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 750,
                        flexShrink: 0
                      }}>
                        #{index + 1}
                      </span>

                      {/* Visibility Toggle Checkbox */}
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        flex: 1,
                        minWidth: 0
                      }}>
                        <input
                          type="checkbox"
                          checked={col.visible}
                          onChange={() => handleToggleColumn(col.id)}
                          style={{
                            width: '18px',
                            height: '18px',
                            cursor: 'pointer',
                            accentColor: '#2563eb',
                            flexShrink: 0
                          }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontSize: '13.5px',
                            fontWeight: 700,
                            color: col.visible ? 'var(--text-primary)' : 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            <span>{col.label}</span>
                            {col.shortLabel && col.shortLabel !== col.label && (
                              <span style={{
                                fontSize: '10.5px',
                                fontWeight: 600,
                                color: 'var(--text-secondary)',
                                background: 'var(--bg-tertiary)',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                border: '1px solid var(--border-light)'
                              }}>
                                Header: {col.shortLabel}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {col.description}
                          </div>
                        </div>
                      </label>
                    </div>

                    {/* Right: Visibility State Badge & Alignment Tag */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{
                        fontSize: '10.5px',
                        fontWeight: 650,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        padding: '2px 7px',
                        borderRadius: '5px',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-light)'
                      }}>
                        {col.align}
                      </span>
                      <span style={{
                        fontSize: '11.5px',
                        fontWeight: 700,
                        padding: '3px 9px',
                        borderRadius: '6px',
                        background: col.visible ? '#ecfdf5' : '#f1f5f9',
                        color: col.visible ? '#059669' : '#94a3b8',
                        border: col.visible ? '1px solid #a7f3d0' : '1px solid #cbd5e1'
                      }}>
                        {col.visible ? 'Visible' : 'Hidden'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Live Table Header Preview */}
            <div style={{
              background: 'var(--bg-tertiary)',
              borderRadius: '14px',
              padding: '16px',
              border: '1px solid var(--border-light)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px'
              }}>
                <div style={{
                  fontSize: '11.5px',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <Layers size={14} color="#2563eb" /> Live Table Header Preview ({selectedColumnCountry})
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Order matches table appearance from left to right
                </span>
              </div>

              <div style={{
                overflowX: 'auto',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
                  borderBottom: '1.5px solid #e2e8f0',
                  minWidth: 'max-content'
                }}>
                  {columnsConfig.filter(c => c.visible).length === 0 ? (
                    <div style={{ padding: '14px 20px', fontSize: '12.5px', color: '#dc2626', fontWeight: 600 }}>
                      ⚠️ No columns selected. Please enable at least one column to display tasks.
                    </div>
                  ) : (
                    columnsConfig
                      .filter(c => c.visible)
                      .map(col => (
                        <div
                          key={`preview-${col.id}`}
                          style={{
                            padding: '10px 12px',
                            fontSize: '11px',
                            fontWeight: 750,
                            color: '#334155',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            borderRight: '1px solid #e2e8f0',
                            whiteSpace: 'nowrap',
                            textAlign: col.align as any,
                            minWidth: col.minWidth || '80px',
                            background: 'rgba(255,255,255,0.6)'
                          }}
                        >
                          {col.shortLabel || col.label}
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── 2. Appearance / Theme Card ─── */}
        <div className="card" style={{
          background: 'var(--bg-secondary)',
          borderRadius: '18px',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          boxShadow: 'var(--card-shadow)'
        }}>
          <div style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-light)',
            background: 'var(--bg-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Sparkles size={18} color="var(--accent)" />
              <h2 style={{ fontSize: '16px', fontWeight: 750, color: 'var(--text-primary)', margin: 0 }}>
                Appearance & Theme
              </h2>
            </div>
            <span style={{ fontSize: '11.5px', fontWeight: 650, color: 'var(--text-secondary)' }}>
              Active Mode: <strong style={{ color: 'var(--accent)', textTransform: 'capitalize' }}>{currentTheme}</strong>
            </span>
          </div>

          <div style={{ padding: '24px' }}>
            <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginTop: 0, marginBottom: '18px' }}>
              Choose your preferred interface theme. The theme persists across sessions and updates instantly across all views.
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '14px',
            }}>
              {/* Option 1: Light Mode */}
              <div
                onClick={() => handleThemeSelect('light')}
                style={{
                  border: currentTheme === 'light' ? '2px solid #2563eb' : '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '18px',
                  cursor: 'pointer',
                  background: currentTheme === 'light' ? 'var(--accent-light)' : 'var(--bg-secondary)',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  boxShadow: currentTheme === 'light' ? '0 4px 14px rgba(37,99,235,0.12)' : 'none'
                }}
                onMouseEnter={e => { if (currentTheme !== 'light') e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onMouseLeave={e => { if (currentTheme !== 'light') e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{
                    width: '38px', height: '38px', borderRadius: '10px',
                    background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Sun size={20} />
                  </div>
                  {currentTheme === 'light' && (
                    <span style={{
                      width: '20px', height: '20px', borderRadius: '50%',
                      background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '14.5px', fontWeight: 750, color: 'var(--text-primary)' }}>
                    Light Mode
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Crisp white panels with soft shadows and high readability.
                  </div>
                </div>
              </div>

              {/* Option 2: Dark Mode */}
              <div
                onClick={() => handleThemeSelect('dark')}
                style={{
                  border: currentTheme === 'dark' ? '2px solid #3b82f6' : '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '18px',
                  cursor: 'pointer',
                  background: currentTheme === 'dark' ? 'var(--accent-light)' : 'var(--bg-secondary)',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  boxShadow: currentTheme === 'dark' ? '0 4px 14px rgba(59,130,246,0.18)' : 'none'
                }}
                onMouseEnter={e => { if (currentTheme !== 'dark') e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onMouseLeave={e => { if (currentTheme !== 'dark') e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{
                    width: '38px', height: '38px', borderRadius: '10px',
                    background: '#1e293b', color: '#38bdf8', border: '1px solid #334155',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Moon size={20} />
                  </div>
                  {currentTheme === 'dark' && (
                    <span style={{
                      width: '20px', height: '20px', borderRadius: '50%',
                      background: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '14.5px', fontWeight: 750, color: 'var(--text-primary)' }}>
                    Dark Mode
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Midnight slate surfaces, reduced eye strain, and vibrant contrast.
                  </div>
                </div>
              </div>

              {/* Option 3: System Sync */}
              <div
                onClick={() => handleThemeSelect('system')}
                style={{
                  border: currentTheme === 'system' ? '2px solid #8b5cf6' : '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '18px',
                  cursor: 'pointer',
                  background: currentTheme === 'system' ? 'rgba(139, 92, 246, 0.1)' : 'var(--bg-secondary)',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  boxShadow: currentTheme === 'system' ? '0 4px 14px rgba(139,92,246,0.15)' : 'none'
                }}
                onMouseEnter={e => { if (currentTheme !== 'system') e.currentTarget.style.borderColor = '#8b5cf6'; }}
                onMouseLeave={e => { if (currentTheme !== 'system') e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{
                    width: '38px', height: '38px', borderRadius: '10px',
                    background: '#f5f3ff', color: '#8b5cf6', border: '1px solid #ddd6fe',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Laptop size={20} />
                  </div>
                  {currentTheme === 'system' && (
                    <span style={{
                      width: '20px', height: '20px', borderRadius: '50%',
                      background: '#8b5cf6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '14.5px', fontWeight: 750, color: 'var(--text-primary)' }}>
                    System Synchronized
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Automatically adjusts based on your operating system preferences.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── 3. Profile & Security Two-Column Layout ─── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '24px',
        }}>
          {/* Profile Overview Card */}
          <div className="card" style={{
            background: 'var(--bg-secondary)',
            borderRadius: '18px',
            border: '1px solid var(--border)',
            overflow: 'hidden',
            boxShadow: 'var(--card-shadow)'
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid var(--border-light)',
              background: 'var(--bg-tertiary)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <UserIcon size={18} color="var(--accent)" />
              <h2 style={{ fontSize: '16px', fontWeight: 750, color: 'var(--text-primary)', margin: 0 }}>
                Profile & Identity
              </h2>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* User Avatar + Username Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '52px', height: '52px', borderRadius: '14px',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px', fontWeight: 800, flexShrink: 0,
                  boxShadow: '0 4px 10px rgba(37,99,235,0.25)'
                }}>
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {user.username}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: 700,
                      background: user.role?.toLowerCase() === 'admin' ? '#f5f3ff' : 'var(--accent-light)',
                      color: user.role?.toLowerCase() === 'admin' ? '#7c3aed' : 'var(--accent)',
                      border: user.role?.toLowerCase() === 'admin' ? '1px solid #ddd6fe' : '1px solid #bfdbfe'
                    }}>
                      <Shield size={11} /> {user.role?.toUpperCase()}
                    </span>
                    {(dataCountry || country || user.country) && (
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        · 📍 {dataCountry || country || user.country}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Permissions Summary Box */}
              <div style={{
                background: 'var(--bg-tertiary)',
                borderRadius: '12px',
                padding: '14px',
                border: '1px solid var(--border-light)',
                marginTop: '4px'
              }}>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
                  Active Permissions
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {isAdmin(user) ? (
                    <div style={{ fontSize: '12.5px', color: '#7c3aed', fontWeight: 650, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={14} color="#7c3aed" /> Full Administrative Controller Access
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: '12.5px', color: user.permissions?.can_update_status !== false ? 'var(--text-primary)' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Activity size={14} color={user.permissions?.can_update_status !== false ? '#10b981' : '#94a3b8'} /> Task Status Updates ({user.permissions?.can_update_status !== false ? 'Enabled' : 'Disabled'})
                      </div>
                      <div style={{ fontSize: '12.5px', color: user.permissions?.can_view_companies ? 'var(--text-primary)' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Building2 size={14} color={user.permissions?.can_view_companies ? '#3b82f6' : '#94a3b8'} /> Company Directory Access ({user.permissions?.can_view_companies ? 'Enabled' : 'Disabled'})
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Change Password Card */}
          <div className="card" style={{
            background: 'var(--bg-secondary)',
            borderRadius: '18px',
            border: '1px solid var(--border)',
            overflow: 'hidden',
            boxShadow: 'var(--card-shadow)'
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid var(--border-light)',
              background: 'var(--bg-tertiary)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <KeyRound size={18} color="var(--accent)" />
              <h2 style={{ fontSize: '16px', fontWeight: 750, color: 'var(--text-primary)', margin: 0 }}>
                Security & Password
              </h2>
            </div>

            <form onSubmit={handlePasswordChange} style={{ padding: '24px' }}>
              {message && (
                <div style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: message.type === 'error' ? '#fef2f2' : '#ecfdf5',
                  border: `1px solid ${message.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
                  color: message.type === 'error' ? '#dc2626' : '#059669',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                }}>
                  {message.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                  {message.text}
                </div>
              )}

              {/* Current Password Field */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  Current Password *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Enter existing password"
                    style={{
                      width: '100%', padding: '9px 36px 9px 12px', borderRadius: '8px',
                      border: '1px solid var(--border)', fontSize: '13px', outline: 'none',
                      color: 'var(--text-primary)', background: 'var(--bg-secondary)'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    style={{
                      position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer'
                    }}
                  >
                    {showCurrentPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* New Password Field */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  New Password *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    style={{
                      width: '100%', padding: '9px 36px 9px 12px', borderRadius: '8px',
                      border: '1px solid var(--border)', fontSize: '13px', outline: 'none',
                      color: 'var(--text-primary)', background: 'var(--bg-secondary)'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    style={{
                      position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer'
                    }}
                  >
                    {showNewPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password Field */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 650, color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  Confirm New Password *
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: '8px',
                    border: '1px solid var(--border)', fontSize: '13px', outline: 'none',
                    color: 'var(--text-primary)', background: 'var(--bg-secondary)'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  fontSize: '13.5px',
                  fontWeight: 650,
                  cursor: (loading || !currentPassword || !newPassword || !confirmPassword) ? 'not-allowed' : 'pointer',
                  opacity: (loading || !currentPassword || !newPassword || !confirmPassword) ? 0.6 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
                  transition: 'all 0.15s'
                }}
              >
                {loading ? (
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Save size={16} />
                )}
                Save Password Update
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

