import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, BorderStyle, WidthType } from 'docx';
import { generateLetterOfUndertaking172 } from './templates';

export async function exportConfirmationDocx(templateId: string, values: Record<string, string>) {
  if (templateId !== 'letter-of-undertaking-172') {
    alert('Export not supported for this template.');
    return;
  }

  const content = generateLetterOfUndertaking172(values);
  const companyName = content.companyNameLine.split('(CR NO.')[0].trim();

  try {
    const PW = 11906, MG = 1440, CW = PW - 2 * MG; // content width is 9026 DXA (6.27 inches)
    const colWidth = Math.round(CW / 2);

    const borderNone = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const nbds = () => ({
      top: borderNone,
      bottom: borderNone,
      left: borderNone,
      right: borderNone,
    });

    const run = (text: string, opts: any = {}) => new TextRun({
      text,
      font: 'Times New Roman',
      size: 24, // 12pt
      ...opts
    });

    const p = (children: any, opts: any = {}) => new Paragraph({
      children: Array.isArray(children) ? children : [children],
      spacing: { after: 120, line: 276 }, // 1.15 line spacing, 6pt after
      ...opts
    });

    const blankLine = () => new Paragraph({ children: [], spacing: { after: 120 } });

    // Header Table for "To," and Date on same line
    const headerTable = new Table({
      width: { size: CW, type: WidthType.DXA },
      columnWidths: [colWidth, colWidth],
      borders: {
        top: borderNone,
        bottom: borderNone,
        left: borderNone,
        right: borderNone,
        insideHorizontal: borderNone,
        insideVertical: borderNone,
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: colWidth, type: WidthType.DXA },
              borders: nbds(),
              children: [p(run(content.to), { spacing: { after: 0 } })],
            }),
            new TableCell({
              width: { size: colWidth, type: WidthType.DXA },
              borders: nbds(),
              children: [p(run(content.date), { alignment: AlignmentType.RIGHT, spacing: { after: 0 } })],
            }),
          ]
        })
      ]
    });

    const children: any[] = [
      headerTable,
      p(run(content.recipientAddress[0]), { spacing: { after: 0 } }),
      p(run(content.recipientAddress[1]), { spacing: { after: 180 } }),
      blankLine(),
      p(run(content.subject, { bold: true }), { spacing: { after: 180 } }),
      blankLine(),
      p(run(content.salutation), { spacing: { after: 180 } }),
      blankLine(),
      p(run(content.companyNameLine, { bold: true }), { spacing: { after: 180 } }),
      blankLine(),
      ...content.paragraphs.map(text => p(run(text), { alignment: AlignmentType.JUSTIFIED, spacing: { after: 180 } })),
      blankLine(),
      p(run(content.signoff), { spacing: { after: 360 } }),
      blankLine(),
      p(run('_________________________'), { spacing: { after: 60 } }),
      p(run(content.signatory, { bold: true }), { spacing: { after: 0 } }),
    ];

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              size: { width: PW, height: 16838 }, // A4 page size
              margin: { top: MG, right: MG, bottom: MG, left: MG }
            }
          },
          children,
        }
      ]
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Undertaking_Letter_${companyName.replace(/\s+/g, '_')}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);

  } catch (err: any) {
    console.error('Word export error:', err);
    alert('Error exporting Word document:\n' + err.message);
  }
}
