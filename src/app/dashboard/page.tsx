'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, isAdmin, getDataCountry } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { User, Task, Company } from '@/lib/supabase';
import {
  Building2,
  ListTodo,
  Clock,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';

interface DashboardStats {
  totalCompanies: number;
  totalTasks: number;
  pendingTasks: number;
  completedTasks: number;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalCompanies: 0,
    totalTasks: 0,
    pendingTasks: 0,
    completedTasks: 0,
  });
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const { user: u } = getSession();
    if (!u) {
      router.push('/');
      return;
    }
    setUser(u);
    loadDashboard(u);
  }, [router]);

  async function loadDashboard(currentUser: User) {
    setLoading(true);
    try {
      const dataCountry = getDataCountry();

      // Load stats
      let companyQuery = supabase.from('companies').select('*', { count: 'exact', head: true });
      if (dataCountry) companyQuery = companyQuery.eq('country', dataCountry);
      const { count: companyCount } = await companyQuery;

      let taskQuery = supabase.from('tasks').select('*, company:companies(company_name, country)');
      if (!isAdmin(currentUser)) {
        taskQuery = taskQuery.eq('assigned_to', currentUser.id);
      }
      const { data: tasks } = await taskQuery;

      let allTasks = tasks || [];
      // Filter tasks by country (via their company)
      if (dataCountry) {
        allTasks = allTasks.filter(t => (t.company as any)?.country === dataCountry);
      }

      setStats({
        totalCompanies: companyCount || 0,
        totalTasks: allTasks.length,
        pendingTasks: allTasks.filter(t => !t.status.toLowerCase().includes('completed')).length,
        completedTasks: allTasks.filter(t => t.status.toLowerCase().includes('completed')).length,
      });

      // Load recent tasks with company and assignee info
      let recentQuery = supabase
        .from('tasks')
        .select('*, company:companies(company_name, country, job), assignee:users!tasks_assigned_to_fkey(username)')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!isAdmin(currentUser)) {
        recentQuery = recentQuery.eq('assigned_to', currentUser.id);
      }
      const { data: recent } = await recentQuery;
      let recentFiltered = (recent as Task[]) || [];
      if (dataCountry) {
        recentFiltered = recentFiltered.filter(t => (t.company as any)?.country === dataCountry);
      }
      setRecentTasks(recentFiltered.slice(0, 10)); // Increased limit to 10 since we have more space
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function updateTaskStatus(taskId: string, newStatus: string) {
    await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);
    if (user) loadDashboard(user);
  }

  const getStatusBadge = (status: string) => {
    let badgeClass = 'badge-pending';
    const s = status.toLowerCase();
    if (s.includes('completed')) badgeClass = 'badge-completed';
    else if (s.includes('progress') || s.includes('review') || s.includes('sent') || s.includes('waiting') || s.includes('required')) badgeClass = 'badge-in-progress';
    return <span className={`badge ${badgeClass}`}>{status}</span>;
  };

  const getPriorityBadge = (priority: string) => {
    const map: Record<string, string> = {
      high: 'badge-high',
      medium: 'badge-medium',
      low: 'badge-low',
    };
    return <span className={`badge ${map[priority] || ''}`} style={{ textTransform: 'capitalize' }}>{priority}</span>;
  };

  if (loading) {
    return (
      <div className="stagger-children">
        <div className="skeleton" style={{ height: '32px', width: '200px', marginBottom: '24px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton" style={{ height: '120px', borderRadius: '16px' }} />
          ))}
        </div>
        <div className="skeleton" style={{ height: '300px', borderRadius: '16px' }} />
      </div>
    );
  }

  const statCards = [
    {
      label: 'Total Companies',
      value: stats.totalCompanies,
      icon: <Building2 size={22} />,
      color: '#0071e3',
      bg: 'linear-gradient(135deg, #e8f4fd, #d4ecfb)',
      href: '/dashboard/companies',
    },
    {
      label: 'Total Tasks',
      value: stats.totalTasks,
      icon: <ListTodo size={22} />,
      color: '#5856d6',
      bg: 'linear-gradient(135deg, #ededfa, #e0e0f7)',
      href: '/dashboard/tasks',
    },
    {
      label: 'Pending Tasks',
      value: stats.pendingTasks,
      icon: <Clock size={22} />,
      color: '#ff9f0a',
      bg: 'linear-gradient(135deg, #fff5e5, #ffedcc)',
      href: '/dashboard/tasks',
    },
    {
      label: 'Completed',
      value: stats.completedTasks,
      icon: <CheckCircle2 size={22} />,
      color: '#34c759',
      bg: 'linear-gradient(135deg, #e8f8ec, #d4f1dc)',
      href: '/dashboard/tasks',
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="animate-fadeIn" style={{ marginBottom: '28px' }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
        }}>
          {isAdmin(user) ? 'Admin Dashboard' : 'My Dashboard'}
        </h1>
        <p style={{
          fontSize: '15px',
          color: 'var(--text-secondary)',
          marginTop: '4px',
        }}>
          Welcome back, {user?.username}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="stagger-children" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '32px',
      }}>
        {statCards.map((card, i) => (
          <div
            key={i}
            className="card stat-card"
            onClick={() => router.push(card.href)}
            style={{
              padding: '20px',
              position: 'relative',
              overflow: 'hidden',
              cursor: 'pointer',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
          >
            <div style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '80px',
              height: '80px',
              background: card.bg,
              borderRadius: '0 16px 0 40px',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'flex-end',
              padding: '14px',
              color: card.color,
            }}>
              {card.icon}
            </div>
            <div style={{
              fontSize: '36px',
              fontWeight: 700,
              color: card.color,
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}>
              {card.value}
            </div>
            <div style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              marginTop: '8px',
            }}>
              {card.label}
            </div>
          </div>
        ))}
      </div>

      {/* Content Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: '24px',
      }}>
        {/* Recent Tasks */}
        <div className="card animate-slideUp" style={{ overflow: 'hidden' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-light)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ListTodo size={18} color="var(--accent)" />
              <h2 style={{
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}>
                {isAdmin(user) ? 'Recent Tasks' : 'My Tasks'}
              </h2>
            </div>
            <button
              onClick={() => router.push('/dashboard/tasks')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                color: 'var(--accent)',
                fontWeight: 500,
                fontFamily: 'inherit',
              }}
            >
              View All <ArrowRight size={14} />
            </button>
          </div>

          {recentTasks.length === 0 ? (
            <div style={{
              padding: '48px 24px',
              textAlign: 'center',
              color: 'var(--text-tertiary)',
            }}>
              <AlertCircle size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
              <p style={{ fontSize: '14px' }}>No tasks yet</p>
            </div>
          ) : (
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Company & Job</th>
                    {isAdmin(user) && <th>Assigned To</th>}
                    <th>Deadline</th>
                    <th>Priority</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTasks.map((task) => (
                    <tr key={task.id}>
                      <td style={{ fontWeight: 500 }}>{task.title}</td>
                      <td>
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          {(task.company as unknown as Company)?.company_name || '—'}
                        </div>
                        {(task.company as unknown as Company)?.job && (
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            Job: {(task.company as unknown as Company).job}
                          </div>
                        )}
                      </td>
                      {isAdmin(user) && (
                        <td style={{ color: 'var(--text-secondary)' }}>
                          {(task.assignee as unknown as User)?.username || '—'}
                        </td>
                      )}
                      <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                        {task.deadline ? new Date(task.deadline).toLocaleDateString('en-GB') : '—'}
                      </td>
                      <td>{getPriorityBadge(task.priority)}</td>
                      <td>
                        <select
                          className="select"
                          value={task.status}
                          onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                          disabled={!isAdmin(user) && task.assigned_to !== user?.id}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            padding: '4px 28px 4px 8px',
                            fontSize: '12px',
                            width: 'auto',
                            minWidth: '130px',
                            borderRadius: '8px',
                            fontWeight: 500,
                          }}
                        >
                          <option value="Yet to Start">Yet to Start</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Waiting for Documents">Waiting for Documents</option>
                          <option value="Xero Access Required">Xero Access Required</option>
                          <option value="IRD Number Required">IRD Number Required</option>
                          <option value="Queries Sent">Queries Sent</option>
                          <option value="Sent for Review 1">Sent for Review 1</option>
                          <option value="Sent for Review 2">Sent for Review 2</option>
                          <option value="Sent for Review 3">Sent for Review 3</option>
                          <option value="Completed">Completed</option>
                          {/* Show current value if it's not in the standard list */}
                          {!['Yet to Start', 'In Progress', 'Waiting for Documents', 'Xero Access Required',
                            'IRD Number Required', 'Queries Sent', 'Sent for Review 1', 'Sent for Review 2',
                            'Sent for Review 3', 'Completed'].includes(task.status) && (
                            <option value={task.status}>{task.status}</option>
                          )}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
