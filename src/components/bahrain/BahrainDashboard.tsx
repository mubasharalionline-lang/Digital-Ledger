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
  sender_id: string;
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
  const [urgentTasks, setUrgentTasks] = useState<(Task & { companyName: string; assignedName: string; daysLeft: number })[]>([]);
  const [partnerWorkloads, setPartnerWorkloads] = useState<PartnerWorkload[]>([]);
  const [dailyTaskStats, setDailyTaskStats] = useState<{ total: number; pending: number; completed: number; repeatCount: number; statusBreakdown: Record<string, number> }>({ total: 0, pending: 0, completed: 0, repeatCount: 0, statusBreakdown: {} });
  const [recentMessages, setRecentMessages] = useState<RecentMessage[]>([]);
  const [recentDescUpdates, setRecentDescUpdates] = useState<RecentDescUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [lastReadMap, setLastReadMap] = useState<Record<string, string>>({});


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
    try {
      const raw = localStorage.getItem('task_last_read');
      if (raw) setLastReadMap(JSON.parse(raw));
    } catch {}
  }, []);


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
          sender_id: m.sender_id,
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
          setUrgentTasks(parsed.urgentTasks || []);
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

      const usersList = usersRes.data || [];

      // Urgent tasks
      const newUrgentTasks = taskList
        .filter(t => t.status !== 'Closed' && t.status !== 'Completed' && t.priority === 'Urgent')
        .map(t => {
          const company = companyList.find(c => c.id === t.company_id);
          const daysLeft = Math.ceil((new Date(t.deadline).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const assignedUser = usersList.find(u => u.id === t.assigned_to);
          return {
            ...t,
            companyName: company?.company_name || 'Unknown',
            assignedName: assignedUser?.username || 'Unassigned',
            daysLeft
          };
        })
        .sort((a, b) => {
          const aOverdue = a.daysLeft < 0;
          const bOverdue = b.daysLeft < 0;
          if (aOverdue && !bOverdue) return -1;
          if (!aOverdue && bOverdue) return 1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        });
      setUrgentTasks(newUrgentTasks);

      // Partner workload
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
        urgentTasks: newUrgentTasks,
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
              You have <span style={{ color: overdueTasks > 0 ? '#f87171' : '#34d399', fontWeight: 700 }}>{overdueTasks}</span> overdue task{overdueTasks !== 1 ? 's' : ''} out of <span style={{ color: '#fff', fontWeight: 700 }}>{totalTasks}</span> total task{totalTasks !== 1 ? 's' : ''}.{' '}
              {urgentClients.length > 0 ? (
                <span>
                  There are <span style={{ color: '#fbbf24', fontWeight: 700 }}>{urgentClients.length}</span> urgent client{urgentClients.length !== 1 ? 's' : ''} requiring immediate follow-up.
                </span>
              ) : (
                <span style={{ color: '#94a3b8' }}>All operations are running smoothly with no urgent issues.</span>
              )}
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

        {/* Urgent Clients */}
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#fef2f2', color: '#ef4444', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AlertTriangle size={18} /></div>
              <h3 style={{ ...panelTitleStyle, margin: 0 }}>Urgent Clients</h3>
            </div>
            <span style={badgeStyle}>Due ≤ 7 days</span>
          </div>
          <div className="custom-scrollbar" style={listContainerStyle}>
            {urgentClients.length === 0 ? (
              <EmptyState message="No urgent clients right now" icon="🎉" />
            ) : (
              urgentClients.map(({ company, tasks, overdueCount }) => (
                <div key={company.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '16px',
                    border: '1px solid #f1f5f9',
                    borderRadius: '16px',
                    background: '#ffffff',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    position: 'relative',
                    overflow: 'hidden',
                    flexShrink: 0
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 12px 24px -8px rgba(239, 68, 68, 0.15)';
                    e.currentTarget.style.borderColor = '#fca5a5';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.borderColor = '#f1f5f9';
                  }}
                >
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: 'linear-gradient(to bottom, #ef4444, #f87171)' }} />
                  
                  {/* Company Header Row */}
                  <div 
                    onClick={() => router.push(`/dashboard/tasks?company=${company.id}`)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', width: '100%' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0, flex: 1 }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <AlertTriangle size={20} strokeWidth={2.5} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '4px', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {company.company_name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, flexWrap: 'wrap' }}>
                          <span style={{ color: '#ef4444', background: '#fef2f2', padding: '2px 8px', borderRadius: '6px' }}>
                            {tasks.length} task{tasks.length > 1 ? 's' : ''}
                          </span>
                          {overdueCount > 0 && (
                            <span style={{ color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#b91c1c' }}/>
                              {overdueCount} overdue
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', transition: 'all 0.2s ease', marginLeft: '8px' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                      onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                    >
                      <ChevronRight size={18} />
                    </div>
                  </div>

                  {/* Tasks List with Priority Badges */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                    {tasks.map(task => {
                      const prio = getPriorityInfo(task.priority);
                      return (
                        <div 
                          key={task.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/tasks?openDesc=${task.id}`);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                            padding: '6px 8px',
                            borderRadius: '8px',
                            transition: 'background 0.2s ease',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <span style={{ fontSize: '13px', color: '#475569', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {task.title}
                          </span>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: prio.color,
                            background: prio.bg,
                            border: `1px solid ${prio.border}`,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            whiteSpace: 'nowrap',
                            flexShrink: 0
                          }}>
                            <span style={{ fontSize: '10px' }}>{prio.emoji}</span> {prio.label}
                          </span>
                        </div>
                      );
                    })}
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
            <div className="custom-scrollbar" style={listContainerStyle}>
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

        {/* Urgent Tasks */}
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: '#fef2f2', color: '#ef4444', width: '38px', height: '38px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                <AlertTriangle size={18} />
              </div>
              <h3 style={panelTitleStyle}>Urgent Tasks</h3>
            </div>
            <span style={badgeStyle}>{urgentTasks.length} urgent</span>
          </div>
          
          <div className="custom-scrollbar" style={listContainerStyle}>
            {urgentTasks.length === 0 ? (
              <EmptyState message="No urgent tasks found" icon="📅" />
            ) : (
              urgentTasks.map(task => {
                const isOverdue = task.daysLeft < 0;
                
                return (
                  <div key={task.id} onClick={() => router.push('/dashboard/tasks')}
                    style={{ 
                      padding: '16px 20px', 
                      borderRadius: '18px', 
                      cursor: 'pointer', 
                      transition: 'all 0.2s ease-in-out', 
                      background: isOverdue ? 'linear-gradient(135deg, #fffefe, #fff5f5)' : '#ffffff', 
                      border: `1px solid ${isOverdue ? 'rgba(239, 68, 68, 0.25)' : 'rgba(226, 232, 240, 0.8)'}`, 
                      borderLeft: `4px solid #ef4444`,
                      boxShadow: isOverdue ? '0 4px 12px rgba(239, 68, 68, 0.04)' : '0 2px 8px rgba(0,0,0,0.01)',
                      flexShrink: 0
                    }}
                    onMouseEnter={e => { 
                      e.currentTarget.style.background = isOverdue ? 'linear-gradient(135deg, #fff5f5, #ffebee)' : '#f8fafc';
                      e.currentTarget.style.boxShadow = isOverdue ? '0 6px 16px rgba(239, 68, 68, 0.08)' : '0 4px 12px rgba(0,0,0,0.03)';
                      e.currentTarget.style.borderColor = isOverdue ? '#ef4444' : '#cbd5e1';
                    }}
                    onMouseLeave={e => { 
                      e.currentTarget.style.background = isOverdue ? 'linear-gradient(135deg, #fffefe, #fff5f5)' : '#ffffff';
                      e.currentTarget.style.boxShadow = isOverdue ? '0 4px 12px rgba(239, 68, 68, 0.04)' : '0 2px 8px rgba(0,0,0,0.01)';
                      e.currentTarget.style.borderColor = isOverdue ? 'rgba(239, 68, 68, 0.25)' : 'rgba(226, 232, 240, 0.8)';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: isOverdue ? '#991b1b' : '#1e293b', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {task.title}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>{task.companyName}</span>
                          <span style={{ color: '#cbd5e1', fontSize: '10px' }}>•</span>
                          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>Assigned: <strong style={{ color: '#475569' }}>{task.assignedName}</strong></span>
                        </div>
                      </div>
                      
                      <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 700, color: '#ef4444', background: '#fef2f2', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '2px 6px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            🔴 Urgent
                          </span>
                          <span style={{ fontSize: '10px', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '2px 6px', borderRadius: '6px' }}>
                            {task.status}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {isOverdue ? (
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#b91c1c', background: '#fef2f2', padding: '1px 6px', borderRadius: '4px' }}>Overdue</span>
                          ) : (
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#b45309', background: '#fffbeb', padding: '1px 6px', borderRadius: '4px' }}>{task.daysLeft}d left</span>
                          )}
                          <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500 }}>
                            {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Messages (Activity Feed) */}
        <div style={{ ...panelStyle, gridColumn: '1 / -1' }}>
          <div style={panelHeaderStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: '#e0f2fe', color: '#0284c7', width: '38px', height: '38px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(2, 132, 199, 0.15)' }}>
                <MessageCircle size={18} />
              </div>
              <h3 style={panelTitleStyle}>Recent Message Center</h3>
            </div>
            <span style={badgeStyle}>Global Feed</span>
          </div>
          
          {recentMessages.length === 0 ? (
            <EmptyState message="No messages posted yet" icon="💬" />
          ) : (
            <div className="custom-scrollbar timeline-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '450px', overflowY: 'auto', paddingRight: '4px' }}>
               {recentMessages.map((msg, idx) => {
                 const timeAgo = formatDateTime(msg.created_at);
                 const avatarColors = ['#4f46e5','#06b6d4','#10b981','#3b82f6','#ec4899','#f59e0b','#ef4444','#8b5cf6'];
                 const avatarColor = avatarColors[msg.sender_name.charCodeAt(0) % avatarColors.length];
                 
                 const lastRead = lastReadMap[msg.task_id];
                 const isUnread = msg.sender_id !== currentUser?.id && (!lastRead || new Date(msg.created_at) > new Date(lastRead));
                 
                 return (
                   <div key={msg.id} className="timeline-item"
                     style={{
                       display: 'flex', gap: '16px', alignItems: 'flex-start',
                       position: 'relative'
                     }}
                   >
                     {/* Vertical timeline line segment */}
                     {idx < recentMessages.length - 1 && (
                       <div style={{
                         position: 'absolute',
                         left: '21px', // center of the 42px avatar
                         top: '42px',  // starts from bottom of avatar
                         bottom: '-16px', // extends through the 16px gap to the next item's top
                         width: '2px',
                         background: '#e2e8f0',
                         zIndex: 1
                       }} />
                     )}
 
                     {/* Avatar */}
                     <div style={{ width: '42px', height: '42px', borderRadius: '14px', background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '15px', fontWeight: 800, color: '#fff', position: 'relative', boxShadow: '0 4px 10px rgba(0,0,0,0.08)', zIndex: 2 }}>
                       {msg.sender_name.charAt(0).toUpperCase()}
                       {isUnread && <span style={{ position: 'absolute', top: '-2px', right: '-2px', width: '8px', height: '8px', borderRadius: '50%', background: '#f43f5e', border: '2px solid #fff', zIndex: 3 }} />}
                     </div>
                     
                     {/* Clickable Card on the right */}
                     <div
                       onClick={() => router.push(msg.is_daily ? `/dashboard/daily-tasks?openChat=${msg.task_id}` : `/dashboard/tasks?openChat=${msg.task_id}`)}
                       style={{
                         flex: 1, minWidth: 0, padding: '16px 20px', borderRadius: '18px',
                         cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                         background: isUnread ? '#fafbfe' : '#ffffff',
                         border: isUnread ? '1px solid rgba(59, 130, 246, 0.15)' : '1px solid rgba(226, 232, 240, 0.8)',
                         zIndex: 2,
                       }}
                       onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.transform = 'translateX(4px)'; e.currentTarget.style.boxShadow = '0 8px 24px -10px rgba(0,0,0,0.06)'; }}
                       onMouseLeave={e => { e.currentTarget.style.background = isUnread ? '#fafbfe' : '#ffffff'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                     >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{msg.sender_name}</span>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>posted update</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto', fontWeight: 500, whiteSpace: 'nowrap' }}>{timeAgo}</span>
                      </div>
                      
                      <div style={{ fontSize: '14px', color: '#334155', lineHeight: 1.45, marginBottom: '10px', wordBreak: 'break-word', fontWeight: 500 }}>
                        {msg.message}
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', background: '#f1f5f9', padding: '3px 10px', borderRadius: '8px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {msg.task_title}
                        </span>
                        {msg.company_name && <span style={{ fontSize: '10px', fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #dbeafe', padding: '2px 8px', borderRadius: '6px', whiteSpace: 'nowrap' }}>{msg.company_name}</span>}
                        {msg.task_type_name && <span style={{ fontSize: '10px', fontWeight: 600, color: '#ea580c', background: '#fff7ed', border: '1px solid #ffedd5', padding: '2px 8px', borderRadius: '6px', whiteSpace: 'nowrap' }}>{msg.task_type_name}</span>}
                        {msg.is_daily && <span style={{ fontSize: '10px', fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ede9fe', padding: '2px 8px', borderRadius: '6px' }}>Daily</span>}
                        
                        {/* Delete Button for Admin */}
                        {isAdmin(getSession().user) && (
                          <button onClick={e => handleDeleteMessage(e, msg.id)}
                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', marginLeft: 'auto', padding: '4px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease' }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = '#fef2f2'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'none'; }}
                            title="Delete message"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Description Updates (Activity Feed) */}
        <div style={{ ...panelStyle, gridColumn: '1 / -1' }}>
          <div style={panelHeaderStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: '#f0fdf4', color: '#16a34a', width: '38px', height: '38px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(22, 163, 74, 0.15)' }}>
                <Edit2 size={16} />
              </div>
              <h3 style={panelTitleStyle}>Recent Log Activity</h3>
            </div>
            <span style={badgeStyle}>System Logs</span>
          </div>
          
          {recentDescUpdates.length === 0 ? (
            <EmptyState message="No description updates found" icon="📝" />
          ) : (
            <div className="custom-scrollbar timeline-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '450px', overflowY: 'auto', paddingRight: '4px' }}>
              {recentDescUpdates.map((update, idx) => {
                const timeAgo = formatDateTime(update.created_at);
                const avatarColors = ['#8b5cf6','#3b82f6','#10b981','#f59e0b','#ec4899','#06b6d4','#6366f1','#ef4444'];
                const avatarColor = avatarColors[update.updated_by_name.charCodeAt(0) % avatarColors.length];
                const statusColor = getStatusColor(update.task_status);
                
                return (
                  <div key={update.id} className="timeline-item"
                    style={{
                      display: 'flex', gap: '16px', alignItems: 'flex-start',
                      position: 'relative'
                    }}
                  >
                    {/* Vertical timeline line segment */}
                    {idx < recentDescUpdates.length - 1 && (
                      <div style={{
                        position: 'absolute',
                        left: '21px', // center of the 42px avatar
                        top: '42px',  // starts from bottom of avatar
                        bottom: '-16px', // extends through the 16px gap to the next item's top
                        width: '2px',
                        background: '#e2e8f0',
                        zIndex: 1
                      }} />
                    )}

                    {/* Avatar */}
                    <div style={{ width: '42px', height: '42px', borderRadius: '14px', background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '15px', fontWeight: 800, color: '#fff', position: 'relative', boxShadow: '0 4px 10px rgba(0,0,0,0.08)', zIndex: 2 }}>
                      {update.updated_by_name.charAt(0).toUpperCase()}
                      {idx < 3 && <span style={{ position: 'absolute', top: '-2px', right: '-2px', width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', border: '2px solid #fff', zIndex: 3 }} />}
                    </div>
                    
                    {/* Clickable Card on the right */}
                    <div
                      onClick={() => router.push(update.is_daily ? `/dashboard/daily-tasks?openDesc=${update.task_id}` : `/dashboard/tasks?openDesc=${update.task_id}`)}
                      style={{
                        flex: 1, minWidth: 0, padding: '16px 20px', borderRadius: '18px',
                        cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                        background: idx < 3 ? '#fcfdfd' : '#ffffff',
                        border: idx < 3 ? '1px solid rgba(16, 185, 129, 0.15)' : '1px solid rgba(226, 232, 240, 0.8)',
                        zIndex: 2,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.transform = 'translateX(4px)'; e.currentTarget.style.boxShadow = '0 8px 24px -10px rgba(0,0,0,0.06)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = idx < 3 ? '#fcfdfd' : '#ffffff'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{update.updated_by_name}</span>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>updated description</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto', fontWeight: 500, whiteSpace: 'nowrap' }}>{timeAgo}</span>
                      </div>
                      
                      {/* blockquote layout */}
                      <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', borderLeft: '3px solid #10b981', margin: '8px 0', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        "{update.description_preview}"
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', background: '#f1f5f9', padding: '3px 10px', borderRadius: '8px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {update.task_title}
                        </span>
                        {update.company_name && <span style={{ fontSize: '10px', fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #dbeafe', padding: '2px 8px', borderRadius: '6px', whiteSpace: 'nowrap' }}>{update.company_name}</span>}
                        {update.task_type_name && <span style={{ fontSize: '10px', fontWeight: 600, color: '#ea580c', background: '#fff7ed', border: '1px solid #ffedd5', padding: '2px 8px', borderRadius: '6px', whiteSpace: 'nowrap' }}>{update.task_type_name}</span>}
                        {update.assigned_to_name !== 'Unassigned' && <span style={{ fontSize: '10px', fontWeight: 600, color: '#9333ea', background: '#faf5ff', border: '1px solid #f3e8ff', padding: '2px 8px', borderRadius: '6px', whiteSpace: 'nowrap' }}>👤 {update.assigned_to_name}</span>}
                        <span style={{ fontSize: '10px', fontWeight: 700, color: statusColor, background: `${statusColor}12`, padding: '2px 8px', borderRadius: '6px', marginLeft: 'auto', textTransform: 'capitalize' }}>
                          {update.task_status}
                        </span>
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

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
