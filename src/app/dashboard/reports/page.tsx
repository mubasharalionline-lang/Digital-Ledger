'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, isAdmin, getDataCountry } from '@/lib/auth';
import NewZealandReports from '@/components/nz/NewZealandReports';
import BahrainReports from '@/components/bahrain/BahrainReports';
import { Loader2 } from 'lucide-react';

export default function ReportsPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [isNzCountry, setIsNzCountry] = useState<boolean>(false);

  useEffect(() => {
    const { user, country: sessionCountry } = getSession();
    if (!user || !isAdmin(user)) {
      router.replace('/dashboard');
      return;
    }
    
    const activeCountry = getDataCountry() || sessionCountry || '';
    const isNz =
      activeCountry === 'New Zealand' ||
      activeCountry === 'NZ' ||
      activeCountry.toLowerCase() === 'new zealand' ||
      activeCountry.toLowerCase() === 'nz';

    setIsNzCountry(isNz);
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

  return isNzCountry ? <NewZealandReports /> : <BahrainReports />;
}
