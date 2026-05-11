import React, { FC, useState, useEffect } from 'react';
import { css } from '@emotion/css';
import { Modal, Button, Switch, useStyles2 } from '@grafana/ui';
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
  const [multiple, setMultiple] = useState(false);

  const styles = useStyles2(getStyles);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setManualInput(companies[0]);
      setMultiple(false);
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

  const toggleMultiple = (next: boolean) => {
    setMultiple(next);
    setManualInput(next ? '' : companies[0]);
  };

  const selectedValues = multiple ? manualInput.split(',').filter(Boolean) : [];

  const toggleCompany = (company: string) => {
    const set = new Set(selectedValues);
    if (set.has(company)) {
      set.delete(company);
    } else {
      set.add(company);
    }
    const next = companies.filter((c) => set.has(c));
    setManualInput(next.join(','));
  };

  return (
    <Modal title={title} isOpen={isOpen} onDismiss={onDismiss}>
      <div className={styles.container}>
        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>Mail to multiple</span>
          <Switch value={multiple} onChange={(e: any) => toggleMultiple(e.currentTarget.checked)} />
        </div>
        <div className={styles.formRow}>
          {multiple ? (
            <div className={styles.multiList} role="listbox" aria-multiselectable="true">
              {companies.map((company: string) => {
                const isSelected = selectedValues.includes(company);
                return (
                  <div
                    key={company}
                    role="option"
                    aria-selected={isSelected}
                    className={`${styles.multiRow} ${isSelected ? styles.multiRowSelected : ''}`}
                    onClick={() => toggleCompany(company)}
                  >
                    <span className={styles.multiRowLabel}>{company || ''}</span>
                    {isSelected && <i className={`fa fa-check ${styles.multiRowTick}`} />}
                  </div>
                );
              })}
            </div>
          ) : (
            <select className={styles.select} value={manualInput} onChange={(e: any) => change(e)}>
              {companies.map((company: string) => (
                <option key={company} value={company}>
                  {company || ''}
                </option>
              ))}
            </select>
          )}
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
  multiList: css`
    width: 100%;
    max-height: 220px;
    overflow-y: auto;
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.borderRadius(1)};
    background: ${theme.colors.background.primary};
  `,
  multiRow: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: ${theme.spacing(0.75)} ${theme.spacing(1.5)};
    cursor: pointer;
    border-bottom: 1px solid ${theme.colors.border.weak};
    &:last-child {
      border-bottom: none;
    }
    &:hover {
      background: ${theme.colors.action.hover};
    }
  `,
  multiRowSelected: css`
    background: ${theme.colors.action.selected};
  `,
  multiRowLabel: css`
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  multiRowTick: css`
    margin-left: ${theme.spacing(2)};
    color: ${theme.colors.success.text};
  `,
  toggleRow: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};
    margin-bottom: ${theme.spacing(2)};
  `,
  toggleLabel: css`
    font-weight: ${theme.typography.fontWeightMedium};
  `,
});
