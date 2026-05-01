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
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Users,
  Briefcase,
  Calendar,
  Shield,
  Eye,
} from 'lucide-react';

interface DashboardStats {
  totalCompanies: number;
  totalTasks: number;
  pendingTasks: number;
  completedTasks: number;
}

interface CompanyOverview {
  id: string;
  company_name: string;
  job?: string;
  status?: string;
  start_date?: string;
  due_date?: string;
  staff: { id: string; username: string; role: string }[];
  tasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
    deadline: string;
    assigned_to: string;
    assignee_name?: string;
  }[];
}

const TASK_STATUS_OPTIONS = [
  'Yet to Start',
  'In Progress',
  'Waiting for Documents',
  'Xero Access Required',
  'IRD Number Required',
  'Queries Sent',
  'Sent for Review 1',
  'Sent for Review 2',
  'Sent for Review 3',
  'Completed',
];

const COMPANY_STATUS_OPTIONS = [
  'Yet to Start',
  'In Progress',
  'Working',
  'Review',
  'Completed',
];

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalCompanies: 0,
    totalTasks: 0,
    pendingTasks: 0,
    completedTasks: 0,
  });
  const [companyOverviews, setCompanyOverviews] = useState<CompanyOverview[]>([]);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
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

      // Load companies
      let companyQuery = supabase.from('companies').select('*').order('created_at', { ascending: false });
      if (dataCountry) companyQuery = companyQuery.eq('country', dataCountry);
      const { data: companies, count: companyCount } = await companyQuery;

      // Load all tasks with assignee info
      let taskQuery = supabase.from('tasks').select('*, company:companies(company_name, country), assignee:users!tasks_assigned_to_fkey(username)');
      if (!isAdmin(currentUser)) {
        taskQuery = taskQuery.eq('assigned_to', currentUser.id);
      }
      const { data: tasks } = await taskQuery;

      let allTasks = tasks || [];
      if (dataCountry) {
        allTasks = allTasks.filter(t => (t.company as any)?.country === dataCountry);
      }

      // Load company_staff with user info
      const { data: companyStaff } = await supabase
        .from('company_staff')
        .select('company_id, role, user:users(id, username)');

      // Build company overviews
      const overviews: CompanyOverview[] = (companies || []).map(c => {
        const compTasks = allTasks.filter(t => t.company_id === c.id);
        const compStaff = (companyStaff || [])
          .filter(cs => cs.company_id === c.id)
          .map(cs => ({
            id: (cs.user as any)?.id || '',
            username: (cs.user as any)?.username || '',
            role: cs.role,
          }));

        return {
          id: c.id,
          company_name: c.company_name,
          job: c.job,
          status: c.status,
          start_date: c.start_date,
          due_date: c.due_date,
          staff: compStaff,
          tasks: compTasks.map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            deadline: t.deadline,
            assigned_to: t.assigned_to,
            assignee_name: (t.assignee as any)?.username || '',
          })),
        };
      });

      // Filter out companies with no tasks for non-admin users
      const filteredOverviews = isAdmin(currentUser)
        ? overviews
        : overviews.filter(o => o.tasks.length > 0);

      setStats({
        totalCompanies: companyCount || (companies || []).length,
        totalTasks: allTasks.length,
        pendingTasks: allTasks.filter(t => !t.status.toLowerCase().includes('completed')).length,
        completedTasks: allTasks.filter(t => t.status.toLowerCase().includes('completed')).length,
      });

      setCompanyOverviews(filteredOverviews);

      // Auto-expand companies with active tasks (up to 3)
      const activeCompanies = filteredOverviews
        .filter(o => o.tasks.some(t => !t.status.toLowerCase().includes('completed')))
        .slice(0, 3)
        .map(o => o.id);
      setExpandedCompanies(new Set(activeCompanies));
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

  async function updateCompanyStatus(companyId: string, newStatus: string) {
    setCompanyOverviews(prev =>
      prev.map(c => c.id === companyId ? { ...c, status: newStatus } : c)
    );
    await supabase.from('companies').update({ status: newStatus }).eq('id', companyId);
  }

  function toggleExpand(companyId: string) {
    setExpandedCompanies(prev => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  }

  const getStatusBadge = (status: string) => {
    let badgeClass = 'badge-pending';
    const s = status.toLowerCase();
    if (s.includes('completed')) badgeClass = 'badge-completed';
    else if (s.includes('progress') || s.includes('review') || s.includes('sent') || s.includes('waiting') || s.includes('required') || s.includes('working')) badgeClass = 'badge-in-progress';
    return <span className={`badge ${badgeClass}`}>{status}</span>;
  };

  const getPriorityDot = (priority: string) => {
    const colorMap: Record<string, string> = {
      high: '#ef4444',
      medium: '#f59e0b',
      low: '#22c55e',
    };
    return (
      <span style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: colorMap[priority] || '#94a3b8',
        display: 'inline-block',
        flexShrink: 0,
      }} title={`${priority} priority`} />
    );
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
      <div className="stagger-children dashboard-summary-grid" style={{
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

      {/* Company Overview Section */}
      <div className="card animate-slideUp" style={{ overflow: 'hidden' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-light)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Building2 size={18} color="var(--accent)" />
            <h2 style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}>
              Company Overview
            </h2>
            <span style={{
              padding: '2px 8px',
              borderRadius: '8px',
              background: 'var(--bg-tertiary)',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
            }}>
              {companyOverviews.length}
            </span>
          </div>
          <button
            onClick={() => router.push('/dashboard/companies')}
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

        {companyOverviews.length === 0 ? (
          <div style={{
            padding: '48px 24px',
            textAlign: 'center',
            color: 'var(--text-tertiary)',
          }}>
            <AlertCircle size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            <p style={{ fontSize: '14px' }}>No companies yet</p>
          </div>
        ) : (
          <div>
            {companyOverviews.map((company) => {
              const isExpanded = expandedCompanies.has(company.id);
              const activeTasks = company.tasks.filter(t => !t.status.toLowerCase().includes('completed'));
              const completedTasks = company.tasks.filter(t => t.status.toLowerCase().includes('completed'));
              const isOverdue = company.due_date && new Date(company.due_date) < new Date() && !company.status?.toLowerCase().includes('completed');

              return (
                <div key={company.id} style={{
                  borderBottom: '1px solid var(--border-light)',
                }}>
                  {/* Company Row Header */}
                  <div
                    onClick={() => toggleExpand(company.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '16px 24px',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                      background: isExpanded ? 'var(--bg-tertiary)' : 'transparent',
                    }}
                    onMouseOver={(e) => { if (!isExpanded) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-tertiary)'; }}
                    onMouseOut={(e) => { if (!isExpanded) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                  >
                    {/* Expand icon */}
                    <div style={{ color: 'var(--text-tertiary)', flexShrink: 0, display: 'flex' }}>
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>

                    {/* Company icon */}
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: isOverdue
                        ? 'linear-gradient(135deg, #fde8e8, #fcd6d6)'
                        : 'linear-gradient(135deg, #e8f4fd, #d4ecfb)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Building2 size={16} color={isOverdue ? 'var(--danger)' : 'var(--accent)'} />
                    </div>

                    {/* Company info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}>
                          {company.company_name}
                        </span>
                        {company.job && (
                          <span className="job-tag" style={{ fontSize: '10px', padding: '1px 6px' }}>
                            <Briefcase size={8} />
                            {company.job}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', marginTop: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <ListTodo size={10} />
                          {activeTasks.length} active / {company.tasks.length} tasks
                        </span>
                        {company.staff.length > 0 && (
                          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Users size={10} />
                            {company.staff.map(s => s.username).join(', ')}
                          </span>
                        )}
                        {company.due_date && (
                          <span style={{
                            fontSize: '11px',
                            color: isOverdue ? 'var(--danger)' : 'var(--text-tertiary)',
                            fontWeight: isOverdue ? 600 : 400,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}>
                            <Calendar size={10} />
                            Due: {new Date(company.due_date).toLocaleDateString('en-GB')}
                            {isOverdue && ' ⚠'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Company Status */}
                    <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
                      {isAdmin(user) ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Shield size={12} color="var(--accent)" />
                          <select
                            className="select"
                            value={company.status || 'Yet to Start'}
                            onChange={(e) => updateCompanyStatus(company.id, e.target.value)}
                            style={{
                              padding: '4px 24px 4px 8px',
                              fontSize: '12px',
                              width: 'auto',
                              minWidth: '120px',
                              borderRadius: '8px',
                              fontWeight: 600,
                              backgroundColor: 'var(--bg-secondary)',
                              border: '1px solid var(--border-light)',
                            }}
                          >
                            {COMPANY_STATUS_OPTIONS.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                            {company.status && !COMPANY_STATUS_OPTIONS.includes(company.status) && (
                              <option value={company.status}>{company.status}</option>
                            )}
                          </select>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Eye size={12} color="var(--text-tertiary)" />
                          {getStatusBadge(company.status || 'Yet to Start')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div style={{
                      padding: '0 24px 16px 72px',
                      background: 'var(--bg-tertiary)',
                    }}>
                      {/* Staff Section */}
                      {company.staff.length > 0 && (
                        <div style={{ marginBottom: '14px' }}>
                          <div style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'var(--text-tertiary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            marginBottom: '8px',
                          }}>
                            Assigned Staff
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {company.staff.map(s => (
                              <span key={s.id} style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '4px 10px',
                                borderRadius: '8px',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-light)',
                                fontSize: '12px',
                                fontWeight: 500,
                                color: 'var(--text-primary)',
                              }}>
                                <Users size={10} color="var(--accent)" />
                                {s.username}
                                <span style={{
                                  fontSize: '10px',
                                  color: 'var(--text-tertiary)',
                                  padding: '1px 5px',
                                  background: 'var(--bg-tertiary)',
                                  borderRadius: '4px',
                                }}>
                                  {s.role}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Tasks Section */}
                      {company.tasks.length > 0 ? (
                        <div>
                          <div style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'var(--text-tertiary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            marginBottom: '8px',
                          }}>
                            Tasks
                          </div>
                          <div style={{
                            borderRadius: '10px',
                            border: '1px solid var(--border-light)',
                            background: 'var(--bg-secondary)',
                            overflow: 'hidden',
                          }}>
                            {company.tasks.map((task, idx) => (
                              <div key={task.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px 14px',
                                borderBottom: idx < company.tasks.length - 1 ? '1px solid var(--border-light)' : 'none',
                                flexWrap: 'wrap',
                              }}>
                                {/* Priority dot */}
                                {getPriorityDot(task.priority)}

                                {/* Task title */}
                                <span style={{
                                  fontSize: '13px',
                                  fontWeight: 500,
                                  color: 'var(--text-primary)',
                                  flex: 1,
                                  minWidth: '100px',
                                }}>
                                  {task.title}
                                </span>

                                {/* Assigned to */}
                                {task.assignee_name && (
                                  <span style={{
                                    fontSize: '11px',
                                    color: 'var(--text-tertiary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                  }}>
                                    → {task.assignee_name}
                                  </span>
                                )}

                                {/* Deadline */}
                                {task.deadline && (
                                  <span style={{
                                    fontSize: '11px',
                                    color: 'var(--text-tertiary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                  }}>
                                    <Calendar size={10} />
                                    {new Date(task.deadline).toLocaleDateString('en-GB')}
                                  </span>
                                )}

                                {/* Task status dropdown */}
                                <select
                                  className="select"
                                  value={task.status}
                                  onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                                  disabled={!isAdmin(user) && task.assigned_to !== user?.id}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    padding: '3px 24px 3px 8px',
                                    fontSize: '11px',
                                    width: 'auto',
                                    minWidth: '120px',
                                    borderRadius: '6px',
                                    fontWeight: 500,
                                  }}
                                >
                                  {TASK_STATUS_OPTIONS.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                  {!TASK_STATUS_OPTIONS.includes(task.status) && (
                                    <option value={task.status}>{task.status}</option>
                                  )}
                                </select>
                              </div>
                            ))}
                          </div>

                          {/* Task summary */}
                          <div style={{
                            display: 'flex',
                            gap: '16px',
                            marginTop: '10px',
                            padding: '0 4px',
                          }}>
                            <span style={{
                              fontSize: '11px',
                              color: 'var(--success)',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}>
                              <CheckCircle2 size={11} />
                              {completedTasks.length} completed
                            </span>
                            {activeTasks.length > 0 && (
                              <span style={{
                                fontSize: '11px',
                                color: 'var(--warning)',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}>
                                <Clock size={11} />
                                {activeTasks.length} pending
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          padding: '16px',
                          textAlign: 'center',
                          color: 'var(--text-tertiary)',
                          fontSize: '13px',
                          background: 'var(--bg-secondary)',
                          borderRadius: '10px',
                          border: '1px solid var(--border-light)',
                        }}>
                          No tasks assigned yet
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
