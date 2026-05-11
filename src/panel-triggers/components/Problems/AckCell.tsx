import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { css } from '@emotion/css';
import { RTCell } from '../../types';
import { ProblemDTO, ZBXAcknowledge } from '../../../datasource/types';
import { FAIcon } from '../../../components';
import { useStyles, useTheme } from '@grafana/ui';
import { GrafanaTheme } from '@grafana/data';
import { getBackendSrv, getAppEvents, locationService } from '@grafana/runtime';

function isValidJSONObject(str) {
  try {
    const parsed = JSON.parse(str);
    if (typeof parsed === 'object' && parsed !== null) {
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

interface MessageJson {
  grafanaUser: string;
  grafanaUserId?: number;
  message: string;
}

async function navigateToGrafanaUser(login: string, userId?: number) {
  let resolvedId = userId;
  if (!resolvedId && login) {
    try {
      const user = await getBackendSrv().get(`/api/users/lookup?loginOrEmail=${encodeURIComponent(login)}`);
      resolvedId = user?.id;
    } catch {
      // ignore — handled below
    }
  }
  if (resolvedId) {
    locationService.push(`/admin/users/edit/${resolvedId}`);
  } else {
    // @ts-ignore
    getAppEvents().emit('alert-warning', ['Kullanıcı bulunamadı', `${login} Grafana'da bulunamadı`]);
  }
}

function getZabbixUserDisplay(ack: ZBXAcknowledge): string {
  const fullName = `${ack.name || ''} ${ack.surname || ''}`.trim();
  return fullName || ack.user || ack.alias || 'İsimsiz Kullanıcı';
}

const values: Record<string, string[]> = {
  closeProblem: ['1', '5', '7', '21'],
  message: ['4', '6'],
  suppressProblem: ['32', '36', '38'],
  unsuppressProblem: ['64', '68', '70'],
  changeSeverity: ['8'],
  unacknowledged: ['16', '20', '21'],
  acknowledged: ['2', '6', '7', '38', '70'],
};

export const AckCell: React.FC<RTCell<ProblemDTO>> = (props: RTCell<ProblemDTO>) => {
  const problem = props.original;
  const theme = useTheme();
  const styles = getStyles(theme);
  const [modalOpen, setModalOpen] = useState(false);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const toggleModal = () => {
    if (!modalOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPopupPos({ top: rect.bottom + 4, left: rect.left });
    }
    setModalOpen(!modalOpen);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (modalRef.current && modalRef.current.contains(target)) {
        return;
      }
      if (triggerRef.current && triggerRef.current.contains(target)) {
        return;
      }
      setModalOpen(false);
    };

    if (modalOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [modalOpen]);

  return (
    <>
      <div ref={triggerRef} onClick={toggleModal} className={styles.clickableArea}>
        {problem.acknowledges?.length > 0 && (
          <>
            <FAIcon icon="comments" />
            <button className={styles.countLabel}>({problem.acknowledges.length})</button>
          </>
        )}
      </div>

      {modalOpen && problem.acknowledges && problem.acknowledges.length > 0 && popupPos &&
        ReactDOM.createPortal(
        <div
          ref={modalRef}
          className={styles.ackList}
          style={{ top: popupPos.top, left: popupPos.left }}
          onClick={handleModalClick}
        >
          {problem.acknowledges.map((ack, index) => {
            if (isValidJSONObject(ack.message)) {
              const parsedMessage = JSON.parse(ack.message) as MessageJson;
              return (
                <div key={ack.acknowledgeid || index} className={styles.ackItem}>
                  <>
                    <div className={styles.ackHeader}>
                      <span className={styles.ackUser}>
                        {parsedMessage.grafanaUser && parsedMessage.grafanaUser !== '' ? (
                          <a
                            href="#"
                            className={styles.userLink}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              navigateToGrafanaUser(parsedMessage.grafanaUser, parsedMessage.grafanaUserId);
                            }}
                          >
                            {parsedMessage.grafanaUser}
                          </a>
                        ) : (
                          'İsimsiz Kullanıcı'
                        )}
                      </span>
                      <span className={styles.ackTime}>on {ack.time}</span>
                    </div>
                    {parsedMessage.message && <div className={styles.ackMessage}>{parsedMessage.message}</div>}
                    {values.changeSeverity.includes(ack.action) && (
                      <div className={styles.ackAction}>
                        {/* @ts-ignore */}
                        Changed severity from {ack.old_severity} to {ack.new_severity}
                      </div>
                    )}
                    {values.suppressProblem.includes(ack.action) &&
                      // @ts-ignore
                      (parseInt(ack.suppress_until, 10) === 0 ? (
                        <div className={styles.ackAction}>Suppressed indefinitely</div>
                      ) : (
                        <div className={styles.ackAction}>
                          {/* @ts-ignore */}
                          Suppressed until {new Date(parseInt(ack.suppress_until, 10) * 1000).toLocaleString()}
                        </div>
                      ))}
                    {values.unsuppressProblem.includes(ack.action) && (
                      <div className={styles.ackAction}>Unsuppressed the problem</div>
                    )}
                    {values.closeProblem.includes(ack.action) && (
                      <div className={styles.ackAction}>Manually closed the problem</div>
                    )}
                    {values.acknowledged.includes(ack.action) && <div className={styles.ackAction}>Acknowledged</div>}
                    {values.unacknowledged.includes(ack.action) && (
                      <div className={styles.ackAction}>Unacknowledged</div>
                    )}
                  </>
                </div>
              );
            }

            return (
              <div key={ack.acknowledgeid || index} className={styles.ackItem}>
                <div className={styles.ackHeader}>
                  <span className={styles.ackUser}>
                    {getZabbixUserDisplay(ack)}
                    <span className={styles.zabbixLabel}> (Zabbix)</span>
                  </span>
                  <span className={styles.ackTime}>on {ack.time}</span>
                </div>
                {ack.message && <div className={styles.ackMessage}>{ack.message}</div>}
                {values.changeSeverity.includes(ack.action) && (
                  <div className={styles.ackAction}>
                    {/* @ts-ignore */}
                    Changed severity from {ack.old_severity} to {ack.new_severity}
                  </div>
                )}
                {values.suppressProblem.includes(ack.action) &&
                  // @ts-ignore
                  (parseInt(ack.suppress_until, 10) === 0 ? (
                    <div className={styles.ackAction}>Suppressed indefinitely</div>
                  ) : (
                    <div className={styles.ackAction}>
                      {/* @ts-ignore */}
                      Suppressed until {new Date(parseInt(ack.suppress_until, 10) * 1000).toLocaleString()}
                    </div>
                  ))}
                {values.unsuppressProblem.includes(ack.action) && (
                  <div className={styles.ackAction}>Unsuppressed the problem</div>
                )}
                {values.closeProblem.includes(ack.action) && (
                  <div className={styles.ackAction}>Manually closed the problem</div>
                )}
                {values.acknowledged.includes(ack.action) && <div className={styles.ackAction}>Acknowledged</div>}
                {values.unacknowledged.includes(ack.action) && <div className={styles.ackAction}>Unacknowledged</div>}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
};

const getStyles = (theme: GrafanaTheme) => {
  return {
    countLabel: css`
      font-size: ${theme.typography.size.sm};
      background: none;
      border: none;
      padding: 0;
      margin-left: 4px;
      cursor: pointer;
      color: ${theme.colors.text};
      &:hover {
        text-decoration: underline;
      }
    `,
    ackList: css`
      position: fixed;
      z-index: 1000;
      background: ${theme.colors.bg2};
      border: 1px solid ${theme.colors.border2};
      border-radius: ${theme.border.radius.sm};
      padding: 16px;
      width: 350px;
      max-height: 400px;
      overflow-y: auto;
      box-shadow: 0 0 20px ${theme.colors.dashboardBg};
    `,
    ackItem: css`
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid ${theme.colors.border1};
      &:last-child {
        border-bottom: none;
        margin-bottom: 0;
        padding-bottom: 0;
      }
    `,
    ackHeader: css`
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
      word-break: break-word;
    `,
    ackUser: css`
      font-weight: 600;
      margin-right: 8px;
    `,
    userLink: css`
      color: ${theme.colors.linkExternal};
      text-decoration: underline;
      cursor: pointer;
      &:hover {
        color: ${theme.colors.linkHover};
      }
    `,
    zabbixLabel: css`
      font-weight: 400;
      color: ${theme.colors.textWeak};
      margin-left: 4px;
    `,
    ackTime: css`
      font-size: ${theme.typography.size.xs};
      color: ${theme.colors.textWeak};
    `,
    ackMessage: css`
      font-size: ${theme.typography.size.sm};
      color: ${theme.colors.text};
      white-space: pre-wrap;
      word-break: break-word;
      margin-top: 8px;
    `,
    ackAction: css`
      font-size: ${theme.typography.size.sm};
      color: ${theme.colors.textSemiWeak};
      margin-top: 4px;
      font-style: italic;
    `,
    clickableArea: css`
      cursor: pointer;
      display: inline-flex;
      align-items: center;
    `,
  };
};
