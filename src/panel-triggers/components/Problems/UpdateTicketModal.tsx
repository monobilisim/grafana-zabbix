import React, { FC, useState, useEffect } from 'react';
import { css } from '@emotion/css';
import { Modal, Button, useStyles2 } from '@grafana/ui';
import { GrafanaTheme2 } from '@grafana/data';
import { ZabbixInput } from 'datasource/components/ZabbixInput';

interface EmailModalProps {
  isOpen: boolean;
  problem: any;
  onDismiss: () => void;
  onSubmit: (recipient: string) => Promise<void>;
  title?: string;
  setManualInput: React.Dispatch<React.SetStateAction<string>>;
  manualInput: string;
}

export const TicketModal: FC<EmailModalProps> = ({
  isOpen,
  problem,
  onDismiss,
  onSubmit,
  title = 'Update Ticket ID',
  setManualInput,
  manualInput,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const styles = useStyles2(getStyles);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setManualInput('');
      setError(null);
    }
  }, [isOpen, setManualInput]);

  const handleSubmit = async () => {
    if (!manualInput || manualInput.trim() === '') {
      setError('ID is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit(manualInput);
      onDismiss();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Make sure we're getting a proper event with target
    if (e && e.target) {
      const value = e.target.value.replace(/[^0-9]/g, '');
      setManualInput(value);
    }
  };

  return (
    <Modal title={title} isOpen={isOpen} onDismiss={onDismiss}>
      <div className={styles.container}>
        <div className={styles.formRow}>
          <input type="text" value={manualInput} onChange={handleChange} width={30} placeholder="Enter Ticket ID" />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.buttons}>
          <Button variant="secondary" onClick={onDismiss}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting || !manualInput}>
            {isSubmitting ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    padding: ${theme.spacing(2)};
  `,
  formRow: css`
    margin-bottom: ${theme.spacing(2)};
    display: flex;
    align-items: center;
  `,
  label: css`
    width: 80px;
    font-weight: ${theme.typography.fontWeightMedium};
    margin-right: ${theme.spacing(1)};
  `,
  error: css`
    color: ${theme.colors.error.text};
    margin-bottom: ${theme.spacing(2)};
  `,
  buttons: css`
    display: flex;
    justify-content: flex-end;
    gap: ${theme.spacing(1)};
    margin-top: ${theme.spacing(3)};
  `,
  select: css`
    height: 24px;
  `,
});
