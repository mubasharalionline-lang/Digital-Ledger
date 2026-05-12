'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Task, Company, User, TaskType } from '@/lib/supabase';
import { getDataCountry, getSession, isAdmin } from '@/lib/auth';
import {
  Download, Upload, FileSpreadsheet, FileJson, Loader2, X,
  Calendar, Building2, Users as UsersIcon, BarChart3, CheckCircle2,
  Clock, AlertTriangle, ListTodo, Filter, Database, ArrowRight, Search
} from 'lucide-react';
import { filterTasks, exportExcel, exportFullJson, exportFullExcel } from '@/lib/reportExportUtils';

export default function BahrainReports() {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [allPartners, setAllPartners] = useState<User[]>([]);
  const [allTaskTypes, setAllTaskTypes] = useState<TaskType[]>([]);
  const [allAuditors, setAllAuditors] = useState<any[]>([]);
  const [allStatuses, setAllStatuses] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user: currentUser } = getSession();
  const isAdminUser = isAdmin(currentUser);
  const dataCountry = getDataCountry() || 'Bahrain';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [compRes, usersRes, ttRes, audRes] = await Promise.all([
        supabase.from('companies').select('*').eq('country', dataCountry),
        dataCountry ? supabase.from('users').select('*').eq('country', dataCountry) : supabase.from('users').select('*'),
        supabase.from('task_types').select('*').eq('country', dataCountry),
        dataCountry ? supabase.from('auditors').select('*').eq('country', dataCountry) : supabase.from('auditors').select('*'),
      ]);
      const compList = compRes.data || [];
      const partnerList = usersRes.data || [];
      const ttList = ttRes.data || [];
      const audList = audRes.data || [];
      setAllCompanies(compList);
      setAllPartners(partnerList);
      setAllTaskTypes(ttList);
      setAllAuditors(audList);

      const ids = compList.map(c => c.id);
      let taskList: Task[] = [];
      if (ids.length > 0) {
        const { data } = await supabase.from('tasks').select('*').in('company_id', ids);
        taskList = data || [];
      }
      setAllTasks(taskList);
      const statusSet = new Set<string>();
      taskList.forEach(t => { if (t.status) statusSet.add(t.status); });
      setAllStatuses(Array.from(statusSet).sort());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [dataCountry]);

  useEffect(() => { loadData(); }, [loadData]);

  const ctx = { tasks: allTasks, companies: allCompanies, partners: allPartners, taskTypes: allTaskTypes, auditors: allAuditors, country: dataCountry };

  // --- Export handler ---
  function handleExport(label: string, filter: Parameters<typeof filterTasks>[1]) {
    setExporting(label);
    try {
      const filtered = filterTasks(allTasks, filter);
      if (filtered.length === 0) { alert('No tasks match this filter.'); setExporting(null); return; }
      exportExcel(filtered, ctx, label);
    } catch (e: any) { alert('Export failed: ' + e.message); }
    setExporting(null);
  }

  // --- JSON import ---
  async function handleJsonImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      let imported = 0;
      if (data.companies?.length) {
        for (const c of data.companies) {
          const { error } = await supabase.from('companies').upsert(c, { onConflict: 'id' });
          if (!error) imported++;
        }
      }
      if (data.tasks?.length) {
        for (const t of data.tasks) {
          const { error } = await supabase.from('tasks').upsert(t, { onConflict: 'id' });
          if (!error) imported++;
        }
      }
      setImportResult(`Successfully imported ${imported} records. Refreshing...`);
      sessionStorage.clear();
      setTimeout(() => { loadData(); setImportResult(null); }, 2000);
    } catch (err: any) {
      setImportResult('Import failed: ' + err.message);
    }
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // --- Helpers ---
  const years = Array.from(new Set(allTasks.map(t => (t.deadline || t.created_at)?.slice(0, 4)).filter(Boolean))).sort().reverse();
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  if (!isAdminUser) return <div style={{ textAlign: 'center', padding: '60px', color: '#E74C3C', fontSize: '18px', fontWeight: 'bold' }}>Access Denied</div>;
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}><Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} color="#3b82f6" /></div>;

  const completedCount = allTasks.filter(t => { const s = t.status?.toLowerCase() || ''; return s.includes('completed') || s.includes('closed') || s.includes('filed'); }).length;

  return (
    <div style={{ paddingBottom: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px', padding: '28px 32px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)', borderRadius: '20px', boxShadow: '0 4px 20px rgba(15,23,42,0.15)' }}>
        <div className="reports-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.5px' }}>Reports & Export Center</h1>
            <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>Generate, export, backup & import your company data</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <MiniStat label="Tasks" value={allTasks.length} color="#3b82f6" />
            <MiniStat label="Done" value={completedCount} color="#10b981" />
            <MiniStat label="Companies" value={allCompanies.length} color="#8b5cf6" />
          </div>
        </div>
      </div>

      {/* Import Result Banner */}
      {importResult && (
        <div style={{ padding: '14px 20px', background: importResult.includes('fail') ? '#fef2f2' : '#f0fdf4', border: `1px solid ${importResult.includes('fail') ? '#fecaca' : '#bbf7d0'}`, borderRadius: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: importResult.includes('fail') ? '#dc2626' : '#16a34a' }}>{importResult}</span>
          <button onClick={() => setImportResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
        </div>
      )}

      {/* === DATA BACKUP SECTION === */}
      <SectionTitle icon={<Database size={18} color="#3b82f6" />} title="Data Backup & Import" subtitle="Full JSON and Excel backup of all company data" />
      <div className="reports-backup-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '32px' }}>
        <ActionCard icon={<FileJson size={20} />} label="Export JSON Backup" desc="Full data backup in JSON" color="#3b82f6" loading={exporting === 'json'}
          onClick={() => { setExporting('json'); exportFullJson(ctx); setExporting(null); }} />
        <ActionCard icon={<FileSpreadsheet size={20} />} label="Export Full Excel" desc="All data in Excel sheets" color="#10b981" loading={exporting === 'fullxl'}
          onClick={() => { setExporting('fullxl'); exportFullExcel(ctx); setExporting(null); }} />
        <ActionCard icon={<Upload size={20} />} label="Import JSON Backup" desc="Restore from JSON file" color="#f59e0b" loading={importing}
          onClick={() => fileInputRef.current?.click()} />
        <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleJsonImport} />
      </div>

      {/* === FILTERED REPORTS === */}
      <SectionTitle icon={<Filter size={18} color="#8b5cf6" />} title="Filtered Reports" subtitle="Export tasks by specific criteria as Excel files" />

      {/* Time-based */}
      <SubTitle text="By Time Period" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <FilterCard icon={<Calendar size={16} />} label="All Months (Combined)" count={allTasks.length} color="#0f172a" highlight
          loading={exporting === 'all-months'} onClick={() => handleExport('All_Tasks', {})} />
        {months.slice(0, 6).map(m => {
          const d = new Date(m + '-01');
          const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
          const count = filterTasks(allTasks, { month: m }).length;
          return <FilterCard key={m} icon={<Calendar size={16} />} label={label} count={count} color="#3b82f6"
            loading={exporting === m} onClick={() => handleExport(label, { month: m })} />;
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '28px' }}>
        {years.map(y => {
          const count = filterTasks(allTasks, { year: y }).length;
          return <FilterCard key={y} icon={<Calendar size={16} />} label={`Year ${y}`} count={count} color="#6366f1"
            loading={exporting === y} onClick={() => handleExport(`Year_${y}`, { year: y })} />;
        })}
      </div>

      {/* Company-wise */}
      <SubTitle text="By Company" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', marginBottom: '28px' }}>
        <FilterCard icon={<Building2 size={16} />} label="All Companies (Combined)" count={allTasks.length} color="#0f172a" highlight
          loading={exporting === 'all-companies'} onClick={() => handleExport('All_Companies', {})} />
        {allCompanies.slice().sort((a, b) => a.company_name.localeCompare(b.company_name)).map(c => {
          const count = filterTasks(allTasks, { companyId: c.id }).length;
          return <FilterCard key={c.id} icon={<Building2 size={16} />} label={c.company_name} count={count} color="#8b5cf6"
            loading={exporting === c.id} onClick={() => handleExport(c.company_name, { companyId: c.id })} />;
        })}
      </div>

      {/* Task Type-wise */}
      <SubTitle text="By Task Type" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '28px' }}>
        <FilterCard icon={<BarChart3 size={16} />} label="All Task Types (Combined)" count={allTasks.length} color="#0f172a" highlight
          loading={exporting === 'all-types'} onClick={() => handleExport('All_Task_Types', {})} />
        {allTaskTypes.filter(t => t.active).map(tt => {
          const count = filterTasks(allTasks, { taskTypeId: tt.id }).length;
          return <FilterCard key={tt.id} icon={<BarChart3 size={16} />} label={tt.name} count={count} color="#06b6d4"
            loading={exporting === tt.id} onClick={() => handleExport(tt.name, { taskTypeId: tt.id })} />;
        })}
      </div>

      {/* Status-wise */}
      <SubTitle text="By Status" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '28px' }}>
        <FilterCard icon={<ListTodo size={16} />} label="All Statuses (Combined)" count={allTasks.length} color="#0f172a" highlight
          loading={exporting === 'all-statuses'} onClick={() => handleExport('All_Statuses', {})} />
        {allStatuses.map(s => {
          const count = filterTasks(allTasks, { status: s }).length;
          return <FilterCard key={s} icon={<ListTodo size={16} />} label={s} count={count} color="#f59e0b"
            loading={exporting === s} onClick={() => handleExport(`Status_${s}`, { status: s })} />;
        })}
      </div>

      {/* Partner-wise */}
      <SubTitle text="By Partner / Assigned To" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '28px' }}>
        <FilterCard icon={<UsersIcon size={16} />} label="All Partners (Combined)" count={allTasks.length} color="#0f172a" highlight
          loading={exporting === 'all-partners'} onClick={() => handleExport('All_Partners', {})} />
        {allPartners.map(p => {
          const count = filterTasks(allTasks, { partnerId: p.id }).length;
          if (count === 0) return null;
          return <FilterCard key={p.id} icon={<UsersIcon size={16} />} label={p.username} count={count} color="#ec4899"
            loading={exporting === p.id} onClick={() => handleExport(`Partner_${p.username}`, { partnerId: p.id })} />;
        })}
      </div>

      {/* Auditor-wise */}
      {allAuditors.length > 0 && (<>
        <SubTitle text="By Auditor" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '28px' }}>
          <FilterCard icon={<Search size={16} />} label="All Auditors (Combined)" count={allTasks.length} color="#0f172a" highlight
            loading={exporting === 'all-auditors'} onClick={() => handleExport('All_Auditors', {})} />
          {allAuditors.map(a => {
            const count = filterTasks(allTasks, { auditorId: a.id }).length;
            if (count === 0) return null;
            return <FilterCard key={a.id} icon={<Search size={16} />} label={a.name} count={count} color="#14b8a6"
              loading={exporting === a.id} onClick={() => handleExport(`Auditor_${a.name}`, { auditorId: a.id })} />;
          })}
        </div>
      </>)}

      {/* Special Reports */}
      <SectionTitle icon={<CheckCircle2 size={18} color="#10b981" />} title="Special Reports" subtitle="Completed, pending, overdue, and daily task reports" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px', marginBottom: '28px' }}>
        <FilterCard icon={<CheckCircle2 size={16} />} label="All Completed Tasks" count={completedCount} color="#059669"
          loading={exporting === 'completed'} onClick={() => handleExport('Completed_Tasks', { mode: 'completed' })} />
        <FilterCard icon={<Clock size={16} />} label="Pending / In-Progress" count={allTasks.length - completedCount} color="#d97706"
          loading={exporting === 'pending'} onClick={() => handleExport('Pending_Tasks', { mode: 'pending' })} />
        <FilterCard icon={<AlertTriangle size={16} />} label="Overdue Tasks" count={allTasks.filter(t => {
          if (!t.deadline) return false;
          const sl = t.status?.toLowerCase() || '';
          return new Date(t.deadline) < new Date() && !sl.includes('completed') && !sl.includes('closed') && !sl.includes('filed');
        }).length} color="#ef4444"
          loading={exporting === 'overdue'} onClick={() => {
            setExporting('overdue');
            const overdue = allTasks.filter(t => {
              if (!t.deadline) return false;
              const sl = t.status?.toLowerCase() || '';
              return new Date(t.deadline) < new Date() && !sl.includes('completed') && !sl.includes('closed') && !sl.includes('filed');
            });
            if (overdue.length === 0) { alert('No overdue tasks.'); setExporting(null); return; }
            exportExcel(overdue, ctx, 'Overdue_Tasks');
            setExporting(null);
          }} />
        <FilterCard icon={<ListTodo size={16} />} label="Daily Tasks Only" count={allTasks.filter(t => t.is_daily).length} color="#7c3aed"
          loading={exporting === 'daily'} onClick={() => handleExport('Daily_Tasks', { mode: 'daily' })} />
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: `${color}20`, padding: '8px 16px', borderRadius: '10px', textAlign: 'center' }}>
      <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff' }}>{value}</div>
      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <div>
        <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{title}</h2>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>{subtitle}</p>
      </div>
    </div>
  );
}

function SubTitle({ text }: { text: string }) {
  return <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', paddingLeft: '4px' }}>{text}</div>;
}

function ActionCard({ icon, label, desc, color, loading, onClick }: {
  icon: React.ReactNode; label: string; desc: string; color: string; loading: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      display: 'flex', alignItems: 'center', gap: '14px', padding: '18px 20px',
      background: '#ffffff', border: `1px solid ${color}30`, borderRadius: '14px',
      cursor: loading ? 'wait' : 'pointer', transition: 'all 0.2s', textAlign: 'left',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)', opacity: loading ? 0.7 : 1, width: '100%',
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = `0 4px 16px ${color}20`; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = `${color}30`; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; }}
    >
      <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
        {loading ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{label}</div>
        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{desc}</div>
      </div>
      <Download size={16} color="#cbd5e1" />
    </button>
  );
}

function FilterCard({ icon, label, count, color, loading, onClick, highlight }: {
  icon: React.ReactNode; label: string; count: number; color: string; loading: boolean; onClick: () => void; highlight?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={loading || count === 0} style={{
      display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px',
      background: highlight ? 'linear-gradient(135deg, #0f172a, #1e293b)' : (count === 0 ? '#f9fafb' : '#ffffff'),
      border: highlight ? '1px solid #334155' : '1px solid #e2e8f0',
      borderRadius: '12px', cursor: count === 0 ? 'not-allowed' : (loading ? 'wait' : 'pointer'),
      transition: 'all 0.15s', textAlign: 'left', width: '100%',
      opacity: count === 0 ? 0.5 : (loading ? 0.7 : 1),
    }}
    onMouseEnter={e => { if (count > 0) { e.currentTarget.style.borderColor = highlight ? '#60a5fa' : color; e.currentTarget.style.boxShadow = highlight ? '0 4px 16px rgba(59,130,246,0.2)' : `0 3px 12px ${color}15`; } }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = highlight ? '#334155' : '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ color: highlight ? '#60a5fa' : color, flexShrink: 0 }}>{loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: highlight ? 700 : 600, color: highlight ? '#f1f5f9' : '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      </div>
      <div style={{ fontSize: '12px', fontWeight: 700, color: highlight ? '#93c5fd' : color, background: highlight ? '#1e3a5f' : `${color}10`, padding: '2px 8px', borderRadius: '8px', whiteSpace: 'nowrap' }}>{count}</div>
      <ArrowRight size={12} color={highlight ? '#60a5fa' : '#cbd5e1'} />
    </button>
  );
}
