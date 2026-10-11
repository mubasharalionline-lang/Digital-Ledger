'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, isAdmin, getDataCountry } from '@/lib/auth';
import BahrainReports from '@/components/bahrain/BahrainReports';
import { Loader2 } from 'lucide-react';

export default function ReportsPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [activeCountry, setActiveCountry] = useState<string>('Bahrain');

  useEffect(() => {
    const { user, country: sessionCountry } = getSession();
    if (!user || (!isAdmin(user) && !user.permissions?.can_view_reports)) {
      router.replace('/dashboard');
      return;
    }
    
    const country = sessionCountry || getDataCountry() || user.country || 'Bahrain';
    setActiveCountry(country);
    setAuthorized(true);
  }, [router]);

  if (authorized === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: 500 }}>
          <Loader2 className="animate-spin" size={20} color="var(--accent)" />
          Loading Reports...
        </div>
      </div>
    );
  }

  return <BahrainReports countryOverride={activeCountry} />;
}
