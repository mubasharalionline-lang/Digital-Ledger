'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, setSession } from '@/lib/auth';
import { Globe, ArrowRight, MapPin, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const countries = [
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿' },
  { code: 'BH', name: 'Bahrain', flag: '🇧🇭' },
];

export default function SelectCountryPage() {
  const [selected, setSelected] = useState('');
  const router = useRouter();

  useEffect(() => {
    const { user } = getSession();
    if (!user) {
      router.push('/');
    }
  }, [router]);

  const handleContinue = async () => {
    if (!selected) return;
    const { user } = getSession();
    if (user) {
      const countryName = countries.find(c => c.code === selected)?.name || selected;
      
      // Update the user's country in Supabase
      await supabase.from('users').update({ country: countryName }).eq('id', user.id);
      
      // Update session locally
      user.country = countryName;
      setSession(user, countryName);
      router.push('/dashboard');
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
      <div className="animate-slideUp" style={{
        width: '100%',
        maxWidth: '520px',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #34c759, #30b855)',
            boxShadow: '0 8px 24px rgba(52,199,89,0.25)',
            marginBottom: '16px',
          }}>
            <Globe size={24} color="white" />
          </div>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
          }}>
            Select Your Country
          </h1>
          <p style={{
            fontSize: '15px',
            color: 'var(--text-secondary)',
            marginTop: '4px',
          }}>
            Choose the country you&apos;ll be working with
          </p>
        </div>

        {/* Country Grid */}
        <div className="glass" style={{
          borderRadius: '24px',
          padding: '24px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '10px',
          }}>
            {countries.map((country) => (
              <button
                key={country.code}
                onClick={() => setSelected(country.code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 16px',
                  borderRadius: '14px',
                  border: selected === country.code
                    ? '2px solid var(--accent)'
                    : '2px solid transparent',
                  background: selected === country.code
                    ? 'var(--accent-light)'
                    : 'var(--bg-tertiary)',
                  cursor: 'pointer',
                  transition: 'var(--transition)',
                  textAlign: 'left',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <span style={{ fontSize: '24px' }}>{country.flag}</span>
                <div>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}>
                    {country.code}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                  }}>
                    {country.name}
                  </div>
                </div>
                {selected === country.code && (
                  <div className="animate-scaleIn" style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Check size={12} color="white" />
                  </div>
                )}
              </button>
            ))}
          </div>

          <button
            onClick={handleContinue}
            disabled={!selected}
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '15px',
              fontWeight: 600,
              marginTop: '20px',
              opacity: selected ? 1 : 0.5,
              cursor: selected ? 'pointer' : 'not-allowed',
            }}
          >
            <MapPin size={16} />
            Continue
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
