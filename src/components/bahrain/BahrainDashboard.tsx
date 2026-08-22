'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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
  CheckCircle2,
  BarChart3,
  Sparkles,
  Layers,
  Clock,
  Activity,
  History,
  User as UserIcon,
  ArrowRight,
  FileText,
  Tag
} from 'lucide-react';

interface TaskTypeStats {
  taskType: TaskType;
  count: number;
  companies: Set<string>;
}

interface RecentTaskItem {
  id: string;
  taskId: string;
  title: string;
  companyName: string;
  companyId: string;
  taskTypeName: string;
  assignedTo: string;
  status: string;
  description: string;
  updatedBy: string;
  timestamp: string;
}

export default function BahrainDashboard() {
  const [totalTasks, setTotalTasks] = useState(0);
  const [totalDailyTasks, setTotalDailyTasks] = useState(0);
  const [overdueTasks, setOverdueTasks] = useState(0);
  const [activePartners, setActivePartners] = useState(0);
  const [totalCompanies, setTotalCompanies] = useState(0);
  const [taskTypeStats, setTaskTypeStats] = useState<TaskTypeStats[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [recentModifications, setRecentModifications] = useState<RecentTaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const dataCountry = getDataCountry();

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
    const cacheKey = 'dashboard_data_cache_v4';
    const cacheTimeKey = 'dashboard_data_time_v4';
    const cachedData = sessionStorage.getItem(cacheKey);
    const cacheTime = sessionStorage.getItem(cacheTimeKey);
    
    if (cachedData && cacheTime) {
      try {
        const parsed = JSON.parse(cachedData);
        setTotalTasks(parsed.totalTasks);
        setTotalDailyTasks(parsed.totalDailyTasks || 0);
        setTotalCompanies(parsed.totalCompanies);
        setActivePartners(parsed.activePartners);
        setOverdueTasks(parsed.overdueTasks);
        setTaskTypeStats(parsed.taskTypeStats);
        setStatusCounts(parsed.statusCounts);
        setRecentModifications(parsed.recentModifications || []);
        setLoading(false);
        // If cache is fresh (< 60s), skip network entirely
        if (Date.now() - parseInt(cacheTime) < 60 * 1000) {
          return;
        }
      } catch (e) {}
    }

    try {
      const country = getDataCountry();
      const taskCountry = country || 'Bahrain';
      const { user: u } = getSession();
      const isAdminUser = isAdmin(u);

      // Fire ALL independent queries in parallel — ZERO waterfalls
      const [companiesRes, usersRes, taskTypesRes, tasksRes, dailyTasksRes, recentLogsRes] = await Promise.all([
        supabase.from('companies').select('id, company_name, notes, country, created_at').eq('country', taskCountry),
        supabase.from('users').select('id, username, role, country, created_at'),
        supabase.from('task_types').select('id, name, category, jurisdiction, active, country, created_at').eq('country', taskCountry),
        supabase.from('tasks').select('id, title, company_id, assigned_to, assigned_partners, status, priority, deadline, task_type_id, task_type_ids, auditor_id, description, is_daily, country, created_at').eq('country', taskCountry).neq('is_daily', true),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('is_daily', true).eq('country', taskCountry),
        supabase.from('status_log').select('id, task_id, status, updated_by, remarks, created_at').order('created_at', { ascending: false }).limit(50)
      ]);

      const companyList = companiesRes.data || [];
      const usersList = usersRes.data || [];
      const taskTypesList = taskTypesRes.data || [];
      let allTasks = tasksRes.data || [];
      const dailyCount = dailyTasksRes.count || 0;
      const generalLogs = recentLogsRes.data || [];

      const countryUsers = country ? usersList.filter(usr => !usr.country || usr.country === country) : usersList;
      setActivePartners(countryUsers.filter(usr => usr.role !== 'admin').length);

      // Permission filtering for non-admin users
      const userAuditorAccess: string[] = u?.permissions?.auditor_access || [];
      if (!isAdminUser && u) {
        const isTaskAllowed = (t: Task) => {
          const activePartnerIds = t.assigned_partners && t.assigned_partners.length > 0
            ? t.assigned_partners
            : (t.assigned_to ? [t.assigned_to] : []);
          const isAssigned = activePartnerIds.includes(u.id);
          const hasAuditorAccess = t.auditor_id ? userAuditorAccess.includes(t.auditor_id) : false;
          if (userAuditorAccess.length > 0) {
            return hasAuditorAccess;
          }
          return isAssigned && !t.auditor_id;
        };
        allTasks = allTasks.filter(isTaskAllowed);
      }
      const taskList = allTasks;

      let allowedCompanyList = companyList;
      if (!isAdminUser && u) {
        allowedCompanyList = companyList.filter(c => 
          taskList.some(t => t.company_id === c.id)
        );
      }
      const newTotalCompanies = allowedCompanyList.length;
      setTotalCompanies(newTotalCompanies);
      
      const newTotalTasks = taskList.length;
      setTotalTasks(newTotalTasks);

      // Daily tasks count
      setTotalDailyTasks(dailyCount);

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
        if (task.task_type_id && taskTypesList.length > 0) {
          const typeIds: string[] = task.task_type_id.split(',').map((s: string) => s.trim()).filter(Boolean);
          typeIds.forEach((ttId: string) => {
            const tt = taskTypesList.find(t => t.id === ttId);
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

      // ── Process Recently Modified Description Updates ──
      const genLogMap = new Map<string, any>();
      generalLogs.forEach((log: any) => {
        if (!genLogMap.has(log.task_id)) {
          genLogMap.set(log.task_id, log);
        }
      });

      const processedRecentList: RecentTaskItem[] = [];
      const seenTasks = new Set<string>();

      // 1. Process tasks present in recent logs
      generalLogs.forEach((log: any) => {
        const matchingTask = taskList.find(t => t.id === log.task_id);
        if (matchingTask && !seenTasks.has(matchingTask.id)) {
          seenTasks.add(matchingTask.id);
          const comp = companyList.find(c => c.id === matchingTask.company_id);
          
          // Task Type resolution
          const typeIds: string[] = (matchingTask.task_type_ids && matchingTask.task_type_ids.length > 0)
            ? matchingTask.task_type_ids
            : (matchingTask.task_type_id ? matchingTask.task_type_id.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
          const ttNames = typeIds
            .map((id: string) => taskTypesList.find(tt => tt.id === id)?.name)
            .filter(Boolean)
            .join(', ') || 'General';

          // Assigned To resolution
          const partnerIds = (matchingTask.assigned_partners && matchingTask.assigned_partners.length > 0)
            ? matchingTask.assigned_partners
            : (matchingTask.assigned_to ? [matchingTask.assigned_to] : []);
          const assignedNames = partnerIds
            .map((id: string) => usersList.find(usr => usr.id === id)?.username)
            .filter(Boolean)
            .join(', ') || 'Unassigned';

          const userObj = usersList.find(usr => usr.id === log.updated_by || usr.username === log.updated_by);
          const cleanUpdater = resolveCleanUpdater(userObj?.username || log.updated_by, assignedNames);
          
          processedRecentList.push({
            id: log.id,
            taskId: matchingTask.id,
            title: matchingTask.title,
            companyName: comp?.company_name || 'No Company',
            companyId: matchingTask.company_id,
            taskTypeName: ttNames,
            assignedTo: assignedNames,
            status: matchingTask.status || 'Active',
            description: matchingTask.description || '',
            updatedBy: cleanUpdater,
            timestamp: log.created_at,
          });
        }
      });

      // 2. Include other tasks with descriptions
      taskList.forEach(task => {
        if (!seenTasks.has(task.id) && task.description && task.description.trim().length > 0) {
          seenTasks.add(task.id);
          const comp = companyList.find(c => c.id === task.company_id);
          const genLog = genLogMap.get(task.id);
          
          const typeIds: string[] = (task.task_type_ids && task.task_type_ids.length > 0)
            ? task.task_type_ids
            : (task.task_type_id ? task.task_type_id.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
          const ttNames = typeIds
            .map((id: string) => taskTypesList.find(tt => tt.id === id)?.name)
            .filter(Boolean)
            .join(', ') || 'General';

          const partnerIds = (task.assigned_partners && task.assigned_partners.length > 0)
            ? task.assigned_partners
            : (task.assigned_to ? [task.assigned_to] : []);
          const assignedNames = partnerIds
            .map((id: string) => usersList.find(usr => usr.id === id)?.username)
            .filter(Boolean)
            .join(', ') || 'Unassigned';

          const userObj = genLog ? usersList.find(usr => usr.id === genLog.updated_by || usr.username === genLog.updated_by) : null;
          const cleanUpdater = resolveCleanUpdater(userObj?.username || genLog?.updated_by, assignedNames);

          processedRecentList.push({
            id: genLog?.id || task.id,
            taskId: task.id,
            title: task.title,
            companyName: comp?.company_name || 'No Company',
            companyId: task.company_id,
            taskTypeName: ttNames,
            assignedTo: assignedNames,
            status: task.status || 'Active',
            description: task.description,
            updatedBy: cleanUpdater,
            timestamp: genLog?.created_at || task.created_at,
          });
        }
      });

      // Sort by timestamp descending
      processedRecentList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setRecentModifications(processedRecentList.slice(0, 20));

      // Save cache
      const serializableTaskTypeStats = newTaskTypeStats.map(s => ({ ...s, companies: Array.from(s.companies) }));
      sessionStorage.setItem(cacheKey, JSON.stringify({
        totalTasks: newTotalTasks,
        totalDailyTasks: dailyCount,
        totalCompanies: newTotalCompanies,
        activePartners: usersList.filter(usr => usr.role !== 'admin').length,
        overdueTasks: newOverdueTasks,
        taskTypeStats: serializableTaskTypeStats,
        statusCounts: newStatusCounts,
        recentModifications: processedRecentList.slice(0, 20),
      }));
      sessionStorage.setItem(cacheTimeKey, Date.now().toString());

    } catch (err) {
      console.error('Dashboard load error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const greet = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px 0', width: '100%' }}>
        <div style={{ height: '140px', borderRadius: '24px', background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ height: '130px', borderRadius: '18px', background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn" style={{ paddingBottom: '40px', width: '100%' }}>
      {/* ─── Hero Operations Console Header ─── */}
      <div style={{
        marginBottom: '28px',
        padding: '32px 36px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)',
        borderRadius: '24px',
        color: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 12px 36px rgba(15,23,42,0.18)',
        border: '1px solid rgba(255,255,255,0.08)'
      }}>
        {/* Subtle Ambient Light Orbs */}
        <div style={{ position: 'absolute', top: '-60px', right: '-40px', width: '260px', height: '260px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0) 70%)', filter: 'blur(30px)' }} />
        <div style={{ position: 'absolute', bottom: '-80px', right: '120px', width: '220px', height: '220px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, rgba(139,92,246,0) 70%)', filter: 'blur(30px)' }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '11.5px', color: '#38bdf8', fontWeight: 750, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {greet}, {currentUser?.username || 'Partner'}
                </span>
                <span style={{
                  fontSize: '10px', fontWeight: 700, color: '#34d399',
                  background: 'rgba(52, 211, 153, 0.12)', border: '1px solid rgba(52, 211, 153, 0.3)',
                  padding: '1px 7px', borderRadius: '10px', textTransform: 'uppercase', letterSpacing: '0.03em'
                }}>
                  ● Live System
                </span>
              </div>
              <h1 style={{ fontSize: '30px', fontWeight: 850, color: '#ffffff', margin: 0, letterSpacing: '-0.03em', lineHeight: 1.15 }}>
                Operations Dashboard
              </h1>
            </div>

            {/* Date & Country Chip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {dataCountry && (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '12px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  color: '#e2e8f0',
                  fontWeight: 650,
                  backdropFilter: 'blur(8px)'
                }}>
                  📍 {dataCountry}
                </div>
              )}
              {formattedDate && (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '12px',
                  padding: '6px 14px',
                  fontSize: '12.5px',
                  color: '#cbd5e1',
                  fontWeight: 600,
                  backdropFilter: 'blur(8px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <CalendarDays size={14} color="#38bdf8" />
                  {formattedDate}
                </div>
              )}
            </div>
          </div>

          {/* Quick Metrics & Actions Bar inside Hero */}
          <div style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            paddingTop: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px'
          }}>
            <p style={{ fontSize: '14.5px', color: '#cbd5e1', margin: 0, fontWeight: 500 }}>
              You have <span style={{ color: overdueTasks > 0 ? '#f87171' : '#34d399', fontWeight: 750 }}>{overdueTasks} overdue</span> task{overdueTasks !== 1 ? 's' : ''} across <span style={{ color: '#ffffff', fontWeight: 750 }}>{totalTasks} total</span> active tasks.
            </p>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => router.push('/dashboard/tasks')}
                style={{
                  padding: '7px 14px', borderRadius: '10px', border: 'none',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#ffffff', fontSize: '12.5px', fontWeight: 650, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  boxShadow: '0 2px 8px rgba(37,99,235,0.3)', transition: 'all 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
              >
                <ListTodo size={14} /> Task Management
              </button>

              <button
                onClick={() => router.push('/dashboard/daily-tasks')}
                style={{
                  padding: '7px 14px', borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#ffffff', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '5px', backdropFilter: 'blur(8px)',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              >
                <CalendarDays size={14} color="#a78bfa" /> Daily Routine
              </button>

              <button
                onClick={() => router.push('/dashboard/reports')}
                style={{
                  padding: '7px 14px', borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#ffffff', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '5px', backdropFilter: 'blur(8px)',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              >
                <BarChart3 size={14} color="#34d399" /> Reports
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Executive KPI Stat Cards ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '16px',
        marginBottom: '28px',
      }}>
        {/* Card 1: Total Tasks */}
        <StatCard
          icon={<ListTodo size={20} />}
          label="Total Tasks"
          value={totalTasks}
          colorHex="#3b82f6"
          subtitle="All active workflows"
          onClick={() => router.push('/dashboard/tasks')}
        />

        {/* Card 2: Overdue Tasks */}
        <StatCard
          icon={<AlertTriangle size={20} />}
          label="Overdue"
          value={overdueTasks}
          colorHex="#ef4444"
          subtitle={overdueTasks > 0 ? 'Requires immediate review' : 'All milestones on track'}
          showWarningPulse={overdueTasks > 0}
          onClick={() => router.push('/dashboard/tasks')}
        />

        {/* Card 3: Daily Tasks */}
        <StatCard
          icon={<CalendarDays size={20} />}
          label="Daily Tasks"
          value={totalDailyTasks}
          colorHex="#8b5cf6"
          subtitle="Recurring daily routines"
          onClick={() => router.push('/dashboard/daily-tasks')}
        />

        {/* Card 4: Partners (Admin only) */}
        {isAdmin(getSession().user) && (
          <StatCard
            icon={<UsersIcon size={20} />}
            label="Active Partners"
            value={activePartners}
            colorHex="#10b981"
            subtitle="Configured staff members"
            onClick={() => router.push('/dashboard/staff')}
          />
        )}

        {/* Card 5: Companies */}
        {isAdmin(getSession().user) && (
          <StatCard
            icon={<Building2 size={20} />}
            label="Client Companies"
            value={totalCompanies}
            colorHex="#f59e0b"
            subtitle="Registered company profiles"
            onClick={() => router.push('/dashboard/companies')}
          />
        )}
      </div>

      {/* ─── Main Operations Panels Grid ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '20px',
      }}>
        {/* Panel 1: Tasks by Category / Type */}
        {taskTypeStats.length > 0 && (
          <div style={panelCardStyle}>
            <div style={panelHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                  color: '#2563eb', width: '38px', height: '38px', borderRadius: '12px',
                  border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Layers size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 750, color: 'var(--text-primary)', margin: 0 }}>
                    Tasks by Category
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, marginTop: '1px' }}>
                    Distribution across workflow types
                  </p>
                </div>
              </div>
              <span style={badgeStyle}>{taskTypeStats.length} types</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
              {taskTypeStats.map(({ taskType, count, companies }, idx) => {
                const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];
                const c = colors[idx % colors.length];
                return (
                  <div
                    key={taskType.id}
                    onClick={() => router.push(`/dashboard/tasks?search=${encodeURIComponent(taskType.name)}`)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      cursor: 'pointer',
                      background: 'var(--bg-secondary)',
                      borderRadius: '14px',
                      border: '1px solid var(--border)',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = `0 8px 18px -4px ${c}25`;
                      e.currentTarget.style.borderColor = c;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.borderColor = 'var(--border)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '36px', height: '36px', borderRadius: '10px',
                        background: `linear-gradient(135deg, ${c}15, ${c}05)`,
                        border: `1px solid ${c}25`, color: c,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '14px', fontWeight: 800, flexShrink: 0
                      }}>
                        {idx + 1}
                      </div>
                      <div>
                        <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {taskType.name}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{companies.size} {companies.size === 1 ? 'company' : 'companies'}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '16px', fontWeight: 800, color: c, lineHeight: 1 }}>{count}</span>
                        <div style={{ fontSize: '10px', fontWeight: 650, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tasks</div>
                      </div>
                      <ChevronRight size={16} color="var(--text-tertiary)" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Panel 2: Tasks by Status Pipeline */}
        <div style={panelCardStyle}>
          <div style={panelHeaderStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                color: '#d97706', width: '38px', height: '38px', borderRadius: '12px',
                border: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <CheckCircle2 size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 750, color: 'var(--text-primary)', margin: 0 }}>
                  Tasks by Status
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, marginTop: '1px' }}>
                  Active workflow lifecycle stages
                </p>
              </div>
            </div>
            <span style={badgeStyle}>{Object.keys(statusCounts).length} stages</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
            {Object.keys(statusCounts).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', borderRadius: '14px', border: '1px dashed var(--border)' }}>
                <Activity size={32} color="var(--text-tertiary)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                <div style={{ fontSize: '13.5px', fontWeight: 650 }}>No tasks found to categorize</div>
              </div>
            ) : (
              Object.entries(statusCounts).map(([status, count]) => {
                const color = getStatusColor(status);
                const pct = totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0;
                return (
                  <div
                    key={status}
                    onClick={() => router.push(`/dashboard/tasks?status=${encodeURIComponent(status)}`)}
                    style={{
                      padding: '14px 16px',
                      background: 'var(--bg-secondary)',
                      borderRadius: '14px',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = `0 8px 18px -4px ${color}20`;
                      e.currentTarget.style.borderColor = color;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.borderColor = 'var(--border)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                          {status}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 750, color, background: `${color}12`, padding: '2px 8px', borderRadius: '6px', border: `1px solid ${color}30` }}>
                          {count}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>({pct}%)</span>
                      </div>
                    </div>
                    {/* Status Progress Meter */}
                    <div style={{ background: 'var(--bg-tertiary)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.8s ease-out' }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Panel 3: Recently Modified Description Updates */}
        <div style={panelCardStyle}>
          <div style={panelHeaderStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
                color: '#8b5cf6', width: '38px', height: '38px', borderRadius: '12px',
                border: '1px solid #ddd6fe', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <FileText size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 750, color: 'var(--text-primary)', margin: 0 }}>
                  Recently Modified
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, marginTop: '1px' }}>
                  Latest description updates & assignments
                </p>
              </div>
            </div>
            <span style={badgeStyle}>{recentModifications.length} recent</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
            {recentModifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', borderRadius: '14px', border: '1px dashed var(--border)' }}>
                <Clock size={32} color="var(--text-tertiary)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                <div style={{ fontSize: '13.5px', fontWeight: 650 }}>No description updates found</div>
                <p style={{ fontSize: '12px', margin: '4px 0 0' }}>Activity will appear here when task descriptions are updated.</p>
              </div>
            ) : (
              recentModifications.map(item => {
                const statusCol = getStatusColor(item.status);
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (item.companyId) router.push(`/dashboard/companies/${item.companyId}`);
                    }}
                    style={{
                      padding: '12px 14px',
                      background: 'var(--bg-secondary)',
                      borderRadius: '14px',
                      border: '1px solid var(--border)',
                      cursor: item.companyId ? 'pointer' : 'default',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.04)';
                      e.currentTarget.style.borderColor = '#3b82f6';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.borderColor = 'var(--border)';
                    }}
                  >
                    {/* Header Row: Task Title + Status Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusCol, flexShrink: 0 }} />
                        <span style={{ fontSize: '13.5px', fontWeight: 750, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.title}
                        </span>
                      </div>
                      <span style={{
                        fontSize: '10.5px', fontWeight: 650, padding: '2px 7px', borderRadius: '5px',
                        background: `${statusCol}12`, color: statusCol, border: `1px solid ${statusCol}30`,
                        flexShrink: 0
                      }}>
                        {item.status}
                      </span>
                    </div>

                    {/* Metadata Chips: Company Name, Task Type, Assigned To */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '11px' }}>
                      {/* Company Name */}
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '2px 7px', borderRadius: '5px',
                        background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                        fontWeight: 600, border: '1px solid var(--border-light)'
                      }}>
                        <Building2 size={11} color="var(--accent)" />
                        {item.companyName}
                      </span>

                      {/* Task Type */}
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '2px 7px', borderRadius: '5px',
                        background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6',
                        fontWeight: 650, border: '1px solid rgba(139, 92, 246, 0.2)'
                      }}>
                        <Layers size={11} />
                        {item.taskTypeName}
                      </span>

                      {/* Assigned To */}
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '2px 7px', borderRadius: '5px',
                        background: 'rgba(16, 185, 129, 0.1)', color: '#10b981',
                        fontWeight: 650, border: '1px solid rgba(16, 185, 129, 0.2)'
                      }}>
                        <UserIcon size={11} />
                        {item.assignedTo}
                      </span>
                    </div>

                    {/* Description Box (Full text displayed) */}
                    {item.description && item.description.trim().length > 0 && (
                      <div style={{
                        background: 'var(--bg-tertiary)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        borderLeft: '3px solid var(--accent)',
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}>
                        &ldquo;{item.description}&rdquo;
                      </div>
                    )}

                    {/* Footer Row: Timestamp only */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                        <Clock size={11} /> {formatRelativeTime(item.timestamp)}
                      </span>
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

// ─── Clean Updater Formatter ───
function isUuid(val: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

function resolveCleanUpdater(val: string | undefined, assignedFallback?: string) {
  if (!val) {
    if (assignedFallback && assignedFallback !== 'Unassigned') {
      return assignedFallback.split(',')[0].trim();
    }
    return 'Partner';
  }
  if (isUuid(val) || val.length > 25) {
    if (assignedFallback && assignedFallback !== 'Unassigned') {
      return assignedFallback.split(',')[0].trim();
    }
    return 'Partner';
  }
  return val;
}

// ─── Relative Time Formatter ───
function formatRelativeTime(dateStr: string) {
  if (!dateStr) return '';
  const now = Date.now();
  const time = new Date(dateStr).getTime();
  if (isNaN(time)) return '';
  const diffSec = Math.floor((now - time) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

// ─── Component Helpers ───

function getStatusColor(status: string) {
  const s = status.trim().toLowerCase();

  // 1. Success / Completed / Done / Submitted
  if (s === 'completed' || s === 'done' || s.includes('submitted')) return '#059669';
  if (s === 'closed') return '#047857';
  if (s === 'filed' || s.includes('file')) return '#0891b2';
  if (s.includes('received')) return '#16a34a';

  // 2. Query / Info / Verification
  if (s.includes('query') || s.includes('info') || s.includes('question') || s.includes('letter')) return '#d97706';

  // 3. Review / Auditor / Approval
  if (s.includes('review') || s.includes('auditor') || s.includes('approval')) return '#7c3aed';

  // 4. Financials / Billing / Accounting
  if (s.includes('payment') || s.includes('financial') || s.includes('billing') || s.includes('invoice')) return '#4f46e5';

  // 5. Active / In Progress
  if (s === 'in progress' || s.includes('progress')) return '#2563eb';
  if (s === 'active' || s === 'started') return '#1d4ed8';

  // 6. Danger / Alerts / Overdue
  if (s === 'overdue' || s === 'urgent' || s === 'high') return '#dc2626';
  if (s === 'blocked' || s === 'rework') return '#e11d48';

  // 7. Pending / Waiting
  if (s === 'pending' || s.includes('waiting') || s.includes('awaited')) return '#ea580c';

  return '#64748b';
}

function StatCard({ 
  icon, 
  label, 
  value, 
  colorHex, 
  onClick, 
  showWarningPulse,
  subtitle 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: number; 
  colorHex: string; 
  onClick?: () => void; 
  showWarningPulse?: boolean;
  subtitle?: string;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-secondary)', 
        border: '1px solid var(--border)', 
        borderRadius: '18px', 
        padding: '20px 22px',
        boxShadow: 'var(--card-shadow)', 
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.25s ease', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '12px',
        position: 'relative', 
        overflow: 'hidden',
      }}
      onMouseEnter={e => { 
        if (!onClick) return; 
        e.currentTarget.style.transform = 'translateY(-3px)'; 
        e.currentTarget.style.boxShadow = `0 12px 24px -6px ${colorHex}22`; 
        e.currentTarget.style.borderColor = colorHex; 
      }}
      onMouseLeave={e => { 
        if (!onClick) return; 
        e.currentTarget.style.transform = 'none'; 
        e.currentTarget.style.boxShadow = 'var(--card-shadow)'; 
        e.currentTarget.style.borderColor = 'var(--border)'; 
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3.5px', background: colorHex, borderRadius: '18px 18px 0 0' }} />
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{
            background: `${colorHex}15`, color: colorHex, padding: '8px', borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${colorHex}25`
          }}>
            {icon}
          </div>
          {showWarningPulse && (
            <span style={{
              position: 'absolute', top: '-2px', right: '-2px', width: '8px', height: '8px',
              borderRadius: '50%', background: '#ef4444', border: '2px solid var(--bg-secondary)'
            }} />
          )}
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ fontSize: '32px', fontWeight: 850, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.03em' }}>
          {value}
        </div>
      </div>
      
      {subtitle && (
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginTop: '-4px' }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

const panelCardStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)', 
  border: '1px solid var(--border)', 
  borderRadius: '20px', 
  padding: '24px',
  boxShadow: 'var(--card-shadow)', 
  display: 'flex', 
  flexDirection: 'column', 
  height: '100%',
};

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px',
};

const badgeStyle: React.CSSProperties = {
  fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '3px 10px', borderRadius: '12px', fontWeight: 700,
};
