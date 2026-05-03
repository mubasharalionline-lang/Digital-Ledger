'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { isBahrainMode } from '@/lib/bahrain';
import BahrainTaskTypes from '@/components/bahrain/BahrainTaskTypes';

export default function TaskTypesPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { user, country } = getSession();
    if (!user) { router.push('/'); return; }
    // Task Types page is Bahrain-only
    if (!isBahrainMode(country)) { router.push('/dashboard'); return; }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return <BahrainTaskTypes />;
}
