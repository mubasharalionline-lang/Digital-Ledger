'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { Task, Company, User, TaskType } from '@/lib/supabase';
import { getDataCountry, getSession, isAdmin } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/dateUtils';
import {
  Users as UsersIcon,
  Building2,
  ListTodo,
  ChevronRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Sparkles,
  Layers,
  Clock,
  Activity,
  History,
  User as UserIcon,
  ArrowRight,
  FileText,
  Tag,
  BarChart3,
  TrendingUp,
  ShieldCheck,
  Compass
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

function isTaskCompleted(status?: string | null): boolean {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  return (
    s === 'completed' ||
    s === 'complete' ||
    s === 'closed' ||
    s === 'filed' ||
    s === 'done' ||
    s.includes('complete') ||
    s.includes('closed') ||
    s.includes('filed') ||
    s.includes('done')
  );
}

export default function BahrainDashboard() {
  const [totalTasks, setTotalTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [inProgressTasks, setInProgressTasks] = useState(0);
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
    const today = new Date();
    const weekday = today.toLocaleDateString('en-GB', { weekday: 'long' });
    setFormattedDate(`${weekday}, ${formatDate(today)}`);
  }, []);

  useEffect(() => {
    const { user } = getSession();
    setCurrentUser(user);
  }, []);

  const loadDashboard = useCallback(async () => {
    const cacheKey = 'dashboard_data_cache_v5';
    const cacheTimeKey = 'dashboard_data_time_v5';
    const cachedData = sessionStorage.getItem(cacheKey);
    const cacheTime = sessionStorage.getItem(cacheTimeKey);
    
    if (cachedData && cacheTime) {
      try {
        const parsed = JSON.parse(cachedData);
        setTotalTasks(parsed.totalTasks || 0);
        setCompletedTasks(parsed.completedTasks || 0);
        setInProgressTasks(parsed.inProgressTasks || 0);
        setTotalCompanies(parsed.totalCompanies || 0);
        setActivePartners(parsed.activePartners || 0);
        setTaskTypeStats(parsed.taskTypeStats || []);
        setStatusCounts(parsed.statusCounts || {});
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

      // Fire ALL independent queries in parallel — zero waterfalls
      const [companiesRes, usersRes, taskTypesRes, tasksRes, recentLogsRes] = await Promise.all([
        supabase.from('companies').select('id, company_name, notes, country, created_at').eq('country', taskCountry),
        supabase.from('users').select('id, username, role, country, created_at'),
        supabase.from('task_types').select('id, name, category, jurisdiction, active, country, created_at').eq('country', taskCountry),
        supabase.from('tasks').select('id, title, company_id, assigned_to, assigned_partners, status, priority, deadline, task_type_id, task_type_ids, auditor_id, description, is_daily, country, created_at').eq('country', taskCountry).neq('is_daily', true),
        supabase.from('status_log').select('id, task_id, status, updated_by, remarks, created_at').order('created_at', { ascending: false }).limit(50)
      ]);

      const companyList = companiesRes.data || [];
      const usersList = usersRes.data || [];
      const taskTypesList = taskTypesRes.data || [];
      let allTasks = tasksRes.data || [];
      const generalLogs = recentLogsRes.data || [];

      const countryUsers = country ? usersList.filter(usr => !usr.country || usr.country === country) : usersList;
      setActivePartners(countryUsers.filter(usr => usr.role !== 'admin').length);

      // Permission filtering for non-admin users
      const userAuditorAccess: string[] = u?.permissions?.auditor_access || [];
      if (!isAdminUser && u) {
        const isTaskAllowed = (t: Task) => {
          if (u.permissions?.can_view_all_tasks) return true;
          const activePartnerIds: string[] = [];
          if (Array.isArray(t.assigned_partners)) {
            t.assigned_partners.forEach(id => {
              if (id && !activePartnerIds.includes(id)) activePartnerIds.push(id);
            });
          }
          if (t.assigned_to && !activePartnerIds.includes(t.assigned_to)) {
            activePartnerIds.push(t.assigned_to);
          }
          const isAssigned = activePartnerIds.includes(u.id) || (u.username ? activePartnerIds.includes(u.username) : false);
          const hasAuditorAccess = t.auditor_id ? userAuditorAccess.includes(t.auditor_id) : false;
          return isAssigned || hasAuditorAccess;
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

      // Completed & In-Progress Metrics
      const completedCount = taskList.filter(t => isTaskCompleted(t.status)).length;
      const inProgressCount = Math.max(0, newTotalTasks - completedCount);
      setCompletedTasks(completedCount);
      setInProgressTasks(inProgressCount);

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
      const canonicalKeyMap = new Map<string, string>();
      taskList.forEach(t => {
        if (!t.status) return;
        const trimmed = t.status.trim();
        const lower = trimmed.toLowerCase();
        if (!canonicalKeyMap.has(lower)) {
          canonicalKeyMap.set(lower, trimmed);
        }
        const canonicalKey = canonicalKeyMap.get(lower)!;
        newStatusCounts[canonicalKey] = (newStatusCounts[canonicalKey] || 0) + 1;
      });
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
          
          const typeIds: string[] = (matchingTask.task_type_ids && matchingTask.task_type_ids.length > 0)
            ? matchingTask.task_type_ids
            : (matchingTask.task_type_id ? matchingTask.task_type_id.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
          const ttNames = typeIds
            .map((id: string) => taskTypesList.find(tt => tt.id === id)?.name)
            .filter(Boolean)
            .join(', ') || 'General';

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
        completedTasks: completedCount,
        inProgressTasks: inProgressCount,
        totalCompanies: newTotalCompanies,
        activePartners: countryUsers.filter(usr => usr.role !== 'admin').length,
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
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }, []);

  const completionPercentage = useMemo(() => {
    if (totalTasks === 0) return 0;
    return Math.round((completedTasks / totalTasks) * 100);
  }, [totalTasks, completedTasks]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '16px 0', width: '100%' }}>
        <div style={{ height: '140px', borderRadius: '24px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', opacity: 0.6 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ height: '120px', borderRadius: '18px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', opacity: 0.6 }} />
          ))}
        </div>
      </div>
    );
  }

  const isAdminUser = isAdmin(currentUser);

  return (
    <div className="animate-fadeIn" style={{ paddingBottom: '48px', width: '100%', maxWidth: '1480px', margin: '0 auto' }}>
      
      {/* ─── Hero Operations Console Header (Clean SaaS Aesthetic) ─── */}
      <div style={{
        marginBottom: '26px',
        padding: '28px 32px',
        background: 'linear-gradient(135deg, var(--bg-card, #ffffff) 0%, var(--bg-secondary, #f8fafc) 100%)',
        borderRadius: '24px',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
        border: '1px solid var(--border)'
      }}>
        {/* Subtle Decorative Accent Glow */}
        <div style={{
          position: 'absolute',
          top: '-40px',
          right: '-20px',
          width: '260px',
          height: '260px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(37, 99, 235, 0.08) 0%, rgba(37, 99, 235, 0) 70%)',
          pointerEvents: 'none'
        }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          {/* Top Row: User Greeting, Live Status, Date & Country Badges */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{
                  fontSize: '11.5px',
                  color: 'var(--accent, #2563eb)',
                  fontWeight: 750,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase'
                }}>
                  {greet}, {currentUser?.username || 'Partner'}
                </span>
                <span style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  color: '#10b981',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  padding: '2px 8px',
                  borderRadius: '20px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  Live System
                </span>
                {isAdminUser && (
                  <span style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    color: '#7c3aed',
                    background: 'rgba(124, 58, 237, 0.1)',
                    border: '1px solid rgba(124, 58, 237, 0.25)',
                    padding: '2px 8px',
                    borderRadius: '20px'
                  }}>
                    Admin Controller
                  </span>
                )}
              </div>

              <h1 style={{
                fontSize: '28px',
                fontWeight: 850,
                color: 'var(--text-primary)',
                margin: 0,
                letterSpacing: '-0.03em',
                lineHeight: 1.2
              }}>
                Operations Console
              </h1>
            </div>

            {/* Date & Country Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {dataCountry && (
                <div style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '7px 14px',
                  fontSize: '12.5px',
                  color: 'var(--text-primary)',
                  fontWeight: 650,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span>📍</span>
                  <span>{dataCountry}</span>
                </div>
              )}
              {formattedDate && (
                <div style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '7px 14px',
                  fontSize: '12.5px',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px'
                }}>
                  <CalendarDays size={14} color="var(--accent)" />
                  <span>{formattedDate}</span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Row: Executive Summary & Direct Action Pills */}
          <div style={{
            borderTop: '1px solid var(--border)',
            paddingTop: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px'
          }}>
            <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: 0, fontWeight: 550, lineHeight: 1.5 }}>
              Currently managing <strong style={{ color: 'var(--text-primary)' }}>{totalTasks} active tasks</strong>. Total workflow completion is at <strong style={{ color: '#10b981' }}>{completionPercentage}%</strong> ({completedTasks} completed, {inProgressTasks} in progress).
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => router.push('/dashboard/tasks')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'var(--accent, #2563eb)',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 650,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
              >
                <ListTodo size={15} />
                <span>Task Register</span>
                <ArrowRight size={14} />
              </button>

              <button
                onClick={() => router.push('/dashboard/reports')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontWeight: 650,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <BarChart3 size={15} color="var(--accent)" />
                <span>Reports</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Executive KPI Stat Cards (No Overdue, No Daily Tasks) ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '28px',
      }}>
        {/* Card 1: Total Tasks */}
        <StatCard
          icon={<ListTodo size={20} />}
          label="Total Tasks"
          value={totalTasks}
          colorHex="#2563eb"
          subtitle="Total operational workflows"
          onClick={() => router.push('/dashboard/tasks')}
        />

        {/* Card 2: Completed Tasks */}
        <StatCard
          icon={<CheckCircle2 size={20} />}
          label="Completed"
          value={completedTasks}
          colorHex="#10b981"
          subtitle={`${completionPercentage}% completed successfully`}
          onClick={() => router.push('/dashboard/tasks?status=Completed')}
        />

        {/* Card 3: In Progress Workload */}
        <StatCard
          icon={<Clock size={20} />}
          label="In Progress"
          value={inProgressTasks}
          colorHex="#f59e0b"
          subtitle="Active tasks in pipeline"
          onClick={() => router.push('/dashboard/tasks')}
        />

        {/* Card 4: Active Team (Admin only) */}
        {isAdminUser && (
          <StatCard
            icon={<UsersIcon size={20} />}
            label="Active Partners"
            value={activePartners}
            colorHex="#0ea5e9"
            subtitle="Configured team members"
            onClick={() => router.push('/dashboard/staff')}
          />
        )}
      </div>

      {/* ─── Main Operations Grid (Two-Column Asymmetric Layout) ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '22px',
        alignItems: 'start'
      }}>
        
        {/* ─── Left Side: Status Lifecycle & Category Breakdown ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          
          {/* Panel 1: Tasks by Status Pipeline */}
          <div style={panelCardStyle}>
            <div style={panelHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  background: 'rgba(37, 99, 235, 0.1)',
                  color: 'var(--accent, #2563eb)',
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  border: '1px solid rgba(37, 99, 235, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Activity size={19} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16.5px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                    Tasks by Status
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, marginTop: '2px' }}>
                    Operational workflow lifecycle distribution
                  </p>
                </div>
              </div>
              <span style={badgeStyle}>{Object.keys(statusCounts).length} stages</span>
            </div>

            {/* Multi-Color Segmented Pipeline Meter */}
            {Object.keys(statusCounts).length > 0 && totalTasks > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  display: 'flex',
                  width: '100%',
                  height: '10px',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  background: 'var(--bg-tertiary)',
                  gap: '1px'
                }}>
                  {Object.entries(statusCounts).map(([st, cnt]) => {
                    const col = getStatusColor(st);
                    const pct = (cnt / totalTasks) * 100;
                    return (
                      <div
                        key={`bar-${st}`}
                        title={`${st}: ${cnt} tasks (${Math.round(pct)}%)`}
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: col,
                          transition: 'width 0.3s ease'
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Status Item Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', maxHeight: '440px', overflowY: 'auto', paddingRight: '4px' }}>
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
                        padding: '12px 16px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        cursor: 'pointer',
                        transition: 'all 0.18s ease',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = `0 6px 14px -3px ${color}22`;
                        e.currentTarget.style.borderColor = color;
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.borderColor = 'var(--border)';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {status}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            fontSize: '12px',
                            fontWeight: 750,
                            color,
                            background: `${color}14`,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            border: `1px solid ${color}30`
                          }}>
                            {count}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 650, minWidth: '32px', textAlign: 'right' }}>
                            {pct}%
                          </span>
                          <ChevronRight size={14} color="var(--text-tertiary)" />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ─── Right Side: Quick Tools & Recently Modified Activity Feed ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          
          {/* Panel 3: Quick Navigation Tools */}
          <div style={panelCardStyle}>
            <div style={panelHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  color: '#10b981',
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Compass size={19} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16.5px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                    Quick Tools
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, marginTop: '2px' }}>
                    Operational modules and shortcuts
                  </p>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div
                onClick={() => router.push('/dashboard/tasks')}
                style={toolCardStyle}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(37,99,235,0.1)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ListTodo size={14} />
                  </div>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>Tasks</span>
                </div>
                <ArrowRight size={14} color="var(--text-tertiary)" />
              </div>

              <div
                onClick={() => router.push('/dashboard/reports')}
                style={toolCardStyle}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#10b981'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(16,185,129,0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <BarChart3 size={14} />
                  </div>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>Reports</span>
                </div>
                <ArrowRight size={14} color="var(--text-tertiary)" />
              </div>

              <div
                onClick={() => router.push('/dashboard/companies')}
                style={toolCardStyle}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#8b5cf6'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Building2 size={14} />
                  </div>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>Companies</span>
                </div>
                <ArrowRight size={14} color="var(--text-tertiary)" />
              </div>

              {isAdminUser ? (
                <div
                  onClick={() => router.push('/dashboard/staff')}
                  style={toolCardStyle}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#0ea5e9'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(14,165,233,0.1)', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <UsersIcon size={14} />
                    </div>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>Staff</span>
                  </div>
                  <ArrowRight size={14} color="var(--text-tertiary)" />
                </div>
              ) : (
                <div
                  onClick={() => router.push('/dashboard/profile')}
                  style={toolCardStyle}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#f59e0b'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <UserIcon size={14} />
                    </div>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>My Profile</span>
                  </div>
                  <ArrowRight size={14} color="var(--text-tertiary)" />
                </div>
              )}
            </div>
          </div>

          {/* Panel 4: Recently Modified Description Updates */}
          <div style={panelCardStyle}>
            <div style={panelHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  background: 'rgba(2, 132, 199, 0.1)',
                  color: '#0284c7',
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  border: '1px solid rgba(2, 132, 199, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <History size={19} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16.5px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                    Recent Activity
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, marginTop: '2px' }}>
                    Live description updates and assignments
                  </p>
                </div>
              </div>
              <span style={badgeStyle}>{recentModifications.length} updates</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '520px', overflowY: 'auto', paddingRight: '4px' }}>
              {recentModifications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', borderRadius: '14px', border: '1px dashed var(--border)' }}>
                  <Clock size={32} color="var(--text-tertiary)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                  <div style={{ fontSize: '13.5px', fontWeight: 650 }}>No recent activity found</div>
                  <p style={{ fontSize: '12px', margin: '4px 0 0' }}>Activity updates will appear here automatically.</p>
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
                        background: 'var(--bg-tertiary)',
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        cursor: item.companyId ? 'pointer' : 'default',
                        transition: 'all 0.18s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 6px 14px -3px rgba(0,0,0,0.04)';
                        e.currentTarget.style.borderColor = 'var(--accent)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.borderColor = 'var(--border)';
                      }}
                    >
                      {/* Header Row: Task Title + Status Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', overflow: 'hidden' }}>
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusCol, flexShrink: 0 }} />
                          <span style={{ fontSize: '13px', fontWeight: 750, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.title}
                          </span>
                        </div>
                        <span style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: '5px',
                          background: `${statusCol}14`,
                          color: statusCol,
                          border: `1px solid ${statusCol}28`,
                          flexShrink: 0
                        }}>
                          {item.status}
                        </span>
                      </div>

                      {/* Metadata Chips: Company Name, Task Type, Assigned To */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '11px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 7px',
                          borderRadius: '5px',
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          fontWeight: 650,
                          border: '1px solid var(--border)'
                        }}>
                          <Building2 size={11} color="var(--accent)" />
                          {item.companyName}
                        </span>

                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 7px',
                          borderRadius: '5px',
                          background: 'rgba(139, 92, 246, 0.1)',
                          color: '#8b5cf6',
                          fontWeight: 650,
                          border: '1px solid rgba(139, 92, 246, 0.2)'
                        }}>
                          <Layers size={11} />
                          {item.taskTypeName}
                        </span>

                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 7px',
                          borderRadius: '5px',
                          background: 'rgba(16, 185, 129, 0.1)',
                          color: '#10b981',
                          fontWeight: 650,
                          border: '1px solid rgba(16, 185, 129, 0.2)'
                        }}>
                          <UserIcon size={11} />
                          {item.assignedTo}
                        </span>
                      </div>

                      {/* Description Box */}
                      {item.description && item.description.trim().length > 0 && (
                        <div style={{
                          background: 'var(--bg-secondary)',
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
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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
  return formatDate(dateStr);
}

// ─── Status Color Resolver ───
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

  // 6. Danger / Alerts / Urgent
  if (s === 'urgent' || s === 'high') return '#dc2626';
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
  subtitle 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: number; 
  colorHex: string; 
  onClick?: () => void; 
  subtitle?: string;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-card, var(--bg-secondary))', 
        border: '1px solid var(--border)', 
        borderRadius: '18px', 
        padding: '20px 22px',
        boxShadow: 'var(--card-shadow, 0 2px 10px rgba(0,0,0,0.03))', 
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '12px',
        position: 'relative', 
        overflow: 'hidden',
      }}
      onMouseEnter={e => { 
        if (!onClick) return; 
        e.currentTarget.style.transform = 'translateY(-2px)'; 
        e.currentTarget.style.boxShadow = `0 10px 22px -6px ${colorHex}22`; 
        e.currentTarget.style.borderColor = colorHex; 
      }}
      onMouseLeave={e => { 
        if (!onClick) return; 
        e.currentTarget.style.transform = 'none'; 
        e.currentTarget.style.boxShadow = 'var(--card-shadow, 0 2px 10px rgba(0,0,0,0.03))'; 
        e.currentTarget.style.borderColor = 'var(--border)'; 
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3.5px', background: colorHex }} />
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </div>
        <div style={{
          background: `${colorHex}14`,
          color: colorHex,
          padding: '8px',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${colorHex}25`
        }}>
          {icon}
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ fontSize: '32px', fontWeight: 850, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.03em' }}>
          {value}
        </div>
      </div>
      
      {subtitle && (
        <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 550, marginTop: '-2px' }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

const panelCardStyle: React.CSSProperties = {
  background: 'var(--bg-card, var(--bg-secondary))', 
  border: '1px solid var(--border)', 
  borderRadius: '20px', 
  padding: '24px',
  boxShadow: 'var(--card-shadow, 0 4px 16px rgba(0,0,0,0.03))', 
  display: 'flex', 
  flexDirection: 'column',
};

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '18px',
  flexWrap: 'wrap',
  gap: '10px'
};

const badgeStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-secondary)',
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
  padding: '3px 10px',
  borderRadius: '12px',
  fontWeight: 700,
};

const toolCardStyle: React.CSSProperties = {
  padding: '12px 14px',
  background: 'var(--bg-tertiary)',
  borderRadius: '12px',
  border: '1px solid var(--border)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  transition: 'all 0.15s ease'
};
