'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, Task } from '@/lib/supabase';
import CountryFlag, { getCountryCode, getCanonicalCountryName } from '@/components/CountryFlag';
import * as XLSX from 'xlsx';
import {
  Users,
  Briefcase,
  Flame,
  Filter,
  Search,
  Download,
  RefreshCw,
  X,
  TrendingUp,
  Globe,
  Clock,
  Layers,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Calendar,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Shield,
  UserCheck,
  Sparkles,
  ArrowUpRight,
  SlidersHorizontal,
  BarChart3,
  Check,
  LayoutGrid,
  Table as TableIcon,
  PieChart,
  Activity
} from 'lucide-react';

interface CountryRecord {
  id: string;
  code: string;
  name: string;
  flag?: string;
}

interface WorkloadCompany {
  id: string;
  company_name: string;
  country?: string;
}

type DateRangePreset = 'all' | 'today' | 'this_week' | 'this_month' | 'this_year' | 'custom';
type DateFieldBasis = 'deadline' | 'created_at';
type WorkloadView = 'summary' | 'graphs' | 'cards';

// Helper to determine if a status is considered "completed"
function isStatusCompleted(statusName: string): boolean {
  if (!statusName) return false;
  const s = statusName.toLowerCase().trim();
  return (
    s.includes('completed') ||
    s.includes('complete') ||
    s.includes('closed') ||
    s.includes('filed') ||
    s.includes('done')
  );
}

// Refined, subtle status color palette
function getStatusTheme(statusName: string) {
  const s = (statusName || '').toLowerCase().trim();
  if (isStatusCompleted(s)) {
    return { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0', dot: '#10b981', bar: '#10b981' };
  }
  if (s.includes('in progress') || s.includes('progress') || s.includes('working') || s.includes('active')) {
    return { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe', dot: '#3b82f6', bar: '#3b82f6' };
  }
  if (s.includes('review') || s.includes('checking') || s.includes('draft')) {
    return { bg: '#fffbeb', text: '#92400e', border: '#fde68a', dot: '#f59e0b', bar: '#f59e0b' };
  }
  if (s.includes('query') || s.includes('hold') || s.includes('block') || s.includes('pending') || s.includes('waiting') || s.includes('doc')) {
    return { bg: '#fdf2f8', text: '#9d174d', border: '#fbcfe8', dot: '#ec4899', bar: '#ec4899' };
  }
  if (s.includes('ready') || s.includes('submitted')) {
    return { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0', dot: '#22c55e', bar: '#22c55e' };
  }
  return { bg: '#f8fafc', text: '#475569', border: '#e2e8f0', dot: '#64748b', bar: '#94a3b8' };
}

// Avatar gradient generator
const getAvatarGradient = (name: string, index: number) => {
  const gradients = [
    'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
    'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
    'linear-gradient(135deg, #10b981 0%, #047857 100%)',
    'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
    'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
    'linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)',
  ];
  return gradients[index % gradients.length];
};

interface PartnerWorkloadDashboardProps {
  isEmbedded?: boolean;
}

export default function PartnerWorkloadDashboard({ isEmbedded = false }: PartnerWorkloadDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Raw database data
  const [countries, setCountries] = useState<CountryRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [companies, setCompanies] = useState<WorkloadCompany[]>([]);
  const [dbStatuses, setDbStatuses] = useState<{ id: string; name: string; active?: boolean; country?: string }[]>([]);

  // Active country tab ('all' or country name)
  const [activeCountryTab, setActiveCountryTab] = useState<string>('all');

  // Active View ('summary' | 'matrix' | 'cards')
  const [currentView, setCurrentView] = useState<WorkloadView>('summary');

  // Expanded Partner rows (stores partner IDs)
  const [expandedPartners, setExpandedPartners] = useState<Record<string, boolean>>({});

  // Filter states
  const [searchPartner, setSearchPartner] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [dateBasis, setDateBasis] = useState<DateFieldBasis>('deadline');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Drill-down Modal State
  const [drilldownPartner, setDrilldownPartner] = useState<{ partner: User; countryName: string } | null>(null);
  const [modalSearch, setModalSearch] = useState<string>('');
  const [modalStatusFilter, setModalStatusFilter] = useState<string>('all');

  // Graph display toggle: show only partners with tasks (> 0) vs all partners
  const [graphShowActiveOnly, setGraphShowActiveOnly] = useState<boolean>(true);

  // Fetch all existing data (strictly read-only)
  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [countriesRes, usersRes, tasksRes, companiesRes, statusesRes] = await Promise.all([
        supabase.from('countries').select('id, code, name, flag').order('name'),
        supabase.from('users').select('id, username, role, country, email, created_at').order('username'),
        supabase.from('tasks').select('id, title, company_id, assigned_to, assigned_partners, status, priority, deadline, is_daily, country, created_at'),
        supabase.from('companies').select('id, company_name, country'),
        supabase.from('statuses').select('id, name, active, country').eq('active', true).order('name')
      ]);

      setCountries(countriesRes.data || []);
      setUsers(usersRes.data || []);
      setTasks(tasksRes.data || []);
      setCompanies(companiesRes.data || []);
      setDbStatuses(statusesRes.data || []);
    } catch (err) {
      console.error('Error loading partner workload data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Distinct roles for filter
  const distinctRoles = useMemo(() => {
    const roles = new Set<string>();
    users.forEach(u => {
      if (u.role && u.role.toLowerCase() !== 'admin') {
        roles.add(u.role);
      }
    });
    return Array.from(roles).sort();
  }, [users]);

  // Compute Date Boundaries based on selected preset
  const dateRangeBounds = useMemo<{ start: Date | null; end: Date | null }>(() => {
    if (datePreset === 'all') return { start: null, end: null };

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (datePreset === 'today') {
      return { start: startOfToday, end: endOfToday };
    }

    if (datePreset === 'this_week') {
      const currentDay = now.getDay();
      const diffToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() + diffToMonday);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      return { start: startOfWeek, end: endOfWeek };
    }

    if (datePreset === 'this_month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start: startOfMonth, end: endOfMonth };
    }

    if (datePreset === 'this_year') {
      const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { start: startOfYear, end: endOfYear };
    }

    if (datePreset === 'custom') {
      const start = customStartDate ? new Date(`${customStartDate}T00:00:00`) : null;
      const end = customEndDate ? new Date(`${customEndDate}T23:59:59.999`) : null;
      return { start, end };
    }

    return { start: null, end: null };
  }, [datePreset, customStartDate, customEndDate]);

  // Company Map for fast lookup
  const companyMap = useMemo(() => {
    const map = new Map<string, WorkloadCompany>();
    companies.forEach(c => map.set(c.id, c));
    return map;
  }, [companies]);

  // Normalized list of countries (Deduplicated by canonical ISO country code)
  const normalizedCountriesList = useMemo(() => {
    const countryMapByCode = new Map<string, CountryRecord>();

    // 1. From database countries table
    countries.forEach(c => {
      const code = getCountryCode(c.code, c.name);
      const name = getCanonicalCountryName(c.name || c.code);
      countryMapByCode.set(code, {
        id: c.id || `country-${code}`,
        code,
        name,
        flag: c.flag || '🌍'
      });
    });

    // 2. From users table
    users.forEach(u => {
      if (u.country && u.country.trim()) {
        const code = getCountryCode('', u.country.trim());
        const name = getCanonicalCountryName(u.country.trim());
        if (!countryMapByCode.has(code)) {
          countryMapByCode.set(code, {
            id: `custom-user-${code}`,
            code,
            name,
            flag: '🌍'
          });
        }
      }
    });

    // 3. From companies table
    companies.forEach(c => {
      if (c.country && c.country.trim()) {
        const code = getCountryCode('', c.country.trim());
        const name = getCanonicalCountryName(c.country.trim());
        if (!countryMapByCode.has(code)) {
          countryMapByCode.set(code, {
            id: `custom-comp-${code}`,
            code,
            name,
            flag: '🌍'
          });
        }
      }
    });

    if (countryMapByCode.size === 0) {
      countryMapByCode.set('BH', { id: 'default-bh', code: 'BH', name: 'Bahrain', flag: '🇧🇭' });
    }

    const list = Array.from(countryMapByCode.values());
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [countries, users, companies]);

  // Filter Tasks based on Date, Status, Priority
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      // 1. Status Filter
      if (selectedStatus !== 'all' && task.status !== selectedStatus) {
        return false;
      }

      // 2. Priority Filter
      if (priorityFilter !== 'all') {
        const p = (task.priority || '').toLowerCase();
        if (priorityFilter === 'urgent_high' && p !== 'urgent' && p !== 'high') return false;
        if (priorityFilter === 'medium' && p !== 'medium') return false;
        if (priorityFilter === 'low' && p !== 'low') return false;
      }

      // 3. Date Range Filter
      if (datePreset !== 'all' && (dateRangeBounds.start || dateRangeBounds.end)) {
        const rawDateStr = dateBasis === 'deadline' ? (task.deadline || task.created_at) : task.created_at;
        if (!rawDateStr) return false;

        const taskDate = new Date(rawDateStr);
        if (isNaN(taskDate.getTime())) return false;

        if (dateRangeBounds.start && taskDate < dateRangeBounds.start) return false;
        if (dateRangeBounds.end && taskDate > dateRangeBounds.end) return false;
      }

      return true;
    });
  }, [tasks, selectedStatus, priorityFilter, datePreset, dateRangeBounds, dateBasis]);

  // ONLY ACTIVE & ACTUALLY USED STATUSES in the currently filtered tasks
  const activeUsedStatuses = useMemo(() => {
    const usedSet = new Set<string>();

    filteredTasks.forEach(t => {
      if (t.status && t.status.trim()) {
        usedSet.add(t.status.trim());
      }
    });

    if (usedSet.size === 0) {
      dbStatuses.forEach(s => {
        if (s.name && s.name.trim()) usedSet.add(s.name.trim());
      });
    }

    const list = Array.from(usedSet);
    return list.sort((a, b) => {
      const aComp = isStatusCompleted(a);
      const bComp = isStatusCompleted(b);
      if (aComp && !bComp) return 1;
      if (!aComp && bComp) return -1;
      return a.localeCompare(b);
    });
  }, [filteredTasks, dbStatuses]);

  // Build Country -> Partners -> Workload Aggregations
  const countryWorkloadData = useMemo(() => {
    const partnerTasksMap = new Map<string, Task[]>();

    filteredTasks.forEach(task => {
      const assignedIds = new Set<string>();
      if (task.assigned_to) assignedIds.add(task.assigned_to);
      if (Array.isArray(task.assigned_partners)) {
        task.assigned_partners.forEach(id => { if (id) assignedIds.add(id); });
      }

      assignedIds.forEach(partnerId => {
        if (!partnerTasksMap.has(partnerId)) {
          partnerTasksMap.set(partnerId, []);
        }
        partnerTasksMap.get(partnerId)!.push(task);
      });
    });

    return normalizedCountriesList.map(country => {
      const countryCodeUpper = country.code.trim().toUpperCase();
      const countryNameLower = country.name.trim().toLowerCase();

      // Only partners whose canonical country matches this country
      let countryPartners = users.filter(u => {
        if (u.role?.toLowerCase() === 'admin' && u.username?.toLowerCase() === 'admin') {
          return false;
        }

        const userCountry = (u.country || '').trim();
        if (!userCountry) {
          return false;
        }

        const uCode = getCountryCode('', userCountry).toUpperCase();
        const uName = getCanonicalCountryName(userCountry).toLowerCase();

        return uCode === countryCodeUpper || uName === countryNameLower;
      });

      if (searchPartner.trim()) {
        const q = searchPartner.toLowerCase().trim();
        countryPartners = countryPartners.filter(
          p => p.username.toLowerCase().includes(q) || (p.role && p.role.toLowerCase().includes(q))
        );
      }

      if (roleFilter !== 'all') {
        countryPartners = countryPartners.filter(p => p.role?.toLowerCase() === roleFilter.toLowerCase());
      }

      const partnerStats = countryPartners.map((partner, pIndex) => {
        // Only count tasks that belong to this country for this partner
        const allPartnerTasks = partnerTasksMap.get(partner.id) || [];
        const assignedTasks = allPartnerTasks.filter(task => {
          const rawTaskCountry = (task.country || (task.company_id ? companyMap.get(task.company_id)?.country : '') || '').trim();
          if (!rawTaskCountry) {
            return true; // Fallback to partner's country
          }
          const tCode = getCountryCode('', rawTaskCountry).toUpperCase();
          const tName = getCanonicalCountryName(rawTaskCountry).toLowerCase();

          return tCode === countryCodeUpper || tName === countryNameLower;
        });

        const totalTasks = assignedTasks.length;

        const statusCounts: Record<string, number> = {};
        let completedCount = 0;
        let highUrgentCount = 0;

        assignedTasks.forEach(task => {
          const taskStatus = task.status ? task.status.trim() : 'Not Started';
          statusCounts[taskStatus] = (statusCounts[taskStatus] || 0) + 1;

          if (isStatusCompleted(taskStatus)) {
            completedCount += 1;
          }

          const prio = (task.priority || '').toLowerCase();
          if (prio === 'urgent' || prio === 'high') {
            highUrgentCount += 1;
          }
        });

        const completedPercentage = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
        const pendingCount = totalTasks - completedCount;

        // Extract list of active status items with count > 0 for this partner
        const activePartnerStatusBreakdown = Object.entries(statusCounts)
          .filter(([_, count]) => count > 0)
          .sort(([a, countA], [b, countB]) => {
            // Sort by count descending, completed at the end
            const aComp = isStatusCompleted(a);
            const bComp = isStatusCompleted(b);
            if (aComp && !bComp) return 1;
            if (!aComp && bComp) return -1;
            return countB - countA;
          });

        return {
          partner,
          pIndex,
          totalTasks,
          pendingCount,
          statusCounts,
          activeStatusBreakdown: activePartnerStatusBreakdown,
          completedCount,
          completedPercentage,
          highUrgentCount,
          tasks: assignedTasks
        };
      });

      partnerStats.sort((a, b) => b.totalTasks - a.totalTasks || a.partner.username.localeCompare(b.partner.username));

      const countryTotalTasks = partnerStats.reduce((acc, p) => acc + p.totalTasks, 0);
      const countryCompletedTasks = partnerStats.reduce((acc, p) => acc + p.completedCount, 0);
      const countryHighUrgentTasks = partnerStats.reduce((acc, p) => acc + p.highUrgentCount, 0);
      const countryCompletedPercentage = countryTotalTasks > 0 
        ? Math.round((countryCompletedTasks / countryTotalTasks) * 100) 
        : 0;

      return {
        country,
        partners: partnerStats,
        totalPartners: partnerStats.length,
        totalTasks: countryTotalTasks,
        completedTasks: countryCompletedTasks,
        completedPercentage: countryCompletedPercentage,
        highUrgentTasks: countryHighUrgentTasks,
      };
    });
  }, [normalizedCountriesList, users, filteredTasks, searchPartner, roleFilter]);

  // Overall Global KPI Summary
  const globalSummary = useMemo(() => {
    let totalCountries = 0;
    let totalPartners = 0;
    let totalTasks = 0;
    let totalCompleted = 0;
    let totalHighUrgent = 0;

    countryWorkloadData.forEach(c => {
      if (c.totalPartners > 0 || c.totalTasks > 0) totalCountries += 1;
      totalPartners += c.totalPartners;
      totalTasks += c.totalTasks;
      totalCompleted += c.completedTasks;
      totalHighUrgent += c.highUrgentTasks;
    });

    const completionRate = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;
    const avgTasksPerPartner = totalPartners > 0 ? (totalTasks / totalPartners).toFixed(1) : '0';

    return {
      totalCountries: totalCountries || countryWorkloadData.length,
      totalPartners,
      totalTasks,
      totalCompleted,
      completionRate,
      totalHighUrgent,
      avgTasksPerPartner
    };
  }, [countryWorkloadData]);

  // Selected Country data for Active Tab view
  const visibleCountries = useMemo(() => {
    if (activeCountryTab === 'all') return countryWorkloadData;
    return countryWorkloadData.filter(
      c => c.country.name.toLowerCase() === activeCountryTab.toLowerCase() ||
           c.country.code.toLowerCase() === activeCountryTab.toLowerCase()
    );
  }, [countryWorkloadData, activeCountryTab]);

  // Toggle partner expanded breakdown row
  const togglePartnerExpand = (partnerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedPartners(prev => ({
      ...prev,
      [partnerId]: !prev[partnerId]
    }));
  };

  // Reset all filters
  const handleResetFilters = () => {
    setActiveCountryTab('all');
    setSearchPartner('');
    setSelectedStatus('all');
    setPriorityFilter('all');
    setDatePreset('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setDateBasis('deadline');
    setRoleFilter('all');
  };

  // Export Workload to Excel
  const handleExportExcel = () => {
    try {
      const exportRows: Record<string, any>[] = [];

      countryWorkloadData.forEach(cData => {
        cData.partners.forEach(pStat => {
          const row: Record<string, any> = {
            'Country': cData.country.name,
            'Partner Name': pStat.partner.username,
            'Role': pStat.partner.role || 'Partner',
            'Total Tasks': pStat.totalTasks,
            'Active / Pending Tasks': pStat.pendingCount,
            'Completed Tasks': pStat.completedCount,
            'Completed %': `${pStat.completedPercentage}%`,
            'High/Urgent Tasks': pStat.highUrgentCount,
          };

          activeUsedStatuses.forEach(st => {
            row[st] = pStat.statusCounts[st] || 0;
          });

          exportRows.push(row);
        });
      });

      if (exportRows.length === 0) {
        alert('No workload data to export for current filters.');
        return;
      }

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Partner Workload');

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Partner_Workload_Report_${dateStr}.xlsx`);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export Excel report.');
    }
  };

  // Drilldown tasks for selected partner with search & status filter
  const drilldownTasks = useMemo(() => {
    if (!drilldownPartner) return [];
    let list = filteredTasks.filter(t => {
      const assignedIds = new Set<string>();
      if (t.assigned_to) assignedIds.add(t.assigned_to);
      if (Array.isArray(t.assigned_partners)) {
        t.assigned_partners.forEach(id => { if (id) assignedIds.add(id); });
      }
      return assignedIds.has(drilldownPartner.partner.id);
    });

    if (modalStatusFilter !== 'all') {
      list = list.filter(t => t.status === modalStatusFilter);
    }

    if (modalSearch.trim()) {
      const q = modalSearch.toLowerCase().trim();
      list = list.filter(t => {
        const company = t.company_id ? companyMap.get(t.company_id) : null;
        return (
          (t.title && t.title.toLowerCase().includes(q)) ||
          (company?.company_name && company.company_name.toLowerCase().includes(q)) ||
          (t.status && t.status.toLowerCase().includes(q)) ||
          (t.priority && t.priority.toLowerCase().includes(q))
        );
      });
    }

    return list;
  }, [drilldownPartner, filteredTasks, modalSearch, modalStatusFilter, companyMap]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '14px' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '14px',
          background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(37,99,235,0.15)'
        }}>
          <RefreshCw className="animate-spin" size={24} color="var(--accent)" />
        </div>
        <div style={{ fontSize: '15px', fontWeight: 650, color: 'var(--text-primary)' }}>
          Loading Partner Workload...
        </div>
      </div>
    );
  }

  const isAnyFilterActive =
    activeCountryTab !== 'all' ||
    searchPartner.trim() !== '' ||
    selectedStatus !== 'all' ||
    priorityFilter !== 'all' ||
    datePreset !== 'all' ||
    roleFilter !== 'all';

  return (
    <div className="animate-fadeIn" style={{ padding: isEmbedded ? '0' : '0 4px 40px 4px', maxWidth: '1520px', margin: '0 auto' }}>
      {/* ─── Embedded Section Header or Standalone Top Header ─── */}
      {isEmbedded ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          marginBottom: '16px',
          paddingBottom: '14px',
          borderBottom: '1px solid var(--border-light)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Activity size={18} color="#2563eb" />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Partner Workload & Operations
              </h3>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Operational capacity, active workflow statuses, and workload analytics across jurisdictions
              </p>
            </div>
          </div>

          {/* Top Actions: View switcher, refresh, export */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* View Mode Switcher */}
            <div style={{
              display: 'flex',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '3px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}>
              <button
                onClick={() => setCurrentView('summary')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 12px', borderRadius: '7px',
                  border: currentView === 'summary' ? '1px solid #bfdbfe' : '1px solid transparent',
                  background: currentView === 'summary' ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' : 'transparent',
                  color: currentView === 'summary' ? '#1d4ed8' : 'var(--text-secondary)',
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: currentView === 'summary' ? '0 1px 3px rgba(37,99,235,0.15)' : 'none'
                }}
                title="Summary Table"
              >
                <TableIcon size={14} color="#2563eb" /> Summary
              </button>
              <button
                onClick={() => setCurrentView('graphs')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 12px', borderRadius: '7px',
                  border: currentView === 'graphs' ? '1px solid #ddd6fe' : '1px solid transparent',
                  background: currentView === 'graphs' ? 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)' : 'transparent',
                  color: currentView === 'graphs' ? '#6d28d9' : 'var(--text-secondary)',
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: currentView === 'graphs' ? '0 1px 3px rgba(139,92,246,0.15)' : 'none'
                }}
                title="Visual Analytics & Workload Graphs"
              >
                <BarChart3 size={14} color="#8b5cf6" /> Analytics & Graphs
              </button>
              <button
                onClick={() => setCurrentView('cards')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 12px', borderRadius: '7px',
                  border: currentView === 'cards' ? '1px solid #a7f3d0' : '1px solid transparent',
                  background: currentView === 'cards' ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)' : 'transparent',
                  color: currentView === 'cards' ? '#047857' : 'var(--text-secondary)',
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: currentView === 'cards' ? '0 1px 3px rgba(16,185,129,0.15)' : 'none'
                }}
                title="Cards Grid View"
              >
                <LayoutGrid size={14} color="#10b981" /> Cards
              </button>
            </div>

            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              style={{
                padding: '8px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
              title="Refresh latest data"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>

            <button
              onClick={handleExportExcel}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 650,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
                boxShadow: '0 2px 6px rgba(37,99,235,0.25)'
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(37,99,235,0.35)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(37,99,235,0.25)'; }}
            >
              <Download size={14} /> Export Report
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Standalone Top Header */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            marginBottom: '20px'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{
                  fontSize: '26px',
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.03em',
                  margin: 0
                }}>
                  Partner Workload
                </h1>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 750,
                  color: '#3b82f6',
                  background: '#eff6ff',
                  border: '1px solid #dbeafe',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  Admin Overview
                </span>
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px', margin: '4px 0 0 0' }}>
                Executive overview of partner task capacity, status progress, and workload allocation across all jurisdictions.
              </p>
            </div>

            {/* Top Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{
                display: 'flex',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '3px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
              }}>
                <button
                  onClick={() => setCurrentView('summary')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 12px', borderRadius: '7px',
                    border: currentView === 'summary' ? '1px solid #bfdbfe' : '1px solid transparent',
                    background: currentView === 'summary' ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' : 'transparent',
                    color: currentView === 'summary' ? '#1d4ed8' : 'var(--text-secondary)',
                    fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: currentView === 'summary' ? '0 1px 3px rgba(37,99,235,0.15)' : 'none'
                  }}
                  title="Summary Table"
                >
                  <TableIcon size={14} color="#2563eb" /> Summary
                </button>
                <button
                  onClick={() => setCurrentView('graphs')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 12px', borderRadius: '7px',
                    border: currentView === 'graphs' ? '1px solid #ddd6fe' : '1px solid transparent',
                    background: currentView === 'graphs' ? 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)' : 'transparent',
                    color: currentView === 'graphs' ? '#6d28d9' : 'var(--text-secondary)',
                    fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: currentView === 'graphs' ? '0 1px 3px rgba(139,92,246,0.15)' : 'none'
                  }}
                  title="Visual Analytics & Workload Graphs"
                >
                  <BarChart3 size={14} color="#8b5cf6" /> Analytics & Graphs
                </button>
                <button
                  onClick={() => setCurrentView('cards')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 12px', borderRadius: '7px',
                    border: currentView === 'cards' ? '1px solid #a7f3d0' : '1px solid transparent',
                    background: currentView === 'cards' ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)' : 'transparent',
                    color: currentView === 'cards' ? '#047857' : 'var(--text-secondary)',
                    fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: currentView === 'cards' ? '0 1px 3px rgba(16,185,129,0.15)' : 'none'
                  }}
                  title="Cards Grid View"
                >
                  <LayoutGrid size={14} color="#10b981" /> Cards
                </button>
              </div>

              <button
                onClick={() => fetchData(true)}
                disabled={refreshing}
                style={{
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: 650,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                title="Refresh latest data"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                Refresh
              </button>

              <button
                onClick={handleExportExcel}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 650,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 2px 6px rgba(37,99,235,0.25)'
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(37,99,235,0.35)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(37,99,235,0.25)'; }}
              >
                <Download size={14} /> Export Report
              </button>
            </div>
          </div>

          {/* Standalone Executive KPI Stat Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '14px',
            marginBottom: '20px'
          }}>
            {/* Metric 1: Total Partners */}
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '14px',
              padding: '16px 18px',
              border: '1px solid var(--border)',
              boxShadow: 'var(--card-shadow)',
              display: 'flex',
              alignItems: 'center',
              gap: '14px'
            }}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
              }}>
                <Users size={20} color="#2563eb" />
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Total Partners
                </div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2, marginTop: '2px' }}>
                  {globalSummary.totalPartners}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  In {globalSummary.totalCountries} country workspaces
                </div>
              </div>
            </div>

            {/* Metric 2: Total Assigned Tasks */}
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '14px',
              padding: '16px 18px',
              border: '1px solid var(--border)',
              boxShadow: 'var(--card-shadow)',
              display: 'flex',
              alignItems: 'center',
              gap: '14px'
            }}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
                border: '1px solid #ddd6fe', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
              }}>
                <Layers size={20} color="#7c3aed" />
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Assigned Tasks
                </div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2, marginTop: '2px' }}>
                  {globalSummary.totalTasks}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Avg {globalSummary.avgTasksPerPartner} tasks / partner
                </div>
              </div>
            </div>

            {/* Metric 3: Overall Completion Rate */}
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '14px',
              padding: '16px 18px',
              border: '1px solid var(--border)',
              boxShadow: 'var(--card-shadow)',
              display: 'flex',
              alignItems: 'center',
              gap: '14px'
            }}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
              }}>
                <CheckCircle2 size={20} color="#059669" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Completion Rate
                </div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2, marginTop: '2px' }}>
                  {globalSummary.completionRate}%
                </div>
                <div style={{ width: '100%', height: '5px', background: 'var(--bg-tertiary)', borderRadius: '999px', overflow: 'hidden', marginTop: '6px' }}>
                  <div style={{
                    width: `${globalSummary.completionRate}%`,
                    height: '100%',
                    background: globalSummary.completionRate > 70 ? '#10b981' : (globalSummary.completionRate > 40 ? '#3b82f6' : '#f59e0b'),
                    borderRadius: '999px'
                  }} />
                </div>
              </div>
            </div>

            {/* Metric 4: High & Urgent Tasks */}
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '14px',
              padding: '16px 18px',
              border: '1px solid var(--border)',
              boxShadow: 'var(--card-shadow)',
              display: 'flex',
              alignItems: 'center',
              gap: '14px'
            }}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                border: '1px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
              }}>
                <Flame size={20} color="#dc2626" />
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  High & Urgent
                </div>
                <div style={{
                  fontSize: '22px',
                  fontWeight: 800,
                  color: globalSummary.totalHighUrgent > 0 ? '#dc2626' : 'var(--text-primary)',
                  lineHeight: 1.2,
                  marginTop: '2px'
                }}>
                  {globalSummary.totalHighUrgent}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Bottleneck priority items
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─── Country Selector Tab Strip ─── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        overflowX: 'auto',
        paddingBottom: '10px',
        marginBottom: '12px',
        scrollbarWidth: 'none'
      }}>
        {/* All Jurisdictions Tab */}
        <button
          onClick={() => setActiveCountryTab('all')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '10px',
            border: activeCountryTab === 'all' ? '1px solid var(--accent)' : '1px solid var(--border)',
            background: activeCountryTab === 'all' ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' : 'var(--bg-secondary)',
            color: activeCountryTab === 'all' ? '#1d4ed8' : 'var(--text-secondary)',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxShadow: activeCountryTab === 'all' ? '0 2px 6px rgba(37,99,235,0.12)' : '0 1px 2px rgba(0,0,0,0.02)',
            transition: 'all 0.15s ease'
          }}
        >
          <Globe size={15} />
          <span>All Jurisdictions</span>
          <span style={{
            fontSize: '11px',
            padding: '1px 6px',
            borderRadius: '999px',
            background: activeCountryTab === 'all' ? '#2563eb' : 'var(--bg-tertiary)',
            color: activeCountryTab === 'all' ? '#ffffff' : 'var(--text-secondary)',
            fontWeight: 750
          }}>
            {globalSummary.totalTasks}
          </span>
        </button>

        {/* Individual Country Tabs */}
        {normalizedCountriesList.map(c => {
          const cData = countryWorkloadData.find(item => item.country.name === c.name);
          const isSelected = activeCountryTab.toLowerCase() === c.name.toLowerCase();
          const taskCount = cData?.totalTasks || 0;

          return (
            <button
              key={c.id || c.name}
              onClick={() => setActiveCountryTab(c.name)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '10px',
                border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: isSelected ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' : 'var(--bg-secondary)',
                color: isSelected ? '#1d4ed8' : 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: isSelected ? '0 2px 6px rgba(37,99,235,0.12)' : '0 1px 2px rgba(0,0,0,0.02)',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                <CountryFlag code={c.code} name={c.name} size={16} />
              </div>
              <span>{c.name}</span>
              <span style={{
                fontSize: '11px',
                padding: '1px 6px',
                borderRadius: '999px',
                background: isSelected ? '#2563eb' : 'var(--bg-tertiary)',
                color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 750
              }}>
                {taskCount}
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── Integrated Filter Toolbar ─── */}
      <div style={{
        background: 'var(--bg-secondary)',
        padding: '14px 18px',
        borderRadius: '14px',
        border: '1px solid var(--border)',
        marginBottom: '20px',
        boxShadow: 'var(--card-shadow)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {/* Row 1: Search, Role, Status, Priority */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '10px',
          alignItems: 'center'
        }}>
          {/* Partner Search Input */}
          <div style={{ position: 'relative' }}>
            <Search size={14} color="var(--text-tertiary)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="text"
              value={searchPartner}
              onChange={e => setSearchPartner(e.target.value)}
              placeholder="Search partner or role..."
              style={{
                width: '100%',
                padding: '8px 10px 8px 30px',
                fontSize: '12.5px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                outline: 'none',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                transition: 'all 0.15s ease'
              }}
            />
            {searchPartner && (
              <button
                onClick={() => setSearchPartner('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px' }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Role Filter */}
          <div>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '12.5px',
                fontWeight: 500,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Roles</option>
              {distinctRoles.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '12.5px',
                fontWeight: 500,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Active Statuses ({activeUsedStatuses.length})</option>
              {activeUsedStatuses.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '12.5px',
                fontWeight: 500,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Priorities</option>
              <option value="urgent_high">🔥 Urgent & High Only</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>
          </div>
        </div>

        {/* Row 2: Date Segmented Control + Clear Button */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          paddingTop: '8px',
          borderTop: '1px solid var(--border-light)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--text-secondary)' }}>
              Date Scope:
            </span>
            <div style={{ display: 'flex', gap: '3px', background: 'var(--bg-tertiary)', padding: '3px', borderRadius: '8px' }}>
              {[
                { id: 'all', label: 'All Time' },
                { id: 'today', label: 'Today' },
                { id: 'this_week', label: 'This Week' },
                { id: 'this_month', label: 'This Month' },
                { id: 'this_year', label: 'This Year' },
                { id: 'custom', label: 'Custom Range...' },
              ].map(preset => (
                <button
                  key={preset.id}
                  onClick={() => setDatePreset(preset.id as DateRangePreset)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '11.5px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    background: datePreset === preset.id ? 'var(--bg-secondary)' : 'transparent',
                    color: datePreset === preset.id ? 'var(--accent)' : 'var(--text-secondary)',
                    boxShadow: datePreset === preset.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {isAnyFilterActive && (
            <button
              onClick={handleResetFilters}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '5px 10px', borderRadius: '7px',
                background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#dc2626', fontSize: '11.5px', fontWeight: 650,
                cursor: 'pointer'
              }}
            >
              <X size={12} /> Clear All Filters
            </button>
          )}
        </div>

        {/* Custom Range Drawer */}
        {datePreset === 'custom' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            paddingTop: '10px',
            borderTop: '1px dashed var(--border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>From:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '12px'
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>To:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '12px'
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Basis:</span>
              <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                <button
                  onClick={() => setDateBasis('deadline')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11.5px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    border: 'none',
                    background: dateBasis === 'deadline' ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: dateBasis === 'deadline' ? '#ffffff' : 'var(--text-secondary)'
                  }}
                >
                  Deadline
                </button>
                <button
                  onClick={() => setDateBasis('created_at')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11.5px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    border: 'none',
                    background: dateBasis === 'created_at' ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: dateBasis === 'created_at' ? '#ffffff' : 'var(--text-secondary)'
                  }}
                >
                  Created Date
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Workload Content Area ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {visibleCountries.length === 0 ? (
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: '16px',
            border: '1px solid var(--border)',
            padding: '60px 24px',
            textAlign: 'center',
            boxShadow: 'var(--card-shadow)'
          }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Users size={28} color="#3b82f6" />
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              No matching partners or workload data
            </h3>
            <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', maxWidth: '400px', margin: '6px auto 20px' }}>
              Try adjusting your search terms or clearing your filters.
            </p>
            <button
              onClick={handleResetFilters}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
                fontWeight: 650,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          visibleCountries.map(cData => {
            return (
              <div
                key={cData.country.id || cData.country.name}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  boxShadow: 'var(--card-shadow)'
                }}
              >
                {/* Country Header Bar */}
                <div style={{
                  padding: '16px 20px',
                  background: 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      boxShadow: '0 2px 5px rgba(0,0,0,0.08)',
                      borderRadius: '5px',
                      overflow: 'hidden',
                      display: 'flex'
                    }}>
                      <CountryFlag code={cData.country.code} name={cData.country.name} size={24} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                          {cData.country.name}
                        </span>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: '5px',
                          background: 'var(--bg-tertiary)',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border)'
                        }}>
                          {cData.country.code}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                        {cData.totalPartners} {cData.totalPartners === 1 ? 'partner' : 'partners'} registered
                      </div>
                    </div>
                  </div>

                  {/* Summary Metric Pills */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      padding: '5px 12px',
                      borderRadius: '8px',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: 'var(--text-primary)'
                    }}>
                      {cData.totalTasks} Tasks
                    </span>

                    <span style={{
                      padding: '5px 12px',
                      borderRadius: '8px',
                      background: cData.completedPercentage > 75 ? '#ecfdf5' : (cData.completedPercentage > 40 ? '#eff6ff' : '#fffbeb'),
                      border: `1px solid ${cData.completedPercentage > 75 ? '#a7f3d0' : (cData.completedPercentage > 40 ? '#bfdbfe' : '#fde68a')}`,
                      fontSize: '12.5px',
                      fontWeight: 750,
                      color: cData.completedPercentage > 75 ? '#065f46' : (cData.completedPercentage > 40 ? '#1e40af' : '#92400e')
                    }}>
                      {cData.completedPercentage}% Done
                    </span>

                    {cData.highUrgentTasks > 0 && (
                      <span style={{
                        padding: '5px 12px',
                        borderRadius: '8px',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        fontSize: '12.5px',
                        fontWeight: 750,
                        color: '#dc2626',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <Flame size={13} /> {cData.highUrgentTasks} Urgent
                      </span>
                    )}
                  </div>
                </div>

                {/* Country Partner Workload Table Content */}
                {cData.partners.length === 0 ? (
                  <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                    No partners in {cData.country.name} match current filters.
                  </div>
                ) : currentView === 'summary' ? (
                  /* ─── VIEW 1: Executive Summary Table with Proportional Status Bar & Expandable Grid ─── */
                  <div style={{ width: '100%' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{
                          background: 'var(--bg-tertiary)',
                          borderBottom: '1px solid var(--border-light)',
                          color: 'var(--text-tertiary)',
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em'
                        }}>
                          <th style={{ padding: '12px 18px', width: '22%' }}>Partner</th>
                          <th style={{ padding: '12px 14px', width: '11%' }}>Role</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', width: '10%' }}>Total Tasks</th>
                          <th style={{ padding: '12px 16px', width: '16%' }}>Progress</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', width: '11%' }}>High / Urgent</th>
                          <th style={{ padding: '12px 16px', width: '20%' }}>Status Distribution</th>
                          <th style={{ padding: '12px 18px', textAlign: 'right', width: '10%' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cData.partners.map((pStat, pIdx) => {
                          const isExpanded = !!expandedPartners[pStat.partner.id];

                          return (
                            <React.Fragment key={pStat.partner.id}>
                              <tr
                                onClick={() => {
                                  setModalSearch('');
                                  setModalStatusFilter('all');
                                  setDrilldownPartner({ partner: pStat.partner, countryName: cData.country.name });
                                }}
                                style={{
                                  borderBottom: isExpanded || pIdx === cData.partners.length - 1 ? 'none' : '1px solid var(--border-light)',
                                  cursor: 'pointer',
                                  transition: 'background 0.12s ease',
                                  background: isExpanded ? 'var(--bg-primary)' : 'transparent'
                                }}
                                onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                                onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
                                title="Click row to view assigned tasks"
                              >
                                {/* Partner Avatar + Username */}
                                <td style={{ padding: '14px 18px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                      width: '36px',
                                      height: '36px',
                                      borderRadius: '10px',
                                      background: getAvatarGradient(pStat.partner.username, pStat.pIndex),
                                      color: '#ffffff',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '14px',
                                      fontWeight: 750,
                                      flexShrink: 0,
                                      boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                                    }}>
                                      {pStat.partner.username.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '13.5px' }}>
                                        {pStat.partner.username}
                                      </div>
                                      {pStat.partner.email && (
                                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                          {pStat.partner.email}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {/* Role */}
                                <td style={{ padding: '14px 14px' }}>
                                  <span style={{
                                    display: 'inline-block',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    background: 'var(--bg-primary)',
                                    border: '1px solid var(--border)',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    color: 'var(--text-secondary)'
                                  }}>
                                    {pStat.partner.role || 'Partner'}
                                  </span>
                                </td>

                                {/* Total Tasks */}
                                <td style={{ padding: '14px 14px', textAlign: 'center' }}>
                                  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <span style={{
                                      fontSize: '15px',
                                      fontWeight: 800,
                                      color: pStat.totalTasks > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)'
                                    }}>
                                      {pStat.totalTasks}
                                    </span>
                                    {pStat.pendingCount > 0 && (
                                      <span style={{ fontSize: '10.5px', color: '#d97706', fontWeight: 650 }}>
                                        {pStat.pendingCount} active
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Progress */}
                                <td style={{ padding: '14px 16px' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                                      <span style={{ fontWeight: 700, color: pStat.completedPercentage > 75 ? '#065f46' : 'var(--text-primary)' }}>
                                        {pStat.completedPercentage}%
                                      </span>
                                      <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                                        {pStat.completedCount} / {pStat.totalTasks} done
                                      </span>
                                    </div>
                                    <div style={{ width: '100%', height: '5px', background: 'var(--bg-tertiary)', borderRadius: '999px', overflow: 'hidden' }}>
                                      <div style={{
                                        width: `${pStat.completedPercentage}%`,
                                        height: '100%',
                                        background: pStat.completedPercentage > 75 ? '#10b981' : (pStat.completedPercentage > 40 ? '#3b82f6' : '#f59e0b'),
                                        borderRadius: '999px'
                                      }} />
                                    </div>
                                  </div>
                                </td>

                                {/* High / Urgent Priority */}
                                <td style={{ padding: '14px 14px', textAlign: 'center' }}>
                                  {pStat.highUrgentCount > 0 ? (
                                    <span style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      padding: '3px 8px',
                                      borderRadius: '6px',
                                      background: '#fef2f2',
                                      border: '1px solid #fecaca',
                                      color: '#dc2626',
                                      fontWeight: 750,
                                      fontSize: '12px'
                                    }}>
                                      <Flame size={12} /> {pStat.highUrgentCount}
                                    </span>
                                  ) : (
                                    <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>—</span>
                                  )}
                                </td>

                                {/* Status Distribution Proportional Bar + Preview */}
                                <td style={{ padding: '14px 16px' }}>
                                  {pStat.totalTasks === 0 ? (
                                    <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>No active tasks</span>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      {/* Segmented Proportional Bar */}
                                      <div style={{
                                        display: 'flex',
                                        width: '100%',
                                        height: '7px',
                                        borderRadius: '999px',
                                        overflow: 'hidden',
                                        background: 'var(--bg-tertiary)'
                                      }}>
                                        {pStat.activeStatusBreakdown.map(([stName, cnt]) => {
                                          const widthPct = (cnt / pStat.totalTasks) * 100;
                                          const theme = getStatusTheme(stName);
                                          return (
                                            <div
                                              key={stName}
                                              style={{
                                                width: `${widthPct}%`,
                                                height: '100%',
                                                background: theme.bar,
                                                borderRight: '1px solid #ffffff'
                                              }}
                                              title={`${cnt} ${stName} (${Math.round(widthPct)}%)`}
                                            />
                                          );
                                        })}
                                      </div>

                                      {/* Top Status Labels */}
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                        <span>{pStat.activeStatusBreakdown.length} active stages</span>
                                        <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--text-tertiary)' }} />
                                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                                          {pStat.activeStatusBreakdown[0]?.[1]} {pStat.activeStatusBreakdown[0]?.[0]}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </td>

                                {/* Actions & Breakdown Accordion Toggle */}
                                <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                    <button
                                      onClick={e => togglePartnerExpand(pStat.partner.id, e)}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '5px 10px',
                                        borderRadius: '7px',
                                        background: isExpanded ? 'var(--accent-light)' : 'var(--bg-primary)',
                                        border: isExpanded ? '1px solid var(--accent)' : '1px solid var(--border)',
                                        color: isExpanded ? 'var(--accent)' : 'var(--text-secondary)',
                                        fontSize: '12px',
                                        fontWeight: 650,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                      }}
                                      title="Toggle full status breakdown grid"
                                    >
                                      <span>Statuses</span>
                                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                    </button>
                                  </div>
                                </td>
                              </tr>

                              {/* In-Row Expanded Status Grid Matrix */}
                              {isExpanded && (
                                <tr style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)' }}>
                                  <td colSpan={7} style={{ padding: '16px 22px 20px 22px' }}>
                                    <div style={{
                                      background: 'var(--bg-secondary)',
                                      border: '1px solid var(--border)',
                                      borderRadius: '12px',
                                      padding: '16px 18px',
                                      boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                                    }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <BarChart3 size={15} color="var(--accent)" />
                                          <span style={{ fontSize: '13px', fontWeight: 750, color: 'var(--text-primary)' }}>
                                            Status Breakdown for {pStat.partner.username}
                                          </span>
                                          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                            ({pStat.totalTasks} total tasks)
                                          </span>
                                        </div>

                                        <button
                                          onClick={() => {
                                            setModalSearch('');
                                            setModalStatusFilter('all');
                                            setDrilldownPartner({ partner: pStat.partner, countryName: cData.country.name });
                                          }}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            background: 'var(--accent)',
                                            color: '#ffffff',
                                            border: 'none',
                                            fontSize: '11.5px',
                                            fontWeight: 650,
                                            cursor: 'pointer'
                                          }}
                                        >
                                          <Eye size={12} /> View All {pStat.totalTasks} Tasks
                                        </button>
                                      </div>

                                      {/* Structured Status Grid */}
                                      {pStat.activeStatusBreakdown.length === 0 ? (
                                        <div style={{ padding: '10px 0', color: 'var(--text-tertiary)', fontSize: '12px' }}>No active tasks for this partner.</div>
                                      ) : (
                                        <div style={{
                                          display: 'grid',
                                          gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                                          gap: '8px'
                                        }}>
                                          {pStat.activeStatusBreakdown.map(([statusName, count]) => {
                                            const theme = getStatusTheme(statusName);
                                            const pct = pStat.totalTasks > 0 ? Math.round((count / pStat.totalTasks) * 100) : 0;

                                            return (
                                              <div
                                                key={statusName}
                                                onClick={() => {
                                                  setModalSearch('');
                                                  setModalStatusFilter(statusName);
                                                  setDrilldownPartner({ partner: pStat.partner, countryName: cData.country.name });
                                                }}
                                                style={{
                                                  background: 'var(--bg-primary)',
                                                  border: `1px solid ${theme.border}`,
                                                  borderLeft: `4px solid ${theme.bar}`,
                                                  borderRadius: '8px',
                                                  padding: '9px 12px',
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  justifyContent: 'space-between',
                                                  cursor: 'pointer',
                                                  transition: 'all 0.12s ease'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = theme.bg}
                                                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                                                title={`Click to filter tasks with status "${statusName}"`}
                                              >
                                                <div>
                                                  <div style={{ fontSize: '12px', fontWeight: 650, color: 'var(--text-primary)' }}>
                                                    {statusName}
                                                  </div>
                                                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '1px' }}>
                                                    {pct}% of workload
                                                  </div>
                                                </div>
                                                <div style={{
                                                  fontSize: '15px',
                                                  fontWeight: 800,
                                                  color: theme.text,
                                                  padding: '2px 8px',
                                                  borderRadius: '6px',
                                                  background: theme.bg
                                                }}>
                                                  {count}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : currentView === 'graphs' ? (
                  /* ─── VIEW 2: Interactive SVG Line Chart Graphs ─── */
                  <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* Line Chart 1: Partner Workload & Task Progression Multi-Line Chart */}
                    <div style={{
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '16px',
                      padding: '20px 22px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '18px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '32px', height: '32px', borderRadius: '8px',
                              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                              border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                              <TrendingUp size={17} color="#2563eb" />
                            </div>
                            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                              Partner Workload & Performance Line Graph
                            </h4>
                          </div>
                          <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                            Multi-series trend curve comparing total task volume, completed tasks, active pending load, and urgent bottlenecks across partners in {cData.country.name}.
                          </p>
                        </div>

                        {/* Controls: Series Legend & Active Partners Toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                          {/* Filter Toggle: Active Only vs All Partners */}
                          <div style={{
                            display: 'flex',
                            background: 'var(--bg-secondary)',
                            padding: '3px',
                            borderRadius: '8px',
                            border: '1px solid var(--border)'
                          }}>
                            <button
                              type="button"
                              onClick={() => setGraphShowActiveOnly(true)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                borderRadius: '6px',
                                border: 'none',
                                background: graphShowActiveOnly ? 'var(--bg-primary)' : 'transparent',
                                color: graphShowActiveOnly ? 'var(--accent)' : 'var(--text-secondary)',
                                boxShadow: graphShowActiveOnly ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                cursor: 'pointer',
                                transition: 'all 0.12s ease'
                              }}
                            >
                              Active Partners ({cData.partners.filter(p => p.totalTasks > 0).length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setGraphShowActiveOnly(false)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                borderRadius: '6px',
                                border: 'none',
                                background: !graphShowActiveOnly ? 'var(--bg-primary)' : 'transparent',
                                color: !graphShowActiveOnly ? 'var(--accent)' : 'var(--text-secondary)',
                                boxShadow: !graphShowActiveOnly ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                cursor: 'pointer',
                                transition: 'all 0.12s ease'
                              }}
                            >
                              All ({cData.partners.length})
                            </button>
                          </div>

                          {/* Chart Legend */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '12px', fontWeight: 650 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ width: '16px', height: '3.5px', borderRadius: '2px', background: '#3b82f6' }} />
                              <span style={{ color: 'var(--text-primary)' }}>Total Workload</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ width: '16px', height: '3.5px', borderRadius: '2px', background: '#10b981' }} />
                              <span style={{ color: 'var(--text-primary)' }}>Completed</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ width: '16px', height: '3.5px', borderRadius: '2px', background: '#f59e0b' }} />
                              <span style={{ color: 'var(--text-primary)' }}>Active Pending</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ width: '16px', height: '3.5px', borderRadius: '2px', background: '#ef4444' }} />
                              <span style={{ color: 'var(--text-primary)' }}>Urgent / High</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* SVG Line Graph Container */}
                      {(() => {
                        const rawPartners = cData.partners;
                        const partners = graphShowActiveOnly
                          ? rawPartners.filter(p => p.totalTasks > 0)
                          : rawPartners;

                        if (partners.length === 0) {
                          return (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                              No partners with assigned tasks found.
                            </div>
                          );
                        }

                        const colWidth = Math.max(90, 860 / Math.max(partners.length, 1));
                        const paddingLeft = 65;
                        const paddingRight = 55;
                        const paddingTop = 35;
                        const paddingBottom = 95; // Plenty of room for angled labels
                        const plotWidth = Math.max(760, (partners.length - 1) * colWidth);
                        const svgWidth = plotWidth + paddingLeft + paddingRight;
                        const svgHeight = 350;
                        const plotHeight = svgHeight - paddingTop - paddingBottom;

                        const maxVal = Math.max(
                          ...partners.map(p => Math.max(p.totalTasks, p.completedCount, p.pendingCount, p.highUrgentCount)),
                          10
                        );
                        const yMax = Math.ceil(maxVal / 10) * 10 || 10;

                        const getX = (index: number) => {
                          if (partners.length === 1) return paddingLeft + plotWidth / 2;
                          return paddingLeft + index * colWidth;
                        };

                        const getY = (val: number) => {
                          return paddingTop + plotHeight - (val / yMax) * plotHeight;
                        };

                        // Generate Smooth Bezier Paths
                        const buildSmoothPath = (pts: { x: number; y: number }[]) => {
                          if (pts.length === 0) return '';
                          if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
                          if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

                          let d = `M ${pts[0].x} ${pts[0].y}`;
                          for (let i = 0; i < pts.length - 1; i++) {
                            const p0 = pts[i === 0 ? 0 : i - 1];
                            const p1 = pts[i];
                            const p2 = pts[i + 1];
                            const p3 = pts[i + 2] || p2;

                            const cp1x = p1.x + (p2.x - p0.x) / 6;
                            const cp1y = p1.y + (p2.y - p0.y) / 6;
                            const cp2x = p2.x - (p3.x - p1.x) / 6;
                            const cp2y = p2.y - (p3.y - p1.y) / 6;

                            d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
                          }
                          return d;
                        };

                        const totalPoints = partners.map((p, idx) => ({ x: getX(idx), y: getY(p.totalTasks), val: p.totalTasks, partner: p }));
                        const completedPoints = partners.map((p, idx) => ({ x: getX(idx), y: getY(p.completedCount), val: p.completedCount, partner: p }));
                        const pendingPoints = partners.map((p, idx) => ({ x: getX(idx), y: getY(p.pendingCount), val: p.pendingCount, partner: p }));
                        const urgentPoints = partners.map((p, idx) => ({ x: getX(idx), y: getY(p.highUrgentCount), val: p.highUrgentCount, partner: p }));

                        const totalPath = buildSmoothPath(totalPoints);
                        const completedPath = buildSmoothPath(completedPoints);
                        const pendingPath = buildSmoothPath(pendingPoints);
                        const urgentPath = buildSmoothPath(urgentPoints);

                        const baseY = paddingTop + plotHeight;
                        const totalAreaPath = totalPoints.length > 1
                          ? `${totalPath} L ${totalPoints[totalPoints.length - 1].x} ${baseY} L ${totalPoints[0].x} ${baseY} Z`
                          : '';

                        // Grid steps
                        const yTicks = [0, Math.round(yMax * 0.25), Math.round(yMax * 0.5), Math.round(yMax * 0.75), yMax];

                        return (
                          <div style={{ width: '100%', overflowX: 'auto', paddingBottom: '8px' }}>
                            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: `${Math.max(100, (svgWidth / 860) * 100)}%`, height: 'auto', minWidth: `${svgWidth}px`, display: 'block' }}>
                              <defs>
                                <linearGradient id="totalAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
                                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                                </linearGradient>
                                <linearGradient id="completedAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
                                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                                </linearGradient>
                              </defs>

                              {/* Horizontal Gridlines & Y-Axis Labels */}
                              {yTicks.map(tVal => {
                                const yPos = getY(tVal);
                                return (
                                  <g key={tVal}>
                                    <line
                                      x1={paddingLeft}
                                      y1={yPos}
                                      x2={svgWidth - paddingRight}
                                      y2={yPos}
                                      stroke="var(--border)"
                                      strokeDasharray="4 4"
                                      strokeWidth="1"
                                      opacity="0.8"
                                    />
                                    <text
                                      x={paddingLeft - 12}
                                      y={yPos + 4}
                                      textAnchor="end"
                                      fontSize="11.5"
                                      fill="var(--text-tertiary)"
                                      fontWeight="650"
                                    >
                                      {tVal}
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Gradient Area below Total Workload curve */}
                              {totalAreaPath && (
                                <path d={totalAreaPath} fill="url(#totalAreaGrad)" />
                              )}

                              {/* Curve Lines */}
                              {/* 1. Total Workload Line */}
                              <path
                                d={totalPath}
                                fill="none"
                                stroke="#3b82f6"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />

                              {/* 2. Completed Line */}
                              <path
                                d={completedPath}
                                fill="none"
                                stroke="#10b981"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />

                              {/* 3. Active Pending Line */}
                              <path
                                d={pendingPath}
                                fill="none"
                                stroke="#f59e0b"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />

                              {/* 4. Urgent / High Line */}
                              <path
                                d={urgentPath}
                                fill="none"
                                stroke="#ef4444"
                                strokeWidth="2"
                                strokeDasharray="3 3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />

                              {/* Data Points / Nodes & Angled Partner Labels */}
                              {partners.map((p, idx) => {
                                const x = getX(idx);
                                const yTotal = getY(p.totalTasks);
                                const yComp = getY(p.completedCount);
                                const yPend = getY(p.pendingCount);
                                const yUrg = getY(p.highUrgentCount);

                                return (
                                  <g key={p.partner.id} style={{ cursor: 'pointer' }} onClick={() => {
                                    setModalSearch('');
                                    setModalStatusFilter('all');
                                    setDrilldownPartner({ partner: p.partner, countryName: cData.country.name });
                                  }}>
                                    {/* Vertical Column Hover Guide */}
                                    <line
                                      x1={x}
                                      y1={paddingTop}
                                      x2={x}
                                      y2={baseY}
                                      stroke="var(--border)"
                                      strokeWidth="1"
                                      opacity="0.5"
                                    />

                                    {/* Total Point */}
                                    <circle cx={x} cy={yTotal} r="5" fill="#3b82f6" stroke="#ffffff" strokeWidth="2" />
                                    {/* Completed Point */}
                                    {p.completedCount > 0 && (
                                      <circle cx={x} cy={yComp} r="4" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                                    )}
                                    {/* Pending Point */}
                                    {p.pendingCount > 0 && (
                                      <circle cx={x} cy={yPend} r="4" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
                                    )}
                                    {/* Urgent Point */}
                                    {p.highUrgentCount > 0 && (
                                      <circle cx={x} cy={yUrg} r="4" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                                    )}

                                    {/* Total Value Pill Label on Top Node (Only show if > 0) */}
                                    {p.totalTasks > 0 && (
                                      <g transform={`translate(${x}, ${yTotal - 14})`}>
                                        <rect
                                          x="-14"
                                          y="-10"
                                          width="28"
                                          height="17"
                                          rx="5"
                                          fill="#2563eb"
                                        />
                                        <text
                                          x="0"
                                          y="2.5"
                                          textAnchor="middle"
                                          fill="#ffffff"
                                          fontSize="10.5"
                                          fontWeight="800"
                                        >
                                          {p.totalTasks}
                                        </text>
                                      </g>
                                    )}

                                    {/* Angled X-Axis Partner Name & Status Labels - 100% Crisp & Non-Overlapping */}
                                    <g transform={`translate(${x}, ${baseY + 16}) rotate(-40)`}>
                                      <text
                                        x="0"
                                        y="0"
                                        textAnchor="end"
                                        fontSize="12.5"
                                        fontWeight="750"
                                        fill="var(--text-primary)"
                                      >
                                        {p.partner.username}
                                      </text>
                                      <text
                                        x="0"
                                        y="14"
                                        textAnchor="end"
                                        fontSize="11"
                                        fontWeight="600"
                                        fill={p.completedPercentage > 70 ? '#059669' : 'var(--text-tertiary)'}
                                      >
                                        {p.completedPercentage}% done
                                      </text>
                                    </g>
                                  </g>
                                );
                              })}
                            </svg>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Line Chart 2: Team Completion Velocity Curve (%) */}
                    <div style={{
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '16px',
                      padding: '18px 20px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                        <CheckCircle2 size={16} color="#059669" />
                        <div>
                          <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 750, color: 'var(--text-primary)' }}>
                            Partner Completion Velocity (%)
                          </h4>
                          <p style={{ margin: '1px 0 0 0', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                            Target performance curve vs 75% benchmark
                          </p>
                        </div>
                      </div>

                      {/* Completion Rate Line SVG */}
                      {(() => {
                        const rawPartners = cData.partners;
                        const partners = graphShowActiveOnly
                          ? rawPartners.filter(p => p.totalTasks > 0)
                          : rawPartners;

                        if (partners.length === 0) return null;

                        const colWidth = Math.max(90, 860 / Math.max(partners.length, 1));
                        const pLeft = 65;
                        const pRight = 55;
                        const pTop = 20;
                        const pBottom = 85;
                        const plotWidth = Math.max(760, (partners.length - 1) * colWidth);
                        const vWidth = plotWidth + pLeft + pRight;
                        const vHeight = 250;
                        const pHeight = vHeight - pTop - pBottom;

                        const getX = (idx: number) => {
                          if (partners.length === 1) return pLeft + plotWidth / 2;
                          return pLeft + idx * colWidth;
                        };
                        const getY = (pct: number) => pTop + pHeight - (pct / 100) * pHeight;

                        const vPoints = partners.map((p, idx) => ({
                          x: getX(idx),
                          y: getY(p.completedPercentage),
                          pct: p.completedPercentage,
                          partner: p
                        }));

                        let vPath = `M ${vPoints[0].x} ${vPoints[0].y}`;
                        for (let i = 0; i < vPoints.length - 1; i++) {
                          const p0 = vPoints[i === 0 ? 0 : i - 1];
                          const p1 = vPoints[i];
                          const p2 = vPoints[i + 1];
                          const p3 = vPoints[i + 2] || p2;
                          const cp1x = p1.x + (p2.x - p0.x) / 6;
                          const cp1y = p1.y + (p2.y - p0.y) / 6;
                          const cp2x = p2.x - (p3.x - p1.x) / 6;
                          const cp2y = p2.y - (p3.y - p1.y) / 6;
                          vPath += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
                        }

                        const vBaseY = pTop + pHeight;
                        const vArea = vPoints.length > 1 ? `${vPath} L ${vPoints[vPoints.length - 1].x} ${vBaseY} L ${vPoints[0].x} ${vBaseY} Z` : '';
                        const benchmarkY = getY(75);

                        return (
                          <div style={{ width: '100%', overflowX: 'auto', paddingBottom: '8px' }}>
                            <svg viewBox={`0 0 ${vWidth} ${vHeight}`} style={{ width: `${Math.max(100, (vWidth / 860) * 100)}%`, height: 'auto', minWidth: `${vWidth}px`, display: 'block' }}>
                              <defs>
                                <linearGradient id="emeraldLineGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
                                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                                </linearGradient>
                              </defs>

                              {/* Benchmark Line at 75% */}
                              <line x1={pLeft} y1={benchmarkY} x2={vWidth - pRight} y2={benchmarkY} stroke="#10b981" strokeDasharray="3 3" strokeWidth="1.5" opacity="0.6" />
                              <text x={vWidth - pRight + 5} y={benchmarkY + 3} fontSize="9.5" fill="#059669" fontWeight="750">75% Target</text>

                              {/* Y-Axis grid lines */}
                              {[0, 50, 100].map(pct => {
                                const y = getY(pct);
                                return (
                                  <g key={pct}>
                                    <line x1={pLeft} y1={y} x2={vWidth - pRight} y2={y} stroke="var(--border)" strokeDasharray="3 3" strokeWidth="1" opacity="0.5" />
                                    <text x={pLeft - 10} y={y + 3} textAnchor="end" fontSize="10.5" fill="var(--text-tertiary)" fontWeight="650">{pct}%</text>
                                  </g>
                                );
                              })}

                              {vArea && <path d={vArea} fill="url(#emeraldLineGrad)" />}
                              <path d={vPath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />

                              {vPoints.map(pt => (
                                <g key={pt.partner.partner.id}>
                                  <circle cx={pt.x} cy={pt.y} r="4.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                                  <text x={pt.x} y={pt.y - 7} textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#059669">
                                    {pt.pct}%
                                  </text>
                                  {/* Angled Partner Name */}
                                  <g transform={`translate(${pt.x}, ${vBaseY + 16}) rotate(-40)`}>
                                    <text x="0" y="0" textAnchor="end" fontSize="12" fontWeight="700" fill="var(--text-primary)">
                                      {pt.partner.partner.username}
                                    </text>
                                  </g>
                                </g>
                              ))}
                            </svg>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  /* ─── VIEW 3: Partner Workload Cards Grid ─── */
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '14px',
                    padding: '16px'
                  }}>
                    {cData.partners.map(pStat => {
                      return (
                        <div
                          key={pStat.partner.id}
                          onClick={() => {
                            setModalSearch('');
                            setModalStatusFilter('all');
                            setDrilldownPartner({ partner: pStat.partner, countryName: cData.country.name });
                          }}
                          style={{
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                            padding: '16px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.borderColor = 'var(--accent)';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'var(--border)';
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.02)';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '10px',
                                background: getAvatarGradient(pStat.partner.username, pStat.pIndex),
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '14px',
                                fontWeight: 750,
                                boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                              }}>
                                {pStat.partner.username.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                                  {pStat.partner.username}
                                </div>
                                <div style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>
                                  {pStat.partner.role || 'Partner'}
                                </div>
                              </div>
                            </div>

                            {pStat.highUrgentCount > 0 && (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '2px 7px',
                                borderRadius: '5px',
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                color: '#dc2626',
                                fontWeight: 750,
                                fontSize: '11.5px'
                              }}>
                                <Flame size={11} /> {pStat.highUrgentCount}
                              </span>
                            )}
                          </div>

                          {/* Progress bar */}
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>
                                {pStat.totalTasks} Tasks ({pStat.completedCount} done)
                              </span>
                              <span style={{ fontWeight: 700, color: pStat.completedPercentage > 75 ? '#065f46' : 'var(--text-primary)' }}>
                                {pStat.completedPercentage}%
                              </span>
                            </div>
                            <div style={{ width: '100%', height: '5px', background: 'var(--bg-tertiary)', borderRadius: '999px', overflow: 'hidden' }}>
                              <div style={{
                                width: `${pStat.completedPercentage}%`,
                                height: '100%',
                                background: pStat.completedPercentage > 75 ? '#10b981' : (pStat.completedPercentage > 40 ? '#3b82f6' : '#f59e0b'),
                                borderRadius: '999px'
                              }} />
                            </div>
                          </div>

                          {/* Status List preview */}
                          {pStat.activeStatusBreakdown.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {pStat.activeStatusBreakdown.slice(0, 4).map(([statusName, count]) => {
                                const theme = getStatusTheme(statusName);
                                return (
                                  <span
                                    key={statusName}
                                    style={{
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      background: theme.bg,
                                      border: `1px solid ${theme.border}`,
                                      color: theme.text,
                                      fontSize: '11px',
                                      fontWeight: 650
                                    }}
                                  >
                                    {count} {statusName}
                                  </span>
                                );
                              })}
                              {pStat.activeStatusBreakdown.length > 4 && (
                                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', alignSelf: 'center' }}>
                                  +{pStat.activeStatusBreakdown.length - 4} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ─── Task Drilldown Modal ─── */}
      {drilldownPartner && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(6px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '840px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 45px rgba(0,0,0,0.25)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 22px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-primary)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '15px',
                  boxShadow: '0 2px 6px rgba(37,99,235,0.25)'
                }}>
                  {drilldownPartner.partner.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 750, color: 'var(--text-primary)' }}>
                    {drilldownPartner.partner.username}
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                    {drilldownPartner.countryName} · {drilldownPartner.partner.role || 'Partner'} · {drilldownTasks.length} tasks
                  </div>
                </div>
              </div>

              <button
                onClick={() => setDrilldownPartner(null)}
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '6px',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)'
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Search & Filter Bar */}
            <div style={{
              padding: '12px 20px',
              borderBottom: '1px solid var(--border-light)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={14} color="var(--text-tertiary)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search in tasks..."
                  value={modalSearch}
                  onChange={e => setModalSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px 7px 30px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '12.5px',
                    outline: 'none'
                  }}
                />
              </div>

              <select
                value={modalStatusFilter}
                onChange={e => setModalStatusFilter(e.target.value)}
                style={{
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  outline: 'none'
                }}
              >
                <option value="all">All Statuses</option>
                {activeUsedStatuses.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Modal Task List */}
            <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1 }}>
              {drilldownTasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                  No tasks match the filter criteria.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {drilldownTasks.map(task => {
                    const company = task.company_id ? companyMap.get(task.company_id) : null;
                    const theme = getStatusTheme(task.status);
                    const prio = (task.priority || '').toLowerCase();
                    const isUrgent = prio === 'urgent' || prio === 'high';

                    return (
                      <div
                        key={task.id}
                        style={{
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border)',
                          borderRadius: '10px',
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          flexWrap: 'wrap'
                        }}
                      >
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <div style={{ fontWeight: 650, fontSize: '13.5px', color: 'var(--text-primary)' }}>
                            {task.title || 'Untitled Task'}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Building2 size={12} /> {company?.company_name || 'No Company'}
                            </span>
                            {task.is_daily && (
                              <span style={{ padding: '1px 6px', borderRadius: '4px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600 }}>
                                Daily
                              </span>
                            )}
                            {task.deadline && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Clock size={11} /> Due: {task.deadline}
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '5px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            background: isUrgent ? '#fef2f2' : 'var(--bg-tertiary)',
                            border: `1px solid ${isUrgent ? '#fecaca' : 'var(--border)'}`,
                            color: isUrgent ? '#dc2626' : 'var(--text-secondary)'
                          }}>
                            {task.priority || 'Medium'}
                          </span>

                          <span style={{
                            padding: '3px 9px',
                            borderRadius: '5px',
                            fontSize: '12px',
                            fontWeight: 650,
                            background: theme.bg,
                            border: `1px solid ${theme.border}`,
                            color: theme.text,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: theme.dot }} />
                            {task.status || 'Not Started'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              background: 'var(--bg-primary)'
            }}>
              <button
                onClick={() => setDrilldownPartner(null)}
                style={{
                  padding: '7px 16px',
                  borderRadius: '8px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontWeight: 650,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
