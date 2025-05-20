import React, { useState } from 'react';
import { css } from '@emotion/css';
import { RTCell } from '../../types';
import { ProblemDTO } from '../../../datasource/types';
import { FAIcon } from '../../../components';
import { useTheme, stylesFactory } from '@grafana/ui';
import { GrafanaTheme } from '@grafana/data';

const getStyles = stylesFactory((theme: GrafanaTheme) => {
  return {
    countLabel: css`
      font-size: ${theme.typography.size.sm};
    `,
    ackList: css`
      position: absolute;
      z-index: 1000;
      background: ${theme.colors.bg2};
      border: 1px solid ${theme.colors.border2};
      border-radius: ${theme.border.radius.sm};
      padding: ${theme.spacing.sm};
      width: 300px;
    `,
    ackItem: css`
      margin-bottom: ${theme.spacing.sm};
      padding-bottom: ${theme.spacing.sm};
      border-bottom: 1px solid ${theme.colors.border1};
      &:last-child {
        border-bottom: none;
        margin-bottom: 0;
      }
    `,
  };
});

export const AckCell: React.FC<RTCell<ProblemDTO>> = (props: RTCell<ProblemDTO>) => {
  const problem = props.original;
  const theme = useTheme();
  const styles = getStyles(theme);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div onClick={() => setModalOpen(!modalOpen)}>
        {problem.acknowledges?.length > 0 && (
          <>
            <FAIcon icon="comments" />
            <span className={styles.countLabel}> ({problem.acknowledges.length})</span>
          </>
        )}
      </div>

      {modalOpen && problem.acknowledges && problem.acknowledges.length > 0 && (
        <div className={styles.ackList}>
          {problem.acknowledges.map((ack, index) => (
            <div key={ack.acknowledgeid || index} className={styles.ackItem}>
              <div>
                <strong>
                  {ack.user || ack.name} {ack.surname}
                </strong>{' '}
                on {ack.time}
              </div>
              {ack.message && <div>{ack.message}</div>}
              {ack.action === '4' && <div>Acknowledged</div>}
              {ack.action === '8' && (
                <div>
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
