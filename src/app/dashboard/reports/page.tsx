'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/auth';
import BahrainReports from '@/components/bahrain/BahrainReports';

/**
 * Unified Reports page — available for all countries.
 * The previous Bahrain-only guard has been removed.
 */
export default function ReportsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { user } = getSession();
    if (!user) { router.push('/'); return; }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return <BahrainReports />;
}
