import * as XLSX from 'xlsx';
import type { Task, Company, User, TaskType } from './supabase';

interface ExportCtx {
  tasks: Task[];
  companies: Company[];
  partners: User[];
  taskTypes: TaskType[];
  auditors: any[];
  country: string;
}

function resolveTask(task: Task, ctx: ExportCtx) {
  const company = ctx.companies.find(c => c.id === task.company_id);
  const ttIds = task.task_type_ids?.length ? task.task_type_ids : (task.task_type_id ? task.task_type_id.split(',').map(s => s.trim()).filter(Boolean) : []);
  const ttNames = ttIds.map(id => ctx.taskTypes.find(t => t.id === id)?.name).filter(Boolean).join(', ');
  const activePartnerIds = task.assigned_partners && task.assigned_partners.length > 0 
    ? task.assigned_partners 
    : (task.assigned_to ? [task.assigned_to] : []);
  const allNames = activePartnerIds.map(id => ctx.partners.find(p => p.id === id)?.username).filter(Boolean);
  const assigned = allNames.length > 0 ? allNames.join(', ') : 'Unassigned';
  const auditor = ctx.auditors.find(a => a.id === task.auditor_id)?.name || '';
  return {
    'Task ID': task.id.slice(0, 8), 'Company': company?.company_name || 'Unknown',
    'Task Type': ttNames || '—', 'Description': task.description || '',
    'Priority': task.priority, 'Status': task.status, 'Due Date': task.deadline || '',
    'Assigned To': assigned, 'Auditor': auditor,
    'Created': task.created_at ? new Date(task.created_at).toLocaleDateString() : '',
    'Daily': task.is_daily ? 'Yes' : 'No',
  };
}

const COL_WIDTHS = [
  { wch: 10 }, { wch: 25 }, { wch: 20 }, { wch: 35 }, { wch: 10 },
  { wch: 18 }, { wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 8 },
];

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
      const activeIds = t.assigned_partners && t.assigned_partners.length > 0 
        ? t.assigned_partners 
        : (t.assigned_to ? [t.assigned_to] : []);
      if (!activeIds.includes(filter.partnerId)) return false;
    }
    if (filter.auditorId && t.auditor_id !== filter.auditorId) return false;
    if (filter.mode === 'completed' && !isCompleted(t.status)) return false;
    if (filter.mode === 'pending' && isCompleted(t.status)) return false;
    if (filter.mode === 'daily' && !t.is_daily) return false;
    return true;
  });
}

export function exportExcel(filteredTasks: Task[], ctx: ExportCtx, label: string) {
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
    { Metric: 'Date', Value: new Date().toLocaleDateString() },
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

export function exportFullExcel(ctx: ExportCtx) {
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
    'FY End': c.fy_end || '', Created: c.created_at?.slice(0, 10) || '',
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
