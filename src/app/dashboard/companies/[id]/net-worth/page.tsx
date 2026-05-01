'use client';
import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { generateNetWorthDocx } from '@/lib/docxGenerators/netWorthCertificate';

export default function NetWorthCertificatePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [d, setD] = useState({
    name: '', rel: 'S/o', father: '', addr1: '', addr2: '', passport: '', certDate: '', refNo: '',
    joint: false, jName: '', jRel: 'W/o', jFather: '', jAddr: '', jPassport: '',
    caName: 'CA. Syed Nasiruddin', caDesig: 'Partner', firmName: 'AM Sharma & Associates', firmReg: '030525N', memNo: '555803', udin: '26555803XXXXXXXX', place: 'Qadian', dated: '',
    currency: 'EUR', customCurr: '', customSym: '', exRate: '', rateDate: '', rateSource: 'xe.com',
    immovEntries: [] as any[],
    bankEntries: [] as any[],
    bfdEntries: [] as any[],
    poEntries: [] as any[],
    ppfEntries: [] as any[],
    shEntries: [] as any[],
    oaEntries: [] as any[],
    gold: '', cash: '', hhgoods: '',
    pan: '', fy: '', income: '', itrDate: '', itrAck: '',
    pan2: '', fy2: '', income2: '', itrDate2: '', itrAck2: ''
  });

  const upd = (key: string, val: any) => setD(prev => ({ ...prev, [key]: val }));
  const updArr = (arr: string, idx: number, key: string, val: any) => {
    setD(prev => {
      const newArr = [...(prev as any)[arr]];
      newArr[idx][key] = val;
      return { ...prev, [arr]: newArr };
    });
  };
  const addArr = (arr: string, obj: any) => setD(prev => ({ ...prev, [arr]: [...(prev as any)[arr], obj] }));
  const rmArr = (arr: string, idx: number) => setD(prev => ({ ...prev, [arr]: (prev as any)[arr].filter((_: any, i: number) => i !== idx) }));

  const rate = parseFloat(d.exRate) || 0;
  const sym = d.currency === 'EUR' ? '€' : d.currency === 'GBP' ? '£' : d.currency === 'USD' ? '$' : d.currency === 'CAD' ? 'CA$' : d.currency === 'AUD' ? 'A$' : d.customSym;
  const currCode = d.currency === 'OTHER' ? d.customCurr : d.currency;

  const totalImmov = useMemo(() => {
    let t = 0;
    d.immovEntries.forEach(e => t += parseFloat(e.val) || 0);
    d.oaEntries.filter(e => e.cat === 'Immovable').forEach(e => t += parseFloat(e.val) || 0);
    return t;
  }, [d.immovEntries, d.oaEntries]);

  const totalMov = useMemo(() => {
    let t = 0;
    d.bankEntries.forEach(e => t += parseFloat(e.bal) || 0);
    d.bfdEntries.forEach(e => t += parseFloat(e.amt) || 0);
    d.poEntries.forEach(e => t += parseFloat(e.amt) || 0);
    d.ppfEntries.forEach(e => t += parseFloat(e.bal) || 0);
    d.shEntries.forEach(e => t += parseFloat(e.val) || 0);
    d.oaEntries.filter(e => e.cat !== 'Immovable').forEach(e => t += parseFloat(e.val) || 0);
    t += parseFloat(d.gold) || 0;
    t += parseFloat(d.cash) || 0;
    t += parseFloat(d.hhgoods) || 0;
    return t;
  }, [d]);

  const grand = totalImmov + totalMov;
  const foreign = rate > 0 ? grand / rate : 0;

  const amtWords = (num: number) => {
    if (num === 0) return 'Zero Only';
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const numToWords = (n: number): string => {
      if ((n = n | 0) === 0) return '';
      if (n < 20) return a[n];
      if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : ' ');
      if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? 'and ' + numToWords(n % 100) : '');
      if (n < 100000) return numToWords(Math.floor(n / 1000)) + 'Thousand ' + (n % 1000 !== 0 ? numToWords(n % 1000) : '');
      if (n < 10000000) return numToWords(Math.floor(n / 100000)) + 'Lakh ' + (n % 100000 !== 0 ? numToWords(n % 100000) : '');
      return numToWords(Math.floor(n / 10000000)) + 'Crore ' + (n % 10000000 !== 0 ? numToWords(n % 10000000) : '');
    };
    return 'Rupees ' + numToWords(num).trim() + ' Only';
  };

  const handleGenerate = () => {
    const dataToExport = {
      ...d,
      sym, curr: currCode, rate,
      totalImmov, totalMov, grand, foreign,
      grandWords: amtWords(grand),
      income: parseFloat(d.income) || 0,
      income2: parseFloat(d.income2) || 0,
    };
    generateNetWorthDocx(dataToExport);
  };

  return (
    <div className="nwc-wrapper">
      <style dangerouslySetInnerHTML={{__html: `
        .nwc-wrapper { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; min-height: 100vh; padding-bottom: 40px; }
        .nwc-wrapper .app-header { background: #1a3a5c; color: #fff; padding: 15px 24px; display: flex; justify-content: space-between; align-items: center; }
        .nwc-wrapper .app-header .h1 { font-size: 17px; font-weight: 700; }
        .nwc-wrapper .app-header .sub { font-size: 12px; opacity: 0.8; margin-top: 4px; }
        .nwc-wrapper .btn-gen { background: #27ae60; color: #fff; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 13px; transition: background .2s; }
        .nwc-wrapper .btn-gen:hover { background: #219653; }
        
        .nwc-wrapper .layout { display: flex; gap: 20px; padding: 20px; max-width: 1200px; margin: 0 auto; align-items: flex-start; }
        .nwc-wrapper .form-area { flex: 1; min-width: 0; }
        .nwc-wrapper .sidebar { width: 275px; flex-shrink: 0; }

        .nwc-wrapper .card { background: #fff; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 14px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
        .nwc-wrapper .ch { padding: 11px 16px; font-weight: 700; font-size: 12px; letter-spacing: .4px; text-transform: uppercase; display: flex; align-items: center; justify-content: space-between; }
        .nwc-wrapper .cb { padding: 14px 16px; }

        .nwc-wrapper .s1 .ch { background: #e8f0fb; color: #1a3a5c; border-bottom: 2px solid #2e75b6; }
        .nwc-wrapper .s2 .ch { background: #fff3e0; color: #7b3f00; border-bottom: 2px solid #e67e22; }
        .nwc-wrapper .s3 .ch { background: #f0faf4; color: #1a4f2e; border-bottom: 2px solid #27ae60; }
        .nwc-wrapper .s4 .ch { background: #fdf6e3; color: #6b4f00; border-bottom: 2px solid #f39c12; }
        .nwc-wrapper .s5 .ch { background: #fce8e8; color: #6b0000; border-bottom: 2px solid #c0392b; }
        .nwc-wrapper .s6 .ch { background: #e8f0fb; color: #1a3a5c; border-bottom: 2px solid #2e75b6; }
        .nwc-wrapper .s7 .ch { background: #eaf4fb; color: #124a6b; border-bottom: 2px solid #3498db; }
        .nwc-wrapper .s8 .ch { background: #fdf0fa; color: #5b0b5b; border-bottom: 2px solid #9b59b6; }
        .nwc-wrapper .s9 .ch { background: #f0f9f4; color: #0d3d25; border-bottom: 2px solid #16a085; }
        .nwc-wrapper .s10 .ch { background: #fff8e1; color: #5d4037; border-bottom: 2px solid #f57f17; }
        .nwc-wrapper .s11 .ch { background: #f5f5f5; color: #333; border-bottom: 2px solid #7f8c8d; }
        .nwc-wrapper .s12 .ch { background: #f0eafa; color: #3b1f6b; border-bottom: 2px solid #8e44ad; }
        .nwc-wrapper .s13 .ch { background: #e8faf0; color: #0d5c3a; border-bottom: 2px solid #1abc9c; }

        .nwc-wrapper .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
        .nwc-wrapper .g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 11px; }
        .nwc-wrapper .g4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 11px; }
        .nwc-wrapper .full { grid-column: 1/-1; }

        .nwc-wrapper .fld { display: flex; flex-direction: column; gap: 3px; }
        .nwc-wrapper .fld label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .3px; }
        .nwc-wrapper .fld input, .nwc-wrapper .fld select, .nwc-wrapper .fld textarea { padding: 7px 9px; border: 1px solid #cbd5e1; border-radius: 5px; font-size: 13px; color: #0f172a; background: #fafcff; transition: border-color .15s; font-family: inherit; }
        .nwc-wrapper .fld input:focus, .nwc-wrapper .fld select:focus, .nwc-wrapper .fld textarea:focus { outline: none; border-color: #2e75b6; box-shadow: 0 0 0 3px rgba(46,117,182,.12); background: #fff; }
        .nwc-wrapper .fld textarea { resize: vertical; min-height: 52px; }

        .nwc-wrapper .tog-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
        .nwc-wrapper .tog-row label { font-size: 13px; font-weight: 600; cursor: pointer; }
        .nwc-wrapper .tog { position: relative; width: 42px; height: 23px; background: #ccc; border-radius: 12px; cursor: pointer; transition: background .2s; flex-shrink: 0; }
        .nwc-wrapper .tog.on { background: #2e75b6; }
        .nwc-wrapper .tog::after { content: ''; position: absolute; width: 17px; height: 17px; background: #fff; border-radius: 50%; top: 3px; left: 3px; transition: transform .2s; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
        .nwc-wrapper .tog.on::after { transform: translateX(19px); }

        .nwc-wrapper .entry { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 9px; background: #fafcff; }
        .nwc-wrapper .entry-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .nwc-wrapper .entry-lbl { font-size: 12px; font-weight: 700; color: #2e75b6; text-transform: uppercase; letter-spacing: .3px; }
        .nwc-wrapper .btn-rem { background: none; border: 1px solid #e74c3c; color: #e74c3c; padding: 3px 9px; border-radius: 4px; font-size: 12px; cursor: pointer; transition: all .15s; }
        .nwc-wrapper .btn-rem:hover { background: #e74c3c; color: #fff; }
        .nwc-wrapper .btn-add { background: none; border: 1px dashed #2e75b6; color: #2e75b6; padding: 7px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; width: 100%; margin-top: 3px; transition: all .15s; }
        .nwc-wrapper .btn-add:hover { background: #e8f0fb; }

        /* SIDEBAR */
        .nwc-wrapper .sc { background: #fff; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; position: sticky; top: 20px; box-shadow: 0 1px 6px rgba(0,0,0,.08); }
        .nwc-wrapper .st { background: #1a3a5c; color: #fff; padding: 11px 14px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; }
        .nwc-wrapper .sb { padding: 12px 14px; }
        .nwc-wrapper .tr { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #eee; font-size: 12px; }
        .nwc-wrapper .tr:last-child { border-bottom: none; }
        .nwc-wrapper .tr .lbl { color: #64748b; }
        .nwc-wrapper .tr .amt { font-weight: 700; font-family: 'Courier New', monospace; font-size: 12px; }
        .nwc-wrapper .grand-box { background: #e8f0fb; border-radius: 6px; padding: 9px 11px; margin-top: 9px; display: flex; justify-content: space-between; }
        .nwc-wrapper .grand-box .lbl { font-weight: 700; font-size: 13px; color: #1a3a5c; }
        .nwc-wrapper .grand-box .amt { font-size: 14px; color: #1a3a5c; font-weight: 700; font-family: monospace; }
        .nwc-wrapper .fx-box { background: #f0faf4; border-radius: 6px; padding: 9px 11px; margin-top: 7px; display: flex; justify-content: space-between; }
        .nwc-wrapper .fx-box .lbl { color: #1a6b3c; font-weight: 600; font-size: 12px; }
        .nwc-wrapper .fx-box .amt { color: #1a6b3c; font-weight: 700; font-family: monospace; font-size: 12px; }
        .nwc-wrapper .words-box { background: #fffbf0; border-radius: 6px; padding: 9px 11px; margin-top: 7px; font-size: 11px; color: #6b4f00; font-style: italic; line-height: 1.5; }
        .nwc-wrapper .sg { padding: 12px 14px; border-top: 1px solid #e2e8f0; }
        .nwc-wrapper .sg .btn-gen { width: 100%; }

        @media(max-width:900px){.nwc-wrapper .layout{flex-direction:column;}.nwc-wrapper .sidebar{width:100%;position:static;}.nwc-wrapper .g4{grid-template-columns:1fr 1fr;}.nwc-wrapper .g3{grid-template-columns:1fr 1fr;}}
        @media(max-width:600px){.nwc-wrapper .g2,.nwc-wrapper .g3,.nwc-wrapper .g4{grid-template-columns:1fr;}.nwc-wrapper .layout{padding:10px;}}
      `}} />

      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => router.push(`/dashboard/companies/${id}`)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px' }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="h1">Net Worth Certificate Preparer</div>
            <div className="sub">AM Sharma & Associates — Chartered Accountants</div>
          </div>
        </div>
        <button className="btn-gen" onClick={handleGenerate}>⬇ Generate Certificate (.docx)</button>
      </div>

      <div className="layout">
        <div className="form-area">
          
          {/* 1. APPLICANT */}
          <div className="card s1">
            <div className="ch"><span>👤 Applicant Details</span></div>
            <div className="cb">
              <div className="g2" style={{ marginBottom: '11px' }}>
                <div className="fld full"><label>Full Name</label><input type="text" placeholder="e.g. Mohammad Ahsan" value={d.name} onChange={e => upd('name', e.target.value)} /></div>
                <div className="fld"><label>Relationship</label>
                  <select value={d.rel} onChange={e => upd('rel', e.target.value)}>
                    <option value="S/o">S/o (Son of)</option><option value="D/o">D/o (Daughter of)</option>
                    <option value="W/o">W/o (Wife of)</option><option value="H/o">H/o (Husband of)</option>
                  </select>
                </div>
                <div className="fld"><label>Father / Spouse Name</label><input type="text" placeholder="e.g. Mohammad Hussain" value={d.father} onChange={e => upd('father', e.target.value)} /></div>
                <div className="fld full"><label>Address Line 1</label><input type="text" placeholder="e.g. Mohalla Ahmadiyya" value={d.addr1} onChange={e => upd('addr1', e.target.value)} /></div>
                <div className="fld full"><label>Address Line 2 (City, District, State – PIN)</label><input type="text" placeholder="e.g. Qadian, Gurdaspur, Punjab – 143516" value={d.addr2} onChange={e => upd('addr2', e.target.value)} /></div>
                <div className="fld"><label>Passport Number</label><input type="text" placeholder="e.g. X5430995" value={d.passport} onChange={e => upd('passport', e.target.value)} /></div>
                <div className="fld"><label>Certificate Date</label><input type="text" placeholder="e.g. 15.04.2026" value={d.certDate} onChange={e => upd('certDate', e.target.value)} /></div>
                <div className="fld"><label>Ref No. (optional)</label><input type="text" placeholder="e.g. AMS/2026/001" value={d.refNo} onChange={e => upd('refNo', e.target.value)} /></div>
              </div>
              <div className="tog-row">
                <div className={`tog ${d.joint ? 'on' : ''}`} onClick={() => upd('joint', !d.joint)}></div>
                <label onClick={() => upd('joint', !d.joint)}>Joint Account / Joint Holder</label>
              </div>
            </div>
          </div>

          {/* 2. JOINT */}
          {d.joint && (
            <div className="card s2">
              <div className="ch"><span>👥 Joint Holder (Holder 2)</span></div>
              <div className="cb">
                <div className="g2">
                  <div className="fld full"><label>Full Name (Joint Holder)</label><input type="text" placeholder="e.g. Fatima Ahsan" value={d.jName} onChange={e => upd('jName', e.target.value)} /></div>
                  <div className="fld"><label>Relationship</label>
                    <select value={d.jRel} onChange={e => upd('jRel', e.target.value)}>
                      <option value="W/o">W/o</option><option value="S/o">S/o</option>
                      <option value="D/o">D/o</option><option value="H/o">H/o</option>
                    </select>
                  </div>
                  <div className="fld"><label>Father / Spouse Name</label><input type="text" placeholder="e.g. Ahmad Ali" value={d.jFather} onChange={e => upd('jFather', e.target.value)} /></div>
                  <div className="fld full"><label>Address (if different)</label><input type="text" placeholder="Leave blank if same" value={d.jAddr} onChange={e => upd('jAddr', e.target.value)} /></div>
                  <div className="fld"><label>Passport Number</label><input type="text" placeholder="e.g. Y1234567" value={d.jPassport} onChange={e => upd('jPassport', e.target.value)} /></div>
                </div>
              </div>
            </div>
          )}

          {/* 3. CA DETAILS */}
          <div className="card s3">
            <div className="ch"><span>🏛 CA / Firm Details</span></div>
            <div className="cb">
              <div className="g3">
                <div className="fld"><label>CA Name</label><input type="text" value={d.caName} onChange={e => upd('caName', e.target.value)} /></div>
                <div className="fld"><label>Designation</label><input type="text" value={d.caDesig} onChange={e => upd('caDesig', e.target.value)} /></div>
                <div className="fld"><label>Firm Name</label><input type="text" value={d.firmName} onChange={e => upd('firmName', e.target.value)} /></div>
                <div className="fld"><label>Firm Reg. No.</label><input type="text" value={d.firmReg} onChange={e => upd('firmReg', e.target.value)} /></div>
                <div className="fld"><label>Membership No.</label><input type="text" value={d.memNo} onChange={e => upd('memNo', e.target.value)} /></div>
                <div className="fld"><label>UDIN</label><input type="text" value={d.udin} onChange={e => upd('udin', e.target.value)} /></div>
                <div className="fld"><label>Place</label><input type="text" value={d.place} onChange={e => upd('place', e.target.value)} /></div>
                <div className="fld"><label>Dated</label><input type="text" placeholder="e.g. 15.04.2026" value={d.dated} onChange={e => upd('dated', e.target.value)} /></div>
              </div>
            </div>
          </div>

          {/* 4. EXCHANGE RATE */}
          <div className="card s4">
            <div className="ch"><span>💱 Foreign Currency / Exchange Rate</span></div>
            <div className="cb">
              <div className="g4">
                <div className="fld"><label>Currency</label>
                  <select value={d.currency} onChange={e => upd('currency', e.target.value)}>
                    <option value="EUR">EUR (€ Euro)</option><option value="GBP">GBP (£ Pound)</option>
                    <option value="USD">USD ($ Dollar)</option><option value="CAD">CAD (CA$)</option>
                    <option value="AUD">AUD (A$)</option><option value="OTHER">Other (Manual)</option>
                  </select>
                </div>
                {d.currency === 'OTHER' && (
                  <>
                    <div className="fld"><label>Currency Code</label><input type="text" placeholder="e.g. CHF" value={d.customCurr} onChange={e => upd('customCurr', e.target.value)} /></div>
                    <div className="fld"><label>Symbol</label><input type="text" placeholder="e.g. Fr." value={d.customSym} onChange={e => upd('customSym', e.target.value)} /></div>
                  </>
                )}
                <div className="fld"><label>1 Foreign = ₹ (Rate)</label><input type="number" step="0.01" placeholder="e.g. 110.05" value={d.exRate} onChange={e => upd('exRate', e.target.value)} /></div>
                <div className="fld"><label>Rate Date</label><input type="text" placeholder="e.g. 15.04.2026" value={d.rateDate} onChange={e => upd('rateDate', e.target.value)} /></div>
                <div className="fld"><label>Rate Source</label><input type="text" value={d.rateSource} onChange={e => upd('rateSource', e.target.value)} /></div>
              </div>
            </div>
          </div>

          {/* 5. IMMOVABLE */}
          <div className="card s5">
            <div className="ch"><span>🏠 Immovable Assets (Land / Property)</span></div>
            <div className="cb">
              {d.immovEntries.map((e, i) => (
                <div className="entry" key={i}>
                  <div className="entry-hdr"><span className="entry-lbl">Property #{i+1}</span><button className="btn-rem" onClick={() => rmArr('immovEntries', i)}>− Remove</button></div>
                  <div className="g2">
                    <div className="fld full"><label>Property Description</label><textarea rows={2} placeholder="e.g. Residential Plot measuring 15 Marlas at Village Nangal Baghbana..." value={e.desc} onChange={ev => updArr('immovEntries', i, 'desc', ev.target.value)}></textarea></div>
                    <div className="fld"><label>Valuation Report By</label><input type="text" placeholder="e.g. Qmb Atelier Pvt. Ltd." value={e.by} onChange={ev => updArr('immovEntries', i, 'by', ev.target.value)} /></div>
                    <div className="fld"><label>Valuation Report Date</label><input type="text" placeholder="e.g. 15.04.2026" value={e.vd} onChange={ev => updArr('immovEntries', i, 'vd', ev.target.value)} /></div>
                    <div className="fld"><label>Property Value (₹)</label><input type="number" step="0.01" placeholder="0" value={e.val} onChange={ev => updArr('immovEntries', i, 'val', ev.target.value)} /></div>
                  </div>
                </div>
              ))}
              <button className="btn-add" onClick={() => addArr('immovEntries', { desc: '', vd: '', by: '', val: '' })}>+ Add Property</button>
            </div>
          </div>

          {/* 6. BANK SAVINGS */}
          <div className="card s6">
            <div className="ch"><span>🏦 Bank Savings / Current Accounts</span></div>
            <div className="cb">
              {d.bankEntries.map((e, i) => (
                <div className="entry" key={i}>
                  <div className="entry-hdr"><span className="entry-lbl">Bank Account #{i+1}</span><button className="btn-rem" onClick={() => rmArr('bankEntries', i)}>− Remove</button></div>
                  <div className="g3">
                    <div className="fld"><label>Bank Name</label><input type="text" placeholder="e.g. State Bank of India" value={e.bank} onChange={ev => updArr('bankEntries', i, 'bank', ev.target.value)} /></div>
                    <div className="fld"><label>Account Number</label><input type="text" placeholder="e.g. 10776200344" value={e.acc} onChange={ev => updArr('bankEntries', i, 'acc', ev.target.value)} /></div>
                    <div className="fld"><label>Statement Date</label><input type="text" placeholder="e.g. 13.04.2026" value={e.date} onChange={ev => updArr('bankEntries', i, 'date', ev.target.value)} /></div>
                    <div className="fld"><label>Balance (₹)</label><input type="number" step="0.01" placeholder="0" value={e.bal} onChange={ev => updArr('bankEntries', i, 'bal', ev.target.value)} /></div>
                    <div className="fld"><label>Account Type</label>
                      <select value={e.type} onChange={ev => updArr('bankEntries', i, 'type', ev.target.value)}>
                        <option value="Savings">Savings Account</option>
                        <option value="Current">Current Account</option>
                        <option value="OD">OD / CC Account</option>
                      </select>
                    </div>
                    <div className="fld"><label>Note (optional)</label><input type="text" placeholder="e.g. FD included" value={e.note} onChange={ev => updArr('bankEntries', i, 'note', ev.target.value)} /></div>
                    <div className="fld full" style={{ marginTop: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <div className={`tog ${e.jointly ? 'on' : ''}`} onClick={() => updArr('bankEntries', i, 'jointly', !e.jointly)}></div>
                        <label onClick={() => updArr('bankEntries', i, 'jointly', !e.jointly)} style={{ fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Jointly Held Account</label>
                        {e.jointly && (
                          <div style={{ flex: 1, minWidth: '200px' }}>
                            <input type="text" placeholder="Joint holder name (e.g. Fatima Ahsan)" style={{ width: '100%', padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '13px', fontFamily: 'inherit' }} value={e.jholderName} onChange={ev => updArr('bankEntries', i, 'jholderName', ev.target.value)} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <button className="btn-add" onClick={() => addArr('bankEntries', { type: 'Savings', acc: '', bank: '', bal: '', jointly: false, jholderName: '', date: '', note: '' })}>+ Add Bank Account</button>
            </div>
          </div>

          {/* 7. BANK FD */}
          <div className="card s7">
            <div className="ch"><span>📑 Bank Fixed Deposits (FD)</span></div>
            <div className="cb">
              {d.bfdEntries.map((e, i) => (
                <div className="entry" key={i}>
                  <div className="entry-hdr"><span className="entry-lbl">Bank FD #{i+1}</span><button className="btn-rem" onClick={() => rmArr('bfdEntries', i)}>− Remove</button></div>
                  <div className="g3">
                    <div className="fld"><label>Bank Name</label><input type="text" placeholder="e.g. HDFC Bank" value={e.bank} onChange={ev => updArr('bfdEntries', i, 'bank', ev.target.value)} /></div>
                    <div className="fld"><label>FD / Receipt No.</label><input type="text" placeholder="e.g. FD/2025/0001" value={e.no} onChange={ev => updArr('bfdEntries', i, 'no', ev.target.value)} /></div>
                    <div className="fld"><label>Maturity Date</label><input type="text" placeholder="e.g. 31.03.2027" value={e.mdate} onChange={ev => updArr('bfdEntries', i, 'mdate', ev.target.value)} /></div>
                    <div className="fld"><label>Amount (₹)</label><input type="number" step="0.01" placeholder="0" value={e.amt} onChange={ev => updArr('bfdEntries', i, 'amt', ev.target.value)} /></div>
                    <div className="fld"><label>Interest Rate</label><input type="text" placeholder="e.g. 7.25% p.a." value={e.rate} onChange={ev => updArr('bfdEntries', i, 'rate', ev.target.value)} /></div>
                  </div>
                </div>
              ))}
              <button className="btn-add" onClick={() => addArr('bfdEntries', { bank: '', no: '', amt: '', rate: '', mdate: '' })}>+ Add Bank FD</button>
            </div>
          </div>

          {/* 8. POST OFFICE */}
          <div className="card s8">
            <div className="ch"><span>📮 Post Office Schemes (NSC / KVP / MIS / RD)</span></div>
            <div className="cb">
              {d.poEntries.map((e, i) => (
                <div className="entry" key={i}>
                  <div className="entry-hdr"><span className="entry-lbl">Post Office Scheme #{i+1}</span><button className="btn-rem" onClick={() => rmArr('poEntries', i)}>− Remove</button></div>
                  <div className="g3">
                    <div className="fld"><label>Scheme Type</label>
                      <select value={e.type} onChange={ev => updArr('poEntries', i, 'type', ev.target.value)}>
                        <option>Post Office FD</option><option>NSC (National Savings Certificate)</option>
                        <option>KVP (Kisan Vikas Patra)</option><option>MIS (Monthly Income Scheme)</option>
                        <option>RD (Recurring Deposit)</option><option>Post Office Savings Account</option>
                        <option>SCSS (Senior Citizen Savings Scheme)</option>
                      </select>
                    </div>
                    <div className="fld"><label>Certificate / Account No.</label><input type="text" placeholder="e.g. NSC/2025/00001" value={e.no} onChange={ev => updArr('poEntries', i, 'no', ev.target.value)} /></div>
                    <div className="fld"><label>Post Office / Branch</label><input type="text" placeholder="e.g. Qadian PO" value={e.br} onChange={ev => updArr('poEntries', i, 'br', ev.target.value)} /></div>
                    <div className="fld"><label>Maturity / Statement Date</label><input type="text" placeholder="e.g. 31.03.2028" value={e.date} onChange={ev => updArr('poEntries', i, 'date', ev.target.value)} /></div>
                    <div className="fld"><label>Amount / Balance (₹)</label><input type="number" step="0.01" placeholder="0" value={e.amt} onChange={ev => updArr('poEntries', i, 'amt', ev.target.value)} /></div>
                  </div>
                </div>
              ))}
              <button className="btn-add" onClick={() => addArr('poEntries', { type: 'NSC', no: '', br: '', amt: '', date: '' })}>+ Add Post Office Scheme</button>
            </div>
          </div>

          {/* 9. PPF/EPF */}
          <div className="card s9">
            <div className="ch"><span>🏧 PPF / EPF / NPS</span></div>
            <div className="cb">
              {d.ppfEntries.map((e, i) => (
                <div className="entry" key={i}>
                  <div className="entry-hdr"><span className="entry-lbl">PPF / EPF #{i+1}</span><button className="btn-rem" onClick={() => rmArr('ppfEntries', i)}>− Remove</button></div>
                  <div className="g3">
                    <div className="fld"><label>Account Type</label>
                      <select value={e.type} onChange={ev => updArr('ppfEntries', i, 'type', ev.target.value)}>
                        <option value="PPF (Public Provident Fund)">PPF</option>
                        <option value="EPF (Employee Provident Fund)">EPF</option>
                        <option value="NPS (National Pension System)">NPS</option>
                        <option value="GPF (General Provident Fund)">GPF</option>
                      </select>
                    </div>
                    <div className="fld"><label>Account No. / UAN</label><input type="text" placeholder="e.g. PPF/SBI/00001" value={e.no} onChange={ev => updArr('ppfEntries', i, 'no', ev.target.value)} /></div>
                    <div className="fld"><label>Bank / Institution</label><input type="text" placeholder="e.g. State Bank of India" value={e.bank} onChange={ev => updArr('ppfEntries', i, 'bank', ev.target.value)} /></div>
                    <div className="fld"><label>Balance Date</label><input type="text" placeholder="e.g. 31.03.2026" value={e.date} onChange={ev => updArr('ppfEntries', i, 'date', ev.target.value)} /></div>
                    <div className="fld"><label>Balance (₹)</label><input type="number" step="0.01" placeholder="0" value={e.bal} onChange={ev => updArr('ppfEntries', i, 'bal', ev.target.value)} /></div>
                  </div>
                </div>
              ))}
              <button className="btn-add" onClick={() => addArr('ppfEntries', { type: 'PPF', no: '', bank: '', bal: '', date: '' })}>+ Add PPF / EPF / NPS</button>
            </div>
          </div>

          {/* 10. SHARES */}
          <div className="card s10">
            <div className="ch"><span>📈 Shares / Mutual Funds / Demat</span></div>
            <div className="cb">
              {d.shEntries.map((e, i) => (
                <div className="entry" key={i}>
                  <div className="entry-hdr"><span className="entry-lbl">Shares / MF #{i+1}</span><button className="btn-rem" onClick={() => rmArr('shEntries', i)}>− Remove</button></div>
                  <div className="g3">
                    <div className="fld"><label>Type</label>
                      <select value={e.type} onChange={ev => updArr('shEntries', i, 'type', ev.target.value)}>
                        <option>Equity Shares</option><option>Mutual Fund Units</option>
                        <option>Demat Holdings</option><option>Bonds / Debentures</option>
                        <option>Shares and Mutual Fund Units</option>
                      </select>
                    </div>
                    <div className="fld full"><label>Description / Folio / Demat Account</label><input type="text" placeholder="e.g. Demat Account No. IN123456 with Zerodha" value={e.desc} onChange={ev => updArr('shEntries', i, 'desc', ev.target.value)} /></div>
                    <div className="fld"><label>Valuation Date</label><input type="text" placeholder="e.g. 15.04.2026" value={e.date} onChange={ev => updArr('shEntries', i, 'date', ev.target.value)} /></div>
                    <div className="fld"><label>Market Value (₹)</label><input type="number" step="0.01" placeholder="0" value={e.val} onChange={ev => updArr('shEntries', i, 'val', ev.target.value)} /></div>
                  </div>
                </div>
              ))}
              <button className="btn-add" onClick={() => addArr('shEntries', { type: 'Mutual Funds', val: '', desc: '', date: '' })}>+ Add Shares / MF</button>
            </div>
          </div>

          {/* 11. OTHER */}
          <div className="card s11">
            <div className="ch"><span>💰 Other Movable Assets</span></div>
            <div className="cb">
              <div className="g3">
                <div className="fld"><label>Gold Ornaments Value (₹)</label><input type="number" step="0.01" placeholder="0" value={d.gold} onChange={e => upd('gold', e.target.value)} /></div>
                <div className="fld"><label>Cash in Hand (₹)</label><input type="number" step="0.01" placeholder="0" value={d.cash} onChange={e => upd('cash', e.target.value)} /></div>
                <div className="fld"><label>Household Goods (₹)</label><input type="number" step="0.01" placeholder="0" value={d.hhgoods} onChange={e => upd('hhgoods', e.target.value)} /></div>
              </div>
            </div>
          </div>

          {/* 12. ADDITIONAL / OTHER ASSETS */}
          <div className="card s13">
            <div className="ch"><span>➕ Additional / Other Assets</span></div>
            <div className="cb">
              <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>Add assets not covered above e.g. vehicles, insurance, business capital, loans receivable etc. Choose <strong>Immovable</strong> (land/property) or <strong>Movable</strong>.</p>
              {d.oaEntries.map((e, i) => (
                <div className="entry" key={i}>
                  <div className="entry-hdr"><span className="entry-lbl">Other Asset #{i+1}</span><button className="btn-rem" onClick={() => rmArr('oaEntries', i)}>− Remove</button></div>
                  <div className="g3">
                    <div className="fld full"><label>Asset Name / Type</label><input type="text" placeholder="e.g. Motor Vehicle, LIC Policy, Business Capital" value={e.name} onChange={ev => updArr('oaEntries', i, 'name', ev.target.value)} /></div>
                    <div className="fld"><label>Category</label>
                      <select value={e.cat} onChange={ev => updArr('oaEntries', i, 'cat', ev.target.value)}>
                        <option value="Movable">Movable</option>
                        <option value="Immovable">Immovable</option>
                      </select>
                    </div>
                    <div className="fld"><label>Valuation / Statement Date</label><input type="text" placeholder="e.g. 15.04.2026" value={e.date} onChange={ev => updArr('oaEntries', i, 'date', ev.target.value)} /></div>
                    <div className="fld full"><label>Description / Details (optional)</label><input type="text" placeholder="e.g. Registration No., Policy No., Branch, etc." value={e.desc} onChange={ev => updArr('oaEntries', i, 'desc', ev.target.value)} /></div>
                    <div className="fld"><label>Value (Rs.)</label><input type="number" step="0.01" placeholder="0" value={e.val} onChange={ev => updArr('oaEntries', i, 'val', ev.target.value)} /></div>
                  </div>
                </div>
              ))}
              <button className="btn-add" onClick={() => addArr('oaEntries', { cat: 'Movable', name: '', val: '', desc: '', date: '' })}>+ Add Other Asset</button>
            </div>
          </div>

          {/* 13. INCOME */}
          <div className="card s12">
            <div className="ch"><span>📊 Annual Income (Annexure II)</span></div>
            <div className="cb">
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '8px' }}>{d.joint ? 'Applicant 1 — Income' : 'Applicant Income'}</div>
              <div className="g3">
                <div className="fld"><label>PAN Number</label><input type="text" placeholder="e.g. ABCDE1234F" value={d.pan} onChange={e => upd('pan', e.target.value)} /></div>
                <div className="fld"><label>Financial Year</label><input type="text" placeholder="e.g. 2024-25" value={d.fy} onChange={e => upd('fy', e.target.value)} /></div>
                <div className="fld"><label>Annual Income (₹) — 0 = leave blank</label><input type="number" step="0.01" placeholder="0" value={d.income} onChange={e => upd('income', e.target.value)} /></div>
                <div className="fld"><label>ITR Filing Date</label><input type="text" placeholder="e.g. 31.07.2025" value={d.itrDate} onChange={e => upd('itrDate', e.target.value)} /></div>
                <div className="fld full"><label>ITR Acknowledgement Number</label><input type="text" placeholder="e.g. 123456789012345" value={d.itrAck} onChange={e => upd('itrAck', e.target.value)} /></div>
              </div>

              {d.joint && (
                <>
                  <hr style={{ border: 'none', borderTop: '1px dashed #e2e8f0', margin: '14px 0' }} />
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '8px' }}>Joint Applicant Income</div>
                  <div className="g3">
                    <div className="fld"><label>PAN Number (Applicant 2)</label><input type="text" placeholder="e.g. FGHIJ5678K" value={d.pan2} onChange={e => upd('pan2', e.target.value)} /></div>
                    <div className="fld"><label>Financial Year</label><input type="text" placeholder="e.g. 2024-25" value={d.fy2} onChange={e => upd('fy2', e.target.value)} /></div>
                    <div className="fld"><label>Annual Income (₹) — 0 = leave blank</label><input type="number" step="0.01" placeholder="0" value={d.income2} onChange={e => upd('income2', e.target.value)} /></div>
                    <div className="fld"><label>ITR Filing Date</label><input type="text" placeholder="e.g. 31.07.2025" value={d.itrDate2} onChange={e => upd('itrDate2', e.target.value)} /></div>
                    <div className="fld full"><label>ITR Acknowledgement Number</label><input type="text" placeholder="e.g. 123456789012345" value={d.itrAck2} onChange={e => upd('itrAck2', e.target.value)} /></div>
                  </div>
                </>
              )}
            </div>
          </div>

        </div>

        {/* SIDEBAR */}
        <div className="sidebar">
          <div className="sc">
            <div className="st">📊 Live Summary</div>
            <div className="sb">
              <div className="tr"><span className="lbl">🏠 Immovable</span><span className="amt">₹ {totalImmov.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div className="tr"><span className="lbl">🏦 Bank Savings</span><span className="amt">₹ {d.bankEntries.reduce((s, e) => s + (parseFloat(e.bal) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div className="tr"><span className="lbl">📑 Bank FDs</span><span className="amt">₹ {d.bfdEntries.reduce((s, e) => s + (parseFloat(e.amt) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div className="tr"><span className="lbl">📮 Post Office</span><span className="amt">₹ {d.poEntries.reduce((s, e) => s + (parseFloat(e.amt) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div className="tr"><span className="lbl">🏧 PPF/EPF</span><span className="amt">₹ {d.ppfEntries.reduce((s, e) => s + (parseFloat(e.bal) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div className="tr"><span className="lbl">📈 Shares/MF</span><span className="amt">₹ {d.shEntries.reduce((s, e) => s + (parseFloat(e.val) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div className="tr"><span className="lbl">💰 Gold/Cash/HH</span><span className="amt">₹ {((parseFloat(d.gold) || 0) + (parseFloat(d.cash) || 0) + (parseFloat(d.hhgoods) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div className="tr"><span className="lbl">➕ Other Assets</span><span className="amt">₹ {d.oaEntries.filter(e => e.cat !== 'Immovable').reduce((s, e) => s + (parseFloat(e.val) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div className="tr" style={{ borderTop: '2px solid #e2e8f0', marginTop: '4px', paddingTop: '10px' }}>
                <span className="lbl" style={{ fontWeight: 700, color: '#1a3a5c' }}>Total Immovable (A)</span>
                <span className="amt" style={{ color: '#1a3a5c' }}>₹ {totalImmov.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="tr">
                <span className="lbl" style={{ fontWeight: 700, color: '#1a3a5c' }}>Total Movable (B)</span>
                <span className="amt" style={{ color: '#1a3a5c' }}>₹ {totalMov.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="grand-box"><span className="lbl">Grand Total (A+B)</span><span className="amt">₹ {grand.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div className="fx-box"><span className="lbl">Equivalent ({currCode})</span><span className="amt">{foreign > 0 ? `${sym} ${foreign.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}</span></div>
              <div className="words-box">{grand > 0 ? amtWords(grand) : 'Enter amounts to see total in words'}</div>
            </div>
            <div className="sg"><button className="btn-gen" onClick={handleGenerate}>⬇ Download .docx</button></div>
          </div>
        </div>

      </div>
    </div>
  );
}
