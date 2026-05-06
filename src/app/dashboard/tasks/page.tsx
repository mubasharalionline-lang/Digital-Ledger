'use client';

import BahrainTasks from '@/components/bahrain/BahrainTasks';

/**
 * Unified Tasks page — all countries use the same task management component.
 * The old New Zealand task view has been removed.
 */
import { Suspense } from 'react';

export default function TasksPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: '60px' }}>Loading tasks...</div>}>
      <BahrainTasks />
    </Suspense>
  );
}
