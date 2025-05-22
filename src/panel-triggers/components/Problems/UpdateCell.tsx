import React, { useState, useEffect } from 'react';
import { css, cx } from '@emotion/css';
import {
  useTheme,
  useStyles2,
  Modal,
  Button,
  Stack,
  Input,
  TextArea,
  RadioButtonGroup,
  Checkbox,
  Tooltip,
  DateTimePicker,
} from '@grafana/ui';
import { GrafanaTheme2, SelectableValue, dateTime, DateTime } from '@grafana/data';
import { ProblemDTO } from '../../../datasource/types';
import { getDataSourceSrv, getAppEvents, getBackendSrv } from '@grafana/runtime';

interface UpdateCellProps {
  problem: ProblemDTO;
}

export const UpdateCell: React.FC<UpdateCellProps> = ({ problem }) => {
  const theme = useTheme();
  const styles = getStyles(theme);

  const [message, setMessage] = useState('');
  const [suppressProblem, setSuppressProblem] = useState(false);
  const [suppressTimeOption, setSuppressTimeOption] = useState<string>('1');
  const [suppressUntilProblem, setSuppressUntilProblem] = useState<DateTime | null>(null);
  const [unsuppressProblem, setUnsuppressProblem] = useState(false);
  const [closeProblem, setCloseProblem] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const suppressProblemDisabled = closeProblem || unsuppressProblem;
  const unsuppressProblemDisabled = closeProblem || suppressProblem;

  useEffect(() => {
    if (suppressProblemDisabled && suppressProblem) {
      setSuppressProblem(false);
    }
  }, [suppressProblemDisabled, suppressProblem]);

  useEffect(() => {
    if (unsuppressProblemDisabled && unsuppressProblem) {
      setUnsuppressProblem(false);
    }
  }, [unsuppressProblemDisabled, unsuppressProblem]);

  const suppressTimeOptionsElementsDisabled = !suppressProblem;
  const suppressUntilInputDisabled = suppressTimeOptionsElementsDisabled || suppressTimeOption === '0';

  useEffect(() => {
    if (isOpen) {
      setMessage('');
      setSuppressProblem(false);
      setSuppressTimeOption('1');
      setSuppressUntilProblem(null);
      setUnsuppressProblem(false);
      setCloseProblem(false);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    setIsSubmitting(true);

    const backend = getBackendSrv();
    const user = await backend.get('/api/user');
    const name = user.name;

    let actions = 0;

    if (closeProblem) {
      actions |= 1; // close problem
      actions |= 2; // acknowledge
    }
    // Grafana User'ı mesajda içerdiğimiz için her istek mesaj bulunduruyor
    actions |= 4; // message
    if (suppressProblem) {
      //actions |= 2; // acknowledge
      actions -= 4; // suppress doesn't like message to be added
      actions |= 32; // suppress
    }
    if (unsuppressProblem) {
      actions |= 64;
    }

    if (actions === 0 && !message) {
      // @ts-ignore
      getAppEvents().emit('alert-warning', [
        'Validation Error',
        'At least one update operation or message must exist.',
      ]);
      setIsSubmitting(false);
      return;
    }

    try {
      if (!problem.datasource) {
        console.error('Datasource is missing in problem data for UpdateCell.tsx');
        // @ts-ignore
        getAppEvents().emit('alert-error', ['Error', 'Datasource configuration missing for the problem.']);
        setIsSubmitting(false);
        return;
      }

      const ds: any = await getDataSourceSrv().get(problem.datasource);

      const resString = JSON.stringify({ grafanaUser: name, message: message });

      const unixEpoch = suppressUntilProblem ? Math.floor(suppressUntilProblem.valueOf() / 1000) : 0;

      const params = {
        ...(suppressProblem ? { suppress_until: unixEpoch } : {}),
      };

      await ds.zabbix.acknowledgeEvent(problem.eventid, resString, actions, undefined, params);

      // @ts-ignore
      getAppEvents().emit('alert-success', ['', 'İşlem başarıyla çağırıldı']);
      setIsOpen(false);
    } catch (error) {
      // @ts-ignore
      getAppEvents().emit('alert-error', ['', 'Acknowledge update failed']);
      setIsOpen(false);
    } finally {
      setIsSubmitting(false);
      setIsOpen(false);
    }
  };

  const renderHelpButton = (tooltipText: string, href?: string) => (
    <Tooltip content={tooltipText} placement="top">
      <a
        href={href || '#'}
        target={href ? '_blank' : undefined}
        rel={href ? 'noopener noreferrer' : undefined}
        className={styles.helpButton}
        onClick={(e) => {
          if (!href) {
            e.preventDefault();
          }
        }}
        aria-label="Help"
      >
        <i className="fa fa-question-circle"></i>
      </a>
    </Tooltip>
  );

  return (
    <>
      <button onClick={(e) => setIsOpen(!isOpen)}>Update</button>

      <Modal
        isOpen={isOpen}
        onDismiss={() => setIsOpen(false)}
        onClickBackdrop={() => setIsOpen(false)}
        title="Update Problem"
      >
        <div className={styles.modalContent}>
          <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
            <ul className={styles.tableForms}>
              {/* Problem Name */}
              <li className={styles.tableFormsLi}>
                <div className={styles.tableFormsTdLeft}>Problem</div>
                <div className={cx(styles.tableFormsTdRight, styles.wordbreak)}>{problem.name}</div>
              </li>

              {/* Message */}
              <li className={styles.tableFormsLi}>
                <div className={styles.tableFormsTdLeft}>
                  <label htmlFor="acknowledge_message">Message</label>
                </div>
                <div className={styles.tableFormsTdRight}>
                  <TextArea
                    id="acknowledge_message"
                    value={message}
                    onChange={(e) => setMessage(e.currentTarget.value)}
                    rows={4}
                    maxLength={2048}
                    className={styles.textarea}
                  />
                </div>
              </li>

              {/* Suppress Problem */}
              <li className={styles.tableFormsLi}>
                <div className={styles.tableFormsTdLeft}>
                  <div className={styles.labelWithHelp}>
                    <label htmlFor="suppress_problem_cb">Suppress</label>
                    {renderHelpButton(
                      'Manual problem suppression. Date-time input accepts relative and absolute time format.'
                    )}
                  </div>
                </div>
                <div className={styles.tableFormsTdRight}>
                  <Stack spacing="md" direction="row" alignItems="flex-start" wrap>
                    <Checkbox
                      id="suppress_problem_cb"
                      value={suppressProblem}
                      onChange={(e) => setSuppressProblem(e.currentTarget.checked)}
                      disabled={suppressProblemDisabled}
                    />
                    <RadioButtonGroup
                      options={[
                        { label: 'Indefinitely', value: '0' },
                        { label: 'Until', value: '1' },
                      ]}
                      value={suppressTimeOption}
                      onChange={setSuppressTimeOption}
                      disabled={suppressTimeOptionsElementsDisabled}
                    />
                    <DateTimePicker
                      date={suppressUntilProblem}
                      onChange={(date) => setSuppressUntilProblem(date)}
                      placeholder="Select date and time"
                    />
                  </Stack>
                </div>
              </li>

              {/* Unsuppress Problem */}
              <li className={styles.tableFormsLi}>
                <div className={styles.tableFormsTdLeft}>
                  <div className={styles.labelWithHelp}>
                    <label htmlFor="unsuppress_problem_cb">Unsuppress</label>
                    {renderHelpButton('Deactivates manual suppression.')}
                  </div>
                </div>
                <div className={styles.tableFormsTdRight}>
                  <Checkbox
                    id="unsuppress_problem_cb"
                    value={unsuppressProblem}
                    onChange={(e) => setUnsuppressProblem(e.currentTarget.checked)}
                    disabled={unsuppressProblemDisabled}
                  />
                </div>
              </li>

              {/* Close Problem */}
              <li className={styles.tableFormsLi}>
                <div className={styles.tableFormsTdLeft}>
                  <label htmlFor="close_problem_cb">Close problem</label>
                </div>
                <div className={styles.tableFormsTdRight}>
                  <Checkbox
                    id="close_problem_cb"
                    value={closeProblem}
                    onChange={(e) => setCloseProblem(e.currentTarget.checked)}
                  />
                </div>
              </li>

              {/* Asterisk Message */}
              <li className={styles.tableFormsLi}>
                <div className={styles.tableFormsTdLeft}></div>
                <div className={styles.tableFormsTdRight}>
                  <div className={styles.asteriskMessage}>At least one update operation or message must exist.</div>
                </div>
              </li>
            </ul>
          </form>
          <Stack justifyContent="flex-end" gap="md" style={{ marginTop: theme.spacing.md }}>
            <Button variant="secondary" disabled={isSubmitting} onClick={(e) => setIsOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Updating...' : 'Update'}
            </Button>
          </Stack>
        </div>
      </Modal>
    </>
  );
};

export default UpdateCell;

const getStyles = () => {
  return {
    modalContent: css`
      width: 650px;
      color: #d8d9da;
    `,
    form: css`
      font-size: 14px;
    `,
    tableForms: css`
      list-style: none;
      padding: 0;
      margin: 0;
    `,
    tableFormsLi: css`
      display: flex;
      padding: 8px 0;
      border-bottom: 1px solid #555555;
      &:last-child {
        border-bottom: none;
      }
    `,
    tableFormsTdLeft: css`
      width: 150px;
      padding-right: 16px;
      font-weight: 500;
      display: flex;
      align-items: flex-start;
      padding-top: 4px;
    `,
    tableFormsTdRight: css`
      flex: 1;
      display: flex;
      flex-direction: column;
    `,
    wordbreak: css`
      word-break: break-all;
      padding-top: 4px;
    `,
    historyTable: css`
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
      font-size: 12px;
      th,
      td {
        border: 1px solid #555555;
        padding: 4px;
        text-align: left;
      }
      th {
        background-color: #22252b;
      }
    `,
    listCheckRadio: css`
      list-style: none;
      padding: 0;
      margin: 0;
      li {
        margin-bottom: 4px;
      }
    `,
    severityList: css`
      display: flex;
      flex-direction: column;
      gap: 4px;
      li {
        padding: 4px;
        border-radius: 4px;
        input[type='radio'] {
          margin-right: 8px;
        }
      }
    `,
    horList: css`
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    `,
    formInputMargin: css`
      margin-left: 16px;
      font-size: 12px;
      color: #9fa7b3;
    `,
    helpButton: css`
      background: none;
      border: none;
      color: #6e9fff;
      cursor: pointer;
      padding: 0 4px;
      font-size: 16px;
    `,
    asteriskMessage: css`
      color: #9fa7b3;
      font-size: 12px;
      margin-top: 8px;
    `,
    textarea: css`
      width: 100%;
      min-height: 80px;
      background-color: #181b1f;
      border: 1px solid #555555;
      border-radius: 4px;
      color: #d8d9da;
      padding: 8px;
      &:focus {
        border-color: #5794f2;
        outline: none;
      }
    `,
    checkboxRadio: css`
      margin-right: 4px;
    `,
    labelWithHelp: css`
      display: flex;
      align-items: center;
    `,
  };
};
