const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// Safety-net cap, not a hard requirement — Part 10 asks that exports never
// buffer an entire dataset in memory, which streaming already guarantees.
// This just stops a badly-filtered report from producing an unbounded file,
// with a visible note rather than a silent truncation.
const EXPORT_ROW_CAP = 50_000;

function csvEscape(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// runQuery: (onRow) => Promise<void> — typically `(onRow) => streamMany(query, params, onRow)`
// from server/db/sql.js, so rows arrive one at a time straight from the
// mssql driver instead of being materialized into an array first.
async function streamCsv(res, { filename, columns }, runQuery) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);

    res.write(`${columns.map((c) => csvEscape(c.headerName)).join(',')}\r\n`);

    let rowCount = 0;
    let truncated = false;
    await runQuery((row) => {
        rowCount += 1;
        if (rowCount > EXPORT_ROW_CAP) { truncated = true; return; }
        res.write(`${columns.map((c) => csvEscape(row[c.field])).join(',')}\r\n`);
    });
    if (truncated) res.write(`\r\n"Export truncated at ${EXPORT_ROW_CAP} rows"\r\n`);
    res.end();
}

async function streamXlsx(res, { filename, columns, sheetName }, runQuery) {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
    const sheet = workbook.addWorksheet(sheetName || 'Report');
    sheet.columns = columns.map((c) => ({ header: c.headerName, key: c.field, width: 22 }));
    sheet.getRow(1).font = { bold: true };

    let rowCount = 0;
    let truncated = false;
    await runQuery((row) => {
        rowCount += 1;
        if (rowCount > EXPORT_ROW_CAP) { truncated = true; return; }
        sheet.addRow(row).commit();
    });
    if (truncated) {
        sheet.addRow({ [columns[0].field]: `Export truncated at ${EXPORT_ROW_CAP} rows` }).commit();
    }
    sheet.commit();
    await workbook.commit();
}

async function streamPdf(res, { filename, columns, title }, runQuery) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);

    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: columns.length > 6 ? 'landscape' : 'portrait' });
    doc.pipe(res);

    const left = doc.page.margins.left;
    const usableWidth = doc.page.width - left - doc.page.margins.right;
    const colWidth = usableWidth / columns.length;
    const rowHeight = 16;

    function drawHeader() {
        doc.fontSize(14).font('Helvetica-Bold').text(title, left, doc.y);
        doc.moveDown(0.5);
        const y = doc.y;
        doc.fontSize(8).font('Helvetica-Bold');
        columns.forEach((c, i) => doc.text(String(c.headerName), left + i * colWidth, y, { width: colWidth, ellipsis: true }));
        doc.moveDown();
        doc.moveTo(left, doc.y).lineTo(left + usableWidth, doc.y).strokeColor('#cccccc').stroke();
        doc.moveDown(0.3);
        doc.font('Helvetica').fontSize(8);
    }

    drawHeader();

    let rowCount = 0;
    let truncated = false;
    await runQuery((row) => {
        rowCount += 1;
        if (rowCount > EXPORT_ROW_CAP) { truncated = true; return; }
        if (doc.y > doc.page.height - doc.page.margins.bottom - rowHeight) {
            doc.addPage();
            drawHeader();
        }
        const y = doc.y;
        columns.forEach((c, i) => {
            const value = row[c.field];
            doc.text(value === null || value === undefined ? '' : String(value), left + i * colWidth, y, { width: colWidth, ellipsis: true });
        });
        doc.moveDown(0.9);
    });

    if (truncated) {
        doc.moveDown();
        doc.fillColor('red').text(`Export truncated at ${EXPORT_ROW_CAP} rows.`);
    }
    doc.end();
}

// Single dispatch point routes.reports.js calls — keeps the "which format ->
// which streamer" decision in one place.
async function streamExport(res, format, meta, runQuery) {
    if (format === 'xlsx') return streamXlsx(res, meta, runQuery);
    if (format === 'pdf') return streamPdf(res, meta, runQuery);
    return streamCsv(res, meta, runQuery);
}

module.exports = { streamExport, streamCsv, streamXlsx, streamPdf, EXPORT_ROW_CAP };
