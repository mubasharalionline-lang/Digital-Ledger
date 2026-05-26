'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSession, getDataCountry } from '@/lib/auth';
import { supabase, Company } from '@/lib/supabase';
import {
  ArrowLeft,
  FileText,
  Lock,
  Printer,
  Download,
  CheckCircle2,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { CONFIRMATION_TEMPLATES } from '@/lib/confirmations/templates';
import { exportConfirmationDocx } from '@/lib/confirmations/docxExporter';

// Utility to get today's date formatted as DD-MMM-YY (e.g. 26-May-26)
function getFormattedToday(): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mmm = months[today.getMonth()];
  const yy = String(today.getFullYear()).slice(-2);
  return `${dd}-${mmm}-${yy}`;
}

export default function ConfirmationsGeneratorPage() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<Company | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);

  // Form values state
  const [formValues, setFormValues] = useState<Record<string, string>>({
    companyName: '',
    currentDate: '',
    crNo: '',
    fiscalYear: '',
    authorisedSignatory: ''
  });

  useEffect(() => {
    const { user: u } = getSession();
    if (!u) {
      router.push('/');
      return;
    }
    loadCompanyData();
  }, [id, router]);

  async function loadCompanyData() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        router.push('/dashboard/companies');
        return;
      }

      // Country isolation check
      const dataCountry = getDataCountry();
      if (dataCountry && data.country !== dataCountry) {
        router.push('/dashboard/companies');
        return;
      }

      setCompany(data);
      setFormValues(prev => ({
        ...prev,
        companyName: data.company_name,
        currentDate: getFormattedToday()
      }));
    } catch (err) {
      console.error('Error loading company data:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormValues(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const triggerPrint = () => {
    window.print();
  };

  const triggerDocxExport = async () => {
    if (!activeTemplate) return;
    await exportConfirmationDocx(activeTemplate, formValues);
  };

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <div className="skeleton" style={{ height: '24px', width: '100px', marginBottom: '24px' }} />
        <div className="skeleton" style={{ height: '180px', borderRadius: '16px', marginBottom: '24px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
          <div className="skeleton" style={{ height: '120px', borderRadius: '12px' }} />
          <div className="skeleton" style={{ height: '120px', borderRadius: '12px' }} />
          <div className="skeleton" style={{ height: '120px', borderRadius: '12px' }} />
        </div>
      </div>
    );
  }

  if (!company) return null;

  const isBahrain = company?.country?.toLowerCase() === 'bahrain';

  return (
    <div className="confirmations-page-wrapper">
      {/* Dynamic Scoped CSS Styles */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .confirmations-page-wrapper {
            font-family: inherit;
            color: var(--text-primary);
          }
          
          .back-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: none;
            border: none;
            cursor: pointer;
            font-size: 14px;
            color: var(--accent);
            font-weight: 500;
            margin-bottom: 20px;
            transition: var(--transition);
          }
          
          .back-btn:hover {
            color: var(--accent-hover);
          }

          .page-header {
            margin-bottom: 24px;
          }

          .page-title {
            font-size: 22px;
            font-weight: 700;
            color: var(--text-primary);
            letter-spacing: -0.02em;
            margin-bottom: 6px;
          }

          .page-subtitle {
            font-size: 14px;
            color: var(--text-secondary);
          }

          /* GRID SYSTEM */
          .templates-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 16px;
            margin-top: 10px;
          }

          .template-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-light);
            border-radius: var(--card-radius);
            padding: 20px;
            position: relative;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-height: 150px;
            transition: var(--transition);
            box-shadow: var(--card-shadow);
          }

          .template-card.active {
            border-color: rgba(59, 130, 246, 0.2);
            cursor: pointer;
          }

          .template-card.active:hover {
            transform: translateY(-2px);
            border-color: var(--accent);
            box-shadow: var(--card-shadow-hover);
          }

          .template-card.locked {
            opacity: 0.65;
            cursor: not-allowed;
            border-style: dashed;
            background: rgba(255,255,255,0.4);
          }

          .card-top {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            margin-bottom: 12px;
          }

          .icon-box {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .active-icon {
            background: var(--accent-light);
            color: var(--accent);
          }

          .locked-icon {
            background: var(--bg-tertiary);
            color: var(--text-tertiary);
          }

          .badge-soon {
            font-size: 11px;
            font-weight: 600;
            background: var(--bg-tertiary);
            color: var(--text-secondary);
            padding: 3px 8px;
            border-radius: 6px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
          }

          .card-name {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary);
            line-height: 1.4;
          }

          .card-action-text {
            font-size: 12px;
            font-weight: 500;
            color: var(--accent);
            margin-top: 12px;
            display: flex;
            align-items: center;
            gap: 2px;
          }

          /* WORKSPACE SPLIT LAYOUT */
          .workspace-layout {
            display: grid;
            grid-template-columns: 420px 1fr;
            gap: 24px;
            align-items: start;
          }

          .form-panel {
            background: var(--bg-secondary);
            border: 1px solid var(--border-light);
            border-radius: var(--card-radius);
            padding: 24px;
            box-shadow: var(--card-shadow);
          }

          .form-group {
            margin-bottom: 20px;
          }

          .form-label-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
          }

          .form-label {
            font-size: 13px;
            font-weight: 600;
            color: var(--text-primary);
          }

          .form-badge {
            font-size: 11px;
            font-weight: 500;
            color: var(--text-tertiary);
          }

          .form-input {
            width: 100%;
            padding: 10px 14px;
            border: 1px solid var(--border);
            border-radius: 10px;
            font-size: 14px;
            font-family: inherit;
            outline: none;
            transition: var(--transition);
            background: var(--bg-secondary);
          }

          .form-input:focus {
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
          }

          .form-input:disabled {
            background: var(--bg-tertiary);
            color: var(--text-secondary);
            cursor: not-allowed;
          }

          .preview-panel {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .preview-actions {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .action-btn-group {
            display: flex;
            gap: 10px;
          }

          /* SHEET PREVIEW */
          .preview-sheet-container {
            background: #e2e8f0;
            border-radius: 12px;
            padding: 40px 20px;
            display: flex;
            justify-content: center;
            overflow-x: auto;
          }

          .preview-sheet {
            background: #ffffff;
            width: 100%;
            max-width: 800px;
            min-height: 1000px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.08);
            padding: 1.2in 1in 1in 1in;
            font-family: 'Times New Roman', Times, serif;
            font-size: 16px;
            line-height: 1.5;
            color: #000000;
            box-sizing: border-box;
            text-align: left;
            position: relative;
          }

          /* PRINT MEDIA */
          @media print {
            body * {
              visibility: hidden !important;
            }
            .print-area-target, .print-area-target * {
              visibility: visible !important;
            }
            .print-area-target {
              position: absolute;
              left: 0;
              top: 0;
              width: 100% !important;
              max-width: 100% !important;
              box-shadow: none !important;
              border: none !important;
              padding: 0.8in 0.8in 0.8in 0.8in !important;
              margin: 0 !important;
              background: white !important;
              color: black !important;
            }
          }

          @media (max-width: 1024px) {
            .workspace-layout {
              grid-template-columns: 1fr;
            }
          }
        `
      }} />

      {/* Back Button */}
      <button
        onClick={() => {
          if (activeTemplate) {
            setActiveTemplate(null);
          } else {
            router.push(`/dashboard/companies/${id}`);
          }
        }}
        className="back-btn"
      >
        <ArrowLeft size={16} />
        {activeTemplate ? 'Back to Document Types' : 'Back to Company Page'}
      </button>

      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">
          {activeTemplate ? 'Document Generator Workspace' : 'Confirmations & Document Generator'}
        </h1>
        <p className="page-subtitle">
          {activeTemplate
            ? `Generating document for ${company.company_name}`
            : `Create professional business confirmation letters for ${company.company_name}`
          }
        </p>
      </div>

      {/* main area */}
      {!isBahrain ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 24px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--card-radius)',
          boxShadow: 'var(--card-shadow)',
          textAlign: 'center',
          maxWidth: '520px',
          margin: '40px auto 0'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px'
          }}>
            <FileText size={28} />
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Coming Soon
          </h3>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Confirmations module is not yet available for this country.
          </p>
        </div>
      ) : !activeTemplate ? (
        // VIEW 1: Directory grid of templates
        <div className="templates-grid">
          {CONFIRMATION_TEMPLATES.map((tmpl) => (
            <div
              key={tmpl.id}
              onClick={() => {
                if (tmpl.active) {
                  setActiveTemplate(tmpl.id);
                }
              }}
              className={`template-card ${tmpl.active ? 'active' : 'locked'}`}
            >
              <div className="card-top">
                <div className={`icon-box ${tmpl.active ? 'active-icon' : 'locked-icon'}`}>
                  <FileText size={20} />
                </div>
                {!tmpl.active ? (
                  <span className="badge-soon">
                    <Lock size={10} /> Locked
                  </span>
                ) : (
                  <span className="badge-soon" style={{ color: 'var(--success)', background: '#e8fdf0' }}>
                    <CheckCircle2 size={10} color="var(--success)" /> Active
                  </span>
                )}
              </div>
              <div>
                <h3 className="card-name">{tmpl.name}</h3>
                {tmpl.active && (
                  <div className="card-action-text">
                    Generate Now <ChevronRight size={14} />
                  </div>
                )}
                {!tmpl.active && (
                  <div className="card-action-text" style={{ color: 'var(--text-tertiary)' }}>
                    Coming Soon
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : isBahrain ? (
        // VIEW 2: SPLIT SCREEN EDITOR
        <div className="workspace-layout">
          {/* Left Form Panel */}
          <div className="form-panel">
            <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
              Document Fields
            </h2>
            
            {/* Field: Company Name (Read-only) */}
            <div className="form-group">
              <div className="form-label-row">
                <label className="form-label">Company Name</label>
                <span className="form-badge">Auto-filled</span>
              </div>
              <input
                type="text"
                className="form-input"
                value={formValues.companyName}
                disabled
              />
            </div>

            {/* Field: Current Date (Auto-filled) */}
            <div className="form-group">
              <div className="form-label-row">
                <label className="form-label">Current Date</label>
                <span className="form-badge">Auto-filled</span>
              </div>
              <input
                type="text"
                className="form-input"
                value={formValues.currentDate}
                onChange={(e) => handleInputChange('currentDate', e.target.value)}
              />
            </div>

            {/* Field: CR No. */}
            <div className="form-group">
              <div className="form-label-row">
                <label className="form-label">CR No. *</label>
                <span className="form-badge">Manual input</span>
              </div>
              <input
                type="text"
                placeholder="e.g. 151702-1"
                className="form-input"
                value={formValues.crNo}
                onChange={(e) => handleInputChange('crNo', e.target.value)}
                required
              />
            </div>

            {/* Field: Fiscal Year */}
            <div className="form-group">
              <div className="form-label-row">
                <label className="form-label">Fiscal Year *</label>
                <span className="form-badge">Manual input</span>
              </div>
              <input
                type="text"
                placeholder="e.g. 2023"
                className="form-input"
                value={formValues.fiscalYear}
                onChange={(e) => handleInputChange('fiscalYear', e.target.value)}
                required
              />
            </div>

            {/* Field: Authorised Signatory */}
            <div className="form-group">
              <div className="form-label-row">
                <label className="form-label">Authorised Signatory *</label>
                <span className="form-badge">Manual input</span>
              </div>
              <input
                type="text"
                placeholder="e.g. MD NOOR HOSSAIN MD JONAILABDIN"
                className="form-input"
                value={formValues.authorisedSignatory}
                onChange={(e) => handleInputChange('authorisedSignatory', e.target.value)}
                required
              />
            </div>
            
            <div style={{ marginTop: '24px', padding: '16px', background: 'var(--accent-light)', borderRadius: '12px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <Sparkles size={16} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <p style={{ fontSize: '12px', color: 'var(--accent-hover)', lineHeight: 1.4, fontWeight: 500 }}>
                Fill in the CR No., Fiscal Year, and Authorised Signatory fields. The letter layout on the right updates automatically.
              </p>
            </div>
          </div>

          {/* Right Preview Panel */}
          <div className="preview-panel">
            <div className="preview-actions">
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Live Document Preview (A4 Page)
              </div>
              <div className="action-btn-group">
                <button
                  onClick={triggerPrint}
                  className="btn btn-secondary"
                  style={{ padding: '8px 14px', fontSize: '13px' }}
                >
                  <Printer size={15} /> Export as PDF
                </button>
                <button
                  onClick={triggerDocxExport}
                  className="btn btn-primary"
                  style={{ padding: '8px 14px', fontSize: '13px' }}
                >
                  <Download size={15} /> Export as Word (.docx)
                </button>
              </div>
            </div>

            {/* Simulated Sheet Canvas */}
            <div className="preview-sheet-container">
              <div className="preview-sheet print-area-target" id="print-document-preview">
                {/* To and Date row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                  <div>To,</div>
                  <div>{formValues.currentDate || '____'}</div>
                </div>

                {/* Recipient address */}
                <div style={{ marginBottom: '24px' }}>
                  Ministry of Industry, Commerce, and Tourism<br />
                  Bahrain
                </div>

                {/* Subject */}
                <div style={{ fontWeight: 'bold', marginBottom: '24px' }}>
                  Subject: Undertaking - Provision of Supporting Documents to External Auditor and Audit Report Acceptance
                </div>

                {/* Salutation */}
                <div style={{ marginBottom: '24px' }}>
                  Dear Sir/Madam,
                </div>

                {/* Company Name / CR row */}
                <div style={{ fontWeight: 'bold', marginBottom: '16px' }}>
                  {(formValues.companyName || '').toUpperCase()}(CR NO. {formValues.crNo || '________'})
                </div>

                {/* Paragraphs */}
                <div style={{ textAlign: 'justify', marginBottom: '18px' }}>
                  assures the Ministry that our company is committed to providing comprehensive supporting documentation to our external auditor for all amounts referenced in future financial statement audits. Acknowledging the critical importance of precise financial reporting, we commit to maintaining accurate records and robust internal controls to facilitate an effective audit process.
                </div>

                <div style={{ textAlign: 'justify', marginBottom: '18px' }}>
                  Additionally, we kindly seek the MOIC's approval for our audit report for the fiscal year {formValues.fiscalYear || '____'}. Our financial statements for {formValues.fiscalYear || '____'} have undergone thorough scrutiny, and we respectfully request the MOIC's acceptance of the audit report.
                </div>

                <div style={{ textAlign: 'justify', marginBottom: '32px' }}>
                  We appreciate your attention to this matter and anticipate a positive response regarding the acceptance of our audit report for the year {formValues.fiscalYear || '____'} and removal of the violation from our CR at the earliest.
                </div>

                {/* Signoff */}
                <div style={{ marginBottom: '40px' }}>
                  Yours sincerely,
                </div>

                {/* Signature Block */}
                <div>
                  _________________________<br />
                  <span style={{ fontWeight: 'bold' }}>{(formValues.authorisedSignatory || 'Authorized Signatory').toUpperCase()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
