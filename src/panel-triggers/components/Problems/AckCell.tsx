import React, { useState } from 'react';
import { css } from '@emotion/css';
import { RTCell } from '../../types';
import { ProblemDTO } from '../../../datasource/types';
import { FAIcon } from '../../../components';
import { useTheme, stylesFactory } from '@grafana/ui';
import { GrafanaTheme } from '@grafana/data';
// import { getBackendSrv } from '@grafana/runtime'; // Not used in this component

const getStyles = stylesFactory((theme: GrafanaTheme) => {
  return {
    countLabel: css`
      font-size: ${theme.typography.size.sm};
      background: none; // Make button transparent
      border: none;
      padding: 0;
      margin-left: ${theme.spacing(0.5)}; // Add a little space after the icon
      cursor: pointer;
      color: ${theme.colors.text}; // Use theme text color
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
      padding: ${theme.spacing.md}; // Increased padding for the modal itself
      width: 350px; // Slightly wider
      max-height: 400px; // Max height before scrolling
      overflow-y: auto; // Enable vertical scroll
      box-shadow: ${theme.shadows.lg}; // Add a bit of shadow for depth
    `,
    ackItem: css`
      margin-bottom: ${theme.spacing.md}; // Increased margin
      padding-bottom: ${theme.spacing.md}; // Increased padding
      border-bottom: 1px solid ${theme.colors.border1};
      &:last-child {
        border-bottom: none;
        margin-bottom: 0;
        padding-bottom: 0; // No padding at the very end
      }
    `,
    ackHeader: css`
      display: flex;
      justify-content: space-between; // Pushes time to the right
      align-items: baseline;
      margin-bottom: ${theme.spacing.xs};
      word-break: break-word; // Prevent overflow for long names
    `,
    ackUser: css`
      font-weight: ${theme.typography.fontWeightBold};
      margin-right: ${theme.spacing(1)}; // Space after user name
    `,
    ackTime: css`
      font-size: ${theme.typography.size.xs};
      color: ${theme.colors.textWeak};
    `,
    ackMessage: css`
      font-size: ${theme.typography.size.sm};
      color: ${theme.colors.text};
      white-space: pre-wrap; // Preserve whitespace and wrap text
      word-break: break-word; // Break long words
      margin-top: ${theme.spacing.sm}; // Space above message if header is present
    `,
    ackAction: css`
      font-size: ${theme.typography.size.sm};
      color: ${theme.colors.textSemiWeak};
      margin-top: ${theme.spacing.xs};
      font-style: italic;
    `,
    clickableArea: css`
      cursor: pointer;
      display: inline-flex; // To keep icon and button on the same line
      align-items: center;
    `,
  };
});

export const AckCell: React.FC<RTCell<ProblemDTO>> = (props: RTCell<ProblemDTO>) => {
  const problem = props.original;
  const theme = useTheme();
  const styles = getStyles(theme);
  const [modalOpen, setModalOpen] = useState(false);

  // Prevent modal from closing when clicking inside it
  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

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
        <div className={styles.ackList} onClick={handleModalClick}>
          {problem.acknowledges.map((ack, index) => (
            <div key={ack.acknowledgeid || index} className={styles.ackItem}>
              <div className={styles.ackHeader}>
                <span className={styles.ackUser}>
                  {ack.user || ack.name} {ack.surname}
                </span>
                <span className={styles.ackTime}>on {ack.time}</span>
              </div>
              {ack.message && <div className={styles.ackMessage}>{ack.message}</div>}
              {ack.action === '4' && <div className={styles.ackAction}>Acknowledged</div>}
              {ack.action === '8' && (
                <div className={styles.ackAction}>
                  Changed severity from {ack.old_severity} to {ack.new_severity}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
};
