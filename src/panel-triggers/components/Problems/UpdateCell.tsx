import React, { useState } from 'react';
import { css } from '@emotion/css';
import { RTCell } from '../../types';
import { ProblemDTO } from '../../../datasource/types';
import { FAIcon } from '../../../components';
import { useTheme, stylesFactory, Modal, Button, HorizontalGroup, VerticalGroup } from '@grafana/ui';
import { GrafanaTheme } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';

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

  const handleUpdate = () => {
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
              {/* Modal content goes here */}
              <p>Are you sure you want to update this problem?</p>
              <p>
                <strong>Problem:</strong> {problem.name}
              </p>
              {/* Add more problem details here as needed */}
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
