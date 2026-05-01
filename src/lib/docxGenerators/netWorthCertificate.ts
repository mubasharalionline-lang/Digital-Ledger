import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign } from 'docx';

function ri(num: number) { return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fi(num: number) { return '₹\u00A0' + ri(num); }

export async function generateNetWorthDocx(d: any) {
  if (!d.name) { alert('Please enter the Applicant Name first.'); return; }

  try {
    const PW = 11906, MG = 1080, CW = PW - 2 * MG; // CW=9746

    // Column widths
    const C1 = 500, C_AMT = 2200, C_FOR = 2000, C_PAR = CW - C1 - C_AMT - C_FOR; // 5046 cover
    const A1 = 500, A3 = 2200, A2 = CW - A1 - A3;                              // 7046 ann1
    const B1 = CW - 2200, B2 = 2200;                                        // ann2

    const bd = (c = 'AAAAAA', s = 6) => ({ style: BorderStyle.SINGLE, size: s, color: c });
    const bds = (c = 'AAAAAA') => ({ top: bd(c), bottom: bd(c), left: bd(c), right: bd(c) });
    const nbds = () => { const n = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }; return { top: n, bottom: n, left: n, right: n }; };
    const pad = { top: 80, bottom: 80, left: 120, right: 120 };
    const padSm = { top: 60, bottom: 60, left: 120, right: 120 };

    const TR = (t: string, o: any = {}) => new TextRun({ text: String(t || ''), font: 'Arial', ...o });
    const PR = (ch: any, o: any = {}) => new Paragraph({ children: Array.isArray(ch) ? ch : [TR(ch)], spacing: { after: 80 }, ...o });
    const BPR = () => new Paragraph({ children: [], spacing: { after: 80 } });

    const fmtR = (amt: number) => amt ? '₹\u00A0' + ri(amt) + '/-' : '—';
    const fmtF = (amt: number) => (amt && d.rate > 0) ? d.sym + '\u00A0' + ri(amt / d.rate) + '/-' : '—';

    // Full applicant name
    const appFull = d.name + ' ' + d.rel + ' Mr. ' + d.father + (d.joint && d.jName ? ' and ' + d.jName + ' ' + d.jRel + ' Mr. ' + d.jFather : '');
    const appNames = d.name + (d.joint && d.jName ? ' and ' + d.jName : '');
    const addr = d.addr1 + (d.addr2 ? ', ' + d.addr2 : '') + ', India';
    const passStr = d.passport + (d.joint && d.jPassport ? ' and ' + d.jPassport : '');
    const plural = d.joint ? 's' : '';

    // ── Divider line ──
    const divLine = () => new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1a3a5c', space: 1 } }, spacing: { before: 80, after: 80 } });

    // ── Signature block ──
    const sig = () => {
      const Lw = Math.round(CW * 0.58), Rw = CW - Lw;
      return [
        BPR(), BPR(),
        new Table({
          width: { size: CW, type: WidthType.DXA }, columnWidths: [Lw, Rw],
          borders: { top: bd('FFFFFF', 0), bottom: bd('FFFFFF', 0), left: bd('FFFFFF', 0), right: bd('FFFFFF', 0), insideHorizontal: bd('FFFFFF', 0), insideVertical: bd('FFFFFF', 0) },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: Lw, type: WidthType.DXA }, borders: nbds(), margins: pad, children: [
                    PR([TR('For ', { bold: true }), TR(d.firmName, { bold: true })]),
                    PR('Chartered Accountants'),
                    PR('(FRN: ' + d.firmReg + ')', { spacing: { after: 200 } }),
                  ]
                }),
                new TableCell({
                  width: { size: Rw, type: WidthType.DXA }, borders: nbds(), margins: pad, children: [
                    PR('Place: ' + d.place),
                    PR('Date:  ' + d.dated),
                  ]
                }),
              ]
            }),
            new TableRow({
              children: [
                new TableCell({
                  width: { size: Lw, type: WidthType.DXA }, borders: nbds(), margins: { ...pad, top: 360 }, children: [
                    PR([TR(d.caName, { bold: true })]),
                    PR('(' + d.caDesig + ')'),
                    PR('M.No.: ' + d.memNo),
                    PR('UDIN: ' + d.udin),
                  ]
                }),
                new TableCell({ width: { size: Rw, type: WidthType.DXA }, borders: nbds(), margins: pad, children: [BPR()] }),
              ]
            }),
          ]
        })
      ];
    };

    // ════════════════════════════════════
    // COVER PAGE
    // ════════════════════════════════════
    const coverIntro = `This is to certify that ${appFull} (Applicant${plural}), residing at ${addr} is the owner of Net Worth amounting to INR ${fmtR(d.grand)} (${d.grandWords})` +
      (d.rate > 0 ? ` equivalent to ${d.curr} ${fmtF(d.grand)} the details of which are as below:`
        : ' the details of which are as below:');

    const TC = (w: number, ch: any, opts: any = {}) => new TableCell({ width: { size: w, type: WidthType.DXA }, margins: pad, ...opts, children: ch });
    const HDR = (w: number, txt2: string, opts: any = {}) => TC(w, [PR([TR(txt2, { bold: true, color: 'FFFFFF', size: 20 })], { alignment: opts.align || AlignmentType.LEFT })], { borders: bds('334466'), shading: { fill: '1a3a5c', type: ShadingType.CLEAR }, ...opts });
    const DAT = (w: number, t: string, al: any = AlignmentType.LEFT) => TC(w, [PR(t, { alignment: al })], { borders: bds() });
    const TOT = (w: number, t: string, al: any = AlignmentType.LEFT) => TC(w, [PR([TR(t, { bold: true })], { alignment: al })], { borders: bds('334466'), shading: { fill: 'EBF3FB', type: ShadingType.CLEAR } });

    const coverTable = new Table({
      width: { size: CW, type: WidthType.DXA }, columnWidths: [C1, C_PAR, C_AMT, C_FOR],
      rows: [
        new TableRow({
          children: [
            HDR(C1, 'S.No.'), HDR(C_PAR, 'Particulars'),
            HDR(C_AMT, 'Amount in INR', { align: AlignmentType.RIGHT }),
            HDR(C_FOR, 'Amt in ' + d.curr, { align: AlignmentType.RIGHT }),
          ]
        }),
        new TableRow({
          children: [
            DAT(C1, '1.'), DAT(C_PAR, 'Immovable Assets (As per Annexure 1(A))'),
            DAT(C_AMT, fmtR(d.totalImmov), AlignmentType.RIGHT), DAT(C_FOR, fmtF(d.totalImmov), AlignmentType.RIGHT),
          ]
        }),
        new TableRow({
          children: [
            DAT(C1, '2.'), DAT(C_PAR, 'Movable / Liquid Assets (As per Annexure 1(B))'),
            DAT(C_AMT, fmtR(d.totalMov), AlignmentType.RIGHT), DAT(C_FOR, fmtF(d.totalMov), AlignmentType.RIGHT),
          ]
        }),
        new TableRow({
          children: [
            TOT(C1, ''), TOT(C_PAR, 'Total Net Worth (1 + 2)'),
            TOT(C_AMT, fmtR(d.grand), AlignmentType.RIGHT), TOT(C_FOR, fmtF(d.grand), AlignmentType.RIGHT),
          ]
        }),
      ]
    });

    const coverChildren = [
      ...(d.refNo ? [PR([TR('Ref: ' + d.refNo, { size: 18, color: '666666' })], { alignment: AlignmentType.RIGHT })] : []),
      PR([TR('NET WORTH CERTIFICATE FOR VISA BY FOREIGN EMBASSY', { bold: true, size: 26, color: '1a3a5c' })], { alignment: AlignmentType.CENTER, spacing: { before: 160, after: 160 } }),
      divLine(),
      BPR(),
      PR([TR(coverIntro, { size: 22 })], { alignment: AlignmentType.JUSTIFIED, spacing: { before: 80, after: 180 } }),
      PR([TR('Details of Calculation of Net Worth:–', { bold: true, size: 22 })], { spacing: { before: 80, after: 120 } }),
      coverTable,
      BPR(),
      PR([TR(`This certification is made on the basis of the documents, records, information and declarations verbal or documentary, produced before us for verification by ${appFull} and is to be used only for embassy visa purpose for the applicant${plural}, ${appNames} (Passport No. ${passStr}).`, { size: 20 })], { alignment: AlignmentType.JUSTIFIED }),
      ...(d.rate > 0 ? [PR([TR(`{${d.curr} Conversion Rate as on ${d.rateDate}  1 ${d.curr} = INR ${d.rate.toFixed(2)}  Source: ${d.rateSource}}`, { size: 18, italics: true, color: '555555' })], { spacing: { before: 80 } })] : []),
      ...sig(),
    ];

    // ════════════════════════════════════
    // ANNEXURE 1
    // ════════════════════════════════════
    const ann1Rows: any[] = [];

    // Table header row
    ann1Rows.push(new TableRow({
      children: [
        new TableCell({ width: { size: A1, type: WidthType.DXA }, borders: bds('334466'), margins: pad, shading: { fill: '1a3a5c', type: ShadingType.CLEAR }, children: [PR([TR('S.No.', { bold: true, color: 'FFFFFF' })])] }),
        new TableCell({ width: { size: A2, type: WidthType.DXA }, borders: bds('334466'), margins: pad, shading: { fill: '1a3a5c', type: ShadingType.CLEAR }, children: [PR([TR('Particulars', { bold: true, color: 'FFFFFF' })])] }),
        new TableCell({ width: { size: A3, type: WidthType.DXA }, borders: bds('334466'), margins: pad, shading: { fill: '1a3a5c', type: ShadingType.CLEAR }, children: [PR([TR('Amount (In INR)', { bold: true, color: 'FFFFFF' })], { alignment: AlignmentType.RIGHT })] }),
      ]
    }));

    const secHdr = (txt2: string) => new TableRow({ children: [new TableCell({ columnSpan: 3, borders: bds('2e75b6'), margins: padSm, shading: { fill: '2e75b6', type: ShadingType.CLEAR }, children: [PR([TR(txt2, { bold: true, color: 'FFFFFF' })])] })] });
    const dtRow = (sn: number, desc: string, amt: number) => new TableRow({
      children: [
        new TableCell({ width: { size: A1, type: WidthType.DXA }, borders: bds(), margins: pad, children: [PR(String(sn))] }),
        new TableCell({ width: { size: A2, type: WidthType.DXA }, borders: bds(), margins: pad, children: [new Paragraph({ children: [TR(desc, { size: 20 })], spacing: { after: 60 }, alignment: AlignmentType.JUSTIFIED })] }),
        new TableCell({ width: { size: A3, type: WidthType.DXA }, borders: bds(), margins: pad, verticalAlign: VerticalAlign.TOP, children: [PR(fmtR(amt), { alignment: AlignmentType.RIGHT })] }),
      ]
    });
    const subTot = (lbl: string, amt: number) => new TableRow({
      children: [
        new TableCell({ borders: bds('334466'), margins: pad, shading: { fill: 'EBF3FB', type: ShadingType.CLEAR }, children: [BPR()] }),
        new TableCell({ borders: bds('334466'), margins: pad, shading: { fill: 'EBF3FB', type: ShadingType.CLEAR }, children: [PR([TR(lbl, { bold: true })])] }),
        new TableCell({ width: { size: A3, type: WidthType.DXA }, borders: bds('334466'), margins: pad, shading: { fill: 'EBF3FB', type: ShadingType.CLEAR }, children: [PR([TR(fmtR(amt), { bold: true })], { alignment: AlignmentType.RIGHT })] }),
      ]
    });

    ann1Rows.push(secHdr('A.  Immovable Assets'));
    let sn = 1;
    d.immovEntries.forEach((e: any) => {
      if (!e.val && !e.desc) return;
      ann1Rows.push(dtRow(sn++, `${e.desc}, Punjab, India registered in name of ${appFull} as per valuation report Dated ${e.vd} issued by ${e.by}, valuing at INR ${fmtR(e.val)}.`, e.val));
    });
    d.oaEntries.filter((e: any) => e.cat === 'Immovable' && e.val > 0).forEach((e: any) => {
      const desc = `${e.name}${e.desc ? ' - ' + e.desc : ''}${e.date ? ', as on ' + e.date : ''}, held in name of ${appFull}, as per valuation produced before us.`;
      ann1Rows.push(dtRow(sn++, desc, e.val));
    });
    ann1Rows.push(subTot('Total (A)', d.totalImmov));

    ann1Rows.push(secHdr('B.  Liquid / Movable Assets'));
    sn = 1;
    d.bankEntries.forEach((e: any) => {
      if (!e.bal) return;
      let jPt = '';
      if (e.jointly) {
        const jn = e.jholderName || (d.joint ? d.jName : '');
        if (jn) jPt = ' and ' + jn + ' (Jointly)';
      }
      const nPt = e.note ? ' (' + e.note + ')' : '';
      ann1Rows.push(dtRow(sn++, `Balance as on ${e.date} in ${e.type} Account No. ${e.acc}, maintained with ${e.bank} held in name of ${d.name}${jPt}${nPt}, as per the Bank Statement produced before us for verification.`, e.bal));
    });
    d.bfdEntries.forEach((e: any) => {
      if (!e.amt) return;
      ann1Rows.push(dtRow(sn++, `Fixed Deposit bearing No. ${e.no} with ${e.bank} in name of ${appFull}${e.mdate ? ', maturing on ' + e.mdate : ''}${e.rate ? ' @ ' + e.rate : ''}, as per FD Certificate produced before us for verification.`, e.amt));
    });
    d.poEntries.forEach((e: any) => {
      if (!e.amt) return;
      ann1Rows.push(dtRow(sn++, `Amount invested in ${e.type}${e.no ? ' bearing No. ' + e.no : ''}${e.br ? ' at ' + e.br : ''} in name of ${appFull}${e.date ? ', as per certificate / passbook dated ' + e.date : ''}, produced before us for verification.`, e.amt));
    });
    d.ppfEntries.forEach((e: any) => {
      if (!e.bal) return;
      ann1Rows.push(dtRow(sn++, `${e.type} balance${e.no ? ' in Account No. ' + e.no : ''}${e.bank ? ' with ' + e.bank : ''} in name of ${appFull}${e.date ? ', as on ' + e.date : ''}, as per passbook / statement produced before us for verification.`, e.bal));
    });
    d.shEntries.forEach((e: any) => {
      if (!e.val) return;
      ann1Rows.push(dtRow(sn++, `${e.type}${e.desc ? ' — ' + e.desc : ''} in name of ${appFull}${e.date ? ', valued as on ' + e.date : ''}, as declared by ${d.name}.`, e.val));
    });
    if (d.gold > 0) ann1Rows.push(dtRow(sn++, `Present Market Value of Gold Ornaments in possession, as declared by ${d.name}.`, d.gold));
    if (d.cash > 0) ann1Rows.push(dtRow(sn++, `Cash in hand as on ${d.certDate} as declared by ${d.name}.`, d.cash));
    if (d.hhgoods > 0) ann1Rows.push(dtRow(sn++, `Realizable value of Household Assets i.e. Furniture and electronic items as declared by ${d.name}.`, d.hhgoods));
    d.oaEntries.filter((e: any) => e.cat !== 'Immovable' && e.val > 0).forEach((e: any) => {
      const desc = `${e.name}${e.desc ? ' - ' + e.desc : ''}${e.date ? ', as on ' + e.date : ''}, held in name of ${appFull}, as declared by ${d.name}.`;
      ann1Rows.push(dtRow(sn++, desc, e.val));
    });
    ann1Rows.push(subTot('Total (B)', d.totalMov));

    // Grand total row
    ann1Rows.push(new TableRow({
      children: [
        new TableCell({ columnSpan: 2, borders: bds('1a3a5c'), margins: pad, shading: { fill: '1a3a5c', type: ShadingType.CLEAR }, children: [PR([TR('Grand Total (A + B)', { bold: true, color: 'FFFFFF', size: 22 })])] }),
        new TableCell({ width: { size: A3, type: WidthType.DXA }, borders: bds('1a3a5c'), margins: pad, shading: { fill: '1a3a5c', type: ShadingType.CLEAR }, children: [PR([TR(fmtR(d.grand), { bold: true, color: 'FFFFFF', size: 22 })], { alignment: AlignmentType.RIGHT })] }),
      ]
    }));

    const ann1Table = new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [A1, A2, A3], rows: ann1Rows });

    const ann1Children = [
      PR([TR('ANNEXURE – 1', { bold: true, size: 24, color: '1a3a5c' })], { alignment: AlignmentType.CENTER, spacing: { before: 120, after: 80 } }),
      PR([TR(`Statement of Net Worth of ${appFull} (Applicant${plural}), residing at ${addr}.`, { size: 20 })], { alignment: AlignmentType.JUSTIFIED, spacing: { before: 60, after: 180 } }),
      ann1Table,
      BPR(),
      PR([TR(d.grandWords, { italics: true, size: 20, color: '333333' })]),
      ...sig(),
    ];

    // ════════════════════════════════════
    // ANNEXURE 2
    // ════════════════════════════════════
    const incAmt1 = d.income === 0 ? '_______/-' : fmtR(d.income);
    const incDesc1 = `Annual Income of ${d.name} ${d.rel} Mr. ${d.father} holding PAN No.: ${d.pan || '_____'}, for the Financial Year ${d.fy || '_____'} as per Income Tax Return filed on ${d.itrDate || '_____'} bearing acknowledgement no. ${d.itrAck || '_____'}.`;

    const ann2Rows = [
      new TableRow({
        children: [
          new TableCell({ width: { size: B1, type: WidthType.DXA }, borders: bds('334466'), margins: pad, shading: { fill: '1a3a5c', type: ShadingType.CLEAR }, children: [PR([TR('Particulars', { bold: true, color: 'FFFFFF' })])] }),
          new TableCell({ width: { size: B2, type: WidthType.DXA }, borders: bds('334466'), margins: pad, shading: { fill: '1a3a5c', type: ShadingType.CLEAR }, children: [PR([TR('Amount (in INR)', { bold: true, color: 'FFFFFF' })], { alignment: AlignmentType.RIGHT })] }),
        ]
      }),
      new TableRow({
        children: [
          new TableCell({ width: { size: B1, type: WidthType.DXA }, borders: bds(), margins: pad, children: [new Paragraph({ children: [TR('➤  ' + incDesc1, { size: 20 })], spacing: { after: 60 }, alignment: AlignmentType.JUSTIFIED })] }),
          new TableCell({ width: { size: B2, type: WidthType.DXA }, borders: bds(), margins: pad, children: [PR(incAmt1, { alignment: AlignmentType.RIGHT })] }),
        ]
      }),
    ];

    // Add second applicant's ITR row if it's a joint certificate
    if (d.joint && d.jName) {
      const incAmt2 = d.income2 === 0 ? '_______/-' : fmtR(d.income2);
      const incDesc2 = `Annual Income of ${d.jName} ${d.jRel} Mr. ${d.jFather} holding PAN No.: ${d.pan2 || '_____'}, for the Financial Year ${d.fy2 || d.fy || '_____'} as per Income Tax Return filed on ${d.itrDate2 || '_____'} bearing acknowledgement no. ${d.itrAck2 || '_____'}.`;
      ann2Rows.push(new TableRow({
        children: [
          new TableCell({ width: { size: B1, type: WidthType.DXA }, borders: bds(), margins: pad, children: [new Paragraph({ children: [TR('➤  ' + incDesc2, { size: 20 })], spacing: { after: 60 }, alignment: AlignmentType.JUSTIFIED })] }),
          new TableCell({ width: { size: B2, type: WidthType.DXA }, borders: bds(), margins: pad, children: [PR(incAmt2, { alignment: AlignmentType.RIGHT })] }),
        ]
      }));
    }

    const ann2Table = new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [B1, B2], rows: ann2Rows });

    const ann2Children = [
      PR([TR('ANNEXURE – II', { bold: true, size: 24, color: '1a3a5c' })], { alignment: AlignmentType.CENTER, spacing: { before: 120, after: 80 } }),
      PR([TR(`Statement of Annual Income of ${appFull} (Applicant${plural}), residing at ${addr}.`, { size: 20 })], { alignment: AlignmentType.JUSTIFIED, spacing: { before: 60, after: 180 } }),

      ann2Table,
      BPR(),
      ...sig(),
    ];

    // ── Build document ──
    const pgProps = { page: { size: { width: PW, height: 16838 }, margin: { top: MG, right: MG, bottom: MG, left: MG } } };
    const doc = new Document({
      styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
      sections: [
        { properties: pgProps, children: coverChildren },
        { properties: pgProps, children: ann1Children },
        { properties: pgProps, children: ann2Children },
      ]
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'NetWorth_Certificate_' + (d.name || 'Certificate').replace(/\s+/g, '_') + '.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);

  } catch (err: any) {
    console.error('Certificate generation error:', err);
    alert('Error generating certificate:\n\n' + err.message + '\n\nPlease check that all required fields are filled in correctly.');
  }
}
