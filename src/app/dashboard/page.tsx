'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth';
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
  const [staffWorkload, setStaffWorkload] = useState<{ username: string; taskCount: number }[]>([]);
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
      // Load stats
      const { count: companyCount } = await supabase
        .from('companies')
        .select('*', { count: 'exact', head: true });

      let taskQuery = supabase.from('tasks').select('*');
      if (!isAdmin(currentUser)) {
        taskQuery = taskQuery.eq('assigned_to', currentUser.id);
      }
      const { data: tasks } = await taskQuery;

      const allTasks = tasks || [];
      setStats({
        totalCompanies: companyCount || 0,
        totalTasks: allTasks.length,
        pendingTasks: allTasks.filter(t => t.status === 'pending').length,
        completedTasks: allTasks.filter(t => t.status === 'completed').length,
      });

      // Load recent tasks with company and assignee info
      let recentQuery = supabase
        .from('tasks')
        .select('*, company:companies(company_name), assignee:users!tasks_assigned_to_fkey(username)')
        .order('created_at', { ascending: false })
        .limit(8);

      if (!isAdmin(currentUser)) {
        recentQuery = recentQuery.eq('assigned_to', currentUser.id);
      }
      const { data: recent } = await recentQuery;
      setRecentTasks((recent as Task[]) || []);

      // Load staff workload (admin only)
      if (isAdmin(currentUser)) {
        const { data: staff } = await supabase
          .from('users')
          .select('id, username');
        const { data: allTasksData } = await supabase
          .from('tasks')
          .select('assigned_to');

        if (staff && allTasksData) {
          const workload = staff.map(s => ({
            username: s.username,
            taskCount: allTasksData.filter(t => t.assigned_to === s.id).length,
          })).sort((a, b) => b.taskCount - a.taskCount);
          setStaffWorkload(workload);
        }
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'badge-pending',
      in_progress: 'badge-in-progress',
      completed: 'badge-completed',
    };
    const labels: Record<string, string> = {
      pending: 'Pending',
      in_progress: 'In Progress',
      completed: 'Completed',
    };
    return <span className={`badge ${map[status] || ''}`}>{labels[status] || status}</span>;
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
    },
    {
      label: 'Total Tasks',
      value: stats.totalTasks,
      icon: <ListTodo size={22} />,
      color: '#5856d6',
      bg: 'linear-gradient(135deg, #ededfa, #e0e0f7)',
    },
    {
      label: 'Pending Tasks',
      value: stats.pendingTasks,
      icon: <Clock size={22} />,
      color: '#ff9f0a',
      bg: 'linear-gradient(135deg, #fff5e5, #ffedcc)',
    },
    {
      label: 'Completed',
      value: stats.completedTasks,
      icon: <CheckCircle2 size={22} />,
      color: '#34c759',
      bg: 'linear-gradient(135deg, #e8f8ec, #d4f1dc)',
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
            className="card"
            style={{
              padding: '20px',
              position: 'relative',
              overflow: 'hidden',
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
        gridTemplateColumns: isAdmin(user) ? '1fr 320px' : '1fr',
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
                    <th>Company</th>
                    {isAdmin(user) && <th>Assigned To</th>}
                    <th>Priority</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTasks.map((task) => (
                    <tr key={task.id}>
                      <td style={{ fontWeight: 500 }}>{task.title}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {(task.company as unknown as Company)?.company_name || '—'}
                      </td>
                      {isAdmin(user) && (
                        <td style={{ color: 'var(--text-secondary)' }}>
                          {(task.assignee as unknown as User)?.username || '—'}
                        </td>
                      )}
                      <td>{getPriorityBadge(task.priority)}</td>
                      <td>{getStatusBadge(task.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Staff Workload (Admin only) */}
        {isAdmin(user) && (
          <div className="card animate-slideUp" style={{
            overflow: 'hidden',
            alignSelf: 'start',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-light)',
            }}>
              <TrendingUp size={18} color="var(--accent)" />
              <h2 style={{
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}>
                Staff Workload
              </h2>
            </div>

            {staffWorkload.length === 0 ? (
              <div style={{
                padding: '32px 24px',
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: '14px',
              }}>
                No staff yet
              </div>
            ) : (
              <div style={{ padding: '12px' }}>
                {staffWorkload.map((staff, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: '12px',
                      transition: 'var(--transition)',
                    }}
                  >
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: `linear-gradient(135deg, ${['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a'][i % 5]}, ${['#764ba2', '#f5576c', '#00f2fe', '#38f9d7', '#fee140'][i % 5]})`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'white',
                      flexShrink: 0,
                    }}>
                      {staff.username.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                      }}>
                        {staff.username}
                      </div>
                    </div>
                    <div style={{
                      padding: '4px 10px',
                      borderRadius: '8px',
                      background: 'var(--bg-tertiary)',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                    }}>
                      {staff.taskCount} tasks
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
