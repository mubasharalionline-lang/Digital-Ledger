import { ConfirmationTemplate } from './types';

export const CONFIRMATION_TEMPLATES: ConfirmationTemplate[] = [
  {
    id: 'letter-of-undertaking-172',
    name: 'Letter of Undertaking (172)',
    code: '172',
    active: true,
    fields: [
      {
        name: 'companyName',
        label: 'Company Name',
        type: 'text',
        required: true,
        behavior: 'Auto-filled from company'
      },
      {
        name: 'currentDate',
        label: 'Current Date',
        type: 'text',
        required: true,
        behavior: 'Auto-filled with today\'s date'
      },
      {
        name: 'crNo',
        label: 'CR No.',
        type: 'text',
        placeholder: 'e.g. 151702-1',
        required: true,
        behavior: 'Manual input'
      },
      {
        name: 'fiscalYear',
        label: 'Fiscal Year',
        type: 'text',
        placeholder: 'e.g. 2023',
        required: true,
        behavior: 'Manual input'
      },
      {
        name: 'authorisedSignatory',
        label: 'Authorised Signatory',
        type: 'text',
        placeholder: 'e.g. MD NOOR HOSSAIN MD JONAILABDIN',
        required: true,
        behavior: 'Manual input'
      }
    ]
  },
  { id: 'agm-notice', name: 'AGM (Annual General Meeting) Notice', code: 'agm', active: false, fields: [] },
  { id: 'bank-confirmation', name: 'Bank Confirmation', code: 'bank', active: false, fields: [] },
  { id: 'cash-confirmation', name: 'Cash Confirmation', code: 'cash', active: false, fields: [] },
  { id: 'confirmation-due-from-related-party', name: 'Confirmation Due from Related Party', code: 'related-from', active: false, fields: [] },
  { id: 'confirmation-due-to-related-party', name: 'Confirmation Due to Related Party', code: 'related-to', active: false, fields: [] },
  { id: 'director-remuneration', name: 'Director Remuneration', code: 'director', active: false, fields: [] },
  { id: 'board-resolution-dls', name: 'Board Resolution (DLS)', code: 'board-res', active: false, fields: [] },
  { id: 'letter-of-commitment-68', name: 'Letter of Commitment (68)', code: 'commitment-68', active: false, fields: [] },
  { id: 'noc-disclaimer-report', name: 'NOC (Disclaimer Report)', code: 'noc', active: false, fields: [] },
  { id: 'shareholders-current-account-confirmation', name: 'Shareholders Current Account Confirmation', code: 'shareholder', active: false, fields: [] },
  { id: 'vat-contact-authorization', name: 'VAT Contact Authorization', code: 'vat-auth', active: false, fields: [] },
  { id: 'esr', name: 'ESR', code: 'esr', active: false, fields: [] },
  { id: 'minutes-of-board-meeting', name: 'Minutes of Board Meeting', code: 'minutes', active: false, fields: [] }
];

export interface LetterContent {
  to: string;
  recipientAddress: string[];
  date: string;
  subject: string;
  salutation: string;
  companyNameLine: string;
  paragraphs: string[];
  signoff: string;
  signatory: string;
}

export function generateLetterOfUndertaking172(values: Record<string, string>): LetterContent {
  const companyName = (values.companyName || '').toUpperCase();
  const crNo = values.crNo || '';
  const fiscalYear = values.fiscalYear || '';
  const currentDate = values.currentDate || '';
  const authorisedSignatory = (values.authorisedSignatory || '').toUpperCase();

  return {
    to: 'To,',
    recipientAddress: [
      'Ministry of Industry, Commerce, and Tourism',
      'Bahrain'
    ],
    date: currentDate,
    subject: 'Subject: Undertaking - Provision of Supporting Documents to External Auditor and Audit Report Acceptance',
    salutation: 'Dear Sir/Madam,',
    companyNameLine: `${companyName}(CR NO. ${crNo})`,
    paragraphs: [
      `assures the Ministry that our company is committed to providing comprehensive supporting documentation to our external auditor for all amounts referenced in future financial statement audits. Acknowledging the critical importance of precise financial reporting, we commit to maintaining accurate records and robust internal controls to facilitate an effective audit process.`,
      `Additionally, we kindly seek the MOIC's approval for our audit report for the fiscal year ${fiscalYear}. Our financial statements for ${fiscalYear} have undergone thorough scrutiny, and we respectfully request the MOIC's acceptance of the audit report.`,
      `We appreciate your attention to this matter and anticipate a positive response regarding the acceptance of our audit report for the year ${fiscalYear} and removal of the violation from our CR at the earliest.`
    ],
    signoff: 'Yours sincerely,',
    signatory: authorisedSignatory
  };
}
