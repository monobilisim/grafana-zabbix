import React, { FC, useState, useEffect, useCallback } from 'react';
import { css } from '@emotion/css';
import { Modal, Button, Spinner, Icon, useStyles2 } from '@grafana/ui';
import { GrafanaTheme2 } from '@grafana/data';
import { getDataSourceSrv, getAppEvents } from '@grafana/runtime';
import { ProblemDTO } from '../../../datasource/types';
import { ZBXScript } from '../../../datasource/zabbix/connectors/zabbix_api/types';
import { parseEmails, parseEmailsFallback } from './Problems';

export const parseCompanies = (command?: string): string[] => {
  if (!command) {
    return [];
  }
  let companies = parseEmails(command);
  if (companies.length === 0) {
    companies = parseEmailsFallback(command);
  }
  return companies;
};

interface BulkMailModalProps {
  isOpen: boolean;
  problems: ProblemDTO[];
  onDismiss: () => void;
}

// Per-datasource information collected once the modal is opened: the available
// e-mail groups parsed from the "Send Email" script, the script id used to run
// it, and how many of the selected problems belong to the datasource.
interface DatasourceInfo {
  key: string;
  label: string;
  datasource: ProblemDTO['datasource'];
  companies: string[];
  sendEmailScriptId: string | null;
  problemCount: number;
  error?: string;
}

type SendStatus = 'success' | 'failed' | 'limited' | 'error';

interface SendResult {
  eventid: string;
  problemName: string;
  datasourceLabel: string;
  group: string;
  status: SendStatus;
  detail?: string;
}

// Stable grouping key for a problem's datasource (which may be a string name or
// a DataSourceRef object).
const rawDatasourceKey = (ds: ProblemDTO['datasource']): string =>
  typeof ds === 'string' ? ds : JSON.stringify(ds ?? null);

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

  // Zabbix errors often split a generic message and the useful detail, e.g.
  // { message: "Application error.", data: "Script is not allowed ..." }
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
const classifyResponse = (value?: unknown): { status: SendStatus; detail?: string } => {
  const text = typeof value === 'string' ? value : value == null ? '' : extractErrorMessage(value);
  if (/limit|rate|too many|quota|throttl/i.test(text)) {
    return { status: 'limited', detail: text };
  }
  return { status: 'success', detail: text };
};

export const BulkMailModal: FC<BulkMailModalProps> = ({ isOpen, problems, onDismiss }) => {
  const styles = useStyles2(getStyles);
  const [loading, setLoading] = useState(false);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [dsInfos, setDsInfos] = useState<DatasourceInfo[]>([]);
  const [selectedGroupByDs, setSelectedGroupByDs] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [results, setResults] = useState<SendResult[] | null>(null);

  // Resolve the datasources of the selected problems, fetch their Send Email
  // scripts and the e-mail groups available on each source.
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
          const emailScript = scripts.find((s) => s.name === 'Send Email');
          infos.push({
            key,
            label: ds?.name || (typeof datasource === 'string' ? datasource : 'Datasource'),
            datasource,
            companies: parseCompanies(emailScript?.command),
            sendEmailScriptId: emailScript?.scriptid ?? null,
            problemCount: groupProblems.length,
            error: emailScript ? undefined : '"Send Email" scripti bulunamadı',
          });
        } catch (err) {
          infos.push({
            key,
            label: typeof datasource === 'string' ? datasource : 'Datasource',
            datasource,
            companies: [],
            sendEmailScriptId: null,
            problemCount: groupProblems.length,
            error: extractErrorMessage(err) || 'Datasource scriptleri alınamadı',
          });
        }
      }

      // Pre-select the first available group for each datasource.
      const defaults: Record<string, string> = {};
      for (const info of infos) {
        if (info.companies.length > 0) {
          defaults[info.key] = info.companies[0];
        }
      }

      setDsInfos(infos);
      setSelectedGroupByDs(defaults);
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
      setSending(false);
    }
  }, [isOpen, prepare]);

  const handleGroupChange = (dsKey: string, group: string) => {
    setSelectedGroupByDs((prev) => ({ ...prev, [dsKey]: group }));
  };

  // Send the e-mails sequentially, in the order the problems were selected,
  // collecting the outcome of every send so failures can be reported.
  const handleSend = async () => {
    setSending(true);
    setResults(null);

    const infoByKey = new Map(dsInfos.map((info) => [info.key, info]));
    // Cache resolved datasource instances so we resolve each one only once.
    const instanceCache = new Map<string, any>();

    const collected: SendResult[] = [];
    setProgress({ done: 0, total: problems.length });

    for (let i = 0; i < problems.length; i++) {
      const problem = problems[i];
      const key = rawDatasourceKey(problem.datasource);
      const info = infoByKey.get(key);
      const group = info ? selectedGroupByDs[info.key] : '';
      const eventid = problem.eventid ?? '';

      const base = {
        eventid,
        problemName: problem.name ?? '',
        datasourceLabel: info?.label ?? '',
        group: group ?? '',
      };

      if (!info || !info.sendEmailScriptId) {
        collected.push({ ...base, status: 'failed', detail: info?.error ?? '"Send Email" scripti bulunamadı' });
        setProgress({ done: i + 1, total: problems.length });
        continue;
      }

      if (!group) {
        collected.push({ ...base, status: 'failed', detail: 'Hedef e-posta grubu seçilmedi' });
        setProgress({ done: i + 1, total: problems.length });
        continue;
      }

      try {
        let instance = instanceCache.get(key);
        if (!instance) {
          instance = await getDataSourceSrv().get(problem.datasource);
          instanceCache.set(key, instance);
        }

        console.log(`Sending email for problem ${eventid} to group ${group} on datasource ${info.label} resulted`);

        const res = await instance.zabbix.executeScript(info.sendEmailScriptId, undefined, eventid, {
          manualinput: group,
        });

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
    setSending(false);
    reportResults(collected);
  };

  // Surface the outcome through Grafana's alert (error) library: a success
  // summary plus a detailed list of every problem that was rate-limited,
  // failed, or errored.
  const reportResults = (collected: SendResult[]) => {
    const appEvents = getAppEvents();
    const succeeded = collected.filter((r) => r.status === 'success');
    const problematic = collected.filter((r) => r.status !== 'success');

    if (succeeded.length > 0) {
      // @ts-ignore
      appEvents.emit('alert-success', [
        'Toplu e-posta gönderildi',
        `${succeeded.length}/${collected.length} e-posta başarıyla gönderildi`,
      ]);
    }

    if (problematic.length > 0) {
      const lines = problematic.map((r) => {
        const label = r.status === 'limited' ? 'Limitlendi' : r.status === 'error' ? 'Hata' : 'Gönderilemedi';
        return `#${r.eventid} (${r.datasourceLabel}) - ${label}${r.detail ? `: ${r.detail}` : ''}`;
      });
      // @ts-ignore
      appEvents.emit('alert-error', [`${problematic.length} e-posta gönderilemedi`, lines.join('\n')]);
    }
  };

  const totalReady = dsInfos.reduce(
    (acc, info) => acc + (info.sendEmailScriptId && info.companies.length > 0 ? info.problemCount : 0),
    0
  );
  const canSend = !loading && !sending && problems.length > 0 && totalReady > 0;

  const statusLabel: Record<SendStatus, string> = {
    success: 'Başarılı',
    limited: 'Limitlendi',
    failed: 'Gönderilemedi',
    error: 'Hata',
  };

  return (
    <Modal title="Toplu E-posta Gönderimi" isOpen={isOpen} onDismiss={onDismiss}>
      <div className={styles.container}>
        <div className={styles.summary}>
          Seçilen problem sayısı: <strong>{problems.length}</strong> · Datasource sayısı:{' '}
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
                  <span className={styles.dsCount}>{info.problemCount} problem</span>
                </div>
                {info.error ? (
                  <div className={styles.error}>{info.error}</div>
                ) : info.companies.length === 0 ? (
                  <div className={styles.error}>Bu kaynak üzerinde tanımlı e-posta grubu bulunamadı</div>
                ) : (
                  <div className={styles.formRow}>
                    <label className={styles.label}>Hedef grup</label>
                    <select
                      className={styles.select}
                      value={selectedGroupByDs[info.key] ?? ''}
                      onChange={(e) => handleGroupChange(info.key, e.target.value)}
                    >
                      {info.companies.map((company) => (
                        <option key={company} value={company}>
                          {company}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {sending && (
          <div className={styles.center}>
            <Spinner />{' '}
            <span>
              Gönderiliyor… {progress.done}/{progress.total}
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
                  #{r.eventid} · {r.datasourceLabel} · {r.group} — {statusLabel[r.status]}
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
            <Button variant="primary" onClick={handleSend} disabled={!canSend}>
              {sending ? 'Gönderiliyor…' : `Gönder (${totalReady})`}
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
  formRow: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
  `,
  label: css`
    min-width: 80px;
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  select: css`
    flex: 1;
    height: 28px;
    background: ${theme.colors.background.primary};
    color: ${theme.colors.text.primary};
    border: 1px solid ${theme.colors.border.medium};
    border-radius: ${theme.shape.borderRadius(1)};
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
