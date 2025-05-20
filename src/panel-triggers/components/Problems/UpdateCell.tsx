import React, { useState } from 'react';
import { css } from '@emotion/css';
import { RTCell } from '../../types';
import { ProblemDTO } from '../../../datasource/types';
import { FAIcon } from '../../../components';
import { useTheme, stylesFactory, Modal, Button, HorizontalGroup, VerticalGroup } from '@grafana/ui';
import { GrafanaTheme } from '@grafana/data';
import { getBackendSrv, getDataSourceSrv, getAppEvents } from '@grafana/runtime';

const getStyles = stylesFactory((theme: GrafanaTheme) => {
  return {
    label: css`
      font-size: ${theme.typography.size.md};
      color: ${theme.colors.blue};
      cursor: pointer;
    `,
    modalOverlay: css`
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.6);
      z-index: 1000;
      display: flex;
      justify-content: center;
      align-items: center;
    `,
    modalContent: css`
      width: 500px;
      background: ${theme.colors.bg1};
      border-radius: ${theme.border.radius.sm};
      padding: ${theme.spacing.md};
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
    `,
    modalHeader: css`
      font-size: ${theme.typography.heading.h3};
      margin-bottom: ${theme.spacing.md};
      color: ${theme.colors.text};
    `,
    buttonContainer: css`
      margin-top: ${theme.spacing.lg};
      display: flex;
      justify-content: flex-end;
    `,
  };
});

export const UpdateCell: React.FC<RTCell<ProblemDTO>> = (props: RTCell<ProblemDTO>) => {
  const problem = props.original;
  const theme = useTheme();
  const styles = getStyles(theme);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ackMessage, setAckMessage] = useState('');

  const handleUpdate = async () => {
    try {
      const ds: any = await getDataSourceSrv().get(problem.datasource);
      const result = await ds.zabbix.acknowledgeEvent(problem.eventid, ackMessage);
      getAppEvents().emit('alert-success', ['', 'Acknowledge güncellemesi başarıyla çağırıldı']);
    } catch (error) {
      getAppEvents().emit('alert-error', ['', 'Acknowledge güncelleme başarısız oldu']);
    }

    console.log('Updating problem:', problem);

    setIsModalOpen(false);
  };

  return (
    <>
      <div onClick={() => setIsModalOpen(true)}>
        <button className={styles.label}>Update</button>
      </div>

      {isModalOpen && (
        <Modal isOpen={isModalOpen} title="Update Problem" onDismiss={() => setIsModalOpen(false)}>
          <VerticalGroup spacing="md">
            <div>
              <p>
                <strong>Problem:</strong> {problem.name}
              </p>
              <textarea value={ackMessage} onChange={(e) => setAckMessage(e.target.value)}></textarea>
            </div>

            <HorizontalGroup justify="flex-end">
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleUpdate}>
                Update
              </Button>
            </HorizontalGroup>
          </VerticalGroup>
        </Modal>
      )}
    </>
  );
};

export default UpdateCell;
