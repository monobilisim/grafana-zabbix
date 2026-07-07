import React, { FC, useState, useEffect, useCallback } from 'react';
import { css } from '@emotion/css';
import { Modal, Button, Spinner, Icon, useStyles2 } from '@grafana/ui';
import { GrafanaTheme2 } from '@grafana/data';
import { getDataSourceSrv, getAppEvents } from '@grafana/runtime';
import { ProblemDTO } from '../../../datasource/types';
import { ZBXScript } from '../../../datasource/zabbix/connectors/zabbix_api/types';

interface BulkCloseTicketModalProps {
  isOpen: boolean;
  problems: ProblemDTO[];
  onDismiss: () => void;
  // Called once a bulk close finishes so the parent can clear the selection.
  onClosed: () => void;
}

// Per-datasource information collected once the modal is opened: the id of the
// "Close Ticket" script used to run it and how many of the selected problems
// belong to the datasource.
interface DatasourceInfo {
  key: string;
  label: string;
  datasource: ProblemDTO['datasource'];
  closeTicketScriptId: string | null;
  problems: ProblemDTO[];
  error?: string;
}

type CloseStatus = 'success' | 'failed' | 'limited' | 'error';

interface CloseResult {
  eventid: string;
  problemName: string;
  ticketId: string;
  datasourceLabel: string;
  status: CloseStatus;
  detail?: string;
}

// Stable grouping key for a problem's datasource (which may be a string name or
// a DataSourceRef object).
const rawDatasourceKey = (ds: ProblemDTO['datasource']): string =>
  typeof ds === 'string' ? ds : JSON.stringify(ds ?? null);

// Pull the "TicketId" tag value off a problem, if any.
const getTicketId = (problem: ProblemDTO): string => {
  const tags = problem.tags || [];
  const tag = tags.find((t) => t.tag === 'TicketId');
  return tag?.value ?? '';
};

// Pull a human-readable message out of whatever was thrown/returned. Errors
// from the Grafana backend / Zabbix JSON-RPC arrive as nested objects, so a
// plain String(err) yields "[object Object]". This digs through the common
// shapes and falls back to JSON so the real cause is always shown.
const extractErrorMessage = (err: any): string => {
  if (err == null) {
    return 'Bilinmeyen hata';
  }
  if (typeof err === 'string') {
    return err;
  }

  const zbxMsg = err?.data?.error?.message ?? err?.error?.message;
  const zbxData = err?.data?.error?.data ?? err?.error?.data;
  if (zbxMsg || zbxData) {
    return [zbxMsg, zbxData].filter(Boolean).join(' ').trim();
  }

  const candidates = [err?.data?.message, err?.data?.error, err?.data?.response, err?.statusText, err?.message];
  const found = candidates.find((c) => typeof c === 'string' && c.trim() !== '');
  if (found) {
    return found;
  }

  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
};

// Classify the outcome of a single executeScript call. Rate-limited responses
// are surfaced separately so the user knows to retry them later.
const classifyResponse = (value?: unknown): { status: CloseStatus; detail?: string } => {
  const text = typeof value === 'string' ? value : value == null ? '' : extractErrorMessage(value);
  if (/limit|rate|too many|quota|throttl/i.test(text)) {
    return { status: 'limited', detail: text };
  }
  return { status: 'success', detail: text };
};

export const BulkCloseTicketModal: FC<BulkCloseTicketModalProps> = ({ isOpen, problems, onDismiss, onClosed }) => {
  const styles = useStyles2(getStyles);
  const [loading, setLoading] = useState(false);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [dsInfos, setDsInfos] = useState<DatasourceInfo[]>([]);
  const [closing, setClosing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [results, setResults] = useState<CloseResult[] | null>(null);

  // Resolve the datasources of the selected problems and fetch their Close
  // Ticket scripts.
  const prepare = useCallback(async () => {
    setLoading(true);
    setPrepError(null);
    setResults(null);
    try {
      // Group selected problems by their datasource.
      const byKey = new Map<string, ProblemDTO[]>();
      for (const problem of problems) {
        const key = rawDatasourceKey(problem.datasource);
        const list = byKey.get(key) ?? [];
        list.push(problem);
        byKey.set(key, list);
      }

      const infos: DatasourceInfo[] = [];
      for (const [key, groupProblems] of byKey.entries()) {
        const datasource = groupProblems[0].datasource;
        try {
          const ds: any = await getDataSourceSrv().get(datasource);
          const scripts: ZBXScript[] = await ds.zabbix.getScripts();
          const closeScript = scripts.find((s) => s.name === 'Close Ticket');
          infos.push({
            key,
            label: ds?.name || (typeof datasource === 'string' ? datasource : 'Datasource'),
            datasource,
            closeTicketScriptId: closeScript?.scriptid ?? null,
            problems: groupProblems,
            error: closeScript ? undefined : '"Close Ticket" scripti bulunamadı',
          });
        } catch (err) {
          infos.push({
            key,
            label: typeof datasource === 'string' ? datasource : 'Datasource',
            datasource,
            closeTicketScriptId: null,
            problems: groupProblems,
            error: extractErrorMessage(err) || 'Datasource scriptleri alınamadı',
          });
        }
      }

      setDsInfos(infos);
    } catch (err) {
      setPrepError(extractErrorMessage(err) || 'Datasource bilgileri hazırlanamadı');
    } finally {
      setLoading(false);
    }
  }, [problems]);

  useEffect(() => {
    if (isOpen) {
      prepare();
    } else {
      // Reset transient state when the modal closes.
      setResults(null);
      setProgress({ done: 0, total: 0 });
      setClosing(false);
    }
    // Only (re)prepare when the modal opens/closes — not when `problems`
    // changes underneath us (e.g. the parent clearing the selection after a
    // close), which would otherwise wipe the results view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Close the tickets sequentially, in the order the problems were selected,
  // collecting the outcome of every close so failures can be reported.
  const handleClose = async () => {
    setClosing(true);
    setResults(null);

    const infoByKey = new Map(dsInfos.map((info) => [info.key, info]));
    // Cache resolved datasource instances so we resolve each one only once.
    const instanceCache = new Map<string, any>();

    const collected: CloseResult[] = [];
    setProgress({ done: 0, total: problems.length });

    for (let i = 0; i < problems.length; i++) {
      const problem = problems[i];
      const key = rawDatasourceKey(problem.datasource);
      const info = infoByKey.get(key);
      const eventid = problem.eventid ?? '';

      const base = {
        eventid,
        problemName: problem.name ?? '',
        ticketId: getTicketId(problem),
        datasourceLabel: info?.label ?? '',
      };

      if (!info || !info.closeTicketScriptId) {
        collected.push({ ...base, status: 'failed', detail: info?.error ?? '"Close Ticket" scripti bulunamadı' });
        setProgress({ done: i + 1, total: problems.length });
        continue;
      }

      try {
        let instance = instanceCache.get(key);
        if (!instance) {
          instance = await getDataSourceSrv().get(problem.datasource);
          instanceCache.set(key, instance);
        }

        const res = await instance.zabbix.executeScript(info.closeTicketScriptId, undefined, eventid);

        if (res && res.response === 'failed') {
          collected.push({ ...base, status: 'failed', detail: extractErrorMessage(res.value ?? res) });
        } else {
          const { status, detail } = classifyResponse(res?.value);
          collected.push({ ...base, status, detail });
        }
      } catch (err) {
        collected.push({
          ...base,
          status: 'error',
          detail: extractErrorMessage(err),
        });
      }

      setProgress({ done: i + 1, total: problems.length });
    }

    setResults(collected);
    setClosing(false);
    reportResults(collected);
    // Clear the selection in the parent now that these problems have been
    // processed, so the closed rows aren't left looking still-selected.
    onClosed();
  };

  // Surface the outcome through Grafana's alert library: a success summary plus
  // a detailed list of every ticket that was rate-limited, failed, or errored.
  const reportResults = (collected: CloseResult[]) => {
    const appEvents = getAppEvents();
    const succeeded = collected.filter((r) => r.status === 'success');
    const problematic = collected.filter((r) => r.status !== 'success');

    if (succeeded.length > 0) {
      // @ts-ignore
      appEvents.emit('alert-success', [
        'Toplu ticket kapatma',
        `${succeeded.length}/${collected.length} ticket başarıyla kapatıldı`,
      ]);
    }

    if (problematic.length > 0) {
      const lines = problematic.map((r) => {
        const label = r.status === 'limited' ? 'Limitlendi' : r.status === 'error' ? 'Hata' : 'Kapatılamadı';
        return `#${r.eventid} (${r.datasourceLabel}) - ${label}${r.detail ? `: ${r.detail}` : ''}`;
      });
      // @ts-ignore
      appEvents.emit('alert-error', [`${problematic.length} ticket kapatılamadı`, lines.join('\n')]);
    }
  };

  const totalReady = dsInfos.reduce((acc, info) => acc + (info.closeTicketScriptId ? info.problems.length : 0), 0);
  const canClose = !loading && !closing && problems.length > 0 && totalReady > 0;

  const statusLabel: Record<CloseStatus, string> = {
    success: 'Başarılı',
    limited: 'Limitlendi',
    failed: 'Kapatılamadı',
    error: 'Hata',
  };

  return (
    <Modal title="Toplu Ticket Kapatma" isOpen={isOpen} onDismiss={onDismiss}>
      <div className={styles.container}>
        <div className={styles.summary}>
          {results !== null ? 'İşlenen' : 'Seçilen'} problem sayısı:{' '}
          <strong>{results !== null ? results.length : problems.length}</strong> · Datasource sayısı:{' '}
          <strong>{dsInfos.length}</strong>
        </div>

        {loading && (
          <div className={styles.center}>
            <Spinner /> <span>Datasource bilgileri hazırlanıyor…</span>
          </div>
        )}

        {prepError && <div className={styles.error}>{prepError}</div>}

        {!loading && !prepError && results === null && (
          <div className={styles.dsList}>
            {dsInfos.map((info) => (
              <div key={info.key} className={styles.dsRow}>
                <div className={styles.dsHeader}>
                  <span className={styles.dsLabel}>{info.label}</span>
                  <span className={styles.dsCount}>{info.problems.length} ticket</span>
                </div>
                {info.error ? (
                  <div className={styles.error}>{info.error}</div>
                ) : (
                  <ul className={styles.ticketList}>
                    {info.problems.map((problem) => {
                      const ticketId = getTicketId(problem);
                      return (
                        <li key={problem.eventid} className={styles.ticketItem}>
                          <span className={styles.ticketId}>{ticketId ? `#${ticketId}` : 'Ticket ID yok'}</span>
                          <span className={styles.ticketName}>{problem.name}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {closing && (
          <div className={styles.center}>
            <Spinner />{' '}
            <span>
              Kapatılıyor… {progress.done}/{progress.total}
            </span>
          </div>
        )}

        {results !== null && (
          <div className={styles.results}>
            {results.map((r, idx) => (
              <div key={`${r.eventid}-${idx}`} className={styles.resultRow}>
                <Icon
                  name={r.status === 'success' ? 'check-circle' : 'exclamation-triangle'}
                  className={r.status === 'success' ? styles.okIcon : styles.failIcon}
                />
                <span className={styles.resultText}>
                  #{r.eventid} · {r.datasourceLabel}
                  {r.ticketId ? ` · Ticket #${r.ticketId}` : ''} — {statusLabel[r.status]}
                  {r.detail && r.status !== 'success' ? `: ${r.detail}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className={styles.buttons}>
          <Button variant="secondary" onClick={onDismiss}>
            {results !== null ? 'Kapat' : 'İptal'}
          </Button>
          {results === null && (
            <Button variant="destructive" onClick={handleClose} disabled={!canClose}>
              {closing ? 'Kapatılıyor…' : `Ticketları Kapat (${totalReady})`}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    padding: ${theme.spacing(2)};
  `,
  summary: css`
    margin-bottom: ${theme.spacing(2)};
    color: ${theme.colors.text.secondary};
  `,
  center: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
    margin: ${theme.spacing(2)} 0;
  `,
  dsList: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1.5)};
    max-height: 320px;
    overflow-y: auto;
  `,
  dsRow: css`
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.borderRadius(1)};
    padding: ${theme.spacing(1.5)};
    background: ${theme.colors.background.secondary};
  `,
  dsHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: ${theme.spacing(1)};
  `,
  dsLabel: css`
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  dsCount: css`
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
  `,
  ticketList: css`
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(0.5)};
  `,
  ticketItem: css`
    display: flex;
    align-items: baseline;
    gap: ${theme.spacing(1)};
    font-size: ${theme.typography.bodySmall.fontSize};
  `,
  ticketId: css`
    font-weight: ${theme.typography.fontWeightMedium};
    min-width: 90px;
    color: ${theme.colors.text.primary};
  `,
  ticketName: css`
    color: ${theme.colors.text.secondary};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  error: css`
    color: ${theme.colors.error.text};
    font-size: ${theme.typography.bodySmall.fontSize};
  `,
  results: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(0.5)};
    max-height: 320px;
    overflow-y: auto;
    margin-top: ${theme.spacing(1)};
  `,
  resultRow: css`
    display: flex;
    align-items: flex-start;
    gap: ${theme.spacing(1)};
  `,
  resultText: css`
    font-size: ${theme.typography.bodySmall.fontSize};
  `,
  okIcon: css`
    color: ${theme.colors.success.text};
    margin-top: 2px;
  `,
  failIcon: css`
    color: ${theme.colors.error.text};
    margin-top: 2px;
  `,
  buttons: css`
    display: flex;
    justify-content: flex-end;
    gap: ${theme.spacing(1)};
    margin-top: ${theme.spacing(3)};
  `,
});
