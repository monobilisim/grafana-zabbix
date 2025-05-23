import React, { PureComponent, useState, useEffect } from 'react';
import { css, cx } from '@emotion/css';
import ReactTable from 'react-table-6';
import _ from 'lodash';
// eslint-disable-next-line
import moment from 'moment';
import { stylesFactory, Button } from '@grafana/ui';
import { isNewProblem } from '../../utils';
import { EventTag } from '../EventTag';
import { ProblemDetails } from './ProblemDetails';
import { AckProblemData } from '../AckModal';
import { FAIcon, GFHeartIcon } from '../../../components';
import { ProblemsPanelOptions, RTCell, RTResized, TriggerSeverity } from '../../types';
import { ProblemDTO, ZBXAlert, ZBXEvent, ZBXTag } from '../../../datasource/types';
import { APIExecuteScriptResponse, ZBXScript } from '../../../datasource/zabbix/connectors/zabbix_api/types';
import { AckCell } from './AckCell';
import { DataSourceRef, TimeRange } from '@grafana/data';
import { reportInteraction, getDataSourceSrv, getAppEvents, getTemplateSrv } from '@grafana/runtime';
import { EmailModal } from './EmailModal';
import { TicketModal } from './UpdateTicketModal';
import { UpdateCell } from './UpdateCell';
import { DownloadProblemsCsv } from './DownloadProblemsCsv';

const currentProblem = React.createContext<ProblemDTO | null>(null);

const onExecuteScript = async (
  problem: ProblemDTO,
  scriptid: string,
  input?: any
): Promise<APIExecuteScriptResponse> => {
  const eventid = problem.eventid && problem.eventid.trim() !== '' ? problem.eventid : undefined;
  const ds: any = await getDataSourceSrv().get(problem.datasource);

  return ds.zabbix.executeScript(scriptid, input, eventid);
};

const parseEmails = (scriptString: string) => {
  // Extract just the emails object by finding the boundaries
  const emailsStart = scriptString.indexOf('var emails = {');
  if (emailsStart === -1) {
    return [];
  }

  // Find the end of the emails object, which is the first "};" after emailsStart
  const emailsEnd = scriptString.indexOf('}', emailsStart) + 1;

  // Extract only the emails object as a substring
  const emailsObjectText = scriptString.substring(emailsStart, emailsEnd);

  // Use regex to find all the keys in the emails object
  const emailKeys = emailsObjectText.match(/"([^"]+)":/g).map((key) => key.slice(1, -2));

  return emailKeys;
};

function ActionButtons(props: { original: ProblemDTO }) {
  const [manualInput, setManualInput] = useState('');
  const styles = getStyles();
  const problem: ProblemDTO = props.original;
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [currentProblem, setCurrentProblem] = useState(problem);
  const [companies, setCompanies] = useState([]);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketId, setTicketId] = useState('');
  const [currentProblemForTicket, setCurrentProblemForTicket] = useState(null);
  const [scriptIDS, setScriptIDS] = useState({
    sendEmail: '',
    closeTicket: '',
    createTicket: '',
    updateTicketId: '',
  });

  useEffect(() => {
    const fetchScripts = async () => {
      try {
        const ds: any = await getDataSourceSrv().get(problem.datasource);
        const scripts: ZBXScript[] = await ds.zabbix.getScripts();

        const updatedScriptIDs = { ...scriptIDS };
        scripts.forEach((script) => {
          if (script.name === 'Create Ticket') {
            updatedScriptIDs.createTicket = script.scriptid;
          }
          if (script.name === 'Close Ticket') {
            updatedScriptIDs.closeTicket = script.scriptid;
          }
          if (script.name === 'Send Email') {
            updatedScriptIDs.sendEmail = script.scriptid;
          }
          if (script.name === 'Update Ticket ID') {
            updatedScriptIDs.updateTicketId = script.scriptid;
          }
        });

        setScriptIDS(updatedScriptIDs);

        const missingScripts = [];
        if (updatedScriptIDs.createTicket === '') {
          missingScripts.push('Create Ticket');
        }
        if (updatedScriptIDs.closeTicket === '') {
          missingScripts.push('Close Ticket');
        }
        if (updatedScriptIDs.sendEmail === '') {
          missingScripts.push('Send Email');
        }
        if (updatedScriptIDs.updateTicketId === '') {
          missingScripts.push('Update Ticket ID');
        }

        if (missingScripts.length > 0) {
          // @ts-ignore
          getAppEvents().emit('alert-warning', [
            'Missing Scripts',
            `Scriptler bulunamadı: ${missingScripts.join(', ')}`,
          ]);
        }
      } catch (error) {
        console.error('Failed to fetch scripts:', error);
        // @ts-ignore
        getAppEvents().emit('alert-error', ['Script Error', 'Failed to fetch scripts from the host']);
      }
    };
    fetchScripts();
  }, [problem.datasource]);

  const fetchScriptsAndSetCompanies = async (problem: any) => {
    try {
      const ds: any = await getDataSourceSrv().get(problem.datasource);
      const scripts: ZBXScript[] = await ds.zabbix.getScripts();

      // Find the "Send Email" script
      const emailScript = scripts.find((script) => script.name === 'Send Email');

      if (emailScript?.command) {
        const parsedCompanies = parseEmails(emailScript.command);
        setCompanies(parsedCompanies);
      }

      setCurrentProblem(problem);
      setShowEmailModal(true);
    } catch (error) {
      console.error('Error fetching scripts:', error);
    }
  };

  const sendEmail = async () => {
    const ds: any = await getDataSourceSrv().get(currentProblem.datasource);

    const scripts: ZBXScript[] = await ds.zabbix.getScripts();

    const script = scripts.find((s) => s.scriptid === scriptIDS.sendEmail && s.name === 'Send Email');

    if (script) {
      // @ts-ignore
      getAppEvents().emit('alert-success', ['Success', 'Send Email çağırıldı']);
      return ds.zabbix.executeScript(scriptIDS.sendEmail, undefined, currentProblem.eventid, {
        manualinput: manualInput,
      });
    } else {
      // @ts-ignore
      return getAppEvents().emit('alert-error', ['Script Error', 'Script ID, Send Email adı ile uyuşmuyor']);
    }
  };

  const handleTicketUpdate = async () => {
    const ds: any = await getDataSourceSrv().get(currentProblem.datasource);

    const scripts: ZBXScript[] = await ds.zabbix.getScripts();

    const script = scripts.find((s) => s.scriptid === scriptIDS.updateTicketId && s.name === 'Update Ticket ID');

    if (script) {
      // @ts-ignore
      getAppEvents().emit('alert-success', ['Success', 'Update Ticket ID çağırıldı']);
      return ds.zabbix.executeScript(scriptIDS.updateTicketId, undefined, currentProblem.eventid, {
        manualinput: ticketId,
      });
    } else {
      // @ts-ignore
      return getAppEvents().emit('alert-error', ['Script Error', 'Script ID, Update Ticket ID adı ile uyuşmuyor']);
    }
  };

  async function closeTicket() {
    const ds: any = await getDataSourceSrv().get(currentProblem.datasource);

    const scripts: ZBXScript[] = await ds.zabbix.getScripts();

    const script = scripts.find((s) => s.scriptid === scriptIDS.closeTicket && s.name === 'Close Ticket');

    if (script) {
      // @ts-ignore
      getAppEvents().emit('alert-success', ['Success', 'Close Ticket çağırıldı']);
      return onExecuteScript(problem, scriptIDS.closeTicket);
    } else {
      // @ts-ignore
      return getAppEvents().emit('alert-error', ['Script Error', 'Script ID, Close Ticket adı ile uyuşmuyor']);
    }
  }

  async function createTicket() {
    const ds: any = await getDataSourceSrv().get(currentProblem.datasource);

    const scripts: ZBXScript[] = await ds.zabbix.getScripts();

    const script = scripts.find((s) => s.scriptid === scriptIDS.createTicket && s.name === 'Create Ticket');

    if (script) {
      // @ts-ignore
      getAppEvents().emit('alert-success', ['Success', 'Create Ticket çağırıldı']);
      return onExecuteScript(problem, scriptIDS.createTicket);
    } else {
      // @ts-ignore
      return getAppEvents().emit('alert-error', ['Script Error', 'Script ID, Create Ticket adı ile uyuşmuyor']);
    }
  }

  const handleAction = (actionType: string, e: { stopPropagation: () => void }) => {
    e.stopPropagation();

    switch (actionType) {
      case 'sendEmail':
        fetchScriptsAndSetCompanies(problem);
        break;
      case 'closeTicket':
        closeTicket();
        break;
      case 'createTicket':
        createTicket();
        break;
      case 'updateTicketId':
        setCurrentProblemForTicket(problem);
        setIsTicketModalOpen(true);
        break;
    }
  };

  return (
    <>
      <div className={styles.actionButtons}>
        <i
          className={cx('fa fa-plus-square', styles.actionIcon)}
          onClick={(e: any) => handleAction('createTicket', e)}
          title="Create ticket"
        ></i>
        <i
          className={cx('fa fa-check-square-o', styles.actionIcon)}
          onClick={(e: any) => handleAction('closeTicket', e)}
          title="Close ticket"
        ></i>
        <i
          className={cx('fa fa-envelope-o', styles.actionIcon)}
          onClick={(e: any) => handleAction('sendEmail', e)}
          title="Send email"
        ></i>
        <i
          className={cx('fa fa-pencil-square-o', styles.actionIcon)}
          onClick={(e: any) => handleAction('updateTicketId', e)}
          title="Update ticket ID"
        ></i>
      </div>

      <EmailModal
        isOpen={showEmailModal}
        problem={currentProblem}
        onDismiss={() => setShowEmailModal(false)}
        onSubmit={sendEmail}
        manualInput={manualInput}
        setManualInput={setManualInput}
        companies={companies}
      />

      <TicketModal
        isOpen={isTicketModalOpen}
        problem={currentProblemForTicket}
        onDismiss={() => setIsTicketModalOpen(false)}
        onSubmit={handleTicketUpdate}
        title="Update Ticket ID"
        setManualInput={setTicketId}
        manualInput={ticketId}
      />
    </>
  );
}

function TicketID(props: { original: ProblemDTO }) {
  const problem = props.original;
  const tags = problem.tags || [];
  let ticketId = '';
  tags.forEach((tag) => {
    if (tag.tag === 'TicketId') {
      ticketId = tag.value;
    }
  });
  return <div>{ticketId ? ticketId.toString() : ''}</div>;
}

export interface ProblemListProps {
  problems: ProblemDTO[];
  panelOptions: ProblemsPanelOptions;
  loading?: boolean;
  timeRange?: TimeRange;
  range?: TimeRange;
  pageSize?: number;
  fontSize?: number;
  panelId?: number;
  getProblemEvents: (problem: ProblemDTO) => Promise<ZBXEvent[]>;
  getProblemAlerts: (problem: ProblemDTO) => Promise<ZBXAlert[]>;
  getScripts: (problem: ProblemDTO) => Promise<ZBXScript[]>;
  onExecuteScript: (problem: ProblemDTO, scriptid: string) => Promise<APIExecuteScriptResponse>;
  onProblemAck?: (problem: ProblemDTO, data: AckProblemData) => void;
  onTagClick?: (tag: ZBXTag, datasource: DataSourceRef, ctrlKey?: boolean, shiftKey?: boolean) => void;
  onPageSizeChange?: (pageSize: number, pageIndex: number) => void;
  onColumnResize?: (newResized: RTResized) => void;
}

interface ProblemListState {
  expanded: any;
  expandedProblems: any;
  page: number;
}

export default class ProblemList extends PureComponent<ProblemListProps, ProblemListState> {
  rootWidth: number;
  rootRef: any;

  constructor(props: ProblemListProps) {
    super(props);
    this.rootWidth = 0;
    this.state = {
      expanded: {},
      expandedProblems: {},
      page: 0,
    };
  }

  setRootRef = (ref: any) => {
    this.rootRef = ref;
  };

  handleProblemAck = (problem: ProblemDTO, data: AckProblemData) => {
    return this.props.onProblemAck!(problem, data);
  };

  onExecuteScript = (problem: ProblemDTO, data: AckProblemData) => {};

  handlePageSizeChange = (pageSize: any, pageIndex: any) => {
    if (this.props.onPageSizeChange) {
      this.props.onPageSizeChange(pageSize, pageIndex);
    }
  };

  handleResizedChange = (newResized: any, event: any) => {
    if (this.props.onColumnResize) {
      this.props.onColumnResize(newResized);
    }
  };

  handleExpandedChange = (expanded: any, event: any) => {
    reportInteraction('grafana_zabbix_panel_row_expanded', {});

    const { problems, pageSize } = this.props;
    const { page } = this.state;
    const expandedProblems = {};

    for (const row in expanded) {
      const rowId = Number(row);
      const problemIndex = pageSize * page + rowId;
      if (expanded[row] && problemIndex < problems.length) {
        const expandedProblem = problems[problemIndex].eventid;
        if (expandedProblem) {
          expandedProblems[expandedProblem] = true;
        }
      }
    }

    const nextExpanded = { ...this.state.expanded };
    nextExpanded[page] = expanded;

    const nextExpandedProblems = { ...this.state.expandedProblems };
    nextExpandedProblems[page] = expandedProblems;

    this.setState({
      expanded: nextExpanded,
      expandedProblems: nextExpandedProblems,
    });
  };

  handleTagClick = (tag: ZBXTag, datasource: DataSourceRef, ctrlKey?: boolean, shiftKey?: boolean) => {
    if (this.props.onTagClick) {
      this.props.onTagClick(tag, datasource, ctrlKey, shiftKey);
    }
  };

  getExpandedPage = (page: number) => {
    const { problems, pageSize } = this.props;
    const { expandedProblems } = this.state;
    const expandedProblemsPage = expandedProblems[page] || {};
    const expandedPage = {};

    // Go through the page and search for expanded problems
    const startIndex = pageSize * page;
    const endIndex = Math.min(startIndex + pageSize, problems.length);
    for (let i = startIndex; i < endIndex; i++) {
      const problem = problems[i];
      if (expandedProblemsPage[problem.eventid]) {
        expandedPage[i - startIndex] = {};
      }
    }

    return expandedPage;
  };

  buildColumns() {
    const result = [];
    const options = this.props.panelOptions;
    const highlightNewerThan = options.highlightNewEvents && options.highlightNewerThan;
    const statusCell = (props: RTCell<ProblemDTO>) => StatusCell(props, highlightNewerThan);
    const statusIconCell = (props: RTCell<ProblemDTO>) => StatusIconCell(props, highlightNewerThan);
    const hostNameCell = (props: { original: { host: any; hostInMaintenance: any } }) => (
      <HostCell name={props.original.host} maintenance={props.original.hostInMaintenance} />
    );
    const hostTechNameCell = (props: { original: { hostTechName: any; hostInMaintenance: any } }) => (
      <HostCell name={props.original.hostTechName} maintenance={props.original.hostInMaintenance} />
    );

    const columns = [
      { Header: 'Host', id: 'host', show: options.hostField, Cell: hostNameCell },
      { Header: 'Host (Technical Name)', id: 'hostTechName', show: options.hostTechNameField, Cell: hostTechNameCell },
      { Header: 'Host Groups', accessor: 'groups', show: options.hostGroups, Cell: GroupCell },
      { Header: 'Proxy', accessor: 'proxy', show: options.hostProxy },
      {
        Header: 'Severity',
        show: options.severityField,
        className: 'problem-severity',
        width: 120,
        accessor: (problem: { priority: any }) => problem.priority,
        id: 'severity',
        Cell: (props: RTCell<ProblemDTO>) =>
          SeverityCell(
            props,
            options.triggerSeverity,
            options.markAckEvents,
            options.ackEventColor,
            options.okEventColor
          ),
      },
      {
        Header: '',
        id: 'statusIcon',
        show: options.statusIcon,
        className: 'problem-status-icon',
        width: 50,
        accessor: 'value',
        Cell: statusIconCell,
      },
      {
        Header: 'Status',
        id: 'status',
        accessor: (props: { original: any }) => {
          const problem = props.original;
          let value = 0;

          if (problem.value === 1 || problem.manual_close === 1) {
            value = 1;
          }

          return value;
        },
        show: options.statusField,
        width: 100,
        Cell: statusCell,
      },
      { Header: 'Problem', accessor: 'name', minWidth: 200, Cell: ProblemCell },
      { Header: 'Operational data', accessor: 'opdata', show: options.opdataField, width: 150, Cell: OpdataCell },
      {
        Header: '',
        id: 'update',
        width: 90,
        Cell: (props: { original: any }) => {
          const problem = props.original;

          // @ts-ignore
          return <UpdateCell problem={problem} />;
        },
      },
      {
        Header: 'Msg',
        id: 'msg',
        show: options.ackField,
        width: 70,
        // @ts-ignore
        Cell: (props: unknown) => <AckCell {...props} />,
      },
      {
        Header: 'Tags',
        accessor: 'tags',
        show: options.showTags,
        className: 'problem-tags',
        // @ts-ignore
        Cell: (props: unknown) => <TagCell {...props} onTagClick={this.handleTagClick} />,
      },
      {
        Header: 'Age',
        className: 'problem-age',
        width: 100,
        show: options.ageField,
        accessor: 'timestamp',
        id: 'age',
        Cell: AgeCell,
      },
      {
        Header: 'Time',
        className: 'last-change',
        width: 150,
        accessor: 'timestamp',
        id: 'lastchange',
        Cell: (props: RTCell<ProblemDTO>) =>
          LastChangeCell(props, options.customLastChangeFormat && options.lastChangeFormat),
      },
      {
        Header: 'Actions',
        id: 'actions',
        show: true,
        className: getStyles().actionColumn,
        width: 130, // Slightly wider to accommodate all buttons
        sortable: false,
        filterable: false,
        Cell: (props: { original: any }) => {
          const original = props.original;

          return <ActionButtons original={original} />;
        },
      },
      {
        Header: 'Ticket ID',
        id: 'ticketid',
        className: getStyles().actionColumn,
        width: 100,
        sortable: true,
        filterable: false,
        accessor: (problem: any) => {
          const tags = problem.tags || [];
          let ticketIdValue: number | string = '';

          for (const tag of tags) {
            if (tag.tag === 'TicketId') {
              ticketIdValue = Number(tag.value);
              break;
            }
          }

          return ticketIdValue;
        },
        Cell: (props: { original: any }) => {
          const original = props.original;

          return <TicketID original={original} />;
        },
      },
      {
        Header: '',
        className: 'custom-expander',
        width: 60,
        expander: true,
        Expander: CustomExpander,
      },
    ];
    for (const column of columns) {
      if (column.show || column.show === undefined) {
        delete column.show;
        result.push(column);
      }
    }
    return result;
  }

  render() {
    const columns = this.buildColumns();
    this.rootWidth = this.rootRef && this.rootRef.clientWidth;
    const { pageSize, fontSize, panelOptions } = this.props;
    const panelClass = cx('panel-problems', { [`font-size--${fontSize}`]: !!fontSize });
    let pageSizeOptions = [5, 10, 20, 25, 50, 100];
    if (pageSize) {
      pageSizeOptions.push(pageSize);
      pageSizeOptions = _.uniq(_.sortBy(pageSizeOptions));
    }

    const tmp = getTemplateSrv();
    const scopeVariables = tmp.getVariables();
    let selectedSeverityValues: string[] = [];
    let problemsToRender = this.props.problems;
    const severityObject = scopeVariables.find((variable) => variable.name === 'Severity');

    console.log(this.props.problems);

    if (severityObject) {
      // @ts-ignore
      selectedSeverityValues = severityObject.options
        .filter((option: any) => option.selected)
        .map((option) => option.value);

      let selectedProblems = problemsToRender.filter((problem) => selectedSeverityValues.includes(problem.severity));
      problemsToRender = selectedProblems;
    } else {
      // @ts-ignore
      getAppEvents().emit('alert-warning', ['Severity değerleri tanımlanmamış', `Severity değerleri tanımlanmamış`]);
    }

    if (severityObject) {
      // @ts-ignore
      const shouldShowAllProblems = severityObject.current.value.some(
        (value: any) => typeof value === 'string' && value.includes('all')
      );

      if (shouldShowAllProblems) {
        problemsToRender = this.props.problems;
      }
    }

    return (
      <div className={panelClass} ref={this.setRootRef}>
        <ReactTable
          data={problemsToRender}
          columns={columns}
          defaultPageSize={10}
          pageSize={pageSize}
          pageSizeOptions={pageSizeOptions}
          resized={panelOptions.resizedColumns}
          minRows={0}
          loading={this.props.loading}
          TheadComponent={(headerProps) => {
            return (
              <>
                <div className={getStyles().downloadButtonContainer}>
                  {Array.isArray(problemsToRender) && <DownloadProblemsCsv problemsToRender={problemsToRender} />}
                </div>
                {/* This is important - we still need to render the original header content */}
                <thead className="rt-thead -header" {...headerProps.className} style={headerProps.style}>
                  {headerProps.children}
                </thead>
              </>
            );
          }}
          noDataText="No problems found"
          SubComponent={(props) => (
            <currentProblem.Provider value={props.original}>
              <ProblemDetails
                {...props}
                rootWidth={this.rootWidth}
                timeRange={this.props.timeRange}
                showTimeline={panelOptions.problemTimeline}
                allowDangerousHTML={panelOptions.allowDangerousHTML}
                panelId={this.props.panelId}
                getProblemEvents={this.props.getProblemEvents}
                getProblemAlerts={this.props.getProblemAlerts}
                getScripts={this.props.getScripts}
                onProblemAck={this.handleProblemAck}
                onExecuteScript={this.props.onExecuteScript}
                onTagClick={this.handleTagClick}
                subRows={false}
              />
            </currentProblem.Provider>
          )}
          expanded={this.getExpandedPage(this.state.page)}
          onExpandedChange={this.handleExpandedChange}
          onPageChange={(page: number) => {
            reportInteraction('grafana_zabbix_panel_page_change', {
              action: page > this.state.page ? 'next' : 'prev',
            });

            this.setState({ page });
          }}
          onPageSizeChange={this.handlePageSizeChange}
          onResizedChange={this.handleResizedChange}
        />
      </div>
    );
  }
}

interface HostCellProps {
  name: string;
  maintenance: boolean;
}

const HostCell: React.FC<HostCellProps> = ({ name, maintenance }) => {
  return (
    <div>
      <span style={{ paddingRight: '0.4rem' }}>{name}</span>
      {maintenance && <FAIcon customClass="fired" icon="wrench" />}
    </div>
  );
};

function SeverityCell(
  props: RTCell<ProblemDTO>,
  problemSeverityDesc: TriggerSeverity[],
  markAckEvents?: boolean,
  ackEventColor?: string,
  okColor = DEFAULT_OK_COLOR
) {
  const problem = props.original;
  let color: string;

  let severityDesc: TriggerSeverity;
  const severity = Number(problem.severity);
  // @ts-ignore
  severityDesc = _.find(problemSeverityDesc, (s: { priority: number }) => s.priority === severity);
  if (problem.severity && problem.value === '1') {
    // @ts-ignore
    severityDesc = _.find(problemSeverityDesc, (s: { priority: number }) => s.priority === severity);
  }

  color = problem.value === '0' ? okColor : severityDesc.color;

  // Mark acknowledged triggers with different color
  if (markAckEvents && problem.acknowledged === '1') {
    color = ackEventColor;
  }

  return (
    <div className="severity-cell" style={{ background: color }}>
      {severityDesc.severity}
    </div>
  );
}

const DEFAULT_OK_COLOR = 'rgb(56, 189, 113)';
const DEFAULT_PROBLEM_COLOR = 'rgb(215, 0, 0)';

function StatusCell(props: RTCell<ProblemDTO>, highlightNewerThan?: string) {
  let status = props.value === '0' ? 'RESOLVED' : 'PROBLEM';
  let color = props.value === '0' ? DEFAULT_OK_COLOR : DEFAULT_PROBLEM_COLOR;
  if (props.original.manual_close === '1') {
    status = 'RESOLVED';
    color = DEFAULT_OK_COLOR;
  }
  let newProblem = false;
  if (highlightNewerThan) {
    newProblem = isNewProblem(props.original, highlightNewerThan);
  }
  return (
    <span className={newProblem ? 'problem-status--new' : ''} style={{ color }}>
      {status}
    </span>
  );
}

function StatusIconCell(props: RTCell<ProblemDTO>, highlightNewerThan?: string) {
  const status = props.value === '0' ? 'ok' : 'problem';
  let newProblem = false;
  if (highlightNewerThan) {
    newProblem = isNewProblem(props.original, highlightNewerThan);
  }
  const className = cx(
    'zbx-problem-status-icon',
    { 'problem-status--new': newProblem },
    { 'zbx-problem': props.value === '1' },
    { 'zbx-ok': props.value === '0' }
  );
  return <GFHeartIcon status={status} className={className} />;
}

function GroupCell(props: RTCell<ProblemDTO>) {
  let groups = '';
  if (props.value && props.value.length) {
    groups = props.value.map((g: { name: any }) => g.name).join(', ');
  }
  return <span>{groups}</span>;
}

function ProblemCell(props: RTCell<ProblemDTO>) {
  // const comments = props.original.comments;
  return (
    <div>
      <span className="problem-description">{props.value}</span>
      {/* {comments && <FAIcon icon="file-text-o" customClass="comments-icon" />} */}
    </div>
  );
}

function OpdataCell(props: RTCell<ProblemDTO>) {
  const problem = props.original;
  return (
    <div>
      <span>{problem.opdata}</span>
    </div>
  );
}

function AgeCell(props: RTCell<ProblemDTO>) {
  const problem = props.original;
  const timestamp = moment.unix(problem.timestamp);
  const age = timestamp.fromNow(true);
  return <span>{age}</span>;
}

function LastChangeCell(props: RTCell<ProblemDTO>, customFormat?: string) {
  const DEFAULT_TIME_FORMAT = 'DD MMM YYYY HH:mm:ss';
  const problem = props.original;
  const timestamp = moment.unix(problem.timestamp);
  const format = customFormat || DEFAULT_TIME_FORMAT;
  const lastchange = timestamp.format(format);
  return <span>{lastchange}</span>;
}

interface TagCellProps extends RTCell<ProblemDTO> {
  onTagClick: (tag: ZBXTag, datasource: DataSourceRef | string, ctrlKey?: boolean, shiftKey?: boolean) => void;
}

class TagCell extends PureComponent<TagCellProps> {
  handleTagClick = (tag: ZBXTag, datasource: DataSourceRef | string, ctrlKey?: boolean, shiftKey?: boolean) => {
    if (this.props.onTagClick) {
      this.props.onTagClick(tag, datasource, ctrlKey, shiftKey);
    }
  };

  render() {
    const tags = this.props.value || [];
    return [
      tags.map((tag: ZBXTag) => (
        <EventTag
          key={tag.tag + tag.value}
          tag={tag}
          datasource={this.props.original.datasource}
          onClick={this.handleTagClick}
        />
      )),
    ];
  }
}

function CustomExpander(props: RTCell<any>) {
  return (
    <span className={props.isExpanded ? 'expanded' : ''}>
      <i className="fa fa-info-circle"></i>
    </span>
  );
}

const getStyles = stylesFactory(() => {
  return {
    downloadButtonContainer: css`
      display: flex;
      justify-content: flex-end;
      margin-bottom: 10px;
    `,
    actionButtons: css`
      display: flex;
      justify-content: space-around;
      align-items: center;
    `,
    actionIcon: css`
      padding: 4px;
      cursor: pointer;
      border-radius: 3px;
      transition: background-color 0.2s ease;
      margin: 0 2px;

      &:hover {
        background-color: rgba(204, 204, 220, 0.2);
        color: #181b1f;
      }
    `,
    actionColumn: css`
      text-align: center;
    `,
    modalOverlay: css`
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    `,
    modalContent: css`
      background: #fff;
      border-radius: 4px;
      padding: 20px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
      max-width: 400px;
      width: 100%;
      position: relative;
    `,
    modalHeader: css`
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 15px;
      display: flex;
      justify-content: space-between;
    `,
    modalClose: css`
      cursor: pointer;
      font-size: 22px;
      color: #666;
      &:hover {
        color: #333;
      }
    `,
    formGroup: css`
      margin-bottom: 15px;
    `,
    formLabel: css`
      display: block;
      margin-bottom: 5px;
      font-weight: 500;
    `,
    formInput: css`
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
    `,
    formSelect: css`
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
    `,
    formButton: css`
      background: #3274d9;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      &:hover {
        background: #2264c9;
      }
    `,
    buttonGroup: css`
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 15px;
    `,
    cancelButton: css`
      background: #e0e0e0;
      color: #333;
      &:hover {
        background: #d0d0d0;
      }
    `,
  };
});
