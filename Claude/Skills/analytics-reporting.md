# 📑 Skill: Analytics Reporting

## Overview
This skill defines the complete logic for generating PDF reports and CSV exports from the analytics database. It is used by the Analytics Agent on admin request or scheduled triggers.

---

## Report Types

| Report | Format | Trigger | Saved To |
|--------|--------|---------|---------|
| Daily Summary | PDF + CSV | Auto: midnight | Reports/YYYY-MM-DD_daily.pdf |
| Processing Export | CSV | Admin request | Reports/YYYY-MM-DD_processing.csv |
| License Export | CSV | Admin request | Reports/YYYY-MM-DD_license.csv |
| Full Admin Report | PDF | Admin request | Reports/YYYY-MM-DD_admin_report.pdf |
| Error Log Export | CSV | Admin request | Reports/YYYY-MM-DD_errors.csv |
| User Activity | CSV | Admin request | Reports/YYYY-MM-DD_users.csv |

---

## Data Queries (SQLite)

### Daily Processing Summary
```sql
SELECT
  DATE(completed_at)        AS date,
  COUNT(*)                  AS total,
  SUM(CASE WHEN status='done' THEN 1 ELSE 0 END)   AS done,
  SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
  SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END) AS skipped,
  ROUND(AVG(duration_s), 1) AS avg_duration_s,
  ROUND(SUM(file_size_mb) / 1024.0, 2) AS total_data_gb,
  MAX(preset)               AS top_preset
FROM processing_events
WHERE DATE(completed_at) = DATE('now')
GROUP BY DATE(completed_at);
```

### Hourly Throughput (for chart)
```sql
SELECT
  STRFTIME('%H', completed_at) AS hour,
  COUNT(*) AS count,
  ROUND(SUM(file_size_mb), 1) AS total_mb
FROM processing_events
WHERE DATE(completed_at) = DATE('now')
  AND status = 'done'
GROUP BY hour
ORDER BY hour;
```

### License Status Overview
```sql
SELECT
  status,
  plan,
  COUNT(*) AS count
FROM license_events
WHERE event_type = 'validate'
  AND DATE(occurred_at) = DATE('now')
GROUP BY status, plan;
```

### Top Errors
```sql
SELECT
  error_code,
  COUNT(*) AS occurrences
FROM processing_events
WHERE status = 'failed'
  AND DATE(completed_at) >= DATE('now', '-7 days')
GROUP BY error_code
ORDER BY occurrences DESC
LIMIT 10;
```

### Expiring Licenses (next 30 days)
```sql
SELECT
  license_key,
  plan,
  user_email,
  expires_at,
  CAST(JULIANDAY(expires_at) - JULIANDAY('now') AS INTEGER) AS days_remaining
FROM licenses
WHERE status = 'active'
  AND expires_at BETWEEN DATE('now') AND DATE('now', '+30 days')
ORDER BY expires_at ASC;
```

---

## CSV Generation Logic

```javascript
const { stringify } = require('csv-stringify');
const fs = require('fs');

async function exportProcessingCSV(dateRange, outputPath) {
  const rows = await db.all(`
    SELECT date(completed_at) as date, filename, preset, status,
           duration_s, file_size_mb, error_code, worker_id,
           started_at, completed_at
    FROM processing_events
    WHERE completed_at BETWEEN ? AND ?
    ORDER BY completed_at DESC
  `, [dateRange.start, dateRange.end]);

  const columns = [
    'date', 'filename', 'preset', 'status',
    'duration_s', 'file_size_mb', 'error_code',
    'worker_id', 'started_at', 'completed_at'
  ];

  return new Promise((resolve, reject) => {
    stringify(rows, { header: true, columns }, (err, output) => {
      if (err) return reject(err);
      fs.writeFileSync(outputPath, output, 'utf-8');
      resolve(outputPath);
    });
  });
}
```

---

## PDF Generation Logic

### Using PDFKit
```javascript
const PDFDocument = require('pdfkit');
const fs = require('fs');

async function generateDailyPDF(data, outputPath) {
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(fs.createWriteStream(outputPath));

  // ── Cover Page ──
  doc.fontSize(24).fillColor('#6C63FF').text('Video Reposter', { align: 'center' });
  doc.fontSize(16).fillColor('#333').text('Daily Report', { align: 'center' });
  doc.fontSize(10).fillColor('#666')
     .text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown(2);

  // ── Summary Section ──
  doc.fontSize(14).fillColor('#000').text('📊 Processing Summary');
  doc.moveDown(0.5);

  const summaryTable = [
    ['Metric', 'Value'],
    ['Total Processed', data.total],
    ['Total Failed', data.failed],
    ['Success Rate', `${data.success_rate}%`],
    ['Data Processed', `${data.total_data_gb} GB`],
    ['Avg Processing Time', formatSeconds(data.avg_duration_s)],
    ['Most Used Preset', data.top_preset],
  ];
  renderTable(doc, summaryTable);

  // ── Error Section ──
  doc.addPage();
  doc.fontSize(14).text('❌ Error Breakdown');
  renderTable(doc, [['Error Code', 'Count'], ...data.errors.map(e => [e.error_code, e.count])]);

  doc.end();
  return outputPath;
}
```

---

## Report Schedule

```javascript
// Daily report — runs at midnight
const cron = require('node-cron');

cron.schedule('0 0 * * *', async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];

  await analyticsAgent.generateDailyReport(dateStr);
  log.info(`Daily report generated for ${dateStr}`);
});
```

---

## Report Naming Convention

```
Daily PDF:          Reports/2026-05-31_daily_report.pdf
Processing CSV:     Reports/2026-05-31_processing_export.csv
License CSV:        Reports/2026-05-31_license_export.csv
Error CSV:          Reports/2026-05-31_error_export.csv
Admin Full PDF:     Reports/2026-05-31_admin_report.pdf
User Activity CSV:  Reports/2026-05-31_user_activity.csv
```

---

## Admin Report Sections

```
PAGE 1 — EXECUTIVE SUMMARY
  ┌──────────────────────────────────┐
  │  Videos Processed:     1,234     │
  │  Success Rate:         97.8%     │
  │  Data Processed:       84.2 GB   │
  │  Active Licenses:      48        │
  │  Expiring Soon (30d):  6         │
  └──────────────────────────────────┘

PAGE 2 — PROCESSING CHART
  Bar chart: hourly throughput (videos per hour)
  Line chart: success rate over time

PAGE 3 — LICENSE OVERVIEW
  Pie chart: Active vs Expired vs Revoked
  Table: Top 10 expiring licenses

PAGE 4 — ERROR ANALYSIS
  Table: Error code | Count | % of total | Recommendation

PAGE 5 — SYSTEM PERFORMANCE
  Line graph: CPU usage, RAM usage over past 7 days

PAGE 6 — RECOMMENDATIONS (auto-generated)
  - "Error rate for PROC_003 is 3.2% — consider increasing worker timeout"
  - "6 licenses expiring in next 30 days — send renewal reminders"
  - "Disk usage at 78% — consider archiving old output files"
```

---

## Used By

```
Claude/Agents/analytics-agent.md
Claude/Worktree/export-logs.md
Claude/Worktree/admin-actions.md
```
