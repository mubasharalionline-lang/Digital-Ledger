'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Task, Company, User, TaskType } from '@/lib/supabase';
import { getDataCountry, getSession, isAdmin } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Users as UsersIcon,
  Building2,
  ListTodo,
  ChevronRight,
  ArrowUpRight,
  CalendarDays,
  Repeat,
  CheckCircle2,
} from 'lucide-react';


interface TaskTypeStats {
  taskType: TaskType;
  count: number;
  companies: Set<string>;
}

export default function BahrainDashboard() {
  const [totalTasks, setTotalTasks] = useState(0);
  const [totalDailyTasks, setTotalDailyTasks] = useState(0);
  const [overdueTasks, setOverdueTasks] = useState(0);
  const [activePartners, setActivePartners] = useState(0);
  const [totalCompanies, setTotalCompanies] = useState(0);
  const [taskTypeStats, setTaskTypeStats] = useState<TaskTypeStats[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [dailyTaskStats, setDailyTaskStats] = useState<{ total: number; pending: number; completed: number; repeatCount: number; statusBreakdown: Record<string, number> }>({ total: 0, pending: 0, completed: 0, repeatCount: 0, statusBreakdown: {} });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);


  const [formattedDate, setFormattedDate] = useState('');
  useEffect(() => {
    setFormattedDate(new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }));
  }, []);

  useEffect(() => {
    const { user } = getSession();
    setCurrentUser(user);
  }, []);

  const loadDashboard = useCallback(async () => {
    const cacheKey = 'dashboard_data_cache_v2';
    const cacheTimeKey = 'dashboard_data_time_v2';
    const cachedData = sessionStorage.getItem(cacheKey);
    const cacheTime = sessionStorage.getItem(cacheTimeKey);
    
    let useCache = false;

    if (cachedData && cacheTime) {
      const isFresh = Date.now() - parseInt(cacheTime) < 5 * 60 * 1000; // 5 mins TTL
      if (isFresh) {
        try {
          const parsed = JSON.parse(cachedData);
          setTotalTasks(parsed.totalTasks);
          setTotalDailyTasks(parsed.totalDailyTasks || 0);
          if (parsed.dailyTaskStats) setDailyTaskStats(parsed.dailyTaskStats);
          setTotalCompanies(parsed.totalCompanies);
          setActivePartners(parsed.activePartners);
          setOverdueTasks(parsed.overdueTasks);
          setTaskTypeStats(parsed.taskTypeStats);
          setStatusCounts(parsed.statusCounts);
          setLoading(false);
          useCache = true;
        } catch (e) {}
      }
    }

    if (useCache) {
      return;
    }

    try {
      const dataCountry = getDataCountry();
      const { user: currentUser } = getSession();
      const isAdminUser = isAdmin(currentUser);

      // Fire all independent queries simultaneously
      const [companiesRes, usersRes, taskTypesRes] = await Promise.all([
        supabase.from('companies').select('id, company_name, notes, country, created_at').eq('country', dataCountry || 'Bahrain'),
        dataCountry ? supabase.from('users').select('id, username, role, country, created_at').eq('country', dataCountry).neq('role', 'admin') : supabase.from('users').select('id, username, role, country, created_at').neq('role', 'admin'),
        supabase.from('task_types').select('id, name, category, jurisdiction, active, country, created_at').eq('country', dataCountry || 'Bahrain')
      ]);

      const companyList = companiesRes.data || [];
      const companyIds = companyList.map(c => c.id);
      const newTotalCompanies = companyList.length;
      setTotalCompanies(newTotalCompanies);
      setActivePartners((usersRes.data || []).length);

       // Fetch tasks (depends on companyIds)
      let taskList: Task[] = [];
      const userAuditorAccess: string[] = currentUser?.permissions?.auditor_access || [];
      if (companyIds.length > 0) {
        let taskQuery = supabase.from('tasks').select('id, title, company_id, assigned_to, assigned_partners, status, priority, deadline, task_type_id, task_type_ids, auditor_id, description, is_daily, country, created_at').in('company_id', companyIds).neq('is_daily', true);
        // For non-admin users, we must filter client-side because Supabase
        // can't do OR across a column and a JSONB array in a single .eq()
        const { data: tasks } = await taskQuery;
        let allTasks = tasks || [];

        if (!isAdminUser && currentUser) {
          allTasks = allTasks.filter(t =>
            t.assigned_to === currentUser.id ||
            (t.assigned_partners && t.assigned_partners.includes(currentUser.id)) ||
            (userAuditorAccess.length > 0 && userAuditorAccess.includes(t.auditor_id || ''))
          );
        }
        taskList = allTasks;
      }
      
      const newTotalTasks = taskList.length;
      setTotalTasks(newTotalTasks);

      // Fetch daily tasks with full data for statistics
      const taskCountry = dataCountry || 'Bahrain';
      const dailyQuery = supabase.from('tasks')
        .select('id, title, status, repeat_daily, repeat_monthly, is_daily, country, created_at')
        .eq('is_daily', true)
        .eq('country', taskCountry);

      const { data: dailyTasks } = await dailyQuery;
      const dailyList = dailyTasks || [];

      // Auto-reset daily repeating tasks
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const tasksToReset = dailyList.filter(t => (t.repeat_daily || t.repeat_monthly) && t.status !== 'Pending');
      if (tasksToReset.length > 0) {
        const taskIds = tasksToReset.map(t => t.id);
        const { data: logs } = await supabase
          .from('status_log')
          .select('task_id, created_at')
          .in('task_id', taskIds)
          .order('created_at', { ascending: false });
          
        const resetPromises: any[] = [];
        const currentMonth = todayStart.getMonth();
        const currentYear = todayStart.getFullYear();
        
        for (const task of tasksToReset) {
          const taskLogs = (logs || []).filter(l => l.task_id === task.id);
          const latestLogDateStr = taskLogs.length > 0 ? taskLogs[0].created_at : task.created_at;
          const latestDate = new Date(latestLogDateStr);
          
          let shouldReset = false;
          let remarks = '';
          
          if (task.repeat_daily && latestDate < todayStart) {
            shouldReset = true;
            remarks = 'Daily auto-reset';
          } else if (task.repeat_monthly && (latestDate.getMonth() !== currentMonth || latestDate.getFullYear() !== currentYear)) {
            shouldReset = true;
            remarks = 'Monthly auto-reset';
          }
          
          if (shouldReset) {
            resetPromises.push(
              supabase.from('tasks').update({ status: 'Pending' }).eq('id', task.id)
            );
            resetPromises.push(
              supabase.from('status_log').insert({
                task_id: task.id,
                status: 'Pending',
                remarks: remarks
              })
            );
            task.status = 'Pending';
          }
        }
        
        if (resetPromises.length > 0) {
          await Promise.all(resetPromises);
        }
      }

      setTotalDailyTasks(dailyList.length);

      // Compute daily task stats
      const completedStatuses = ['completed', 'closed', 'done', 'filed'];
      const pendingCount = dailyList.filter(t => !completedStatuses.includes(t.status?.toLowerCase() || '')).length;
      const completedCount = dailyList.filter(t => completedStatuses.includes(t.status?.toLowerCase() || '')).length;
      const repeatCount = dailyList.filter(t => t.repeat_daily === true || t.repeat_monthly === true).length;
      const statusBreakdown: Record<string, number> = {};
      dailyList.forEach(t => { statusBreakdown[t.status || 'Unknown'] = (statusBreakdown[t.status || 'Unknown'] || 0) + 1; });
      const newDailyStats = { total: dailyList.length, pending: pendingCount, completed: completedCount, repeatCount, statusBreakdown };
      setDailyTaskStats(newDailyStats);

      // Overdue count
      const today = new Date();
      const newOverdueTasks = taskList.filter(t => {
        const due = new Date(t.deadline);
        return due < today && t.status !== 'Closed' && t.status !== 'Completed';
      }).length;
      setOverdueTasks(newOverdueTasks);

      // Task types stats
      const ttMap = new Map<string, TaskTypeStats>();
      taskList.forEach(task => {
        if (task.task_type_id && taskTypesRes.data) {
          // Support comma-separated task_type_id (multiple types per task)
          const typeIds = task.task_type_id.split(',').map(s => s.trim()).filter(Boolean);
          typeIds.forEach(ttId => {
            const tt = taskTypesRes.data!.find(t => t.id === ttId);
            if (tt) {
              if (!ttMap.has(tt.id)) {
                ttMap.set(tt.id, { taskType: tt, count: 0, companies: new Set() });
              }
              const entry = ttMap.get(tt.id)!;
              entry.count++;
              entry.companies.add(task.company_id);
            }
          });
        }
      });
      const newTaskTypeStats = Array.from(ttMap.values()).sort((a, b) => b.count - a.count);
      setTaskTypeStats(newTaskTypeStats);

      // Status counts
      const newStatusCounts: Record<string, number> = {};
      taskList.forEach(t => { newStatusCounts[t.status] = (newStatusCounts[t.status] || 0) + 1; });
      setStatusCounts(newStatusCounts);

      // Save cache (exclude Sets which don't JSON serialize well)
      const serializableTaskTypeStats = newTaskTypeStats.map(s => ({ ...s, companies: Array.from(s.companies) }));
      sessionStorage.setItem(cacheKey, JSON.stringify({
        totalTasks: newTotalTasks,
        totalDailyTasks: dailyList.length,
        dailyTaskStats: newDailyStats,
        totalCompanies: newTotalCompanies,
        activePartners: (usersRes.data || []).length,
        overdueTasks: newOverdueTasks,
        taskTypeStats: serializableTaskTypeStats,
        statusCounts: newStatusCounts,
      }));
      sessionStorage.setItem('dashboard_data_time_v2', Date.now().toString());

    } catch (err) {
      console.error('Dashboard load error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '20px 0', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ height: '110px', borderRadius: '24px', background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)', backgroundSize: '200% 100%' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {[1,2,3,4,5].map(i => <div key={i} style={{ height: '130px', borderRadius: '18px', background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)', backgroundSize: '200% 100%' }} />)}
        </div>
      </div>
    );
  }

  const greet = (() => { const h = new Date().getHours(); return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening'; })();

  return (
    <div className="animate-fade-up" style={{ paddingBottom: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        /* custom scrollbars */
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        /* pulse animations */
        @keyframes warningPulse {
          0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          50% { transform: scale(1.15); opacity: 0.8; box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
        }
        .pulse-warning {
          animation: warningPulse 2s infinite ease-in-out;
        }

        /* timeline styles */
        .timeline-container {
          position: relative;
        }
        .timeline-item {
          position: relative;
        }

        /* entrance animation */
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-up {
          animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}} />
      
      <div style={{ marginBottom: '32px', padding: '36px 40px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 45%, #0f172a 100%)', borderRadius: '24px', color: '#fff', position: 'relative', overflow: 'hidden', boxShadow: '0 12px 40px rgba(15,23,42,0.25)', border: '1px solid rgba(255,255,255,0.05)' }}>
        {/* Glowing mesh background */}
        <div className="welcome-glow-1" style={{ position: 'absolute', top: '-60px', right: '-40px', width: '250px', height: '250px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0) 70%)', filter: 'blur(20px)' }} />
        <div className="welcome-glow-2" style={{ position: 'absolute', bottom: '-80px', right: '120px', width: '200px', height: '200px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, rgba(139,92,246,0) 70%)', filter: 'blur(20px)' }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <p style={{ fontSize: '12px', color: '#38bdf8', margin: '0 0 6px 0', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>{greet}</p>
              <h1 style={{ fontSize: '32px', fontWeight: 850, color: '#fff', margin: '0 0 6px 0', letterSpacing: '-0.8px', lineHeight: 1.1 }}>Operations Console</h1>
            </div>
            {formattedDate && (
              <div style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', padding: '8px 16px', fontSize: '13px', color: '#94a3b8', fontWeight: 600, backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CalendarDays size={14} style={{ color: '#38bdf8' }} />
                {formattedDate}
              </div>
            )}
          </div>
          <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px', marginTop: '8px' }}>
            <p style={{ fontSize: '15px', color: '#cbd5e1', margin: 0, fontWeight: 500, lineHeight: 1.5 }}>
              You have <span style={{ color: overdueTasks > 0 ? '#f87171' : '#34d399', fontWeight: 700 }}>{overdueTasks}</span> overdue task{overdueTasks !== 1 ? 's' : ''} out of <span style={{ color: '#fff', fontWeight: 700 }}>{totalTasks}</span> total task{totalTasks !== 1 ? 's' : ''}.
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="dashboard-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <StatCard icon={<ListTodo size={22} />} label="Total Tasks" value={totalTasks} colorHex="#3b82f6" onClick={() => router.push('/dashboard/tasks')} />
        <StatCard icon={<AlertTriangle size={22} />} label="Overdue" value={overdueTasks} colorHex="#ef4444" onClick={() => router.push('/dashboard/tasks')} showWarningPulse={overdueTasks > 0} />
        {isAdmin(getSession().user) && (
          <>
            <StatCard icon={<UsersIcon size={22} />} label="Partners" value={activePartners} colorHex="#10b981" onClick={() => router.push('/dashboard/staff')} />
            <StatCard icon={<Building2 size={22} />} label="Companies" value={totalCompanies} colorHex="#f59e0b" onClick={() => router.push('/dashboard/companies')} />
            <StatCard icon={<CalendarDays size={22} />} label="Daily Tasks" value={totalDailyTasks} colorHex="#8b5cf6" onClick={() => router.push('/dashboard/daily-tasks')} percentage={dailyTaskStats.total > 0 ? Math.round((dailyTaskStats.completed / dailyTaskStats.total) * 100) : 0} subtitle={`${dailyTaskStats.completed} of ${dailyTaskStats.total} done`} />
          </>
        )}
      </div>

      <div className="dashboard-panels-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>

        {/* Tasks by Category */}
        {taskTypeStats.length > 0 && (
          <div style={panelStyle}>
            <div style={panelHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#ecfdf5', color: '#10b981', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ListTodo size={18} /></div>
                <h3 style={{ ...panelTitleStyle, margin: 0 }}>Tasks by Category</h3>
              </div>
            </div>
            <div className="custom-scrollbar" style={listContainerStyle}>
              {taskTypeStats.map(({ taskType, count, companies }, idx) => {
                const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6'];
                const c = colors[idx % colors.length];
                return (
                <div key={taskType.id} onClick={() => router.push(`/dashboard/tasks?search=${encodeURIComponent(taskType.name)}`)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', cursor: 'pointer', background: '#ffffff', borderRadius: '16px', border: '1px solid #f1f5f9', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', flexShrink: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 12px 24px -8px ${c}30`; e.currentTarget.style.borderColor = `${c}50`; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#f1f5f9'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '46px', height: '46px', borderRadius: '14px', background: `linear-gradient(135deg, ${c}15, ${c}05)`, border: `1px solid ${c}20`, color: c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 800, flexShrink: 0 }}>{idx + 1}</div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em', marginBottom: '2px' }}>{taskType.name}</div>
                      <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#cbd5e1' }} />
                        {companies.size} {companies.size === 1 ? 'company' : 'companies'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <span style={{ fontSize: '20px', fontWeight: 800, color: c, lineHeight: 1 }}>{count}</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>Tasks</span>
                    </div>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', transition: 'all 0.2s ease' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                      onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                    >
                      <ChevronRight size={18} />
                    </div>
                  </div>
                </div>
              )})}
            </div>
          </div>
        )}

        {/* Daily Task Statistics Panel — Position 4 */}
        {isAdmin(getSession().user) && (
          <div style={panelStyle}>
            <div style={panelHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#f5f3ff', color: '#8b5cf6', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CalendarDays size={18} /></div>
                <h3 style={{ ...panelTitleStyle, margin: 0 }}>Daily Tasks</h3>
              </div>
              <span style={badgeStyle}>{dailyTaskStats.total} total</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="daily-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                <div style={{ padding: '14px 12px', background: '#f8fafc', borderRadius: '12px', textAlign: 'center', border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#8b5cf6', lineHeight: 1 }}>{dailyTaskStats.total}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Total</div>
                </div>
                <div style={{ padding: '14px 12px', background: '#fffbeb', borderRadius: '12px', textAlign: 'center', border: '1px solid #fde68a40' }}>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#d97706', lineHeight: 1 }}>{dailyTaskStats.pending}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Active</div>
                </div>
                <div style={{ padding: '14px 12px', background: '#ecfdf5', borderRadius: '12px', textAlign: 'center', border: '1px solid #a7f3d040' }}>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#059669', lineHeight: 1 }}>{dailyTaskStats.completed}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Done</div>
                </div>
                <div style={{ padding: '14px 12px', background: '#f5f3ff', borderRadius: '12px', textAlign: 'center', border: '1px solid #ddd6fe40' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <Repeat size={14} color="#7c3aed" />
                    <span style={{ fontSize: '22px', fontWeight: 800, color: '#7c3aed', lineHeight: 1 }}>{dailyTaskStats.repeatCount}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Repeat</div>
                </div>
              </div>
              {dailyTaskStats.total > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Completion Rate</span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#059669' }}>{Math.round((dailyTaskStats.completed / dailyTaskStats.total) * 100)}%</span>
                  </div>
                  <div style={{ background: '#f1f5f9', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{ width: `${(dailyTaskStats.completed / dailyTaskStats.total) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #059669)', borderRadius: '5px', transition: 'width 1s ease-out', minWidth: dailyTaskStats.completed > 0 ? '4px' : '0px' }} />
                  </div>
                </div>
              )}
              {Object.keys(dailyTaskStats.statusBreakdown).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(dailyTaskStats.statusBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([status, count]) => {
                    const pct = dailyTaskStats.total > 0 ? (count / dailyTaskStats.total * 100) : 0;
                    const barColor = getStatusColor(status);
                    return (
                      <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '90px', fontSize: '12px', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{status}</div>
                        <div style={{ flex: 1, background: '#f1f5f9', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${barColor}, ${barColor}bb)`, borderRadius: '4px', transition: 'width 1s ease-out', minWidth: count > 0 ? '3px' : '0px' }} />
                        </div>
                        <div style={{ minWidth: '28px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: barColor }}>{count}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tasks by Status */}
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: '#fffbeb', color: '#d97706', width: '38px', height: '38px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(217, 119, 6, 0.15)' }}>
                <CheckCircle2 size={18} />
              </div>
              <h3 style={panelTitleStyle}>Tasks by Status</h3>
            </div>
            <span style={badgeStyle}>{Object.keys(statusCounts).length} status type{Object.keys(statusCounts).length !== 1 ? 's' : ''}</span>
          </div>
          
          <div className="custom-scrollbar" style={listContainerStyle}>
            {Object.keys(statusCounts).length === 0 ? (
              <EmptyState message="No tasks found to categorize status" icon="📈" />
            ) : (
              Object.entries(statusCounts).map(([status, count]) => {
                const color = getStatusColor(status);
                const pct = totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0;
                return (
                  <div key={status} onClick={() => router.push(`/dashboard/tasks?status=${encodeURIComponent(status)}`)}
                    style={{ padding: '16px 20px', background: '#ffffff', borderRadius: '18px', border: '1px solid rgba(226, 232, 240, 0.8)', cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)', flexShrink: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 12px 24px -8px ${color}12`; e.currentTarget.style.borderColor = `${color}30`; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.8)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'capitalize' }}>{status}</span>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 800, color, background: `${color}10`, padding: '2px 8px', borderRadius: '6px' }}>{count}</span>
                    </div>
                    {/* Status Progress Bar */}
                    <div style={{ background: '#f1f5f9', height: '5px', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 1s ease-out' }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Component & Style Definitions ---

function getStatusColor(status: string) {
  const s = status.trim().toLowerCase();

  // 1. Success / Completed / Done / Submitted (Emerald / Teal / Cyan / Green)
  if (s === 'completed' || s === 'done' || s.includes('submitted')) return '#047857'; // Emerald 700
  if (s === 'closed') return '#065f46';    // Emerald 800
  if (s === 'filed' || s.includes('file')) return '#0e7490';     // Cyan 700
  if (s.includes('received')) return '#16a34a'; // Green 600

  // 2. Query / Info / Ask (Yellow / Gold) - Check before general pending/waiting
  if (s.includes('query') || s.includes('info') || s.includes('question') || s.includes('letter') || s.includes('confirmation')) return '#a16207'; // Yellow 700

  // 3. Review / Verification / Auditor / Approval (Purple / Violet)
  if (s.includes('review') || s.includes('auditor') || s.includes('approval') || s.includes('validation')) return '#6d28d9'; // Purple 700

  // 4. Financials / Billing / Accounting (Indigo / Violet)
  if (s.includes('payment') || s.includes('financial') || s.includes('billing') || s.includes('invoice') || s.includes('xero')) return '#4338ca'; // Indigo 700

  // 5. Active / Work / In Progress (Blue / Sky)
  if (s === 'in progress' || s === 'progress' || s.includes('progress') || s.includes('progess')) return '#1d4ed8'; // Blue 700
  if (s === 'active' || s === 'started' || s === 'running') return '#1e40af'; // Blue 800
  if (s.includes('checklist')) return '#0369a1'; // Sky 700

  // 6. Danger / Alerts (Red / Rose)
  if (s === 'overdue') return '#b91c1c';   // Red 700
  if (s === 'urgent' || s === 'high') return '#991b1b'; // Red 800
  if (s === 'rework' || s === 'blocked') return '#be123c'; // Rose 700

  // 7. Pending / Deferred / Awaiting (Amber / Orange)
  if (s === 'pending' || s.includes('yet to start') || s.includes('not started')) return '#b45309';   // Amber 700
  if (s.includes('hold') || s.includes('waiting') || s.includes('awaited') || s.includes('pending')) return '#c2410c'; // Orange 700

  // 8. Info / Draft / Default
  if (s === 'new' || s === 'created') return '#0369a1'; // Sky 700
  if (s === 'draft' || s === 'memo') return '#475569'; // Slate 700

  // Broad Fallbacks
  if (s.includes('completed') || s.includes('closed') || s.includes('done') || s.includes('filed')) return '#047857';
  if (s.includes('review') || s.includes('waiting') || s.includes('draft') || s.includes('auditor')) return '#6d28d9';
  if (s.includes('progress') || s.includes('active') || s.includes('started')) return '#1d4ed8';
  if (s.includes('urgent') || s.includes('overdue') || s.includes('rework') || s.includes('block')) return '#b91c1c';
  if (s.includes('query') || s.includes('info') || s.includes('question')) return '#a16207';
  if (s.includes('financial') || s.includes('billing') || s.includes('invoice')) return '#4338ca';

  return '#475569'; // Default Slate 700
}



function getPriorityInfo(priority: string) {
  const p = priority ? priority.trim().toLowerCase() : '';
  if (p === 'urgent' || p === 'critical') {
    return {
      label: 'Urgent',
      emoji: '🔴',
      bg: '#fef2f2',
      border: '#fee2e2',
      color: '#ef4444'
    };
  } else if (p === 'high') {
    return {
      label: 'High',
      emoji: '🟠',
      bg: '#fff7ed',
      border: '#ffedd5',
      color: '#f97316'
    };
  } else if (p === 'medium') {
    return {
      label: 'Medium',
      emoji: '🟡',
      bg: '#fefce8',
      border: '#fef9c3',
      color: '#ca8a04'
    };
  } else {
    return {
      label: 'Low',
      emoji: '🟢',
      bg: '#f0fdf4',
      border: '#dcfce7',
      color: '#16a34a'
    };
  }
}

function StatCard({ 
  icon, 
  label, 
  value, 
  colorHex, 
  onClick, 
  percentage, 
  showWarningPulse,
  subtitle 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: number; 
  colorHex: string; 
  onClick?: () => void; 
  percentage?: number; 
  showWarningPulse?: boolean;
  subtitle?: string;
}) {
  const radius = 18;
  const stroke = 3;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = percentage !== undefined ? circumference - (percentage / 100) * circumference : 0;

  return (
    <div onClick={onClick} style={{
      background: '#ffffff', 
      border: '1px solid rgba(226, 232, 240, 0.8)', 
      borderRadius: '22px', 
      padding: '24px 28px',
      boxShadow: '0 4px 20px -2px rgba(15,23,42,0.02), 0 2px 8px -1px rgba(15,23,42,0.02)', 
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)', 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '16px',
      position: 'relative', 
      overflow: 'hidden',
    }}
      onMouseEnter={e => { 
        if (!onClick) return; 
        e.currentTarget.style.transform = 'translateY(-6px)'; 
        e.currentTarget.style.boxShadow = `0 20px 30px -10px ${colorHex}22, 0 8px 16px -8px rgba(15,23,42,0.06)`; 
        e.currentTarget.style.borderColor = `${colorHex}50`; 
      }}
      onMouseLeave={e => { 
        if (!onClick) return; 
        e.currentTarget.style.transform = 'none'; 
        e.currentTarget.style.boxShadow = '0 4px 20px -2px rgba(15,23,42,0.02), 0 2px 8px -1px rgba(15,23,42,0.02)'; 
        e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.8)'; 
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: `linear-gradient(90deg, ${colorHex}, ${colorHex}aa)`, borderRadius: '22px 22px 0 0' }} />
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ position: 'relative' }}>
          <div style={{ background: `${colorHex}08`, color: colorHex, padding: '10px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${colorHex}15` }}>
            {icon}
          </div>
          {showWarningPulse && (
            <span className="pulse-warning" style={{ position: 'absolute', top: '-3px', right: '-3px', width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', border: '2px solid #fff' }} />
          )}
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ fontSize: '38px', fontWeight: 900, color: '#0f172a', lineHeight: 1, letterSpacing: '-1.5px' }}>
          {value}
        </div>
        
        {percentage !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} title={`${percentage}% Completed`}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: colorHex }}>{percentage}%</span>
            <svg height="30" width="30" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
              <circle
                stroke={`${colorHex}15`}
                fill="transparent"
                strokeWidth={stroke}
                r={normalizedRadius}
                cx="15"
                cy="15"
              />
              <circle
                stroke={colorHex}
                fill="transparent"
                strokeWidth={stroke}
                strokeDasharray={circumference + ' ' + circumference}
                style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)' }}
                strokeLinecap="round"
                r={normalizedRadius}
                cx="15"
                cy="15"
              />
            </svg>
          </div>
        )}
      </div>
      
      {subtitle && (
        <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginTop: '-8px' }}>
          {subtitle}
        </div>
      )}
      
      {onClick && (
        <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, marginTop: '2px' }}>
          View details <ArrowUpRight size={12} style={{ color: colorHex }} />
        </div>
      )}
    </div>
  );
}

function EmptyState({ message, icon }: { message: string; icon?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #e2e8f0' }}>
      {icon && <div style={{ fontSize: '28px', marginBottom: '10px' }}>{icon}</div>}
      <div style={{ fontSize: '14px', fontWeight: 600 }}>{message}</div>
    </div>
  );
}



const panelStyle: React.CSSProperties = {
  background: '#ffffff', 
  border: '1px solid rgba(226, 232, 240, 0.8)', 
  borderRadius: '24px', 
  padding: '28px',
  boxShadow: '0 10px 30px -10px rgba(15,23,42,0.03)', 
  display: 'flex', 
  flexDirection: 'column', 
  height: '100%',
  transition: 'box-shadow 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
};

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px',
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.3px',
};

const badgeStyle: React.CSSProperties = {
  fontSize: '11px', color: '#475569', background: '#f1f5f9', padding: '4px 12px', borderRadius: '20px', fontWeight: 700, letterSpacing: '0.02em',
};

const listContainerStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '380px', overflowY: 'auto', paddingRight: '4px',
};
