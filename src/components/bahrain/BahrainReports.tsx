'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Task, Company } from '@/lib/supabase';
import { getDataCountry, getSession, isAdmin } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import {
  ListTodo,
  Building2,
  Users as UsersIcon,
  CheckCircle2,
  Clock,
  BarChart3,
  Globe
} from 'lucide-react';

export default function BahrainReports() {
  const [tasksByCountry, setTasksByCountry] = useState<Record<string, number>>({});
  const [totalTasks, setTotalTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [pendingTasks, setPendingTasks] = useState(0);
  const [totalCompanies, setTotalCompanies] = useState(0);
  const [totalPartners, setTotalPartners] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const router = useRouter();

  const { user: currentUser } = getSession();
  const isAdminUser = isAdmin(currentUser);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const dataCountry = getDataCountry();

      const [companiesRes, usersRes] = await Promise.all([
        supabase.from('companies').select('*').eq('country', dataCountry || 'Bahrain'),
        dataCountry 
          ? supabase.from('users').select('*').eq('country', dataCountry).neq('role', 'admin')
          : supabase.from('users').select('*').neq('role', 'admin')
      ]);

      const companyList = companiesRes.data || [];
      const companyIds = companyList.map(c => c.id);
      
      setTotalCompanies(companyList.length);
      setTotalPartners(usersRes.data ? usersRes.data.length : 0);

      let taskList: Task[] = [];
      if (companyIds.length > 0) {
        const { data: tasks } = await supabase.from('tasks').select('*').in('company_id', companyIds);
        taskList = tasks || [];
      }

      setTotalTasks(taskList.length);
      const completedCount = taskList.filter(t => t.status === 'Closed' || t.status === 'Completed' || t.status === 'Filed').length;
      setCompletedTasks(completedCount);
      setPendingTasks(taskList.length - completedCount);

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

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div style={{ fontSize: '18px', color: 'var(--text-secondary, #666)' }}>Loading reports...</div>
    </div>
  );

  const completionRate = totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) : '0';

  return (
    <div style={{ paddingBottom: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px', padding: '24px 28px', background: 'linear-gradient(135deg, #1E293B 0%, #334155 100%)', borderRadius: '16px', color: '#fff' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#fff', margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>Reports & Analytics</h1>
        <p style={{ fontSize: '14px', color: '#94A3B8', margin: 0 }}>Comprehensive overview of tasks, companies, and performance.</p>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px',
        marginBottom: '32px',
      }}>
        <StatCard 
          icon={<ListTodo size={20} />} 
          label="Total Tasks" 
          value={totalTasks} 
          colorHex="#3B82F6" 
          onClick={() => router.push('/dashboard/tasks')}
        />
        <StatCard 
          icon={<CheckCircle2 size={20} />} 
          label="Completed Tasks" 
          value={completedTasks} 
          colorHex="#10B981" 
          onClick={() => router.push('/dashboard/tasks')}
        />
        <StatCard 
          icon={<Clock size={20} />} 
          label="Pending Tasks" 
          value={pendingTasks} 
          colorHex="#F59E0B" 
          onClick={() => router.push('/dashboard/tasks')}
        />
        <StatCard 
          icon={<Building2 size={20} />} 
          label="Total Companies" 
          value={totalCompanies} 
          colorHex="#8B5CF6" 
          onClick={() => router.push('/dashboard/companies')}
        />
        <StatCard 
          icon={<UsersIcon size={20} />} 
          label="Total Partners" 
          value={totalPartners} 
          colorHex="#EC4899" 
          onClick={() => router.push('/dashboard/staff')}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <h3 style={panelTitleStyle}>
              <Globe size={18} color="#3B82F6" /> Tasks by Country
            </h3>
          </div>
          <div style={listContainerStyle}>
            {Object.entries(tasksByCountry).length === 0 ? (
               <div style={{ textAlign: 'center', padding: '20px', color: '#6B7280' }}>No tasks found</div>
            ) : (
               Object.entries(tasksByCountry).map(([country, count], idx) => {
                 const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899'];
                 const catColor = colors[idx % colors.length];
                 return (
                   <div key={country} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', background: '#FAFAFA', borderRadius: '10px', border: '1px solid #E5E7EB', marginBottom: '8px'
                   }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ 
                          width: '36px', height: '36px', borderRadius: '8px', 
                          background: `${catColor}20`, color: catColor, 
                          display: 'flex', alignItems: 'center', justifyContent: 'center', 
                          fontSize: '18px', fontWeight: 700 
                        }}>
                          {country === 'Bahrain' ? '🇧🇭' : (country === 'New Zealand' ? '🇳🇿' : '🌍')}
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{country}</div>
                     </div>
                     <div style={{ fontSize: '16px', fontWeight: 700, color: catColor }}>{count}</div>
                   </div>
                 );
               })
            )}
          </div>
        </div>

        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <h3 style={panelTitleStyle}>
              <BarChart3 size={18} color="#10B981" /> Overall Completion Rate
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '20px' }}>
             <div style={{ position: 'relative', width: '160px', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%' }}>
                 <path
                   d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                   fill="none"
                   stroke="#E5E7EB"
                   strokeWidth="3.8"
                 />
                 <path
                   d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                   fill="none"
                   stroke="#10B981"
                   strokeWidth="3.8"
                   strokeDasharray={`${completionRate}, 100`}
                   style={{ transition: 'stroke-dasharray 1s ease' }}
                 />
               </svg>
               <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                 <span style={{ fontSize: '32px', fontWeight: 700, color: '#111827' }}>{completionRate}%</span>
               </div>
             </div>
             <div style={{ marginTop: '24px', textAlign: 'center' }}>
               <div style={{ fontSize: '16px', fontWeight: 600, color: '#374151' }}>{completedTasks} of {totalTasks} Tasks Completed</div>
               <div style={{ fontSize: '14px', color: '#6B7280', marginTop: '4px' }}>Keep up the great work!</div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------
// Component & Style Definitions
// -----------------------------------------------------

function StatCard({ icon, label, value, colorHex, onClick }: { icon: React.ReactNode; label: string; value: number | string; colorHex: string; onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      style={{
        background: `linear-gradient(135deg, #ffffff 0%, ${colorHex}08 100%)`,
        border: `1px solid ${colorHex}30`,
        borderTop: `4px solid ${colorHex}`,
        borderRadius: '12px',
        padding: '20px',
        boxShadow: `0 2px 4px ${colorHex}15`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}
      onMouseEnter={e => onClick && (e.currentTarget.style.transform = 'translateY(-2px)', e.currentTarget.style.boxShadow = `0 6px 12px ${colorHex}25`)}
      onMouseLeave={e => onClick && (e.currentTarget.style.transform = 'none', e.currentTarget.style.boxShadow = `0 2px 4px ${colorHex}15`)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ color: '#6B7280', fontSize: '14px', fontWeight: 500 }}>{label}</div>
        <div style={{ background: `${colorHex}15`, color: colorHex, padding: '8px', borderRadius: '8px' }}>
          {icon}
        </div>
      </div>
      <div style={{ fontSize: '32px', fontWeight: 700, color: '#111827', lineHeight: 1 }}>{value}</div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E5E7EB',
  borderRadius: '16px',
  padding: '24px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  display: 'flex',
  flexDirection: 'column',
  height: '100%'
};

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '20px'
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: '#111827',
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
};

const listContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};
