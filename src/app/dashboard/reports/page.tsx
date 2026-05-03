'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { isBahrainMode } from '@/lib/bahrain';
import BahrainReports from '@/components/bahrain/BahrainReports';

export default function ReportsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { user, country } = getSession();
    if (!user) { router.push('/'); return; }
    // Reports page is Bahrain-only for now
    if (!isBahrainMode(country)) { router.push('/dashboard'); return; }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return <BahrainReports />;
}
