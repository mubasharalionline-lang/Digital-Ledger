import type { Task, Company, User, TaskType } from './supabase';
import { formatDate } from './dateUtils';

interface ExportCtx {
  tasks: Task[];
  companies: Company[];
  partners: User[];
  taskTypes: TaskType[];
  auditors: any[];
  country: string;
}

export function getActivePartnerIds(task: { assigned_partners?: string[] | null; assigned_to?: string | null }): string[] {
  const ids: string[] = [];
  if (Array.isArray(task.assigned_partners)) {
    task.assigned_partners.forEach(id => {
      if (id && !ids.includes(id)) ids.push(id);
    });
  }
  if (task.assigned_to && !ids.includes(task.assigned_to)) {
    ids.push(task.assigned_to);
  }
  return ids;
}

function resolveTask(task: Task, ctx: ExportCtx) {
  const company = ctx.companies.find(c => c.id === task.company_id);
  const ttIds = task.task_type_ids?.length ? task.task_type_ids : (task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : []);
  const ttNames = ttIds.map(id => ctx.taskTypes.find(t => t.id === id)?.name).filter(Boolean).join(', ');
  const activePartnerIds = getActivePartnerIds(task);
  const allNames = activePartnerIds.map(id => ctx.partners.find(p => p.id === id)?.username).filter(Boolean);
  const assigned = allNames.length > 0 ? allNames.join(', ') : 'Unassigned';
  const auditor = ctx.auditors.find(a => a.id === task.auditor_id)?.name || '';
  return {
    'Task ID': task.id.slice(0, 8), 'Company': company?.company_name || 'Unknown',
    'Task Type': ttNames || '—', 'Description': task.description || '',
    'Priority': task.priority, 'Status': task.status, 'Due Date': task.deadline ? formatDate(task.deadline) : '',
    'Assigned To': assigned, 'Auditor': auditor,
    'Created': task.created_at ? formatDate(task.created_at) : '',
    'Daily': task.is_daily ? 'Yes' : 'No',
  };
}

const COL_WIDTHS = [
  { wch: 10 }, { wch: 25 }, { wch: 20 }, { wch: 35 }, { wch: 10 },
  { wch: 18 }, { wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 8 },
];

export function formatPlDateDisplay(dateStr?: string | null): string {
  if (!dateStr) return '';
  return formatDate(dateStr);
}

function isCompleted(s: string) {
  const sl = s.toLowerCase();
  return sl.includes('complete') || sl.includes('closed') || sl.includes('filed') || sl.includes('done');
}

export function filterTasks(tasks: Task[], filter: {
  month?: string; year?: string; companyId?: string; taskTypeId?: string;
  status?: string; partnerId?: string; auditorId?: string;
  mode?: 'completed' | 'pending' | 'daily';
}): Task[] {
  return tasks.filter(t => {
    if (filter.month) {
      const d = t.deadline || t.created_at;
      if (!d || d.slice(0, 7) !== filter.month) return false;
    }
    if (filter.year) {
      const d = t.deadline || t.created_at;
      if (!d || d.slice(0, 4) !== filter.year) return false;
    }
    if (filter.companyId && t.company_id !== filter.companyId) return false;
    if (filter.taskTypeId) {
      const ids = t.task_type_ids?.length ? t.task_type_ids : (t.task_type_id ? [t.task_type_id] : []);
      if (!ids.includes(filter.taskTypeId)) return false;
    }
    if (filter.status && t.status !== filter.status) return false;
    if (filter.partnerId) {
      const activeIds = getActivePartnerIds(t);
      if (!activeIds.includes(filter.partnerId)) return false;
    }
    if (filter.auditorId && t.auditor_id !== filter.auditorId) return false;
    if (filter.mode === 'completed' && !isCompleted(t.status)) return false;
    if (filter.mode === 'pending' && isCompleted(t.status)) return false;
    if (filter.mode === 'daily' && !t.is_daily) return false;
    return true;
  });
}

export async function exportExcel(filteredTasks: Task[], ctx: ExportCtx, label: string) {
  const XLSX = await import('xlsx');
  const rows = filteredTasks.map(t => resolveTask(t, ctx)).sort((a, b) => a.Company.localeCompare(b.Company));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = COL_WIDTHS;
  XLSX.utils.book_append_sheet(wb, ws, 'Tasks');

  // Summary sheet
  const completed = filteredTasks.filter(t => isCompleted(t.status)).length;
  const summary = [
    { Metric: 'Total Tasks', Value: filteredTasks.length },
    { Metric: 'Completed', Value: completed },
    { Metric: 'Pending', Value: filteredTasks.length - completed },
    { Metric: 'Rate', Value: filteredTasks.length > 0 ? `${(completed / filteredTasks.length * 100).toFixed(1)}%` : '0%' },
    { Metric: 'Report', Value: label },
    { Metric: 'Date', Value: formatDate(new Date()) },
    { Metric: 'Country', Value: ctx.country },
  ];
  const ws2 = XLSX.utils.json_to_sheet(summary);
  ws2['!cols'] = [{ wch: 16 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `${label.replace(/\s+/g, '_')}_${ctx.country}_${dateStr}.xlsx`);
}

export function exportFullJson(ctx: ExportCtx) {
  const data = {
    exportDate: new Date().toISOString(),
    country: ctx.country,
    companies: ctx.companies,
    tasks: ctx.tasks,
    taskTypes: ctx.taskTypes,
    partners: ctx.partners,
    auditors: ctx.auditors,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DigitalLedger_Backup_${ctx.country}_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportFullExcel(ctx: ExportCtx) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  // Tasks
  const taskRows = ctx.tasks.map(t => resolveTask(t, ctx));
  const ws1 = XLSX.utils.json_to_sheet(taskRows);
  ws1['!cols'] = COL_WIDTHS;
  XLSX.utils.book_append_sheet(wb, ws1, 'All Tasks');
  // Companies
  const compRows = ctx.companies.map(c => ({
    Name: c.company_name, Country: c.country, Status: c.status || '',
    'Tax Reg': c.tax_registration || '', Industry: c.industry || '',
    'FY End': c.fy_end || '', Created: c.created_at ? formatDate(c.created_at) : '',
  }));
  const ws2 = XLSX.utils.json_to_sheet(compRows);
  ws2['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Companies');
  // Partners
  const pRows = ctx.partners.map(p => ({ Username: p.username, Role: p.role, Country: p.country || '', Email: p.email || '' }));
  const ws3 = XLSX.utils.json_to_sheet(pRows);
  ws3['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Partners');
  // Task Types
  const ttRows = ctx.taskTypes.map(t => ({ Name: t.name, Category: t.category, Active: t.active ? 'Yes' : 'No' }));
  const ws4 = XLSX.utils.json_to_sheet(ttRows);
  XLSX.utils.book_append_sheet(wb, ws4, 'Task Types');

  XLSX.writeFile(wb, `DigitalLedger_Full_${ctx.country}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export interface TaskMgmtExportCtx extends ExportCtx {
  descUpdateMap?: Record<string, string>;
}

export async function exportTaskManagementExcel(
  taskList: Task[],
  ctx: TaskMgmtExportCtx,
  options?: { title?: string; filenamePrefix?: string }
) {
  const XLSX = await import('xlsx');
  const title = options?.title || 'Task Management';
  const prefix = options?.filenamePrefix || 'Task_Management';

  const rows = taskList.map(task => {
    const company = ctx.companies.find(c => c.id === task.company_id);
    const ttIds = task.task_type_ids?.length ? task.task_type_ids : (task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : []);
    const ttNames = ttIds.map(id => ctx.taskTypes.find(t => t.id === id)?.name).filter(Boolean).join(', ');
    const activePartnerIds = getActivePartnerIds(task);
    const allNames = activePartnerIds.map(id => ctx.partners.find(p => p.id === id)?.username).filter(Boolean);
    const assigned = allNames.length > 0 ? allNames.join(', ') : 'Unassigned';
    const auditor = ctx.auditors.find(a => a.id === task.auditor_id)?.name || '';

    const updateDate = (ctx.descUpdateMap && ctx.descUpdateMap[task.id]) || (task.description ? task.created_at : null);
    const descUpdatedStr = updateDate ? formatDate(updateDate) : '';

    return {
      'PL Date': formatPlDateDisplay(task.pl_date) || (task.pl_uploaded ? 'Yes' : ''),
      'Company': company?.company_name || 'Unknown',
      'CR Number': company?.cr_number || '',
      'CR Link': company?.cr_link || '',
      'Task Type': ttNames || '—',
      'Description': task.description || '',
      'Desc Updated': descUpdatedStr,
      'Priority': task.priority || 'Medium',
      'Due Date': task.deadline ? formatDate(task.deadline) : '',
      'Status': task.status || 'Pending',
      'Auditor': auditor,
      'Assigned To': assigned,
      'Task ID': task.id.slice(0, 8),
      'Created Date': task.created_at ? formatDate(task.created_at) : '',
      'Country': task.country || ctx.country || 'Bahrain',
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  ws['!cols'] = [
    { wch: 8 },  // PL
    { wch: 28 }, // Company
    { wch: 16 }, // CR Number
    { wch: 24 }, // CR Link
    { wch: 22 }, // Task Type
    { wch: 40 }, // Description
    { wch: 16 }, // Desc Updated
    { wch: 12 }, // Priority
    { wch: 14 }, // Due Date
    { wch: 20 }, // Status
    { wch: 18 }, // Auditor
    { wch: 24 }, // Assigned To
    { wch: 12 }, // Task ID
    { wch: 16 }, // Created Date
    { wch: 12 }, // Country
  ];

  if (rows.length > 0) {
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:N1');
    ws['!autofilter'] = { ref: `A1:N${range.e.r + 1}` };
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Task Management');

  // Summary & Breakdown sheet
  const statusCounts: Record<string, number> = {};
  const priorityCounts: Record<string, number> = {};
  let completedCount = 0;

  taskList.forEach(t => {
    const s = t.status || 'Unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
    const p = t.priority || 'Medium';
    priorityCounts[p] = (priorityCounts[p] || 0) + 1;
    if (isCompleted(s)) completedCount++;
  });

  const summaryData: Array<{ Section: string; Item: string; Count: string | number }> = [
    { Section: 'Overview', Item: 'Total Tasks Exported', Count: taskList.length },
    { Section: 'Overview', Item: 'Completed Tasks', Count: completedCount },
    { Section: 'Overview', Item: 'Pending Tasks', Count: taskList.length - completedCount },
    { Section: 'Overview', Item: 'Completion Rate', Count: taskList.length > 0 ? `${((completedCount / taskList.length) * 100).toFixed(1)}%` : '0%' },
    { Section: 'Overview', Item: 'Export Date', Count: formatDate(new Date()) },
    { Section: 'Overview', Item: 'Country', Count: ctx.country || 'Bahrain' },
    { Section: '', Item: '', Count: '' },
    { Section: '--- Status Breakdown ---', Item: '', Count: '' },
    ...Object.entries(statusCounts).map(([status, count]) => ({
      Section: 'Status',
      Item: status,
      Count: count,
    })),
    { Section: '', Item: '', Count: '' },
    { Section: '--- Priority Breakdown ---', Item: '', Count: '' },
    ...Object.entries(priorityCounts).map(([prio, count]) => ({
      Section: 'Priority',
      Item: prio,
      Count: count,
    })),
  ];

  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 26 }, { wch: 30 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary & Analytics');

  const dateStr = new Date().toISOString().split('T')[0];
  const safeCountry = (ctx.country || 'Bahrain').replace(/\s+/g, '_');
  XLSX.writeFile(wb, `${prefix}_${safeCountry}_${dateStr}.xlsx`);
}

export interface NzPartnerSummaryRow {
  partnerId: string;
  name: string;
  role: string;
  totalTasks: number;
  completedTasks: number;
  completionRate: string;
}

export async function exportNzMonthlyReportExcel(
  taskList: Task[],
  ctx: ExportCtx,
  monthLabel: string,
  options?: {
    partnerSummary?: NzPartnerSummaryRow[];
  }
) {
  const XLSX = await import('xlsx');

  // Sheet 1: NZ Monthly Tasks (CR Number and Hours Spent omitted)
  const rows = taskList.map(task => {
    const company = ctx.companies.find(c => c.id === task.company_id);
    const ttIds = task.task_type_ids?.length ? task.task_type_ids : (task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : []);
    const ttNames = ttIds.map(id => ctx.taskTypes.find(t => t.id === id)?.name).filter(Boolean).join(', ');
    const activePartnerIds = getActivePartnerIds(task);
    const allNames = activePartnerIds.map(id => ctx.partners.find(p => p.id === id)?.username).filter(Boolean);
    const assigned = allNames.length > 0 ? allNames.join(', ') : 'Unassigned';

    const auditor = ctx.auditors.find(a => a.id === task.auditor_id)?.name || 'Direct / None';
    const completedDate = isTaskCompleted(task.status)
      ? (task.completed_at ? formatDate(task.completed_at) : (task.created_at ? formatDate(task.created_at) : 'Completed'))
      : '—';

    return {
      'Company': company?.company_name || 'Unknown',
      'Task Type': ttNames || '—',
      'Description': task.description || '',
      'Auditor (Delegated By)': auditor,
      'Assigned Partner(s)': assigned,
      'Priority': task.priority || 'Medium',
      'Due Date': task.deadline ? formatDate(task.deadline) : '',
      'Status': task.status || 'Pending',
      'Created Date': task.created_at ? formatDate(task.created_at) : '',
    };
  });

  const wb = XLSX.utils.book_new();
  const wsTasks = XLSX.utils.json_to_sheet(rows);

  wsTasks['!cols'] = [
    { wch: 30 }, // Company
    { wch: 22 }, // Task Type
    { wch: 42 }, // Description
    { wch: 24 }, // Auditor (Delegated By)
    { wch: 26 }, // Assigned Partner(s)
    { wch: 12 }, // Priority
    { wch: 14 }, // Due Date
    { wch: 20 }, // Status
    { wch: 16 }, // Created Date
  ];

  if (rows.length > 0) {
    const range = XLSX.utils.decode_range(wsTasks['!ref'] || 'A1:I1');
    wsTasks['!autofilter'] = { ref: `A1:I${range.e.r + 1}` };
  }

  XLSX.utils.book_append_sheet(wb, wsTasks, 'NZ Monthly Tasks');

  // Sheet 2: Executive Summary & Partner Breakdown
  let totalCompleted = 0;
  taskList.forEach(t => {
    if (isCompleted(t.status || '')) totalCompleted++;
  });

  const completionRate = taskList.length > 0
    ? `${((totalCompleted / taskList.length) * 100).toFixed(1)}%`
    : '0%';

  const summarySheetData: any[] = [
    { Section: 'Report Scope', Metric: 'Country', Value: 'New Zealand' },
    { Section: 'Report Scope', Metric: 'Report Month', Value: monthLabel },
    { Section: 'Report Scope', Metric: 'Generated On', Value: formatDate(new Date()) },
    { Section: '', Metric: '', Value: '' },
    { Section: 'Monthly Totals', Metric: 'Total Tasks', Value: taskList.length },
    { Section: 'Monthly Totals', Metric: 'Total Tasks Completed', Value: totalCompleted },
    { Section: 'Monthly Totals', Metric: 'Pending Tasks', Value: taskList.length - totalCompleted },
    { Section: 'Monthly Totals', Metric: 'Completion Rate', Value: completionRate },
    { Section: '', Metric: '', Value: '' },
  ];

  if (options?.partnerSummary && options.partnerSummary.length > 0) {
    summarySheetData.push({ Section: '--- PARTNER-WISE BREAKDOWN ---', Metric: '', Value: '' });
    options.partnerSummary.forEach(p => {
      summarySheetData.push({
        Section: `Partner: ${p.name}`,
        Metric: `Role: ${p.role} | Tasks: ${p.totalTasks} (Completed: ${p.completedTasks})`,
        Value: `Completion Rate: ${p.completionRate}`,
      });
    });
  }

  const wsSummary = XLSX.utils.json_to_sheet(summarySheetData);
  wsSummary['!cols'] = [{ wch: 30 }, { wch: 45 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary & Partners');

  const cleanMonth = monthLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `NZ_Monthly_Report_${cleanMonth}_${dateStr}.xlsx`);
}

export interface AuditorSummaryRow {
  auditorId: string;
  name: string;
  totalTasks: number;
  completedTasks: number;
  completionRate: string;
}

export function isTaskCompleted(status?: string | null): boolean {
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

export function calculateTimeTaken(task: Task, completedDateStr?: string | null): {
  formatted: string;
  totalHours: number;
  totalDays: number;
  isCompleted: boolean;
  rawMs: number;
} {
  const isComp = isTaskCompleted(task.status);
  const startIso = task.created_at;
  const endIso = completedDateStr || task.completed_at;

  if (!startIso) {
    return { formatted: '—', totalHours: 0, totalDays: 0, isCompleted: isComp, rawMs: 0 };
  }

  const startTime = new Date(startIso).getTime();
  if (isNaN(startTime)) {
    return { formatted: '—', totalHours: 0, totalDays: 0, isCompleted: isComp, rawMs: 0 };
  }

  if (isComp) {
    const endTime = endIso ? new Date(endIso).getTime() : null;
    if (!endTime || isNaN(endTime)) {
      return { formatted: 'Completed', totalHours: 0, totalDays: 0, isCompleted: true, rawMs: 0 };
    }

    const diffMs = Math.max(0, endTime - startTime);
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const remainingHours = totalHours % 24;
    const remainingMins = totalMinutes % 60;

    let formatted = '';
    if (days > 0) {
      if (remainingHours > 0) {
        formatted = `${days} day${days === 1 ? '' : 's'} ${remainingHours} hour${remainingHours === 1 ? '' : 's'}`;
      } else {
        formatted = `${days} day${days === 1 ? '' : 's'}`;
      }
    } else if (totalHours > 0) {
      if (remainingMins > 0) {
        formatted = `${totalHours} hour${totalHours === 1 ? '' : 's'} ${remainingMins} min${remainingMins === 1 ? '' : 's'}`;
      } else {
        formatted = `${totalHours} hour${totalHours === 1 ? '' : 's'}`;
      }
    } else if (totalMinutes > 0) {
      formatted = `${totalMinutes} min${totalMinutes === 1 ? '' : 's'}`;
    } else {
      formatted = '< 1 min';
    }

    return {
      formatted,
      totalHours,
      totalDays: days,
      isCompleted: true,
      rawMs: diffMs
    };
  } else {
    // In progress / ongoing
    const nowTime = Date.now();
    const diffMs = Math.max(0, nowTime - startTime);
    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const remainingHours = totalHours % 24;

    let formatted = '';
    if (days > 0) {
      formatted = `${days} day${days === 1 ? '' : 's'} ${remainingHours} hour${remainingHours === 1 ? '' : 's'} (ongoing)`;
    } else if (totalHours > 0) {
      formatted = `${totalHours} hour${totalHours === 1 ? '' : 's'} (ongoing)`;
    } else {
      formatted = '< 1 hour (ongoing)';
    }

    return {
      formatted,
      totalHours,
      totalDays: days,
      isCompleted: false,
      rawMs: diffMs
    };
  }
}

export async function exportComprehensiveReportExcel(
  taskList: Task[],
  ctx: ExportCtx,
  periodLabel: string,
  options?: {
    auditorSummary?: AuditorSummaryRow[];
    partnerSummary?: NzPartnerSummaryRow[];
    timeframeType?: 'monthly' | 'yearly' | 'range';
    fileNamePrefix?: string;
  }
) {
  const XLSX = await import('xlsx');

  // Sort tasks: Completed first, then in progress
  const sortedTasks = [...taskList].sort((a, b) => {
    const aComp = isTaskCompleted(a.status);
    const bComp = isTaskCompleted(b.status);
    if (aComp && !bComp) return -1;
    if (!aComp && bComp) return 1;
    // If both completed, sort by completed_at descending (or deadline/created_at)
    if (aComp && bComp) {
      const aDate = a.completed_at || a.created_at || '';
      const bDate = b.completed_at || b.created_at || '';
      return bDate.localeCompare(aDate);
    }
    // If both in progress, sort by deadline ascending
    const aDead = a.deadline || '9999-99-99';
    const bDead = b.deadline || '9999-99-99';
    return aDead.localeCompare(bDead);
  });

  // Sheet 1: Tasks
  const rows = sortedTasks.map(task => {
    const company = ctx.companies.find(c => c.id === task.company_id);
    const ttIds = task.task_type_ids?.length ? task.task_type_ids : (task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : []);
    const ttNames = ttIds.map(id => ctx.taskTypes.find(t => t.id === id)?.name).filter(Boolean).join(', ');
    const activePartnerIds = getActivePartnerIds(task);
    const allNames = activePartnerIds.map(id => ctx.partners.find(p => p.id === id)?.username).filter(Boolean);
    const assigned = allNames.length > 0 ? allNames.join(', ') : 'Unassigned';
    const auditorName = ctx.auditors.find(a => a.id === task.auditor_id)?.name || 'Direct / None';
    const isComp = isTaskCompleted(task.status);
    const completedDate = isComp
      ? (task.completed_at ? formatDate(task.completed_at) : 'Completed')
      : '—';
    const timeTaken = calculateTimeTaken(task, task.completed_at);

    return {
      'Company': company?.company_name || 'Unknown',
      'Task Type': ttNames || '—',
      'Description': task.description || '',
      'Auditor (Delegated By)': auditorName,
      'Assigned Partner(s)': assigned,
      'Priority': task.priority || 'Medium',
      'Due Date': task.deadline ? formatDate(task.deadline) : '—',
      'Time Taken': isComp ? timeTaken.formatted : timeTaken.formatted,
      'Status': task.status || 'Pending',
      'Created Date': task.created_at ? formatDate(task.created_at) : '',
    };
  });

  const wb = XLSX.utils.book_new();
  const wsTasks = XLSX.utils.json_to_sheet(rows);

  wsTasks['!cols'] = [
    { wch: 28 }, // Company
    { wch: 22 }, // Task Type
    { wch: 42 }, // Description
    { wch: 24 }, // Auditor (Delegated By)
    { wch: 26 }, // Assigned Partner(s)
    { wch: 12 }, // Priority
    { wch: 14 }, // Due Date
    { wch: 20 }, // Time Taken
    { wch: 18 }, // Status
    { wch: 16 }, // Created Date
  ];

  if (rows.length > 0) {
    const range = XLSX.utils.decode_range(wsTasks['!ref'] || 'A1:I1');
    wsTasks['!autofilter'] = { ref: `A1:I${range.e.r + 1}` };
  }

  XLSX.utils.book_append_sheet(wb, wsTasks, 'Tasks Report');

  // Sheet 2: Executive Summary & Breakdown
  let totalCompleted = 0;
  sortedTasks.forEach(t => {
    if (isTaskCompleted(t.status || '')) totalCompleted++;
  });

  const completionRate = sortedTasks.length > 0
    ? `${((totalCompleted / sortedTasks.length) * 100).toFixed(1)}%`
    : '0%';

  const summarySheetData: any[] = [
    { Section: 'Report Scope', Metric: 'Country', Value: ctx.country || 'Bahrain' },
    { Section: 'Report Scope', Metric: 'Timeframe', Value: periodLabel },
    { Section: 'Report Scope', Metric: 'Generated On', Value: formatDate(new Date()) },
    { Section: '', Metric: '', Value: '' },
    { Section: 'Totals', Metric: 'Total Tasks', Value: sortedTasks.length },
    { Section: 'Totals', Metric: 'Completed Tasks', Value: totalCompleted },
    { Section: 'Totals', Metric: 'In Progress / Pending Tasks', Value: sortedTasks.length - totalCompleted },
    { Section: 'Totals', Metric: 'Overall Completion Rate', Value: completionRate },
    { Section: '', Metric: '', Value: '' },
  ];

  if (options?.auditorSummary && options.auditorSummary.length > 0) {
    summarySheetData.push({ Section: '--- AUDITOR-WISE WORKLOAD (DELEGATED WORK) ---', Metric: '', Value: '' });
    options.auditorSummary.forEach(a => {
      summarySheetData.push({
        Section: `Auditor: ${a.name}`,
        Metric: `Tasks Delegated: ${a.totalTasks} | Completed: ${a.completedTasks}`,
        Value: `Completion Rate: ${a.completionRate}`,
      });
    });
    summarySheetData.push({ Section: '', Metric: '', Value: '' });
  }

  if (options?.partnerSummary && options.partnerSummary.length > 0) {
    summarySheetData.push({ Section: '--- PARTNER-WISE BREAKDOWN ---', Metric: '', Value: '' });
    options.partnerSummary.forEach(p => {
      summarySheetData.push({
        Section: `Partner: ${p.name}`,
        Metric: `Role: ${p.role} | Tasks: ${p.totalTasks} (Completed: ${p.completedTasks})`,
        Value: `Completion Rate: ${p.completionRate}`,
      });
    });
  }

  const wsSummary = XLSX.utils.json_to_sheet(summarySheetData);
  wsSummary['!cols'] = [{ wch: 32 }, { wch: 48 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary & Analytics');

  const cleanPeriod = periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dateStr = new Date().toISOString().split('T')[0];
  const countryPrefix = (ctx.country || 'Bahrain').replace(/\s+/g, '_');
  const prefix = options?.fileNamePrefix || `${countryPrefix}_Report`;
  XLSX.writeFile(wb, `${prefix}_${cleanPeriod}_${dateStr}.xlsx`);
}


