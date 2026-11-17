'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
import BahrainDailyTasks from '@/components/bahrain/BahrainDailyTasks';
import { Loader2 } from 'lucide-react';

export default function DailyTasksPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const { user } = getSession();
    if (!user || (!isAdmin(user) && !user.permissions?.can_view_daily_tasks && !user.permissions?.can_manage_daily_tasks)) {
      router.replace('/dashboard');
      return;
    }
    setAuthorized(true);
  }, [router]);

  if (authorized === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: 500 }}>
          <Loader2 className="animate-spin" size={20} color="var(--accent)" />
          Loading Daily Tasks...
        </div>
      </div>
    );
  }

  return <BahrainDailyTasks />;
}
