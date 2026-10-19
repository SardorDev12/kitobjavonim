import { useEffect, useState } from 'react';

import { Picker } from '../components/Picker';
import { adminApi, type AdminReport } from '../lib/adminApi';

// Reports come back all at once (no paging), so these are applied in the browser.
type ReportStatus = 'all' | 'open' | 'resolved';
type ReportSort = 'newest' | 'oldest';

const STATUSES: { value: ReportStatus; label: string }[] = [
  { value: 'all', label: 'Open and resolved' },
  { value: 'open', label: 'Open only' },
  { value: 'resolved', label: 'Resolved only' },
];

const SORTS: { value: ReportSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

export function ReportsPage() {
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [status, setStatus] = useState<ReportStatus>('all');
  const [sort, setSort] = useState<ReportSort>('newest');

  function load() {
    adminApi
      .listReports()
      .then(setReports)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }

  useEffect(load, []);

  async function resolve(reportId: string) {
    setResolvingId(reportId);
    try {
      await adminApi.resolveReport(reportId);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setResolvingId(null);
    }
  }

  if (error) return <p style={{ color: 'var(--danger)' }}>{error}</p>;
  if (!reports) return <p className="text-muted">Loading…</p>;

  const sorted = [...reports].sort((a, b) =>
    sort === 'oldest' ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at)
  );
  const open = status === 'resolved' ? [] : sorted.filter((r) => !r.resolved_at);
  const resolved = status === 'open' ? [] : sorted.filter((r) => r.resolved_at);

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Picker label="Show" value={status} options={STATUSES} onChange={setStatus} />
        <Picker label="Sort" value={sort} options={SORTS} onChange={setSort} />
      </div>

      {status === 'resolved' ? null : (
        <section>
          <h2 style={{ fontSize: 16 }}>Open ({open.length})</h2>
          {open.length === 0 ? (
            <p className="text-muted">No open reports.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {open.map((report) => (
                <ReportCard
                  key={report.report_id}
                  report={report}
                  onResolve={() => resolve(report.report_id)}
                  resolving={resolvingId === report.report_id}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {status === 'resolved' && resolved.length === 0 ? <p className="text-muted">No resolved reports.</p> : null}

      {resolved.length > 0 ? (
        <section>
          <h2 style={{ fontSize: 16 }}>Resolved ({resolved.length})</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {resolved.map((report) => (
              <ReportCard key={report.report_id} report={report} onResolve={() => {}} resolving={false} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ReportCard({
  report,
  onResolve,
  resolving,
}: {
  report: AdminReport;
  onResolve: () => void;
  resolving: boolean;
}) {
  return (
    <div className="card" style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <strong>{report.book_title}</strong>
        <span className={`badge ${report.resolved_at ? 'badge-success' : 'badge-warning'}`}>
          {report.resolved_at ? 'Resolved' : report.reason}
        </span>
      </div>

      {report.details ? <p style={{ margin: 0 }}>{report.details}</p> : null}

      <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
        Reported by {report.reporter_name} · Listing owner: {report.owner_name} ·{' '}
        {new Date(report.created_at).toLocaleString()}
      </p>

      {!report.resolved_at ? (
        <div>
          <button className="button" disabled={resolving} onClick={onResolve}>
            {resolving ? 'Marking resolved…' : 'Mark resolved'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
