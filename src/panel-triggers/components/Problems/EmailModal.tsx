import React, { FC, useState, useEffect } from 'react';
import { css } from '@emotion/css';
import { Modal, Button, useStyles2 } from '@grafana/ui';
import { GrafanaTheme2 } from '@grafana/data';
import { ZabbixInput } from '../../../datasource/components/ZabbixInput';

interface EmailModalProps {
  isOpen: boolean;
  problem: any;
  onDismiss: () => void;
  onSubmit: (recipient: string) => Promise<void>;
  title?: string;
}

export const EmailModal: FC<EmailModalProps> = ({ isOpen, problem, onDismiss, onSubmit, title = 'Send Email' }) => {
  const [recipient, setRecipient] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const styles = useStyles2(getStyles);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setRecipient('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!recipient) {
      setError('Recipient email is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit(recipient);
      onDismiss();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title={title} isOpen={isOpen} onDismiss={onDismiss}>
      <div className={styles.container}>
        <div className={styles.formRow}>
          <div className={styles.label}>Recipient:</div>
          <ZabbixInput
            value={recipient}
            onChange={(e: any) => setRecipient(e.target.value)}
            placeholder="Enter email recipient"
            width={30}
          />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.buttons}>
          <Button variant="secondary" onClick={onDismiss}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting}>
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
});
