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

export default function BahrainDashboard() {
  const [totalTasks, setTotalTasks] = useState(0);
  const [overdueTasks, setOverdueTasks] = useState(0);
  const [activePartners, setActivePartners] = useState(0);
  const [totalCompanies, setTotalCompanies] = useState(0);
  const [urgentClients, setUrgentClients] = useState<UrgentClient[]>([]);
  const [taskTypeStats, setTaskTypeStats] = useState<TaskTypeStats[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [upcomingTasks, setUpcomingTasks] = useState<(Task & { companyName: string; daysLeft: number })[]>([]);
  const [partnerWorkloads, setPartnerWorkloads] = useState<PartnerWorkload[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

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

    if (useCache) return; // Skip expensive DB queries if cache is fresh!

    try {
      const dataCountry = getDataCountry();
      const { user: currentUser } = getSession();
      const isAdminUser = isAdmin(currentUser);

      // Fire all independent queries simultaneously
      const [companiesRes, usersRes, taskTypesRes] = await Promise.all([
        supabase.from('companies').select('*').eq('country', dataCountry || 'Bahrain'),
        dataCountry ? supabase.from('users').select('*').eq('country', dataCountry).neq('role', 'admin') : supabase.from('users').select('*').neq('role', 'admin'),
        supabase.from('task_types').select('*')
      ]);

      const companyList = companiesRes.data || [];
      const companyIds = companyList.map(c => c.id);
      const newTotalCompanies = companyList.length;
      setTotalCompanies(newTotalCompanies);
      setActivePartners((usersRes.data || []).length);

      // Fetch tasks (depends on companyIds)
      let taskList: Task[] = [];
      if (companyIds.length > 0) {
        let taskQuery = supabase.from('tasks').select('*').in('company_id', companyIds);
        if (!isAdminUser && currentUser) {
          taskQuery = taskQuery.eq('assigned_to', currentUser.id);
        }
        const { data: tasks } = await taskQuery;
        taskList = tasks || [];
      }
      
      const newTotalTasks = taskList.length;
      setTotalTasks(newTotalTasks);

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
      
    } catch (err) {
      console.error('Dashboard load error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div style={{ fontSize: '18px', color: 'var(--text-secondary, #666)' }}>Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      
      <div style={{ marginBottom: '32px', padding: '24px 28px', background: 'linear-gradient(135deg, #1E293B 0%, #334155 100%)', borderRadius: '16px', color: '#fff' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#fff', margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>Dashboard Overview</h1>
        <p style={{ fontSize: '14px', color: '#94A3B8', margin: 0 }}>Monitor tasks, clients, and deadlines across your operations.</p>
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
          icon={<AlertTriangle size={20} />} 
          label="Overdue Tasks" 
          value={overdueTasks} 
          colorHex="#EF4444" 
          onClick={() => router.push('/dashboard/tasks')}
        />
        {isAdmin(getSession().user) && (
          <>
            <StatCard 
              icon={<UsersIcon size={20} />} 
              label="Active Partners" 
              value={activePartners} 
              colorHex="#10B981" 
              onClick={() => router.push('/dashboard/staff')}
            />
            <StatCard 
              icon={<Building2 size={20} />} 
              label="Total Companies" 
              value={totalCompanies} 
              colorHex="#F59E0B" 
              onClick={() => router.push('/dashboard/companies')}
            />
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
        
        {/* Urgent Clients */}
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <h3 style={panelTitleStyle}>
              <AlertTriangle size={18} color="#EF4444" /> Urgent Clients
            </h3>
            <span style={badgeStyle}>Due ≤ 7 days or Urgent</span>
          </div>
          
          <div style={listContainerStyle}>
            {urgentClients.length === 0 ? (
              <EmptyState message="No urgent clients at the moment" icon="🎉" />
            ) : (
              urgentClients.map(({ company, tasks, overdueCount }) => (
                <div key={company.id} 
                  onClick={() => router.push(`/dashboard/tasks?company=${company.id}`)}
                  style={{...listItemStyle, background: '#FEF2F2', borderColor: '#FCA5A5'}}
                  onMouseEnter={e => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.borderColor = '#F87171'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.borderColor = '#FCA5A5'; }}
                >
                  <div>
                    <div style={itemTitleStyle}>{company.company_name}</div>
                    <div style={itemSubtitleStyle}>
                      <span style={{ color: '#EF4444', fontWeight: 500 }}>{tasks.length} task{tasks.length > 1 ? 's' : ''}</span>
                      {overdueCount > 0 ? <span style={{ color: '#B91C1C' }}> • {overdueCount} overdue</span> : 
                       tasks.some(t => t.priority === 'Urgent' || t.priority === 'Critical') ? <span style={{ color: '#B91C1C' }}> • Urgent priority</span> :
                       <span> • Due soon</span>}
                    </div>
                  </div>
                  <ChevronRight size={18} color="#9CA3AF" />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tasks by Category */}
        {taskTypeStats.length > 0 && (
          <div style={panelStyle}>
            <div style={panelHeaderStyle}>
              <h3 style={panelTitleStyle}>
                <ListTodo size={18} color="#10B981" /> Tasks by Category
              </h3>
            </div>
            
            <div style={listContainerStyle}>
              {taskTypeStats.map(({ taskType, count, companies }, idx) => {
                const categoryColors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6'];
                const catColor = categoryColors[idx % categoryColors.length];
                return (
                <div key={taskType.id} 
                  onClick={() => router.push(`/dashboard/tasks?search=${encodeURIComponent(taskType.name)}`)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px',
                    cursor: 'pointer', background: '#FAFAFA', borderRadius: '10px', border: '1px solid #E5E7EB', marginBottom: '8px',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F3F4F6'; e.currentTarget.style.borderColor = catColor; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FAFAFA'; e.currentTarget.style.borderColor = '#E5E7EB'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ 
                      width: '36px', height: '36px', borderRadius: '8px', 
                      background: `${catColor}20`, color: catColor, 
                      display: 'flex', alignItems: 'center', justifyContent: 'center', 
                      fontSize: '14px', fontWeight: 700 
                    }}>
                      {idx + 1}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{taskType.name}</div>
                      <div style={{ fontSize: '12px', color: '#6B7280' }}>🏢 {companies.size} {companies.size === 1 ? 'company' : 'companies'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: catColor }}>{count}</div>
                    <ChevronRight size={16} color="#D1D5DB" />
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
              <h3 style={panelTitleStyle}>
                <UsersIcon size={18} color="#8B5CF6" /> Partner Workload
              </h3>
              <span style={badgeStyle}>{partnerWorkloads.length} active</span>
            </div>
            <div style={listContainerStyle}>
              {partnerWorkloads.map((pw, idx) => {
                const { partner, totalTasks: total, completedTasks, overdueTasks: overdue, inProgressTasks } = pw;
                const completionPct = total > 0 ? Math.round((completedTasks / total) * 100) : 0;
                const colors = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#14B8A6'];
                const pColor = colors[idx % colors.length];
                return (
                  <div key={partner.id} style={{
                    padding: '14px 16px', borderRadius: '12px', background: '#FAFAFA',
                    border: overdue > 0 ? '1px solid #FCA5A5' : '1px solid #E5E7EB',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '34px', height: '34px', borderRadius: '50%',
                          background: `linear-gradient(135deg, ${pColor}, ${pColor}CC)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '13px', fontWeight: 700, color: '#fff',
                        }}>
                          {partner.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{partner.username}</div>
                          <div style={{ fontSize: '12px', color: '#6B7280' }}>{total} task{total !== 1 ? 's' : ''}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: pColor }}>{completionPct}%</div>
                    </div>
                    <div style={{ background: '#E5E7EB', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                      <div style={{ width: `${completionPct}%`, height: '100%', background: `linear-gradient(90deg, ${pColor}, ${pColor}AA)`, borderRadius: '3px', transition: 'width 0.8s ease-out' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '11px' }}>
                      <span style={{ color: '#10B981', fontWeight: 600 }}>✓ {completedTasks} done</span>
                      <span style={{ color: '#3B82F6', fontWeight: 600 }}>⟳ {inProgressTasks} active</span>
                      {overdue > 0 && <span style={{ color: '#EF4444', fontWeight: 600 }}>⚠ {overdue} overdue</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tasks by Status */}
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <h3 style={panelTitleStyle}>
              <BarChart3 size={18} color="#3B82F6" /> Tasks by Status
            </h3>
          </div>
          
          <div style={{ ...listContainerStyle, gap: '16px', padding: '8px 0' }}>
            {Object.keys(statusCounts).length === 0 ? (
              <EmptyState message="No status data available" />
            ) : (
              Object.entries(statusCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => {
                const pct = totalTasks > 0 ? (count / totalTasks * 100).toFixed(1) : '0';
                const barColor = getStatusColor(status);
                return (
                  <div key={status} 
                    onClick={() => router.push(`/dashboard/tasks?status=${encodeURIComponent(status)}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                  >
                    <div style={{ width: '140px', fontSize: '13px', color: '#374151', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {status}
                    </div>
                    <div style={{ flex: 1, background: '#F3F4F6', height: '10px', borderRadius: '5px', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
                      <div style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: barColor,
                        borderRadius: '5px',
                        transition: 'width 1s ease-out'
                      }} />
                    </div>
                    <div style={{ width: '30px', textAlign: 'right', fontSize: '13px', color: '#6B7280', fontWeight: 600 }}>
                      {count}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <h3 style={panelTitleStyle}>
              <Clock size={18} color="#F59E0B" /> Upcoming Deadlines
            </h3>
          </div>
          
          <div style={listContainerStyle}>
            {upcomingTasks.length === 0 ? (
              <EmptyState message="No upcoming tasks" />
            ) : (
              upcomingTasks.map(task => (
                <div key={task.id} 
                  onClick={() => router.push('/dashboard/tasks')}
                  style={{...listItemStyle, background: task.daysLeft < 0 ? '#FEF2F2' : '#FFFBEB', borderColor: task.daysLeft < 0 ? '#FCA5A5' : '#FDE68A'}}
                  onMouseEnter={e => { e.currentTarget.style.background = task.daysLeft < 0 ? '#FEE2E2' : '#FEF3C7'; e.currentTarget.style.borderColor = task.daysLeft < 0 ? '#F87171' : '#FCD34D'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = task.daysLeft < 0 ? '#FEF2F2' : '#FFFBEB'; e.currentTarget.style.borderColor = task.daysLeft < 0 ? '#FCA5A5' : '#FDE68A'; }}
                >
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <div style={itemTitleStyle}>{task.companyName}</div>
                      <span style={{ 
                        fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px',
                        background: task.daysLeft < 0 ? '#FEE2E2' : '#FEF3C7',
                        color: task.daysLeft < 0 ? '#DC2626' : '#D97706'
                      }}>
                        {task.daysLeft < 0 ? 'Overdue' : `${task.daysLeft}d left`}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#374151', marginBottom: '6px' }}>{task.title}</div>
                    <div style={{ fontSize: '12px', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} /> Due: {task.deadline}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>


      </div>
    </div>
  );
}

// -----------------------------------------------------
// Component & Style Definitions
// -----------------------------------------------------

function getStatusColor(status: string) {
  const s = status.toLowerCase();
  if (s.includes('completed') || s.includes('closed') || s.includes('done')) return '#10B981'; 
  if (s.includes('review') || s.includes('waiting')) return '#8B5CF6'; 
  if (s.includes('progress') || s.includes('active')) return '#3B82F6'; 
  if (s.includes('urgent') || s.includes('overdue')) return '#EF4444'; 
  return '#F59E0B'; 
}

function StatCard({ icon, label, value, colorHex, onClick }: { icon: React.ReactNode; label: string; value: number; colorHex: string; onClick?: () => void }) {
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

function EmptyState({ message, icon }: { message: string, icon?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6B7280', background: '#F9FAFB', borderRadius: '8px', border: '1px dashed #E5E7EB' }}>
      {icon && <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icon}</div>}
      <div style={{ fontSize: '14px' }}>{message}</div>
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

const badgeStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#6B7280',
  background: '#F3F4F6',
  padding: '4px 10px',
  borderRadius: '12px',
  fontWeight: 500
};

const listContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  maxHeight: '360px',
  overflowY: 'auto',
  paddingRight: '4px'
};

const listItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px',
  border: '1px solid #E5E7EB',
  borderRadius: '10px',
  background: '#FAFAFA',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

const itemTitleStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#111827',
  marginBottom: '4px'
};

const itemSubtitleStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#6B7280',
};
