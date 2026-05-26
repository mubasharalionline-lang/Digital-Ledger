'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser, setSession, getLoginCountries, getSession } from '@/lib/auth';
import { Building2, Lock, User, ArrowRight, Loader2, Globe } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countryOptions, setCountryOptions] = useState<string[]>([]);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const router = useRouter();

  // Persistent login: auto-redirect to dashboard if session exists
  useEffect(() => {
    const { user } = getSession();
    if (user) {
      router.push('/dashboard');
    } else {
      setCheckingSession(false);
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent, selectedCountry?: string) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await loginUser(username, password, selectedCountry);
      if (user) {
        if (user.country) {
          setSession(user, user.country);
          router.push('/dashboard');
        } else if (user.role?.toLowerCase() === 'admin' || user.username?.toLowerCase() === 'admin') {
          setSession(user, 'Bahrain');
          router.push('/dashboard');
        } else {
          setSession(user, 'Bahrain');
          router.push('/dashboard');
        }
      } else {
        // Check if it's a disambiguation case (same creds, multiple countries)
        const countries = await getLoginCountries(username, password);
        if (countries.length > 1) {
          setCountryOptions(countries);
          setShowCountryPicker(true);
          setError('');
        } else {
          setError('Invalid username or password');
        }
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCountrySelect = async (country: string) => {
    setLoading(true);
    try {
      const user = await loginUser(username, password, country);
      if (user) {
        setSession(user, user.country || country);
        router.push('/dashboard');
      } else {
        setError('Login failed. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // While checking persistent session, show nothing (prevents flash of login form)
  if (checkingSession) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 50%, #d5dbe6 100%)',
      }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#0071e3' }} />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 50%, #d5dbe6 100%)',
      padding: '20px',
    }}>
      {/* Decorative background elements */}
      <div style={{
        position: 'fixed',
        top: '-20%',
        right: '-10%',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,113,227,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed',
        bottom: '-15%',
        left: '-8%',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(52,199,89,0.05) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div className="animate-scaleIn" style={{
        width: '100%',
        maxWidth: '420px',
      }}>
        {/* Login Card */}
        <div className="glass" style={{
          borderRadius: '24px',
          padding: '40px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.1)',
          background: 'rgba(255, 255, 255, 0.95)',
        }}>
          {/* Logo & Branding */}
          <div style={{
            textAlign: 'center',
            marginBottom: '32px',
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              marginBottom: '-20px',
              marginTop: '-30px'
            }}>
              <img 
                src="/logo.png" 
                alt="The Digital Ledger" 
                style={{ 
                  height: '180px', 
                  objectFit: 'contain'
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <h1 style={{
              fontSize: '20px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: 0
            }}>
              Welcome Back
            </h1>
            <p style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              marginTop: '6px',
            }}>
              Work Management System
            </p>
          </div>
          {showCountryPicker ? (
            <div className="animate-fadeIn" style={{ padding: '0' }}>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <Globe size={32} style={{ color: 'var(--accent)', marginBottom: '8px' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
                  Select Your Country
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                  Your account exists in multiple countries
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                {countryOptions.map(country => (
                  <button
                    key={country}
                    onClick={() => handleCountrySelect(country)}
                    disabled={loading}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '14px 18px', border: '2px solid #E5E7EB', borderRadius: '12px',
                      background: '#FAFAFA', cursor: 'pointer', fontSize: '15px', fontWeight: 600,
                      color: 'var(--text-primary)', transition: 'all 0.2s ease', width: '100%',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = '#F0F7FF'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.background = '#FAFAFA'; }}
                  >
                    <span style={{ fontSize: '22px' }}>{country === 'Bahrain' ? '🇧🇭' : country === 'New Zealand' ? '🇳🇿' : country === 'UAE' ? '🇦🇪' : '🌍'}</span>
                    {country}
                    <ArrowRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }} />
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setShowCountryPicker(false); setCountryOptions([]); }}
                style={{
                  width: '100%', padding: '10px', background: 'transparent', border: '1px solid #D1D5DB',
                  borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)',
                }}
              >
                ← Back to Login
              </button>
            </div>
          ) : (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '20px' }}>
              <label className="label" htmlFor="username">Username</label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-tertiary)',
                }} />
                <input
                  id="username"
                  className="input"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  style={{ paddingLeft: '40px' }}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label className="label" htmlFor="password">Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-tertiary)',
                }} />
                <input
                  id="password"
                  className="input"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingLeft: '40px' }}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="animate-fadeIn" style={{
                padding: '10px 14px',
                borderRadius: '10px',
                background: '#fff0f0',
                color: 'var(--danger)',
                fontSize: '13px',
                marginBottom: '16px',
                border: '1px solid #ffd4d4',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 20px',
                fontSize: '15px',
                fontWeight: 600,
              }}
            >
              {loading ? (
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <>
                  Sign In
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
          )}
        </div>

        <p style={{
          textAlign: 'center',
          fontSize: '12px',
          color: 'var(--text-tertiary)',
          marginTop: '24px',
        }}>
          © {new Date().getFullYear()} Digital Ledger. All rights reserved.
        </p>
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
