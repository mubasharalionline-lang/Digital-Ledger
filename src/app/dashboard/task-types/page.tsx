'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/auth';
import BahrainTaskTypes from '@/components/bahrain/BahrainTaskTypes';

/**
 * Unified Task Types page — available for all countries.
 * The previous Bahrain-only guard has been removed.
 */
export default function TaskTypesPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { user } = getSession();
    if (!user) { router.push('/'); return; }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return <BahrainTaskTypes />;
}
