'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Task, Company, User, TaskType } from '@/lib/supabase';
import { getDataCountry, getSession, isAdmin } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Clock,
  Users as UsersIcon,
  Building2,
  ListTodo,
  ChevronRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Repeat,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Trash2,
  Edit2,
} from 'lucide-react';

interface UrgentClient {
  company: Company;
  tasks: Task[];
  overdueCount: number;
}

interface TaskTypeStats {
  taskType: TaskType;
  count: number;
  companies: Set<string>;
}

interface PartnerWorkload {
  partner: User;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  inProgressTasks: number;
}

interface RecentMessage {
  id: string;
  task_id: string;
  message: string;
  created_at: string;
  sender_name: string;
  sender_role: string;
  task_title: string;
  company_name: string;
  task_status: string;
  task_type_name: string;
  is_daily: boolean;
}

interface RecentDescUpdate {
  id: string;
  task_id: string;
  description_preview: string;
  created_at: string;
  updated_by_name: string;
  task_title: string;
  company_name: string;
  task_status: string;
  task_type_name: string;
  assigned_to_name: string;
  is_daily: boolean;
}

export default function BahrainDashboard() {
  const [totalTasks, setTotalTasks] = useState(0);
  const [totalDailyTasks, setTotalDailyTasks] = useState(0);
  const [overdueTasks, setOverdueTasks] = useState(0);
  const [activePartners, setActivePartners] = useState(0);
  const [totalCompanies, setTotalCompanies] = useState(0);
  const [urgentClients, setUrgentClients] = useState<UrgentClient[]>([]);
  const [taskTypeStats, setTaskTypeStats] = useState<TaskTypeStats[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [upcomingTasks, setUpcomingTasks] = useState<(Task & { companyName: string; daysLeft: number })[]>([]);
  const [partnerWorkloads, setPartnerWorkloads] = useState<PartnerWorkload[]>([]);
  const [dailyTaskStats, setDailyTaskStats] = useState<{ total: number; pending: number; completed: number; repeatCount: number; statusBreakdown: Record<string, number> }>({ total: 0, pending: 0, completed: 0, repeatCount: 0, statusBreakdown: {} });
  const [recentMessages, setRecentMessages] = useState<RecentMessage[]>([]);
  const [recentDescUpdates, setRecentDescUpdates] = useState<RecentDescUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const handleDeleteMessage = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this message?')) return;
    try {
      await supabase.from('task_messages').delete().eq('id', id);
      setRecentMessages(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  const loadRecentMessages = useCallback(async () => {
    try {
      const dataCountry = getDataCountry();
      const { data: msgs, error: msgsError } = await supabase
        .from('task_messages')
        .select('id, task_id, message, created_at, sender_id, tasks!inner(country)')
        .eq('tasks.country', dataCountry || 'Bahrain')
        .order('created_at', { ascending: false })
        .limit(20);

      if (msgsError) {
        console.error('task_messages fetch error:', msgsError);
      }

      if (!msgs || msgs.length === 0) return;

      const msgTaskIds = [...new Set(msgs.map(m => m.task_id))];
      const msgSenderIds = [...new Set(msgs.map(m => m.sender_id))];

      const [tasksForMsgs, sendersForMsgs, companiesForMsgs, taskTypesForMsgs] = await Promise.all([
        supabase.from('tasks').select('id, title, status, company_id, is_daily, task_type_id').in('id', msgTaskIds),
        supabase.from('users').select('id, username, role').in('id', msgSenderIds),
        supabase.from('companies').select('id, company_name').eq('country', dataCountry || 'Bahrain'),
        supabase.from('task_types').select('id, name').eq('country', dataCountry || 'Bahrain'),
      ]);

      const taskMap = new Map((tasksForMsgs.data || []).map(t => [t.id, t]));
      const senderMap = new Map((sendersForMsgs.data || []).map(u => [u.id, u]));
      const companyMap = new Map((companiesForMsgs.data || []).map(c => [c.id, c.company_name]));
      const taskTypeMap = new Map((taskTypesForMsgs.data || []).map(tt => [tt.id, tt.name]));

      const enriched: RecentMessage[] = msgs.map(m => {
        const task = taskMap.get(m.task_id);
        const sender = senderMap.get(m.sender_id);
        return {
          id: m.id,
          task_id: m.task_id,
          message: m.message,
          created_at: m.created_at,
          sender_name: sender?.username || 'Unknown',
          sender_role: sender?.role || '',
          task_title: task?.title || 'Unknown Task',
          company_name: task?.company_id ? (companyMap.get(task.company_id) || '—') : 'Daily Task',
          task_status: task?.status || '',
          task_type_name: task?.task_type_id ? (taskTypeMap.get(task.task_type_id) || '') : '',
          is_daily: task?.is_daily || false,
        };
      }).filter(m => m.task_title !== 'Unknown Task');

      setRecentMessages(enriched);
    } catch (err) {
      console.error('Messages load error:', err);
    }
  }, []);

  const loadRecentDescUpdates = useCallback(async () => {
    try {
      const dataCountry = getDataCountry();
      const { data: logs, error: logsError } = await supabase
        .from('status_log')
        .select('id, task_id, remarks, created_at, updated_by, tasks!inner(country)')
        .ilike('remarks', 'Description updated to:%')
        .eq('tasks.country', dataCountry || 'Bahrain')
        .order('created_at', { ascending: false })
        .limit(20);

      if (logsError) {
        console.error('status_log fetch error:', logsError);
      }

      if (!logs || logs.length === 0) return;

      const taskIds = [...new Set(logs.map(l => l.task_id))];
      const { data: tasksForLogs } = await supabase
        .from('tasks')
        .select('id, title, status, company_id, is_daily, task_type_id, assigned_to')
        .in('id', taskIds);

      const userIds = [...new Set([
        ...logs.map(l => l.updated_by), 
        ...(tasksForLogs || []).map(t => t.assigned_to)
      ].filter(Boolean))];

      const [usersRes, companiesRes, taskTypesRes] = await Promise.all([
        supabase.from('users').select('id, username').in('id', userIds),
        supabase.from('companies').select('id, company_name').eq('country', dataCountry || 'Bahrain'),
        supabase.from('task_types').select('id, name').eq('country', dataCountry || 'Bahrain'),
      ]);

      const taskMap = new Map((tasksForLogs || []).map(t => [t.id, t]));
      const userMap = new Map((usersRes.data || []).map(u => [u.id, u.username]));
      const companyMap = new Map((companiesRes.data || []).map(c => [c.id, c.company_name]));
      const taskTypeMap = new Map((taskTypesRes.data || []).map(tt => [tt.id, tt.name]));

      const enriched: RecentDescUpdate[] = logs.map(l => {
        const task = taskMap.get(l.task_id);
        return {
          id: l.id,
          task_id: l.task_id,
          description_preview: l.remarks?.replace('Description updated to: ', '') || '',
          created_at: l.created_at,
          updated_by_name: l.updated_by ? (userMap.get(l.updated_by) || 'Unknown') : 'Unknown',
          task_title: task?.title || 'Unknown Task',
          company_name: task?.company_id ? (companyMap.get(task.company_id) || '—') : 'Daily Task',
          task_status: task?.status || '',
          task_type_name: task?.task_type_id ? (taskTypeMap.get(task.task_type_id) || '') : '',
          assigned_to_name: task?.assigned_to ? (userMap.get(task.assigned_to) || 'Unassigned') : 'Unassigned',
          is_daily: task?.is_daily || false,
        };
      }).filter(u => u.task_title !== 'Unknown Task');

      setRecentDescUpdates(enriched);
    } catch (err) {
      console.error('Desc updates load error:', err);
    }
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
          setUrgentClients(parsed.urgentClients);
          setTaskTypeStats(parsed.taskTypeStats);
          setStatusCounts(parsed.statusCounts);
          setUpcomingTasks(parsed.upcomingTasks);
          if (parsed.partnerWorkloads) setPartnerWorkloads(parsed.partnerWorkloads);
          setLoading(false);
          useCache = true;
        } catch (e) {}
      }
    }

    if (useCache) {
      // Still load fresh messages even when dashboard stats are cached
      await loadRecentMessages();
      await loadRecentDescUpdates();
      return;
    }

    try {
      const dataCountry = getDataCountry();
      const { user: currentUser } = getSession();
      const isAdminUser = isAdmin(currentUser);

      // Fire all independent queries simultaneously
      const [companiesRes, usersRes, taskTypesRes] = await Promise.all([
        supabase.from('companies').select('*').eq('country', dataCountry || 'Bahrain'),
        dataCountry ? supabase.from('users').select('*').eq('country', dataCountry).neq('role', 'admin') : supabase.from('users').select('*').neq('role', 'admin'),
        supabase.from('task_types').select('*').eq('country', dataCountry || 'Bahrain')
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
        let taskQuery = supabase.from('tasks').select('*').in('company_id', companyIds).neq('is_daily', true);
        if (!isAdminUser && currentUser && userAuditorAccess.length === 0) {
          // Simple case: no auditor access, just fetch assigned tasks
          taskQuery = taskQuery.eq('assigned_to', currentUser.id);
        }
        const { data: tasks } = await taskQuery;
        let allTasks = tasks || [];

        // For users with auditor access (but not admin), filter client-side
        if (!isAdminUser && currentUser && userAuditorAccess.length > 0) {
          allTasks = allTasks.filter(t =>
            t.assigned_to === currentUser.id ||
            (t.assigned_partners && t.assigned_partners.includes(currentUser.id)) ||
            userAuditorAccess.includes(t.auditor_id || '')
          );
        }
        taskList = allTasks;
      }
      
      const newTotalTasks = taskList.length;
      setTotalTasks(newTotalTasks);

      // Fetch daily tasks with full data for statistics
      const taskCountry = dataCountry || 'Bahrain';
      const dailyQuery = supabase.from('tasks')
        .select('*')
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

      // Urgent clients
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(today.getDate() + 7);

      const urgentMap = new Map<string, UrgentClient>();
      taskList.forEach(task => {
        if (task.status === 'Closed' || task.status === 'Completed') return;
        const dueDate = new Date(task.deadline);
        const isUrgentPriority = task.priority === 'Urgent' || task.priority === 'Critical';
        if (dueDate <= sevenDaysFromNow || isUrgentPriority) {
          const company = companyList.find(c => c.id === task.company_id);
          if (company) {
            if (!urgentMap.has(company.id)) {
              urgentMap.set(company.id, { company, tasks: [], overdueCount: 0 });
            }
            const entry = urgentMap.get(company.id)!;
            entry.tasks.push(task);
            if (dueDate < today) {
              entry.overdueCount++;
            } else if (isUrgentPriority && dueDate > sevenDaysFromNow) {
              // Priority-based urgency, not strictly overdue or within 7 days yet
              // We don't increment overdueCount, but it stays in the list
            }
          }
        }
      });
      const newUrgentClients = Array.from(urgentMap.values()).sort((a, b) => b.overdueCount - a.overdueCount);
      setUrgentClients(newUrgentClients);

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

      // Upcoming deadlines
      const newUpcomingTasks = taskList
        .filter(t => t.status !== 'Closed' && t.status !== 'Completed')
        .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
        .slice(0, 5)
        .map(t => {
          const company = companyList.find(c => c.id === t.company_id);
          const daysLeft = Math.ceil((new Date(t.deadline).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          return { ...t, companyName: company?.company_name || 'Unknown', daysLeft };
        });
      setUpcomingTasks(newUpcomingTasks);

      // Partner workload
      const usersList = usersRes.data || [];
      const newPartnerWorkloads: PartnerWorkload[] = usersList.map(partner => {
        const partnerTasks = taskList.filter(t => 
          t.assigned_to === partner.id || (t.assigned_partners && t.assigned_partners.includes(partner.id))
        );
        const completedTasks = partnerTasks.filter(t => 
          t.status === 'Closed' || t.status === 'Completed' || t.status === 'Filed'
        ).length;
        const overdueTasks = partnerTasks.filter(t => {
          const due = new Date(t.deadline);
          return due < today && t.status !== 'Closed' && t.status !== 'Completed' && t.status !== 'Filed';
        }).length;
        const inProgressTasks = partnerTasks.filter(t => 
          t.status !== 'Closed' && t.status !== 'Completed' && t.status !== 'Filed' && t.status !== 'Not Started'
        ).length;
        return { partner, totalTasks: partnerTasks.length, completedTasks, overdueTasks, inProgressTasks };
      }).filter(pw => pw.totalTasks > 0).sort((a, b) => b.totalTasks - a.totalTasks);
      setPartnerWorkloads(newPartnerWorkloads);

      // Save cache (exclude Sets which don't JSON serialize well)
      const serializableTaskTypeStats = newTaskTypeStats.map(s => ({ ...s, companies: Array.from(s.companies) }));
      sessionStorage.setItem(cacheKey, JSON.stringify({
        totalTasks: newTotalTasks,
        totalDailyTasks: dailyList.length,
        dailyTaskStats: newDailyStats,
        totalCompanies: newTotalCompanies,
        activePartners: (usersRes.data || []).length,
        overdueTasks: newOverdueTasks,
        urgentClients: newUrgentClients,
        taskTypeStats: serializableTaskTypeStats,
        statusCounts: newStatusCounts,
        upcomingTasks: newUpcomingTasks,
        partnerWorkloads: newPartnerWorkloads
      }));
      sessionStorage.setItem('dashboard_data_time_v2', Date.now().toString());

      // Load recent messages (always fresh, not cached)
      loadRecentMessages();
      loadRecentDescUpdates();
      
    } catch (err) {
      console.error('Dashboard load error:', err);
    }
    setLoading(false);
  }, [loadRecentMessages, loadRecentDescUpdates]);

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
    <div style={{ paddingBottom: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      
      <div style={{ marginBottom: '32px', padding: '32px 36px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #334155 100%)', borderRadius: '24px', color: '#fff', position: 'relative', overflow: 'hidden', boxShadow: '0 8px 32px rgba(15,23,42,0.2)' }}>
        <div style={{ position: 'absolute', top: '-40px', right: '-20px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(59,130,246,0.08)' }} />
        <div style={{ position: 'absolute', bottom: '-60px', right: '100px', width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(139,92,246,0.06)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 4px 0', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{greet}</p>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#fff', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>Dashboard Overview</h1>
          <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>Monitor tasks, clients, and deadlines across your operations.</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="dashboard-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <StatCard icon={<ListTodo size={22} />} label="Total Tasks" value={totalTasks} colorHex="#3b82f6" onClick={() => router.push('/dashboard/tasks')} />
        <StatCard icon={<AlertTriangle size={22} />} label="Overdue" value={overdueTasks} colorHex="#ef4444" onClick={() => router.push('/dashboard/tasks')} />
        {isAdmin(getSession().user) && (
          <>
            <StatCard icon={<UsersIcon size={22} />} label="Partners" value={activePartners} colorHex="#10b981" onClick={() => router.push('/dashboard/staff')} />
            <StatCard icon={<Building2 size={22} />} label="Companies" value={totalCompanies} colorHex="#f59e0b" onClick={() => router.push('/dashboard/companies')} />
            <StatCard icon={<CalendarDays size={22} />} label="Daily Tasks" value={totalDailyTasks} colorHex="#8b5cf6" onClick={() => router.push('/dashboard/daily-tasks')} />
          </>
        )}
      </div>

      <div className="dashboard-panels-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>

        
        {/* Urgent Clients */}
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#fef2f2', color: '#ef4444', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AlertTriangle size={18} /></div>
              <h3 style={{ ...panelTitleStyle, margin: 0 }}>Urgent Clients</h3>
            </div>
            <span style={badgeStyle}>Due ≤ 7 days</span>
          </div>
          <div style={listContainerStyle}>
            {urgentClients.length === 0 ? (
              <EmptyState message="No urgent clients right now" icon="🎉" />
            ) : (
              urgentClients.map(({ company, tasks, overdueCount }) => (
                <div key={company.id} onClick={() => router.push(`/dashboard/tasks?company=${company.id}`)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', border: '1px solid #f1f5f9', borderRadius: '16px', background: '#ffffff', cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', position: 'relative', overflow: 'hidden', flexShrink: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 24px -8px rgba(239, 68, 68, 0.15)'; e.currentTarget.style.borderColor = '#fca5a5'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#f1f5f9'; }}
                >
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: 'linear-gradient(to bottom, #ef4444, #f87171)' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <AlertTriangle size={20} strokeWidth={2.5} />
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '4px', letterSpacing: '-0.01em' }}>{company.company_name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, flexWrap: 'wrap' }}>
                        <span style={{ color: '#ef4444', background: '#fef2f2', padding: '2px 8px', borderRadius: '6px' }}>{tasks.length} task{tasks.length > 1 ? 's' : ''}</span>
                        {overdueCount > 0 && <span style={{ color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#b91c1c' }}/> {overdueCount} overdue</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', transition: 'all 0.2s ease' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                  >
                    <ChevronRight size={18} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tasks by Category */}
        {taskTypeStats.length > 0 && (
          <div style={panelStyle}>
            <div style={panelHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#ecfdf5', color: '#10b981', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ListTodo size={18} /></div>
                <h3 style={{ ...panelTitleStyle, margin: 0 }}>Tasks by Category</h3>
              </div>
            </div>
            <div style={listContainerStyle}>
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

        {/* Partner Workload */}
        {isAdmin(getSession().user) && partnerWorkloads.length > 0 && (
          <div style={panelStyle}>
            <div style={panelHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#f5f3ff', color: '#8b5cf6', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><UsersIcon size={18} /></div>
                <h3 style={{ ...panelTitleStyle, margin: 0 }}>Partner Workload</h3>
              </div>
              <span style={badgeStyle}>{partnerWorkloads.length} active</span>
            </div>
            <div style={listContainerStyle}>
              {partnerWorkloads.map((pw, idx) => {
                const { partner, totalTasks: total, completedTasks, overdueTasks: overdue, inProgressTasks } = pw;
                const pct = total > 0 ? Math.round((completedTasks / total) * 100) : 0;
                const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#14b8a6'];
                const c = colors[idx % colors.length];
                return (
                  <div key={partner.id} style={{ padding: '16px', borderRadius: '14px', background: '#ffffff', border: overdue > 0 ? '1px solid #fecaca' : '1px solid #f1f5f9', transition: 'all 0.2s ease' }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: `linear-gradient(135deg, ${c}, ${c}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 700, color: '#fff' }}>
                          {partner.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{partner.username}</div>
                          <div style={{ fontSize: '12px', color: '#94a3b8' }}>{total} task{total !== 1 ? 's' : ''} assigned</div>
                        </div>
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: c, background: `${c}10`, padding: '4px 12px', borderRadius: '10px' }}>{pct}%</div>
                    </div>
                    <div style={{ background: '#f1f5f9', height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '10px' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${c}, ${c}aa)`, borderRadius: '4px', transition: 'width 1s ease-out' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                      <span style={{ color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />{completedTasks} done</span>
                      <span style={{ color: '#3b82f6', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />{inProgressTasks} active</span>
                      {overdue > 0 && <span style={{ color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />{overdue} overdue</span>}
                    </div>
                  </div>
                );
              })}
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
              <div onClick={() => router.push('/dashboard/daily-tasks')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: '10px', background: '#f5f3ff', color: '#7c3aed', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease', border: '1px solid #ddd6fe40' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#ede9fe'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#f5f3ff'; e.currentTarget.style.transform = 'none'; }}
              >
                View All Daily Tasks <ArrowUpRight size={14} />
              </div>
            </div>
          </div>
        )}

        {/* Tasks by Status */}
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#eff6ff', color: '#3b82f6', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BarChart3 size={18} /></div>
              <h3 style={{ ...panelTitleStyle, margin: 0 }}>Tasks by Status</h3>
            </div>
          </div>
          <div style={{ ...listContainerStyle, gap: '14px' }}>
            {Object.keys(statusCounts).length === 0 ? (
              <EmptyState message="No status data available" />
            ) : (
              Object.entries(statusCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => {
                const pct = totalTasks > 0 ? (count / totalTasks * 100) : 0;
                const barColor = getStatusColor(status);
                return (
                  <div key={status} onClick={() => router.push(`/dashboard/tasks?status=${encodeURIComponent(status)}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', padding: '2px 0' }}
                  >
                    <div style={{ width: '120px', fontSize: '13px', color: '#334155', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{status}</div>
                    <div style={{ flex: 1, background: '#f1f5f9', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${barColor}, ${barColor}bb)`, borderRadius: '5px', transition: 'width 1s ease-out', minWidth: count > 0 ? '4px' : '0px' }} />
                    </div>
                    <div style={{ minWidth: '36px', textAlign: 'center', fontSize: '13px', fontWeight: 700, color: barColor, background: `${barColor}12`, padding: '2px 8px', borderRadius: '6px' }}>{count}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#fffbeb', color: '#f59e0b', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Clock size={18} /></div>
              <h3 style={{ ...panelTitleStyle, margin: 0 }}>Upcoming Deadlines</h3>
            </div>
          </div>
          <div style={listContainerStyle}>
            {upcomingTasks.length === 0 ? (
              <EmptyState message="No upcoming deadlines" icon="✅" />
            ) : (
              upcomingTasks.map(task => (
                <div key={task.id} onClick={() => router.push('/dashboard/tasks')}
                  style={{ padding: '14px 16px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s ease', background: task.daysLeft < 0 ? '#fef2f2' : '#fffbeb', border: `1px solid ${task.daysLeft < 0 ? '#fecaca' : '#fde68a'}`, borderLeft: `4px solid ${task.daysLeft < 0 ? '#ef4444' : '#f59e0b'}` }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(4px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{task.companyName}</div>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: task.daysLeft < 0 ? '#fee2e2' : '#fef3c7', color: task.daysLeft < 0 ? '#dc2626' : '#d97706' }}>
                      {task.daysLeft < 0 ? `${Math.abs(task.daysLeft)}d overdue` : `${task.daysLeft}d left`}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#475569', marginBottom: '6px' }}>{task.title}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> Due: {task.deadline}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Messages */}
        <div style={{ ...panelStyle, gridColumn: '1 / -1' }}>
          <div style={panelHeaderStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: 'linear-gradient(135deg, #ede9fe, #f5f3ff)', color: '#7c3aed', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MessageCircle size={18} /></div>
              <h3 style={{ ...panelTitleStyle, margin: 0 }}>Recent Messages</h3>
            </div>
            <span style={badgeStyle}>{recentMessages.length} latest</span>
          </div>
          {recentMessages.length === 0 ? (
            <EmptyState message="No recent messages" icon="💬" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
              {recentMessages.map((msg, idx) => {
                const timeAgo = getTimeAgo(msg.created_at);
                const isSenderAdmin = msg.sender_role?.toLowerCase() === 'admin';
                const avatarColors = ['#8b5cf6','#3b82f6','#10b981','#f59e0b','#ec4899','#06b6d4','#6366f1','#ef4444'];
                const avatarColor = avatarColors[msg.sender_name.charCodeAt(0) % avatarColors.length];
                const statusColor = getStatusColor(msg.task_status);
                return (
                  <div key={msg.id}
                    onClick={() => router.push(msg.is_daily ? `/dashboard/daily-tasks?openChat=${msg.task_id}` : `/dashboard/tasks?openChat=${msg.task_id}`)}
                    style={{
                      display: 'flex', gap: '14px', padding: '14px 16px', borderRadius: '14px',
                      cursor: 'pointer', transition: 'all 0.2s ease',
                      background: idx < 3 ? '#fefce8' : '#ffffff',
                      border: idx < 3 ? '1px solid #fde68a' : '1px solid #f1f5f9',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.transform = 'translateX(3px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = idx < 3 ? '#fefce8' : '#ffffff'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    {/* Avatar */}
                    <div style={{ width: '38px', height: '38px', borderRadius: '12px', background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '14px', fontWeight: 700, color: '#fff', position: 'relative' }}>
                      {msg.sender_name.charAt(0).toUpperCase()}
                      {idx < 3 && <span style={{ position: 'absolute', top: '-2px', right: '-2px', width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b', border: '2px solid #fff' }} />}
                    </div>
                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{msg.sender_name}</span>
                        {isSenderAdmin && <span style={{ fontSize: '9px', fontWeight: 700, background: '#ede9fe', color: '#7c3aed', padding: '1px 6px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Admin</span>}
                        <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto', fontWeight: 500, whiteSpace: 'nowrap' }}>{timeAgo}</span>
                        {isAdmin(getSession().user) && (
                          <div 
                            onClick={(e) => handleDeleteMessage(e, msg.id)}
                            style={{ marginLeft: '4px', color: '#ef4444', background: '#fef2f2', padding: '4px', borderRadius: '4px', cursor: 'pointer' }}
                            title="Delete Message"
                          >
                            <Trash2 size={12} />
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '6px' }}>
                        {msg.message}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.task_title}</span>
                        {msg.company_name && <span style={{ fontSize: '10px', color: '#64748b' }}>• {msg.company_name}</span>}
                        {msg.task_type_name && <span style={{ fontSize: '10px', color: '#94a3b8' }}>• {msg.task_type_name}</span>}
                        <span style={{ fontSize: '10px', fontWeight: 600, color: statusColor, background: `${statusColor}12`, padding: '1px 6px', borderRadius: '4px', marginLeft: 'auto' }}>{msg.task_status}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Task Description Updates */}
        <div style={{ ...panelStyle, gridColumn: '1 / -1', marginTop: '20px' }}>
          <div style={panelHeaderStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: 'linear-gradient(135deg, #dcfce7, #ecfdf5)', color: '#16a34a', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Edit2 size={18} /></div>
              <h3 style={{ ...panelTitleStyle, margin: 0 }}>Recent Description Updates</h3>
            </div>
            <span style={badgeStyle}>{recentDescUpdates.length} latest</span>
          </div>
          {recentDescUpdates.length === 0 ? (
            <EmptyState message="No recent description updates" icon="📝" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
              {recentDescUpdates.map((update, idx) => {
                const timeAgo = getTimeAgo(update.created_at);
                const avatarColors = ['#8b5cf6','#3b82f6','#10b981','#f59e0b','#ec4899','#06b6d4','#6366f1','#ef4444'];
                const avatarColor = avatarColors[update.updated_by_name.charCodeAt(0) % avatarColors.length];
                const statusColor = getStatusColor(update.task_status);
                return (
                  <div key={update.id}
                    onClick={() => router.push(update.is_daily ? `/dashboard/daily-tasks?openDesc=${update.task_id}` : `/dashboard/tasks?openDesc=${update.task_id}`)}
                    style={{
                      display: 'flex', gap: '14px', padding: '14px 16px', borderRadius: '14px',
                      cursor: 'pointer', transition: 'all 0.2s ease',
                      background: idx < 3 ? '#f0fdf4' : '#ffffff',
                      border: idx < 3 ? '1px solid #bbf7d0' : '1px solid #f1f5f9',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.transform = 'translateX(3px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = idx < 3 ? '#f0fdf4' : '#ffffff'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    {/* Avatar */}
                    <div style={{ width: '38px', height: '38px', borderRadius: '12px', background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '14px', fontWeight: 700, color: '#fff', position: 'relative' }}>
                      {update.updated_by_name.charAt(0).toUpperCase()}
                      {idx < 3 && <span style={{ position: 'absolute', top: '-2px', right: '-2px', width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e', border: '2px solid #fff' }} />}
                    </div>
                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{update.updated_by_name}</span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>updated description</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto', fontWeight: 500, whiteSpace: 'nowrap' }}>{timeAgo}</span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '6px' }}>
                        "{update.description_preview}"
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{update.task_title}</span>
                        {update.company_name && <span style={{ fontSize: '10px', color: '#64748b' }}>• {update.company_name}</span>}
                        {update.task_type_name && <span style={{ fontSize: '10px', color: '#94a3b8' }}>• {update.task_type_name}</span>}
                        {update.assigned_to_name !== 'Unassigned' && <span style={{ fontSize: '10px', color: '#94a3b8' }}>• 👤 {update.assigned_to_name}</span>}
                        <span style={{ fontSize: '10px', fontWeight: 600, color: statusColor, background: `${statusColor}12`, padding: '1px 6px', borderRadius: '4px', marginLeft: 'auto' }}>{update.task_status}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Component & Style Definitions ---

function getStatusColor(status: string) {
  const s = status.toLowerCase();
  if (s.includes('completed') || s.includes('closed') || s.includes('done') || s.includes('filed')) return '#10b981';
  if (s.includes('review') || s.includes('waiting') || s.includes('draft')) return '#8b5cf6';
  if (s.includes('progress') || s.includes('active') || s.includes('started')) return '#3b82f6';
  if (s.includes('urgent') || s.includes('overdue') || s.includes('rework')) return '#ef4444';
  if (s.includes('query') || s.includes('info')) return '#f59e0b';
  return '#64748b';
}

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StatCard({ icon, label, value, colorHex, onClick }: { icon: React.ReactNode; label: string; value: number; colorHex: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{
      background: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '18px', padding: '22px 24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)', cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column', gap: '16px',
      position: 'relative', overflow: 'hidden',
    }}
      onMouseEnter={e => { if (!onClick) return; e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 12px 28px ${colorHex}18, 0 4px 10px rgba(0,0,0,0.04)`; e.currentTarget.style.borderColor = `${colorHex}40`; }}
      onMouseLeave={e => { if (!onClick) return; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = '#f1f5f9'; }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, ${colorHex}, ${colorHex}88)`, borderRadius: '18px 18px 0 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 600, letterSpacing: '0.02em' }}>{label}</div>
        <div style={{ background: `${colorHex}10`, color: colorHex, padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      </div>
      <div style={{ fontSize: '36px', fontWeight: 800, color: '#0f172a', lineHeight: 1, letterSpacing: '-1px' }}>{value}</div>
      {onClick && <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>View details <ArrowUpRight size={12} /></div>}
    </div>
  );
}

function EmptyState({ message, icon }: { message: string; icon?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0' }}>
      {icon && <div style={{ fontSize: '28px', marginBottom: '10px' }}>{icon}</div>}
      <div style={{ fontSize: '14px', fontWeight: 500 }}>{message}</div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '20px', padding: '24px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', height: '100%',
  transition: 'box-shadow 0.2s ease',
};

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px',
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.2px',
};

const badgeStyle: React.CSSProperties = {
  fontSize: '12px', color: '#64748b', background: '#f1f5f9', padding: '4px 12px', borderRadius: '20px', fontWeight: 600,
};

const listContainerStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '380px', overflowY: 'auto', paddingRight: '4px',
};
