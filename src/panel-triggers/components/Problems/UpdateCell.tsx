import React, { useState, useEffect } from 'react';
import { css, cx } from '@emotion/css';
// @ts-ignore
import {
  useTheme,
  stylesFactory,
  Modal,
  Button,
  HorizontalGroup,
  VerticalGroup,
  Input,
  TextArea,
  RadioButtonGroup,
  Checkbox,
  Tooltip,
} from '@grafana/ui';
// @ts-ignore
import { GrafanaTheme, SelectableValue } from '@grafana/data';
import { ProblemDTO } from '../../../datasource/types';
import { getDataSourceSrv, getAppEvents } from '@grafana/runtime'; // Added imports

// Helper to define styles
const getStyles = stylesFactory((theme: GrafanaTheme) => {
  const zabbixColors = {
    naBg: theme.colors.bg2, // Not Classified
    infoBg: theme.palette.blue95, // Information
    warningBg: theme.palette.yellow, // Warning
    averageBg: theme.palette.orange, // Average
    highBg: theme.palette.red, // High
    disasterBg: theme.palette.purple, // Disaster
    textDark: theme.colors.text,
    textLight: theme.colors.textStrong,
    border: theme.colors.border1,
    inputBg: theme.colors.formInputBg,
    buttonPrimaryBg: theme.colors.primary,
    buttonPrimaryText: theme.colors.primaryContrast,
  };

  return {
    modalContent: css`
      width: 650px;
      color: ${zabbixColors.textDark};
    `,
    form: css`
      font-size: ${theme.typography.size.sm};
    `,
    tableForms: css`
      list-style: none;
      padding: 0;
      margin: 0;
    `,
    tableFormsLi: css`
      display: flex;
      padding: ${theme.spacing.sm} 0;
      border-bottom: 1px solid ${zabbixColors.border};
      &:last-child {
        border-bottom: none;
      }
    `,
    tableFormsTdLeft: css`
      width: 150px;
      padding-right: ${theme.spacing.md};
      font-weight: ${theme.typography.fontWeightMedium};
      display: flex;
      align-items: flex-start; // Align with top of input
      padding-top: ${theme.spacing.xs}; // Adjust for alignment
    `,
    tableFormsTdRight: css`
      flex: 1;
      display: flex;
      flex-direction: column;
    `,
    wordbreak: css`
      word-break: break-all;
      padding-top: ${theme.spacing.xs};
    `,
    historyTable: css`
      width: 100%;
      border-collapse: collapse;
      margin-top: ${theme.spacing.xs};
      font-size: ${theme.typography.size.xs};
      th,
      td {
        border: 1px solid ${zabbixColors.border};
        padding: ${theme.spacing.xs};
        text-align: left;
      }
      th {
        background-color: ${theme.colors.bg2};
      }
    `,
    listCheckRadio: css`
      list-style: none;
      padding: 0;
      margin: 0;
      li {
        margin-bottom: ${theme.spacing.xs};
      }
    `,
    severityList: css`
      display: flex;
      flex-direction: column;
      gap: ${theme.spacing.xs};
      li {
        padding: ${theme.spacing.xs};
        border-radius: 4px; // Changed to pure CSS
        input[type='radio'] {
          margin-right: ${theme.spacing.sm};
        }
      }
    `,
    severityNa: css`
      background-color: ${zabbixColors.naBg};
    `,
    severityInfo: css`
      background-color: ${zabbixColors.infoBg};
      color: ${zabbixColors.textLight};
    `,
    severityWarning: css`
      background-color: ${zabbixColors.warningBg};
      color: ${zabbixColors.textDark};
    `,
    severityAverage: css`
      background-color: ${zabbixColors.averageBg};
      color: ${zabbixColors.textLight};
    `,
    severityHigh: css`
      background-color: ${zabbixColors.highBg};
      color: ${zabbixColors.textLight};
    `,
    severityDisaster: css`
      background-color: ${zabbixColors.disasterBg};
      color: ${zabbixColors.textLight};
    `,
    horList: css`
      display: flex;
      align-items: center;
      gap: ${theme.spacing.sm};
      flex-wrap: wrap; // Allow wrapping
    `,
    formInputMargin: css`
      margin-left: ${theme.spacing.md};
      font-size: ${theme.typography.size.xs};
      color: ${theme.colors.textWeak};
    `,
    helpButton: css`
      background: none;
      border: none;
      color: ${theme.colors.textBlue};
      cursor: pointer;
      padding: 0 ${theme.spacing.xs};
      font-size: ${theme.typography.size.md}; // Make icon a bit larger
    `,
    asteriskMessage: css`
      color: ${theme.colors.textSemiWeak};
      font-size: ${theme.typography.size.xs};
      margin-top: ${theme.spacing.sm};
    `,
    textarea: css`
      width: 100%;
      min-height: 80px;
      background-color: ${theme.colors.formInputBg};
      border: 1px solid ${theme.colors.formInputBorder};
      border-radius: 4px; // Changed to pure CSS
      color: ${theme.colors.formInputText};
      padding: ${theme.spacing.sm};
      &:focus {
        border-color: ${theme.colors.formInputFocus};
        outline: none;
      }
    `,
    checkboxRadio: css`
      margin-right: ${theme.spacing.xs};
    `,
    labelWithHelp: css`
      display: flex;
      align-items: center;
    `,
  };
});

interface ProblemHistoryItem {
  time: string;
  user: string;
  userAction: React.ReactNode;
  message: string;
}

interface UpdateCellProps {
  problem: ProblemDTO;
}

const severityLevels: Array<SelectableValue<string> & { className: string }> = [
  { label: 'Not classified', value: '0', className: 'severityNa' },
  { label: 'Information', value: '1', className: 'severityInfo' },
  { label: 'Warning', value: '2', className: 'severityWarning' },
  { label: 'Average', value: '3', className: 'severityAverage' },
  { label: 'High', value: '4', className: 'severityHigh' },
  { label: 'Disaster', value: '5', className: 'severityDisaster' },
];

export const UpdateCell: React.FC<UpdateCellProps> = ({ problem }) => {
  const theme = useTheme();
  const styles = getStyles(theme);

  const [message, setMessage] = useState('');
  const [scope, setScope] = useState<string>('0');
  const [changeSeverity, setChangeSeverity] = useState(false);
  const [currentSeverity, setCurrentSeverity] = useState<string>('0');
  const [suppressProblem, setSuppressProblem] = useState(false);
  const [suppressTimeOption, setSuppressTimeOption] = useState<string>('1');
  const [suppressUntilProblem, setSuppressUntilProblem] = useState('now+1d');
  const [unsuppressProblem, setUnsuppressProblem] = useState(false);
  const [acknowledgeProblem, setAcknowledgeProblem] = useState(false);
  const [changeRank, setChangeRank] = useState(false);
  const [closeProblem, setCloseProblem] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // if (problem.isSuppressible !== null) {
  //   const isProblemSuppressible = problem.isSuppressible !== false;
  // }

  // if (problem.isUnsuppressible !== null) {
  //   const isProblemUnsuppressible = problem.isUnsuppressible !== false;
  // }

  // const suppressProblemDisabled = !isProblemSuppressible || closeProblem || unsuppressProblem;
  // const unsuppressProblemDisabled = !isProblemUnsuppressible || closeProblem || suppressProblem;

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

  const severityRadiosDisabled = !changeSeverity;
  const suppressTimeOptionsElementsDisabled = !suppressProblem;
  const suppressUntilInputDisabled = suppressTimeOptionsElementsDisabled || suppressTimeOption === '0';

  useEffect(() => {
    if (isOpen) {
      setMessage('');
      setScope('0');
      setChangeSeverity(false);
      setCurrentSeverity('0');
      setSuppressProblem(false);
      setSuppressTimeOption('1');
      setSuppressUntilProblem('now+1d');
      setUnsuppressProblem(false);
      setAcknowledgeProblem(false);
      setChangeRank(false);
      setCloseProblem(false);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    setIsSubmitting(true);

    let actions = 0;
    if (closeProblem) {
      actions |= 1;
    }
    if (acknowledgeProblem) {
      actions |= 2;
    }
    if (changeSeverity) {
      actions |= 8;
    }
    if (suppressProblem) {
      actions |= 32;
    }
    if (unsuppressProblem) {
      actions |= 64;
    }
    if (changeRank) {
      actions |= 128;
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

      await ds.zabbix.acknowledgeEvent(problem.eventid, message);

      // @ts-ignore
      getAppEvents().emit('alert-success', ['', 'Acknowledge update successfully invoked']);
    } catch (error) {
      console.error('Failed to update problem:', error);
      // @ts-ignore
      getAppEvents().emit('alert-error', ['', 'Acknowledge update failed']);
    } finally {
      setIsSubmitting(false);
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

              {/* History */}
              {/* {problem.history && problem.history.length > 0 && (
                <li className={styles.tableFormsLi}>
                  <div className={styles.tableFormsTdLeft}>History</div>
                  <div className={styles.tableFormsTdRight}>
                    <div style={{ maxHeight: '150px', overflowY: 'auto', border: `1px solid ${styles.tableFormsLi}` }}>
                      <table className={styles.historyTable}>
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>User</th>
                            <th>User action</th>
                            <th>Message</th>
                          </tr>
                        </thead>
                        <tbody>
                          {problem.history.map((item, index) => (
                            <tr key={index}>
                              <td>{item.time}</td>
                              <td>{item.user}</td>
                              <td>{item.userAction}</td>
                              <td className={styles.wordbreak}>{item.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </li>
              )} */}

              {/* Scope */}
              <li className={styles.tableFormsLi}>
                <div className={styles.tableFormsTdLeft}>Scope</div>
                <div className={styles.tableFormsTdRight}>
                  <RadioButtonGroup
                    options={[
                      { label: 'Only selected problem', value: '0' },
                      {
                        label: 'Selected and all other problems of related triggers',
                        value: '1',
                        description: problem.eventid ? '1 event' : '',
                      },
                    ]}
                    value={scope}
                    onChange={setScope}
                  />
                </div>
              </li>

              {/* Change Severity */}
              <li className={styles.tableFormsLi}>
                <div className={styles.tableFormsTdLeft}>
                  <label htmlFor="change_severity_cb">Change severity</label>
                </div>
                <div className={styles.tableFormsTdRight}>
                  <HorizontalGroup spacing="md" align="flex-start">
                    <Checkbox
                      id="change_severity_cb"
                      value={changeSeverity}
                      onChange={(e) => setChangeSeverity(e.currentTarget.checked)}
                    />
                    <HorizontalGroup spacing="md" align="flex-start">
                      {severityLevels.map((level) => (
                        <label
                          key={level.value}
                          className={cx(styles.severityList, styles[level.className as keyof typeof styles])}
                          style={{
                            padding: theme.spacing.xs,
                            borderRadius: '4px',
                            opacity: severityRadiosDisabled ? 0.6 : 1,
                          }}
                        >
                          <input
                            type="radio"
                            name="severity"
                            value={level.value}
                            checked={currentSeverity === level.value}
                            onChange={(e) => setCurrentSeverity(e.currentTarget.value)}
                            disabled={severityRadiosDisabled}
                            className={styles.checkboxRadio}
                          />
                          {level.label}
                        </label>
                      ))}
                    </HorizontalGroup>
                  </HorizontalGroup>
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
                  <HorizontalGroup spacing="md" align="flex-start" wrap>
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
                    <Input
                      type="text"
                      id="suppress_until_problem_input"
                      value={suppressUntilProblem}
                      onChange={(e) => setSuppressUntilProblem(e.currentTarget.value)}
                      placeholder="now+1d"
                      disabled={suppressUntilInputDisabled}
                    />
                  </HorizontalGroup>
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

              {/* Acknowledge Problem */}
              <li className={styles.tableFormsLi}>
                <div className={styles.tableFormsTdLeft}>
                  <div className={styles.labelWithHelp}>
                    <label htmlFor="acknowledge_problem_cb">Acknowledge</label>
                    {renderHelpButton(
                      'Confirms the problem is noticed. Status change triggers action update operation.'
                    )}
                  </div>
                </div>
                <div className={styles.tableFormsTdRight}>
                  <Checkbox
                    id="acknowledge_problem_cb"
                    value={acknowledgeProblem}
                    onChange={(e) => setAcknowledgeProblem(e.currentTarget.checked)}
                  />
                </div>
              </li>

              {/* Convert to Cause (Change Rank) */}
              <li className={styles.tableFormsLi}>
                <div className={styles.tableFormsTdLeft}>
                  <div className={styles.labelWithHelp}>
                    <label htmlFor="change_rank_cb">Convert to cause</label>
                    {renderHelpButton('Converts a symptom event back to cause event.')}
                  </div>
                </div>
                <div className={styles.tableFormsTdRight}>
                  <Checkbox
                    id="change_rank_cb"
                    value={changeRank}
                    onChange={(e) => setChangeRank(e.currentTarget.checked)}
                    disabled={true}
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
          <HorizontalGroup justify="flex-end" spacing="md" style={{ marginTop: theme.spacing.md }}>
            <Button variant="secondary" disabled={isSubmitting} onClick={(e) => setIsOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Updating...' : 'Update'}
            </Button>
          </HorizontalGroup>
        </div>
      </Modal>
    </>
  );
};

export default UpdateCell;
