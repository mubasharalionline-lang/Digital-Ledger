'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Task, Company } from '@/lib/supabase';
import { getDataCountry, getSession, isAdmin } from '@/lib/auth';

export default function BahrainReports() {
  const [tasksByCountry, setTasksByCountry] = useState<Record<string, number>>({});
  const [totalTasks, setTotalTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [loading, setLoading] = useState(true);

  const { user: currentUser } = getSession();
  const isAdminUser = isAdmin(currentUser);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const dataCountry = getDataCountry();

      // All companies for Bahrain view
      const { data: companies } = await supabase.from('companies').select('*').eq('country', dataCountry || 'Bahrain');
      const companyList = companies || [];
      const companyIds = companyList.map(c => c.id);

      let taskList: Task[] = [];
      if (companyIds.length > 0) {
        const { data: tasks } = await supabase.from('tasks').select('*').in('company_id', companyIds);
        taskList = tasks || [];
      }

      setTotalTasks(taskList.length);
      setCompletedTasks(taskList.filter(t => t.status === 'Closed' || t.status === 'Completed').length);

      // Group by company country
      const byCountry: Record<string, number> = {};
      taskList.forEach(t => {
        const company = companyList.find(c => c.id === t.company_id);
        const country = company?.country || 'Unknown';
        byCountry[country] = (byCountry[country] || 0) + 1;
      });
      setTasksByCountry(byCountry);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (!isAdminUser) return <div style={{ textAlign: 'center', padding: '60px', color: '#E74C3C', fontSize: '18px', fontWeight: 'bold' }}>Access Denied</div>;

  if (loading) return <div style={{ textAlign: 'center', padding: '60px', color: '#7F8C8D' }}>Loading...</div>;

  const completionRate = totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) : '0';

  const cardGradients = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  ];

  return (
    <div>
      <h2 style={{ color: 'var(--text-primary, #2E4053)', marginBottom: '20px', fontSize: '22px', fontWeight: 600 }}>Reports & Analytics</h2>

      {/* Tasks by country */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        {Object.entries(tasksByCountry).map(([country, count], idx) => (
          <div key={country} style={{
            background: cardGradients[idx % cardGradients.length],
            color: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
          }}>
            <h3 style={{ fontSize: '13px', fontWeight: 500, opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>{country} Tasks</h3>
            <div style={{ fontSize: '48px', fontWeight: 700, lineHeight: 1 }}>{count}</div>
          </div>
        ))}
      </div>

      {/* Completion Rate */}
      <div style={{ marginTop: '30px' }}>
        <h3 style={{ marginBottom: '15px', color: 'var(--text-primary, #2E4053)', fontSize: '18px' }}>Task Completion Rate</h3>
        <div style={{
          padding: '40px', background: 'var(--bg-card, #fff)', borderRadius: '12px', textAlign: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <div style={{ fontSize: '56px', fontWeight: 700, color: '#5DADE2' }}>{completionRate}%</div>
          <div style={{ fontSize: '16px', color: 'var(--text-primary, #333)', marginTop: '10px' }}>Overall Completion Rate</div>
          <div style={{ fontSize: '14px', color: '#7F8C8D', marginTop: '5px' }}>{completedTasks} of {totalTasks} tasks completed</div>
        </div>
      </div>
    </div>
  );
}
