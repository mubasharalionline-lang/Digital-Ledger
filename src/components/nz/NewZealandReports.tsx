'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Task, Company, User, TaskType, Auditor } from '@/lib/supabase';
import { formatDate } from '@/lib/dateUtils';
import { exportNzMonthlyReportExcel, NzPartnerSummaryRow, getActivePartnerIds } from '@/lib/reportExportUtils';
import CountryFlag from '@/components/CountryFlag';
import {
  Calendar,
  CheckCircle2,
  Users,
  Briefcase,
  Printer,
  RefreshCw,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  X,
  FileSpreadsheet,
  Building2,
  Sparkles,
  FileText,
  Download,
  Eye
} from 'lucide-react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Helper to determine if status is considered completed
function isTaskCompleted(status?: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return (
    s.includes('completed') ||
    s.includes('complete') ||
    s.includes('closed') ||
    s.includes('filed') ||
    s.includes('done')
  );
}

// Status color badges
function getStatusBadgeStyle(status?: string | null) {
  const s = (status || '').toLowerCase().trim();
  if (isTaskCompleted(s)) {
    return {
      bg: 'rgba(16, 185, 129, 0.12)',
      text: '#059669',
      border: 'rgba(16, 185, 129, 0.3)',
      dot: '#10b981'
    };
  }
  if (s.includes('progress') || s.includes('working') || s.includes('active')) {
    return {
      bg: 'rgba(37, 99, 235, 0.12)',
      text: '#2563eb',
      border: 'rgba(37, 99, 235, 0.3)',
      dot: '#3b82f6'
    };
  }
  if (s.includes('review') || s.includes('checking') || s.includes('draft') || s.includes('queries')) {
    return {
      bg: 'rgba(245, 158, 11, 0.12)',
      text: '#d97706',
      border: 'rgba(245, 158, 11, 0.3)',
      dot: '#f59e0b'
    };
  }
  if (s.includes('waiting') || s.includes('hold') || s.includes('access') || s.includes('doc')) {
    return {
      bg: 'rgba(236, 72, 153, 0.12)',
      text: '#db2777',
      border: 'rgba(236, 72, 153, 0.3)',
      dot: '#ec4899'
    };
  }
  return {
    bg: 'rgba(100, 116, 139, 0.12)',
    text: 'var(--text-secondary, #64748b)',
    border: 'rgba(100, 116, 139, 0.25)',
    dot: '#94a3b8'
  };
}

// Priority color badge
function getPriorityBadge(priority?: string | null) {
  const p = (priority || 'medium').toLowerCase();
  if (p === 'urgent') return { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', label: 'Urgent' };
  if (p === 'high') return { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316', label: 'High' };
  if (p === 'medium') return { bg: 'rgba(59, 130, 246, 0.12)', text: '#3b82f6', label: 'Medium' };
  return { bg: 'rgba(107, 114, 128, 0.12)', text: '#6b7280', label: 'Low' };
}

export default function NewZealandReports() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [partners, setPartners] = useState<User[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [auditors, setAuditors] = useState<Auditor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Month & Year Selection
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth()); // 0-indexed (0 = Jan)
  const [dateBasis, setDateBasis] = useState<'deadline' | 'created_at' | 'completed_at' | 'both'>('both');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPartner, setFilterPartner] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTaskType, setFilterTaskType] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [showPdfModal, setShowPdfModal] = useState<boolean>(false);

  // Fetch New Zealand data strictly scoped to New Zealand
  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);

      // 1. Fetch NZ Tasks
      const { data: taskData, error: taskErr } = await supabase
        .from('tasks')
        .select('*')
        .eq('country', 'New Zealand')
        .order('created_at', { ascending: false });

      if (taskErr) console.error('Error fetching NZ tasks:', taskErr);

      // 2. Fetch NZ Companies
      const { data: compData, error: compErr } = await supabase
        .from('companies')
        .select('*')
        .eq('country', 'New Zealand');

      if (compErr) console.error('Error fetching NZ companies:', compErr);

      // 3. Fetch ONLY New Zealand Partners & Users (strictly isolated to New Zealand)
      const { data: userData, error: userErr } = await supabase
        .from('users')
        .select('*')
        .eq('country', 'New Zealand')
        .order('username', { ascending: true });

      if (userErr) console.error('Error fetching NZ users:', userErr);

      // 4. Fetch Task Types
      const { data: ttData, error: ttErr } = await supabase
        .from('task_types')
        .select('*');

      if (ttErr) console.error('Error fetching task types:', ttErr);

      // 5. Fetch Auditors
      const { data: audData, error: audErr } = await supabase
        .from('auditors')
        .select('*');

      if (audErr) console.error('Error fetching auditors:', audErr);

      setTasks(taskData || []);
      setCompanies(compData || []);
      setPartners(userData || []);
      setTaskTypes(ttData || []);
      setAuditors(audData || []);
    } catch (err) {
      console.error('Failed to load NZ report data', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Selected Month formatted string: e.g. "2026-08"
  const selectedMonthStr = useMemo(() => {
    const mm = String(selectedMonth + 1).padStart(2, '0');
    return `${selectedYear}-${mm}`;
  }, [selectedYear, selectedMonth]);

  const selectedMonthLabel = useMemo(() => {
    return `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
  }, [selectedMonth, selectedYear]);

  // Month navigation helpers
  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(y => y - 1);
    } else {
      setSelectedMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(y => y + 1);
    } else {
      setSelectedMonth(m => m + 1);
    }
  };

  const handleCurrentMonth = () => {
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth());
  };

  // Month task distribution counts (for badges on month pills)
  const monthTaskCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (let i = 0; i < 12; i++) counts[i] = 0;

    tasks.forEach(t => {
      const dDeadline = t.deadline?.slice(0, 7);
      const dCreated = t.created_at?.slice(0, 7);
      const dCompleted = t.completed_at?.slice(0, 7);
      const targetPrefix = `${selectedYear}-`;

      for (let m = 0; m < 12; m++) {
        const mm = String(m + 1).padStart(2, '0');
        const monthKey = `${targetPrefix}${mm}`;
        if (dateBasis === 'deadline') {
          if (dDeadline === monthKey) counts[m] = (counts[m] || 0) + 1;
        } else if (dateBasis === 'created_at') {
          if (dCreated === monthKey) counts[m] = (counts[m] || 0) + 1;
        } else if (dateBasis === 'completed_at') {
          if (dCompleted === monthKey || (isTaskCompleted(t.status) && (dDeadline === monthKey || dCreated === monthKey))) {
            counts[m] = (counts[m] || 0) + 1;
          }
        } else {
          if (dDeadline === monthKey || dCreated === monthKey) {
            counts[m] = (counts[m] || 0) + 1;
          }
        }
      }
    });
    return counts;
  }, [tasks, selectedYear, dateBasis]);

  // Filter tasks for the selected month
  const monthlyTasks = useMemo(() => {
    return tasks.filter(t => {
      const dDeadline = t.deadline?.slice(0, 7);
      const dCreated = t.created_at?.slice(0, 7);
      const dCompleted = t.completed_at?.slice(0, 7);

      if (dateBasis === 'deadline') {
        return dDeadline === selectedMonthStr;
      }
      if (dateBasis === 'created_at') {
        return dCreated === selectedMonthStr;
      }
      if (dateBasis === 'completed_at') {
        return dCompleted === selectedMonthStr || (isTaskCompleted(t.status) && (dDeadline === selectedMonthStr || dCreated === selectedMonthStr));
      }
      // 'both': matches either deadline or created_at
      return dDeadline === selectedMonthStr || dCreated === selectedMonthStr;
    });
  }, [tasks, selectedMonthStr, dateBasis]);

  // Partner Map & lookup (strictly NZ partners)
  const partnerMap = useMemo(() => {
    return new Map<string, User>(partners.map(p => [p.id, p]));
  }, [partners]);

  // Executive Metrics for the Month
  const metrics = useMemo(() => {
    const total = monthlyTasks.length;
    let completed = 0;
    const activePartnerSet = new Set<string>();

    monthlyTasks.forEach(t => {
      if (isTaskCompleted(t.status)) {
        completed++;
      }
      const pIds = getActivePartnerIds(t);
      pIds.forEach(id => {
        if (partnerMap.has(id)) {
          activePartnerSet.add(id);
        }
      });
    });

    const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0';
    const pending = total - completed;

    return {
      total,
      completed,
      pending,
      completionRate,
      activePartnersCount: activePartnerSet.size
    };
  }, [monthlyTasks, partnerMap]);

  // Partner-wise Breakdown calculation (scoped only to NZ partners with tasks)
  const partnerBreakdown = useMemo(() => {
    const map: Record<string, {
      partnerId: string;
      name: string;
      role: string;
      totalTasks: number;
      completedTasks: number;
      tasks: Task[];
    }> = {};

    monthlyTasks.forEach(task => {
      const activeIds = getActivePartnerIds(task);
      const completed = isTaskCompleted(task.status);

      // Filter activeIds to only include recognized NZ partners
      const validPartnerIds = activeIds.filter(id => partnerMap.has(id));

      if (validPartnerIds.length === 0) {
        const unassignedKey = 'unassigned';
        if (!map[unassignedKey]) {
          map[unassignedKey] = {
            partnerId: 'unassigned',
            name: 'Unassigned',
            role: 'None',
            totalTasks: 0,
            completedTasks: 0,
            tasks: []
          };
        }
        map[unassignedKey].totalTasks++;
        if (completed) map[unassignedKey].completedTasks++;
        map[unassignedKey].tasks.push(task);
      } else {
        validPartnerIds.forEach(pId => {
          if (!map[pId]) {
            const user = partnerMap.get(pId);
            map[pId] = {
              partnerId: pId,
              name: user?.username || 'Unknown Partner',
              role: user?.role || 'Partner',
              totalTasks: 0,
              completedTasks: 0,
              tasks: []
            };
          }
          map[pId].totalTasks++;
          if (completed) map[pId].completedTasks++;
          map[pId].tasks.push(task);
        });
      }
    });

    const list = Object.values(map).map(row => ({
      ...row,
      completionRate: row.totalTasks > 0 ? `${((row.completedTasks / row.totalTasks) * 100).toFixed(1)}%` : '0%'
    }));

    // Sort by completed tasks descending, then total tasks
    list.sort((a, b) => b.completedTasks - a.completedTasks || b.totalTasks - a.totalTasks);
    return list;
  }, [monthlyTasks, partnerMap]);

  // Filtered Tasks for the detailed table
  const filteredTasks = useMemo(() => {
    return monthlyTasks.filter(task => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const comp = companies.find(c => c.id === task.company_id)?.company_name?.toLowerCase() || '';
        const title = (task.title || '').toLowerCase();
        const desc = (task.description || '').toLowerCase();
        const pIds = getActivePartnerIds(task);
        const pNames = pIds.map(id => partnerMap.get(id)?.username?.toLowerCase() || '').join(' ');

        if (!comp.includes(q) && !title.includes(q) && !desc.includes(q) && !pNames.includes(q) && !task.id.toLowerCase().includes(q)) {
          return false;
        }
      }

      // 2. Partner Filter
      if (filterPartner !== 'all') {
        const pIds = getActivePartnerIds(task);
        if (filterPartner === 'unassigned') {
          const hasValidPartner = pIds.some(id => partnerMap.has(id));
          if (hasValidPartner) return false;
        } else {
          if (!pIds.includes(filterPartner)) return false;
        }
      }

      // 3. Status Filter
      if (filterStatus !== 'all') {
        if (filterStatus === 'completed') {
          if (!isTaskCompleted(task.status)) return false;
        } else if (filterStatus === 'pending') {
          if (isTaskCompleted(task.status)) return false;
        } else {
          if ((task.status || '').toLowerCase() !== filterStatus.toLowerCase()) return false;
        }
      }

      // 4. Task Type Filter
      if (filterTaskType !== 'all') {
        const ids = task.task_type_ids?.length
          ? task.task_type_ids
          : (task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()) : []);
        if (!ids.includes(filterTaskType)) return false;
      }

      // 5. Priority Filter
      if (filterPriority !== 'all') {
        if ((task.priority || '').toLowerCase() !== filterPriority.toLowerCase()) return false;
      }

      return true;
    });
  }, [monthlyTasks, searchQuery, filterPartner, filterStatus, filterTaskType, filterPriority, companies, partnerMap]);

  // Export to Excel handler
  const handleExportExcel = async () => {
    const partnerSummaryRows: NzPartnerSummaryRow[] = partnerBreakdown.map(p => ({
      partnerId: p.partnerId,
      name: p.name,
      role: p.role,
      totalTasks: p.totalTasks,
      completedTasks: p.completedTasks,
      completionRate: p.completionRate
    }));

    await exportNzMonthlyReportExcel(
      filteredTasks,
      {
        tasks: monthlyTasks,
        companies,
        partners,
        taskTypes,
        auditors,
        country: 'New Zealand'
      },
      selectedMonthLabel,
      {
        partnerSummary: partnerSummaryRows
      }
    );
  };

  // Print Handler
  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '14px' }}>
        <RefreshCw className="animate-spin" size={32} color="var(--accent, #2563eb)" />
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Loading New Zealand Monthly Report...
        </div>
      </div>
    );
  }

  return (
    <div className="nz-reports-container animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      
      {/* ─── Header & Action Bar ─── */}
      <div className="card glass reports-header" style={{
        padding: '24px 28px',
        borderRadius: '18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '18px',
        background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%)',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.15) 0%, rgba(29, 78, 216, 0.05) 100%)',
            border: '1px solid rgba(37, 99, 235, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            boxShadow: '0 2px 8px rgba(37, 99, 235, 0.12)'
          }}>
            <CountryFlag code="NZ" name="New Zealand" flagEmoji="🇳🇿" size={30} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 750, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                New Zealand Monthly Reports
              </h1>
              <span style={{
                fontSize: '11.5px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '3px 8px',
                borderRadius: '6px',
                background: 'rgba(37, 99, 235, 0.12)',
                color: 'var(--accent, #2563eb)',
                border: '1px solid rgba(37, 99, 235, 0.2)'
              }}>
                NZ Scope
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '13.5px', color: 'var(--text-secondary)' }}>
              Monthly task completions and partner workloads for <strong>{selectedMonthLabel}</strong>.
            </p>
          </div>
        </div>

        {/* Top Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={fetchData}
            disabled={refreshing}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '9px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600
            }}
            title="Refresh Data"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setShowPdfModal(true)}
            className="btn btn-secondary no-print"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '9px 15px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 650,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              cursor: 'pointer'
            }}
            title="Export as PDF / Print Official Report"
          >
            <FileText size={16} color="var(--accent, #2563eb)" />
            <span>Export as PDF</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="btn btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 16px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 650,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              border: 'none',
              boxShadow: '0 3px 12px rgba(16, 185, 129, 0.25)'
            }}
            title="Export to Excel (.xlsx)"
          >
            <FileSpreadsheet size={16} />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* ─── Monthly Selector Hub ─── */}
      <div className="card glass" style={{
        padding: '20px 24px',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        background: 'var(--bg-secondary)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          
          {/* Year & Month Picker Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-tertiary)', padding: '3px', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <button
                onClick={handlePrevMonth}
                className="btn btn-secondary"
                style={{ padding: '6px 9px', borderRadius: '7px', border: 'none', background: 'transparent' }}
                title="Previous Month"
              >
                <ChevronLeft size={16} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 8px', fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
                <Calendar size={16} color="var(--accent)" />
                <span>{MONTH_NAMES[selectedMonth]}</span>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(parseInt(e.target.value))}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '15px',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    outline: 'none',
                    padding: '2px'
                  }}
                >
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                  <option value={2027}>2027</option>
                </select>
              </div>
              <button
                onClick={handleNextMonth}
                className="btn btn-secondary"
                style={{ padding: '6px 9px', borderRadius: '7px', border: 'none', background: 'transparent' }}
                title="Next Month"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <button
              onClick={handleCurrentMonth}
              style={{
                fontSize: '12.5px',
                fontWeight: 600,
                padding: '7px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: selectedMonth === now.getMonth() && selectedYear === now.getFullYear() ? 'var(--accent-light)' : 'transparent',
                color: selectedMonth === now.getMonth() && selectedYear === now.getFullYear() ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              Current Month
            </button>
          </div>

          {/* Date Basis Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', fontWeight: 600 }}>Filter basis:</span>
            <div style={{
              display: 'flex',
              background: 'var(--bg-tertiary)',
              padding: '3px',
              borderRadius: '9px',
              border: '1px solid var(--border)'
            }}>
              {(['both', 'deadline', 'created_at', 'completed_at'] as const).map(basis => {
                const isSelected = dateBasis === basis;
                const label = basis === 'both' ? 'Active / Due' : basis === 'deadline' ? 'Due Date' : basis === 'created_at' ? 'Created Date' : 'Completed Date';
                return (
                  <button
                    key={basis}
                    onClick={() => setDateBasis(basis)}
                    style={{
                      padding: '5px 11px',
                      borderRadius: '7px',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: isSelected ? 700 : 500,
                      background: isSelected ? 'var(--bg-secondary)' : 'transparent',
                      color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                      boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Month Pills Bar (12 Months) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
          gap: '6px',
          paddingTop: '8px',
          borderTop: '1px solid var(--border-light)'
        }}>
          {MONTH_NAMES.map((mName, idx) => {
            const isSelected = selectedMonth === idx;
            const count = monthTaskCounts[idx] || 0;
            return (
              <button
                key={mName}
                onClick={() => setSelectedMonth(idx)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px 4px',
                  borderRadius: '10px',
                  border: isSelected ? '1.5px solid var(--accent)' : '1px solid var(--border-light)',
                  background: isSelected ? 'var(--accent-light, rgba(37, 99, 235, 0.08))' : 'var(--bg-tertiary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                }}
              >
                <span style={{
                  fontSize: '12px',
                  fontWeight: isSelected ? 750 : 600,
                  color: isSelected ? 'var(--accent)' : 'var(--text-primary)'
                }}>
                  {mName.slice(0, 3)}
                </span>
                <span style={{
                  fontSize: '10.5px',
                  fontWeight: 600,
                  color: count > 0 ? (isSelected ? 'var(--accent)' : 'var(--text-secondary)') : 'var(--text-tertiary)',
                  marginTop: '2px'
                }}>
                  {count} {count === 1 ? 'task' : 'tasks'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Executive Stat Cards (Top Metrics - Clickable Filters) ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px'
      }}>
        {/* Card 1: Total Tasks Completed (Click to filter by completed) */}
        <div
          className="card glass"
          onClick={() => setFilterStatus(prev => (prev === 'completed' ? 'all' : 'completed'))}
          style={{
            padding: '22px 24px',
            borderRadius: '18px',
            background: filterStatus === 'completed'
              ? 'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(16, 185, 129, 0.14) 100%)'
              : 'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(16, 185, 129, 0.05) 100%)',
            border: filterStatus === 'completed' ? '2px solid #10b981' : '1px solid rgba(16, 185, 129, 0.25)',
            boxShadow: filterStatus === 'completed' ? '0 6px 24px rgba(16, 185, 129, 0.22)' : '0 4px 16px rgba(16, 185, 129, 0.06)',
            position: 'relative',
            overflow: 'hidden',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          onMouseEnter={e => {
            if (filterStatus !== 'completed') {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.borderColor = '#10b981';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.18)';
            }
          }}
          onMouseLeave={e => {
            if (filterStatus !== 'completed') {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.25)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(16, 185, 129, 0.06)';
            }
          }}
          title={filterStatus === 'completed' ? 'Click to show all tasks' : 'Click to filter only completed tasks'}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 650, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Tasks Completed
            </span>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: filterStatus === 'completed' ? '#10b981' : 'rgba(16, 185, 129, 0.15)',
              color: filterStatus === 'completed' ? '#ffffff' : '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}>
              <CheckCircle2 size={20} color={filterStatus === 'completed' ? '#ffffff' : '#10b981'} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontSize: '38px', fontWeight: 800, color: '#10b981', lineHeight: 1 }}>
              {metrics.completed}
            </span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-tertiary)' }}>
              / {metrics.total} total
            </span>
            {filterStatus === 'completed' && (
              <span style={{
                marginLeft: 'auto',
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                background: '#10b981',
                color: '#ffffff'
              }}>
                Filtered
              </span>
            )}
          </div>
          {/* Completion Rate Progress bar */}
          <div style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, marginBottom: '5px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Completion Rate</span>
              <span style={{ color: '#10b981' }}>{metrics.completionRate}%</span>
            </div>
            <div style={{ width: '100%', height: '7px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                width: `${metrics.completionRate}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                borderRadius: '4px',
                transition: 'width 0.4s ease'
              }} />
            </div>
          </div>
        </div>

        {/* Card 2: Total Tasks in Month (Click to reset and show all tasks) */}
        <div
          className="card glass"
          onClick={() => {
            setFilterStatus('all');
            setFilterPartner('all');
            setFilterTaskType('all');
            setFilterPriority('all');
            setSearchQuery('');
          }}
          style={{
            padding: '22px 24px',
            borderRadius: '18px',
            background: filterStatus === 'all' && filterPartner === 'all' && filterTaskType === 'all' && filterPriority === 'all' && !searchQuery
              ? 'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(59, 130, 246, 0.12) 100%)'
              : 'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(59, 130, 246, 0.05) 100%)',
            border: filterStatus === 'all' && filterPartner === 'all' && filterTaskType === 'all' && filterPriority === 'all' && !searchQuery
              ? '2px solid #3b82f6'
              : '1px solid rgba(59, 130, 246, 0.25)',
            boxShadow: filterStatus === 'all' && filterPartner === 'all' && filterTaskType === 'all' && filterPriority === 'all' && !searchQuery
              ? '0 6px 24px rgba(59, 130, 246, 0.18)'
              : '0 4px 16px rgba(59, 130, 246, 0.06)',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-3px)';
            e.currentTarget.style.borderColor = '#3b82f6';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(59, 130, 246, 0.18)';
          }}
          onMouseLeave={e => {
            const isDefault = filterStatus === 'all' && filterPartner === 'all' && filterTaskType === 'all' && filterPriority === 'all' && !searchQuery;
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = isDefault ? '#3b82f6' : 'rgba(59, 130, 246, 0.25)';
            e.currentTarget.style.boxShadow = isDefault ? '0 6px 24px rgba(59, 130, 246, 0.18)' : '0 4px 16px rgba(59, 130, 246, 0.06)';
          }}
          title="Click to reset filters and view all tasks for this month"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 650, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Tasks in Month
            </span>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'rgba(59, 130, 246, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Briefcase size={20} color="#3b82f6" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '38px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {metrics.total}
            </span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#3b82f6' }}>
              tasks scheduled
            </span>
            {filterStatus === 'all' && filterPartner === 'all' && !searchQuery && (
              <span style={{
                marginLeft: 'auto',
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.12)',
                color: '#3b82f6',
                border: '1px solid rgba(59, 130, 246, 0.2)'
              }}>
                All Tasks
              </span>
            )}
          </div>
          <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Scheduled / active during {selectedMonthLabel}
          </div>
        </div>

        {/* Card 3: Pending / In Progress Tasks (Click to filter by pending) */}
        <div
          className="card glass"
          onClick={() => setFilterStatus(prev => (prev === 'pending' ? 'all' : 'pending'))}
          style={{
            padding: '22px 24px',
            borderRadius: '18px',
            background: filterStatus === 'pending'
              ? 'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(245, 158, 11, 0.14) 100%)'
              : 'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(245, 158, 11, 0.05) 100%)',
            border: filterStatus === 'pending' ? '2px solid #f59e0b' : '1px solid rgba(245, 158, 11, 0.25)',
            boxShadow: filterStatus === 'pending' ? '0 6px 24px rgba(245, 158, 11, 0.22)' : '0 4px 16px rgba(245, 158, 11, 0.06)',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          onMouseEnter={e => {
            if (filterStatus !== 'pending') {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.borderColor = '#f59e0b';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(245, 158, 11, 0.18)';
            }
          }}
          onMouseLeave={e => {
            if (filterStatus !== 'pending') {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.25)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(245, 158, 11, 0.06)';
            }
          }}
          title={filterStatus === 'pending' ? 'Click to show all tasks' : 'Click to filter only pending / in-progress tasks'}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 650, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Pending Tasks
            </span>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: filterStatus === 'pending' ? '#f59e0b' : 'rgba(245, 158, 11, 0.15)',
              color: filterStatus === 'pending' ? '#ffffff' : '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}>
              <TrendingUp size={20} color={filterStatus === 'pending' ? '#ffffff' : '#f59e0b'} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '38px', fontWeight: 800, color: '#f59e0b', lineHeight: 1 }}>
              {metrics.pending}
            </span>
            <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-tertiary)' }}>
              in progress / review
            </span>
            {filterStatus === 'pending' && (
              <span style={{
                marginLeft: 'auto',
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                background: '#f59e0b',
                color: '#ffffff'
              }}>
                Filtered
              </span>
            )}
          </div>
          <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Remaining tasks to complete in {MONTH_NAMES[selectedMonth]}
          </div>
        </div>

        {/* Card 4: Active Partners (Click to jump to partner breakdown section) */}
        <div
          className="card glass"
          onClick={() => {
            const section = document.getElementById('nz-partner-breakdown-section');
            if (section) {
              section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }}
          style={{
            padding: '22px 24px',
            borderRadius: '18px',
            background: 'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(139, 92, 246, 0.05) 100%)',
            border: '1px solid rgba(139, 92, 246, 0.25)',
            boxShadow: '0 4px 16px rgba(139, 92, 246, 0.06)',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-3px)';
            e.currentTarget.style.borderColor = '#8b5cf6';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(139, 92, 246, 0.18)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.25)';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(139, 92, 246, 0.06)';
          }}
          title="Click to view partner-wise task breakdown"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 650, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active Partners
            </span>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'rgba(139, 92, 246, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Users size={20} color="#8b5cf6" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '38px', fontWeight: 800, color: '#8b5cf6', lineHeight: 1 }}>
              {metrics.activePartnersCount}
            </span>
            <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-tertiary)' }}>
              team members
            </span>
          </div>
          <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Handling NZ tasks during {selectedMonthLabel}
          </div>
        </div>
      </div>

      {/* ─── Partner-wise Task Details & Distribution Section ─── */}
      <div id="nz-partner-breakdown-section" className="card glass" style={{
        padding: '24px',
        borderRadius: '18px',
        border: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        boxShadow: 'var(--card-shadow)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} color="var(--accent)" />
              Partner-wise Task Details ({selectedMonthLabel})
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Click on any partner to instantly filter the task table below.
            </p>
          </div>

          {filterPartner !== 'all' && (
            <button
              onClick={() => setFilterPartner('all')}
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '7px', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <X size={13} /> Reset Partner Filter
            </button>
          )}
        </div>

        {partnerBreakdown.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-tertiary)', fontSize: '13.5px' }}>
            No task records found for {selectedMonthLabel}.
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '14px'
          }}>
            {partnerBreakdown.map((p, idx) => {
              const isSelected = filterPartner === p.partnerId;
              const initials = p.name.slice(0, 2).toUpperCase();

              return (
                <div
                  key={p.partnerId}
                  onClick={() => setFilterPartner(isSelected ? 'all' : p.partnerId)}
                  style={{
                    padding: '16px 18px',
                    borderRadius: '14px',
                    border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: isSelected ? 'var(--accent-light, rgba(37,99,235,0.08))' : 'var(--bg-tertiary)',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                    boxShadow: isSelected ? '0 4px 14px rgba(37, 99, 235, 0.15)' : '0 1px 3px rgba(0,0,0,0.02)'
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = 'var(--accent)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.transform = 'none';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: `linear-gradient(135deg, ${idx % 2 === 0 ? '#3b82f6, #1d4ed8' : '#8b5cf6, #6d28d9'})`,
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '13px',
                        fontWeight: 700
                      }}>
                        {initials}
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                          {p.role}
                        </div>
                      </div>
                    </div>

                    <span style={{
                      fontSize: '11.5px',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '6px',
                      background: isSelected ? 'var(--accent)' : 'var(--bg-secondary)',
                      color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                      border: '1px solid var(--border)'
                    }}>
                      {p.completionRate}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', paddingTop: '10px', borderTop: '1px solid var(--border-light)' }}>
                    <div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Total Tasks</div>
                      <div style={{ fontSize: '15px', fontWeight: 750, color: 'var(--text-primary)' }}>{p.totalTasks}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Completed</div>
                      <div style={{ fontSize: '15px', fontWeight: 750, color: '#10b981' }}>{p.completedTasks}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Detailed Monthly Task Table (CR Number Removed) ─── */}
      <div className="card glass" style={{
        padding: '24px',
        borderRadius: '18px',
        border: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        boxShadow: 'var(--card-shadow)'
      }}>
        {/* Table Controls & Filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Briefcase size={18} color="var(--accent)" />
                Monthly Task Log ({filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'})
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                Showing New Zealand monthly task details.
              </p>
            </div>

            {/* Quick Search */}
            <div style={{ position: 'relative', minWidth: '240px' }}>
              <Search size={15} color="var(--text-tertiary)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                className="input"
                placeholder="Search company, partner, task..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  paddingLeft: '34px',
                  paddingRight: searchQuery ? '30px' : '12px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  height: '38px'
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-tertiary)'
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Filter Dropdowns Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
            padding: '12px 14px',
            background: 'var(--bg-tertiary)',
            borderRadius: '12px',
            border: '1px solid var(--border-light)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 650, color: 'var(--text-secondary)' }}>
              <Filter size={14} color="var(--accent)" />
              <span>Filters:</span>
            </div>

            {/* Partner Filter (strictly NZ partners) */}
            <select
              value={filterPartner}
              onChange={e => setFilterPartner(e.target.value)}
              className="input"
              style={{ height: '34px', fontSize: '12.5px', padding: '4px 10px', borderRadius: '8px', minWidth: '130px' }}
            >
              <option value="all">All Partners</option>
              {partners.map(p => (
                <option key={p.id} value={p.id}>{p.username}</option>
              ))}
              <option value="unassigned">Unassigned</option>
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="input"
              style={{ height: '34px', fontSize: '12.5px', padding: '4px 10px', borderRadius: '8px', minWidth: '130px' }}
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed Only</option>
              <option value="pending">Pending Only</option>
              <option value="In Progress">In Progress</option>
              <option value="Waiting for documents">Waiting for documents</option>
              <option value="Sent for review 1">Sent for review 1</option>
              <option value="Xero access required">Xero access required</option>
            </select>

            {/* Task Type Filter */}
            <select
              value={filterTaskType}
              onChange={e => setFilterTaskType(e.target.value)}
              className="input"
              style={{ height: '34px', fontSize: '12.5px', padding: '4px 10px', borderRadius: '8px', minWidth: '130px' }}
            >
              <option value="all">All Task Types</option>
              {taskTypes.map(tt => (
                <option key={tt.id} value={tt.id}>{tt.name}</option>
              ))}
            </select>

            {/* Priority Filter */}
            <select
              value={filterPriority}
              onChange={e => setFilterPriority(e.target.value)}
              className="input"
              style={{ height: '34px', fontSize: '12.5px', padding: '4px 10px', borderRadius: '8px', minWidth: '110px' }}
            >
              <option value="all">All Priorities</option>
              <option value="Urgent">Urgent</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>

            {(filterPartner !== 'all' || filterStatus !== 'all' || filterTaskType !== 'all' || filterPriority !== 'all' || searchQuery) && (
              <button
                onClick={() => {
                  setFilterPartner('all');
                  setFilterStatus('all');
                  setFilterTaskType('all');
                  setFilterPriority('all');
                  setSearchQuery('');
                }}
                className="btn btn-secondary"
                style={{ height: '34px', fontSize: '12px', padding: '4px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <X size={13} /> Clear All
              </button>
            )}
          </div>
        </div>

        {/* The Task Table */}
        {filteredTasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-tertiary)' }}>
            <AlertCircle size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>No tasks found</div>
            <div style={{ fontSize: '13px', marginTop: '4px' }}>Try adjusting your search or filters for {selectedMonthLabel}.</div>
          </div>
        ) : (
          <div className="table-container" style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-secondary)', minWidth: '170px' }}>Company</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-secondary)', minWidth: '130px' }}>Task Type</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-secondary)', minWidth: '180px' }}>Description</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-secondary)', minWidth: '150px' }}>Assigned Partner(s)</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-secondary)', width: '90px' }}>Priority</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-secondary)', minWidth: '105px' }}>Due Date</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-secondary)', minWidth: '125px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map(task => {
                  const company = companies.find(c => c.id === task.company_id);
                  const ttIds = task.task_type_ids?.length
                    ? task.task_type_ids
                    : (task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()) : []);
                  const ttNames = ttIds.map(id => taskTypes.find(t => t.id === id)?.name).filter(Boolean).join(', ');
                  
                  const activePartnerIds = getActivePartnerIds(task);
                  const partnerNames = activePartnerIds
                    .map(id => partnerMap.get(id)?.username)
                    .filter(Boolean) as string[];
                  
                  const statusStyle = getStatusBadgeStyle(task.status);
                  const priorityStyle = getPriorityBadge(task.priority);

                  return (
                    <tr
                      key={task.id}
                      style={{
                        borderBottom: '1px solid var(--border-light)',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {/* Company Name */}
                      <td style={{ padding: '12px 14px', fontWeight: 650, color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Building2 size={14} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
                          <span>{company?.company_name || 'No Company'}</span>
                        </div>
                      </td>

                      {/* Task Type */}
                      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                        {ttNames ? (
                          <span style={{
                            fontSize: '11.5px',
                            fontWeight: 600,
                            padding: '3px 7px',
                            borderRadius: '5px',
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-primary)',
                            display: 'inline-block'
                          }}>
                            {ttNames}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                        )}
                      </td>

                      {/* Description */}
                      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', maxWidth: '240px' }} title={task.description || undefined}>
                        <div style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: '12.5px'
                        }}>
                          {task.description || <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No notes</span>}
                        </div>
                      </td>

                      {/* Assigned Partner(s) */}
                      <td style={{ padding: '12px 14px' }}>
                        {partnerNames.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {partnerNames.map((name, i) => (
                              <span
                                key={i}
                                style={{
                                  fontSize: '11.5px',
                                  fontWeight: 600,
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  background: 'rgba(37, 99, 235, 0.1)',
                                  color: 'var(--accent, #2563eb)',
                                  border: '1px solid rgba(37, 99, 235, 0.2)'
                                }}
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Unassigned</span>
                        )}
                      </td>

                      {/* Priority */}
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: '4px',
                          background: priorityStyle.bg,
                          color: priorityStyle.text
                        }}>
                          {priorityStyle.label}
                        </span>
                      </td>

                      {/* Due Date */}
                      <td style={{ padding: '12px 14px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                        {task.deadline ? formatDate(task.deadline) : '—'}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            padding: '3px 9px',
                            borderRadius: '12px',
                            background: statusStyle.bg,
                            color: statusStyle.text,
                            border: `1px solid ${statusStyle.border}`,
                            width: 'fit-content'
                          }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusStyle.dot }} />
                            {task.status || 'Pending'}
                          </span>
                          {isTaskCompleted(task.status) && task.completed_at && (
                            <span style={{ fontSize: '10px', color: '#059669', fontWeight: 600, paddingLeft: '2px' }}>
                              Completed: {formatDate(task.completed_at)}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── PDF Document Preview Modal ─── */}
      {showPdfModal && (
        <div
          className="modal-overlay no-print"
          onClick={() => setShowPdfModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            padding: '20px',
            boxSizing: 'border-box'
          }}
        >
          <div
            className="modal-content glass animate-fadeIn"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '900px',
              width: '95%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'hidden',
              borderRadius: '20px',
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.3)'
            }}
          >
            {/* Modal Top Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 24px',
              borderBottom: '1px solid var(--border-light)',
              background: 'var(--bg-tertiary)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(37, 99, 235, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <FileText size={18} color="var(--accent, #2563eb)" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    PDF Document Preview — {selectedMonthLabel}
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Publication-ready report formatted for A4 PDF export
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  onClick={() => {
                    window.print();
                  }}
                  className="btn btn-primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '8px 16px',
                    borderRadius: '9px',
                    fontSize: '13px',
                    fontWeight: 650,
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    border: 'none',
                    boxShadow: '0 2px 10px rgba(37, 99, 235, 0.3)'
                  }}
                >
                  <Printer size={15} />
                  <span>Save as PDF / Print</span>
                </button>

                <button
                  onClick={() => setShowPdfModal(false)}
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)'
                  }}
                  title="Close preview"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal Body: A4 Paper Preview */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px',
              background: '#475569',
              display: 'flex',
              justifyContent: 'center'
            }}>
              <div style={{
                width: '100%',
                maxWidth: '800px',
                background: '#ffffff',
                color: '#0f172a',
                padding: '36px 40px',
                borderRadius: '6px',
                boxShadow: '0 12px 36px rgba(0, 0, 0, 0.25)',
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
              }}>
                {/* Header in Preview */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2.5px solid #2563eb', paddingBottom: '14px', marginBottom: '18px' }}>
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.01em' }}>
                      NEW ZEALAND MONTHLY TASK REPORT
                    </h2>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                      The Digital Ledger &bull; Monthly Task Performance & Partner Distribution
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '11px', color: '#334155', lineHeight: 1.45 }}>
                    <div><strong>Country:</strong> New Zealand 🇳🇿</div>
                    <div><strong>Reporting Period:</strong> {selectedMonthLabel}</div>
                    <div><strong>Generated Date:</strong> {formatDate(new Date())}</div>
                  </div>
                </div>

                {/* 1. Executive Summary in Preview */}
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: 750, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px', borderLeft: '3px solid #2563eb', paddingLeft: '8px' }}>
                    1. Executive Performance Summary
                  </h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9' }}>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Total Tasks Scheduled</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Total Tasks Completed</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Pending Tasks</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Completion Rate</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Active Partners</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px' }}><strong>{metrics.total}</strong></td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', color: '#059669', fontWeight: 700 }}>{metrics.completed}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', color: '#d97706', fontWeight: 700 }}>{metrics.pending}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', color: '#2563eb', fontWeight: 700 }}>{metrics.completionRate}%</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px' }}><strong>{metrics.activePartnersCount}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 2. Partner-Wise Breakdown in Preview */}
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: 750, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px', borderLeft: '3px solid #2563eb', paddingLeft: '8px' }}>
                    2. Partner-Wise Task Distribution ({selectedMonthLabel})
                  </h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9' }}>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'left', width: '35px' }}>#</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'left' }}>Partner Name</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'left' }}>Role</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>Total Tasks</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>Completed</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>Pending</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'right' }}>Completion Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {partnerBreakdown.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'center', color: '#64748b' }}>No partner assignments for this month.</td>
                        </tr>
                      ) : (
                        partnerBreakdown.map((p, i) => (
                          <tr key={p.partnerId} style={{ background: i % 2 === 1 ? '#f8fafc' : '#ffffff' }}>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px' }}>{i + 1}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px' }}><strong>{p.name}</strong></td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px' }}>{p.role}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>{p.totalTasks}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center', color: '#059669', fontWeight: 700 }}>{p.completedTasks}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>{p.totalTasks - p.completedTasks}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{p.completionRate}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 3. Task Log in Preview */}
                <div>
                  <h4 style={{ fontSize: '12px', fontWeight: 750, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px', borderLeft: '3px solid #2563eb', paddingLeft: '8px' }}>
                    3. Detailed Monthly Task Log ({filteredTasks.length} {filteredTasks.length === 1 ? 'Task' : 'Tasks'})
                  </h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9' }}>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 7px', textAlign: 'left' }}>Company</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 7px', textAlign: 'left' }}>Task Type</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 7px', textAlign: 'left' }}>Description</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 7px', textAlign: 'left' }}>Partner(s)</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 7px', textAlign: 'left', width: '60px' }}>Priority</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 7px', textAlign: 'left', width: '75px' }}>Due Date</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '6px 7px', textAlign: 'left', width: '85px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'center', color: '#64748b' }}>No tasks found for current selection.</td>
                        </tr>
                      ) : (
                        filteredTasks.map((task, i) => {
                          const company = companies.find(c => c.id === task.company_id);
                          const ttIds = task.task_type_ids?.length
                            ? task.task_type_ids
                            : (task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()) : []);
                          const ttNames = ttIds.map(id => taskTypes.find(t => t.id === id)?.name).filter(Boolean).join(', ');
                          const activePartnerIds = getActivePartnerIds(task);
                          const partnerNames = activePartnerIds.map(id => partnerMap.get(id)?.username).filter(Boolean) as string[];

                          return (
                            <tr key={task.id} style={{ background: i % 2 === 1 ? '#f8fafc' : '#ffffff' }}>
                              <td style={{ border: '1px solid #cbd5e1', padding: '5px 7px' }}><strong>{company?.company_name || 'No Company'}</strong></td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '5px 7px' }}>{ttNames || '—'}</td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '5px 7px' }}>{task.description || '—'}</td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '5px 7px' }}>{partnerNames.join(', ') || 'Unassigned'}</td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '5px 7px' }}>{task.priority || 'Medium'}</td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '5px 7px' }}>{task.deadline ? formatDate(task.deadline) : '—'}</td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '5px 7px' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 5px',
                                  borderRadius: '4px',
                                  fontSize: '9.5px',
                                  fontWeight: 700,
                                  background: isTaskCompleted(task.status) ? '#ecfdf5' : '#eff6ff',
                                  color: isTaskCompleted(task.status) ? '#059669' : '#2563eb'
                                }}>
                                  {task.status || 'Pending'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footer in Preview */}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '10px', marginTop: '24px', fontSize: '10px', color: '#94a3b8' }}>
                  <div>The Digital Ledger &bull; New Zealand Monthly Reports</div>
                  <div>Internal & Confidential Document</div>
                  <div>Report Generated: {formatDate(new Date())}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Dedicated Clean Printable Report Document (Hidden on screen, rendered on Print/PDF) ─── */}
      <div id="nz-printable-report" className="nz-printable-report">
        {/* Document Header */}
        <div className="report-doc-header">
          <div className="report-brand">
            <img src="/logo.png" alt="The Digital Ledger" className="report-logo" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
            <div>
              <h1 className="report-doc-title">NEW ZEALAND MONTHLY TASK REPORT</h1>
              <div className="report-doc-subtitle">The Digital Ledger &bull; Monthly Task Performance & Partner Distribution</div>
            </div>
          </div>
          <div className="report-doc-meta">
            <div><strong>Country:</strong> New Zealand 🇳🇿</div>
            <div><strong>Reporting Period:</strong> {selectedMonthLabel}</div>
            <div><strong>Filter Scope:</strong> {filterStatus === 'all' ? 'All Tasks' : filterStatus === 'completed' ? 'Completed Only' : 'Pending Only'}</div>
            <div><strong>Generated Date:</strong> {formatDate(new Date())}</div>
          </div>
        </div>

        {/* Section 1: Executive KPI Summary */}
        <div className="report-section">
          <h2 className="report-section-title">1. Executive Performance Summary</h2>
          <table className="report-kpi-table">
            <thead>
              <tr>
                <th>Total Tasks Scheduled</th>
                <th>Total Tasks Completed</th>
                <th>Pending Tasks</th>
                <th>Overall Completion Rate</th>
                <th>Active Partners</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>{metrics.total}</strong></td>
                <td style={{ color: '#059669', fontWeight: 700 }}>{metrics.completed}</td>
                <td style={{ color: '#d97706', fontWeight: 700 }}>{metrics.pending}</td>
                <td style={{ color: '#2563eb', fontWeight: 700 }}>{metrics.completionRate}%</td>
                <td><strong>{metrics.activePartnersCount}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Section 2: Partner-Wise Performance Summary */}
        <div className="report-section">
          <h2 className="report-section-title">2. Partner-Wise Task Distribution ({selectedMonthLabel})</h2>
          <table className="report-partner-table">
            <thead>
              <tr>
                <th style={{ width: '35px' }}>#</th>
                <th>Partner Name</th>
                <th>Role</th>
                <th style={{ textAlign: 'center' }}>Total Tasks Handled</th>
                <th style={{ textAlign: 'center' }}>Completed Tasks</th>
                <th style={{ textAlign: 'center' }}>Pending Tasks</th>
                <th style={{ textAlign: 'right' }}>Completion Rate</th>
              </tr>
            </thead>
            <tbody>
              {partnerBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: '#64748b' }}>No partner assignments for this month.</td>
                </tr>
              ) : (
                partnerBreakdown.map((p, i) => (
                  <tr key={p.partnerId}>
                    <td>{i + 1}</td>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.role}</td>
                    <td style={{ textAlign: 'center' }}>{p.totalTasks}</td>
                    <td style={{ textAlign: 'center', color: '#059669', fontWeight: 700 }}>{p.completedTasks}</td>
                    <td style={{ textAlign: 'center' }}>{p.totalTasks - p.completedTasks}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{p.completionRate}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Section 3: Detailed Monthly Task Log */}
        <div className="report-section">
          <h2 className="report-section-title">3. Detailed Monthly Task Log ({filteredTasks.length} {filteredTasks.length === 1 ? 'Task' : 'Tasks'})</h2>
          <table className="report-tasks-table">
            <thead>
              <tr>
                <th>Company Name</th>
                <th>Task Type</th>
                <th>Description</th>
                <th>Assigned Partner(s)</th>
                <th style={{ width: '65px' }}>Priority</th>
                <th style={{ width: '80px' }}>Due Date</th>
                <th style={{ width: '90px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: '#64748b' }}>No tasks found for the current selection.</td>
                </tr>
              ) : (
                filteredTasks.map(task => {
                  const company = companies.find(c => c.id === task.company_id);
                  const ttIds = task.task_type_ids?.length
                    ? task.task_type_ids
                    : (task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()) : []);
                  const ttNames = ttIds.map(id => taskTypes.find(t => t.id === id)?.name).filter(Boolean).join(', ');
                  const activePartnerIds = getActivePartnerIds(task);
                  const partnerNames = activePartnerIds.map(id => partnerMap.get(id)?.username).filter(Boolean) as string[];

                  return (
                    <tr key={task.id}>
                      <td><strong>{company?.company_name || 'No Company'}</strong></td>
                      <td>{ttNames || '—'}</td>
                      <td>{task.description || '—'}</td>
                      <td>{partnerNames.join(', ') || 'Unassigned'}</td>
                      <td>{task.priority || 'Medium'}</td>
                      <td>{task.deadline ? formatDate(task.deadline) : '—'}</td>
                      <td>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 700,
                          background: isTaskCompleted(task.status) ? '#ecfdf5' : '#eff6ff',
                          color: isTaskCompleted(task.status) ? '#059669' : '#2563eb',
                          border: `1px solid ${isTaskCompleted(task.status) ? '#a7f3d0' : '#bfdbfe'}`
                        }}>
                          {task.status || 'Pending'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Document Footer */}
        <div className="report-doc-footer">
          <div>The Digital Ledger &bull; New Zealand Monthly Reports</div>
          <div>Internal & Confidential Document</div>
          <div>Report Generated: {formatDate(new Date())}</div>
        </div>
      </div>

      {/* ─── Print & PDF Scoped Styles ─── */}
      <style jsx global>{`
        /* Hide printable report by default on screen */
        .nz-printable-report {
          display: none;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 14mm 14mm 14mm;
          }

          /* Force light theme & hide all web UI / dashboards */
          html, body {
            background: #ffffff !important;
            color: #0f172a !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Hide everything outside the report document */
          aside,
          .sidebar,
          .mobile-header,
          .mobile-overlay,
          nav,
          .no-print,
          .card:not(.nz-printable-report),
          .nz-reports-container > *:not(.nz-printable-report),
          header,
          button,
          select,
          input {
            display: none !important;
          }

          .main-content {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }

          /* Show the printable report cleanly */
          .nz-printable-report {
            display: block !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
          }

          .report-doc-header {
            display: flex !important;
            justify-content: space-between !important;
            align-items: flex-start !important;
            border-bottom: 2.5px solid #2563eb !important;
            padding-bottom: 12px !important;
            margin-bottom: 16px !important;
          }

          .report-brand {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
          }

          .report-logo {
            height: 36px !important;
            object-fit: contain !important;
          }

          .report-doc-title {
            font-size: 16px !important;
            font-weight: 800 !important;
            color: #0f172a !important;
            margin: 0 !important;
            letter-spacing: -0.01em !important;
          }

          .report-doc-subtitle {
            font-size: 10.5px !important;
            color: #64748b !important;
            margin-top: 2px !important;
          }

          .report-doc-meta {
            text-align: right !important;
            font-size: 10px !important;
            color: #334155 !important;
            line-height: 1.45 !important;
          }

          .report-section {
            margin-bottom: 16px !important;
            page-break-inside: auto !important;
          }

          .report-section-title {
            font-size: 11.5px !important;
            font-weight: 750 !important;
            color: #1e293b !important;
            margin: 0 0 6px 0 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.04em !important;
            border-left: 3px solid #2563eb !important;
            padding-left: 6px !important;
          }

          .report-kpi-table,
          .report-partner-table,
          .report-tasks-table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 10px !important;
            margin-bottom: 8px !important;
          }

          .report-kpi-table th,
          .report-kpi-table td,
          .report-partner-table th,
          .report-partner-table td,
          .report-tasks-table th,
          .report-tasks-table td {
            border: 1px solid #cbd5e1 !important;
            padding: 5px 7px !important;
            text-align: left !important;
          }

          .report-kpi-table th,
          .report-partner-table th,
          .report-tasks-table th {
            background-color: #f1f5f9 !important;
            color: #0f172a !important;
            font-weight: 700 !important;
            text-transform: uppercase !important;
            font-size: 9.5px !important;
            letter-spacing: 0.02em !important;
          }

          .report-tasks-table tr {
            page-break-inside: avoid !important;
          }

          .report-tasks-table tbody tr:nth-child(even) {
            background-color: #f8fafc !important;
          }

          .report-doc-footer {
            display: flex !important;
            justify-content: space-between !important;
            font-size: 9.5px !important;
            color: #94a3b8 !important;
            border-top: 1px solid #e2e8f0 !important;
            padding-top: 8px !important;
            margin-top: 18px !important;
          }
        }
      `}</style>

    </div>
  );
}

