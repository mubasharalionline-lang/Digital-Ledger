'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
import PartnerWorkloadDashboard from '@/components/admin/PartnerWorkloadDashboard';
import { Loader2 } from 'lucide-react';

export default function PartnerWorkloadPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const { user } = getSession();
    if (!user || !isAdmin(user)) {
      router.push('/dashboard');
      return;
    }
    setAuthorized(true);
  }, [router]);

  if (authorized === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: 500 }}>
          <Loader2 className="animate-spin" size={20} color="var(--accent)" />
          Loading Partner Workload...
        </div>
      </div>
    );
  }

  return <PartnerWorkloadDashboard />;
}
