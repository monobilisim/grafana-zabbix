import React, { FC, useState, useEffect } from 'react';
import { css } from '@emotion/css';
import { Modal, Button, useStyles2 } from '@grafana/ui';
import { GrafanaTheme2 } from '@grafana/data';

interface EmailModalProps {
  isOpen: boolean;
  problem: any;
  onDismiss: () => void;
  onSubmit: (recipient: string) => Promise<void>;
  title?: string;
  setManualInput: any;
  manualInput: string;
  companies: string[];
}

export const EmailModal: FC<EmailModalProps> = ({
  isOpen,
  problem,
  onDismiss,
  onSubmit,
  title = 'Send Email',
  setManualInput,
  manualInput,
  companies,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const styles = useStyles2(getStyles);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setManualInput(companies[0]);
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!manualInput) {
      setError('Recipient email is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit(manualInput);
      onDismiss();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setIsSubmitting(false);
    }
  };

  function change(e) {
    setManualInput(e.target.value);
  }

  return (
    <Modal title={title} isOpen={isOpen} onDismiss={onDismiss}>
      <div className={styles.container}>
        <div className={styles.formRow}>
          <select className={styles.select} value={manualInput} onChange={(e: any) => change(e)}>
            {companies.map((company: string) => (
              <option key={company} value={company}>
                {company || ''}
              </option>
            ))}
          </select>
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
  select: css`
    height: 24px;
  `,
});
