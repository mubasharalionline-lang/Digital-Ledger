'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser, setSession } from '@/lib/auth';
import { Building2, Lock, User, ArrowRight, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await loginUser(username, password);
      if (user) {
        if (user.country) {
          // User has a country set (staff always have one, admin may have one)
          setSession(user, user.country);
          router.push('/dashboard');
        } else if (user.role === 'admin') {
          // Admin without country — let them pick
          setSession(user, '');
          router.push('/select-country');
        } else {
          // Staff without country (edge case) — still go to dashboard
          setSession(user, '');
          router.push('/dashboard');
        }
      } else {
        setError('Invalid username or password');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
        {/* Logo & Branding */}
        <div style={{
          textAlign: 'center',
          marginBottom: '32px',
        }}>
          <img 
            src="/logo.png" 
            alt="The Digital Ledger" 
            style={{ 
              height: '160px', 
              marginBottom: '-10px', 
              objectFit: 'contain',
              mixBlendMode: 'multiply'
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <p style={{
            fontSize: '15px',
            color: 'var(--text-secondary)',
            marginTop: '4px',
          }}>
            Work Management System
          </p>
        </div>

        {/* Login Card */}
        <div className="glass" style={{
          borderRadius: '24px',
          padding: '36px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        }}>
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
