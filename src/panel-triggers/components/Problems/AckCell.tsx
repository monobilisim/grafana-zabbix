import React, { useState, useEffect, useRef } from 'react';
import { css } from '@emotion/css';
import { RTCell } from '../../types';
import { ProblemDTO } from '../../../datasource/types';
import { FAIcon } from '../../../components';
import { useStyles, useTheme } from '@grafana/ui';
import { GrafanaTheme } from '@grafana/data';

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
  message: string;
}

const values: Record<string, string[]> = {
  closeProblem: ['1', '5'],
  message: ['4'],
  suppressProblem: ['32', '36'],
  unsuppressProblem: ['64', '68'],
  changeSeverity: ['8'],
};

export const AckCell: React.FC<RTCell<ProblemDTO>> = (props: RTCell<ProblemDTO>) => {
  const problem = props.original;
  const theme = useTheme();
  const styles = getStyles(theme);
  const [modalOpen, setModalOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setModalOpen(false);
      }
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
      <div onClick={() => setModalOpen(!modalOpen)} className={styles.clickableArea}>
        {problem.acknowledges?.length > 0 && (
          <>
            <FAIcon icon="comments" />
            <button className={styles.countLabel}>({problem.acknowledges.length})</button>
          </>
        )}
      </div>

      {modalOpen && problem.acknowledges && problem.acknowledges.length > 0 && (
        <div ref={modalRef} className={styles.ackList} onClick={handleModalClick}>
          {problem.acknowledges.map((ack, index) => {
            if (isValidJSONObject(ack.message)) {
              const parsedMessage = JSON.parse(ack.message) as MessageJson;
              return (
                <div key={ack.acknowledgeid || index} className={styles.ackItem}>
                  <>
                    <div className={styles.ackHeader}>
                      <span className={styles.ackUser}>
                        {parsedMessage.grafanaUser && parsedMessage.grafanaUser !== ''
                          ? parsedMessage.grafanaUser
                          : 'İsimsiz Kullanıcı'}
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
                  </>
                </div>
              );
            }

            return (
              <div key={ack.acknowledgeid || index} className={styles.ackItem}>
                <div className={styles.ackHeader}>
                  <span className={styles.ackUser}>
                    {ack.user || ack.name} {ack.surname}
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
              </div>
            );
          })}
        </div>
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
      position: absolute;
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
