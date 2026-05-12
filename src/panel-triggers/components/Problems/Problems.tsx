import React, { PureComponent, useState, useEffect } from 'react';
import { css, cx } from '@emotion/css';
import ReactTable from 'react-table-6';
import _ from 'lodash';
// eslint-disable-next-line
import moment from 'moment';
import { stylesFactory, Button, Modal } from '@grafana/ui';
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

type ExtendedProblemDTO = ProblemDTO;

const currentProblem = React.createContext<ProblemDTO | null>(null);

const VIEWED_PROBLEMS_KEY = 'zbx-viewed-problems';
const VIEWED_PROBLEMS_LIMIT = 1000;
const COLUMN_ORDER_KEY = 'zbx-column-order';

function loadViewedProblems(): Set<string> {
  try {
    const raw = localStorage.getItem(VIEWED_PROBLEMS_KEY);
    if (!raw) {
      return new Set();
    }
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function persistViewedProblems(set: Set<string>): Set<string> {
  let arr = Array.from(set);
  if (arr.length > VIEWED_PROBLEMS_LIMIT) {
    arr = arr.slice(arr.length - VIEWED_PROBLEMS_LIMIT);
  }
  try {
    localStorage.setItem(VIEWED_PROBLEMS_KEY, JSON.stringify(arr));
  } catch {
    // localStorage may be unavailable / full; ignore
  }
  return new Set(arr);
}

function loadColumnOrder(): string[] {
  try {
    const raw = localStorage.getItem(COLUMN_ORDER_KEY);
    if (!raw) {
      return [];
    }
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persistColumnOrder(order: string[]): void {
  try {
    localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(order));
  } catch {
    // ignore
  }
}

function getColumnId(col: any): string | undefined {
  if (col.id) {
    return col.id;
  }
  if (typeof col.accessor === 'string') {
    return col.accessor;
  }
  return undefined;
}

function sortColumnsByOrder(columns: any[], order: string[]): any[] {
  if (!order.length) {
    return columns;
  }
  const byId = new Map<string, any>();
  for (const col of columns) {
    const id = getColumnId(col);
    if (id) {
      byId.set(id, col);
    }
  }
  const result: any[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    const col = byId.get(id);
    if (col) {
      result.push(col);
      seen.add(id);
    }
  }
  for (const col of columns) {
    const id = getColumnId(col);
    if (!id || !seen.has(id)) {
      result.push(col);
    }
  }
  return result;
}

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

// Fallback for the Python-based Send Email scrip, which
// declares the dict as `emails = {` rather than `var emails = {`.
const parseEmailsFallback = (scriptString: string) => {
  const emailsStart = scriptString.indexOf('emails = {');
  if (emailsStart === -1) {
    return [];
  }

  const emailsEnd = scriptString.indexOf('}', emailsStart) + 1;
  const emailsObjectText = scriptString.substring(emailsStart, emailsEnd);

  const keyMatches = emailsObjectText.match(/["']([^"']+)["']\s*:/g);
  if (!keyMatches) {
    return [];
  }

  return keyMatches.map((key) => key.replace(/["']\s*:$/, '').slice(1));
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
        let parsedCompanies = parseEmails(emailScript.command);
        if (parsedCompanies.length === 0) {
          parsedCompanies = parseEmailsFallback(emailScript.command);
        }
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
      // do not remove this testing variable
      console.log(manualInput);
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
  viewedProblems: Set<string>;
  columnOrder: string[];
  draggingColumnId: string | null;
  dragOverColumnId: string | null;
  infoPopupProblem: ProblemDTO | null;
}

export default class ProblemList extends PureComponent<ProblemListProps, ProblemListState> {
  rootWidth: number;
  rootRef: any;
  hoverOpenTimer: any = null;

  constructor(props: ProblemListProps) {
    super(props);
    this.rootWidth = 0;
    this.state = {
      expanded: {},
      expandedProblems: {},
      page: 0,
      viewedProblems: loadViewedProblems(),
      columnOrder: loadColumnOrder(),
      draggingColumnId: null,
      dragOverColumnId: null,
      infoPopupProblem: null,
    };
  }

  componentWillUnmount() {
    if (this.hoverOpenTimer) {
      clearTimeout(this.hoverOpenTimer);
      this.hoverOpenTimer = null;
    }
  }

  markProblemViewed = (problem: ProblemDTO) => {
    const eventid = problem?.eventid;
    if (!eventid || this.state.viewedProblems.has(eventid)) {
      return;
    }
    const merged = new Set(this.state.viewedProblems);
    merged.add(eventid);
    this.setState({ viewedProblems: persistViewedProblems(merged) });
  };

  openInfoPopup = (problem: ProblemDTO) => {
    this.markProblemViewed(problem);
    this.setState({ infoPopupProblem: problem });
  };

  closeInfoPopup = () => {
    if (this.hoverOpenTimer) {
      clearTimeout(this.hoverOpenTimer);
      this.hoverOpenTimer = null;
    }
    this.setState({ infoPopupProblem: null });
  };

  scheduleHoverOpen = (problem: ProblemDTO) => {
    if (this.hoverOpenTimer) {
      clearTimeout(this.hoverOpenTimer);
    }
    this.hoverOpenTimer = setTimeout(() => {
      this.hoverOpenTimer = null;
      this.openInfoPopup(problem);
    }, 300);
  };

  cancelHoverOpen = () => {
    if (this.hoverOpenTimer) {
      clearTimeout(this.hoverOpenTimer);
      this.hoverOpenTimer = null;
    }
  };

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
    const newlyViewed: string[] = [];

    for (const row in expanded) {
      const rowId = Number(row);
      const problemIndex = pageSize * page + rowId;
      if (expanded[row] && problemIndex < problems.length) {
        const expandedProblem = problems[problemIndex].eventid;
        if (expandedProblem) {
          expandedProblems[expandedProblem] = true;
          if (!this.state.viewedProblems.has(expandedProblem)) {
            newlyViewed.push(expandedProblem);
          }
        }
      }
    }

    const nextExpanded = { ...this.state.expanded };
    nextExpanded[page] = expanded;

    const nextExpandedProblems = { ...this.state.expandedProblems };
    nextExpandedProblems[page] = expandedProblems;

    let nextViewedProblems = this.state.viewedProblems;
    if (newlyViewed.length > 0) {
      const merged = new Set(this.state.viewedProblems);
      for (const id of newlyViewed) {
        merged.add(id);
      }
      nextViewedProblems = persistViewedProblems(merged);
    }

    this.setState({
      expanded: nextExpanded,
      expandedProblems: nextExpandedProblems,
      viewedProblems: nextViewedProblems,
    });
  };

  handleColumnDragStart = (e: React.DragEvent, columnId: string) => {
    e.dataTransfer.setData('text/plain', columnId);
    e.dataTransfer.effectAllowed = 'move';
    this.setState({ draggingColumnId: columnId });
  };

  handleColumnDragEnd = () => {
    this.setState({ draggingColumnId: null, dragOverColumnId: null });
  };

  handleColumnDragEnter = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    if (this.state.dragOverColumnId !== columnId) {
      this.setState({ dragOverColumnId: columnId });
    }
  };

  handleColumnDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  handleColumnDrop = (e: React.DragEvent, targetColumnId: string, currentColumnIds: string[]) => {
    e.preventDefault();
    e.stopPropagation();
    const dragged = e.dataTransfer.getData('text/plain');
    this.setState({ draggingColumnId: null, dragOverColumnId: null });
    if (!dragged || dragged === targetColumnId) {
      return;
    }
    let newOrder = currentColumnIds.filter((id) => id !== dragged);
    const targetIdx = newOrder.indexOf(targetColumnId);
    if (targetIdx === -1) {
      newOrder.push(dragged);
    } else {
      newOrder.splice(targetIdx, 0, dragged);
    }
    persistColumnOrder(newOrder);
    this.setState({ columnOrder: newOrder });
  };

  renderDraggableHeader = (text: string, columnId: string, currentColumnIds: () => string[]) => {
    const { draggingColumnId, dragOverColumnId } = this.state;
    const isDragging = draggingColumnId === columnId;
    const isDropTarget = !!draggingColumnId && draggingColumnId !== columnId && dragOverColumnId === columnId;

    return (
      <span
        onDragEnter={(e) => this.handleColumnDragEnter(e, columnId)}
        onDragOver={this.handleColumnDragOver}
        onDrop={(e) => this.handleColumnDrop(e, columnId, currentColumnIds())}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          opacity: isDragging ? 0.4 : 1,
          borderLeft: isDropTarget ? '3px solid #5794f2' : '3px solid transparent',
          paddingLeft: 3,
          userSelect: 'none',
          width: '100%',
          cursor: 'default',
          transition: 'opacity 0.15s ease, border-color 0.1s ease',
        }}
      >
        <span
          draggable
          onDragStart={(e) => this.handleColumnDragStart(e, columnId)}
          onDragEnd={this.handleColumnDragEnd}
          title="Sürükleyip bırakarak sütunun sırasını değiştir"
          aria-label="Sürükle"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            cursor: 'default',
            padding: '0 2px',
            alignSelf: 'stretch',
          }}
        >
          <svg
            aria-hidden="true"
            width="0.5em"
            height="1em"
            viewBox="0 0 6 14"
            xmlns="http://www.w3.org/2000/svg"
            style={{ flex: 'none', display: 'block' }}
          >
            <circle cx="1.5" cy="2" r="1" fill="#9da5b8" />
            <circle cx="4.5" cy="2" r="1" fill="#9da5b8" />
            <circle cx="1.5" cy="7" r="1" fill="#9da5b8" />
            <circle cx="4.5" cy="7" r="1" fill="#9da5b8" />
            <circle cx="1.5" cy="12" r="1" fill="#9da5b8" />
            <circle cx="4.5" cy="12" r="1" fill="#9da5b8" />
          </svg>
        </span>
        <span
          style={{
            cursor: 'default',
          }}
        >
          {text}
        </span>
      </span>
    );
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

  buildInfoColumn(infoTrigger: ProblemsPanelOptions['infoTrigger']) {
    if (infoTrigger === 'click popup' || infoTrigger === 'hover popup') {
      const getProps = (_state: any, rowInfo: any) => {
        if (!rowInfo) {
          return {};
        }
        const problem = rowInfo.original as ProblemDTO;
        if (infoTrigger === 'hover popup') {
          return {
            style: { cursor: 'pointer' },
            onMouseEnter: () => this.scheduleHoverOpen(problem),
            onMouseLeave: () => this.cancelHoverOpen(),
          };
        }
        return {
          style: { cursor: 'pointer' },
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            this.openInfoPopup(problem);
          },
        };
      };
      return {
        Header: '',
        id: 'expander',
        className: 'custom-expander',
        width: 60,
        sortable: false,
        filterable: false,
        getProps,
        Cell: () => (
          <span>
            <i className="fa fa-info-circle"></i>
          </span>
        ),
      };
    }
    return {
      Header: '',
      id: 'expander',
      className: 'custom-expander',
      width: 60,
      expander: true,
      Expander: CustomExpander,
    };
  }

  buildColumns() {
    const options = this.props.panelOptions;
    const highlightNewerThan = options.highlightNewEvents && options.highlightNewerThan;
    const statusCell = (props: RTCell<ExtendedProblemDTO>) => StatusCell(props, highlightNewerThan);
    const statusIconCell = (props: RTCell<ExtendedProblemDTO>) => StatusIconCell(props, highlightNewerThan);
    const hostNameCell = (props: { original: { host: any; hostInMaintenance: any } }) => (
      <HostCell name={props.original.host} maintenance={props.original.hostInMaintenance} />
    );
    const hostTechNameCell = (props: { original: { hostTechName: any; hostInMaintenance: any } }) => (
      <HostCell name={props.original.hostTechName} maintenance={props.original.hostInMaintenance} />
    );

    let visibleColumnIds: string[] = [];
    const getVisibleColumnIds = () => visibleColumnIds;
    const dh = (text: string, id: string) => this.renderDraggableHeader(text, id, getVisibleColumnIds);

    const columns: any[] = [
      { Header: dh('Host', 'host'), id: 'host', show: options.hostField, Cell: hostNameCell },
      {
        Header: dh('IP', 'ip'),
        id: 'ip',
        width: 100,
        Cell: (props: { original: any }) => {
          const problem = props.original;
          // @ts-ignore
          return <IPCell problem={problem} />;
        },
      },
      {
        Header: dh('Host (Technical Name)', 'hostTechName'),
        id: 'hostTechName',
        show: options.hostTechNameField,
        Cell: hostTechNameCell,
      },
      { Header: dh('Host Groups', 'groups'), accessor: 'groups', show: options.hostGroups, Cell: GroupCell },
      { Header: dh('Proxy', 'proxy'), accessor: 'proxy', show: options.hostProxy },
      {
        Header: dh('Severity', 'severity'),
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
        Header: dh('Status', 'status'),
        id: 'status',
        accessor: (problem: ExtendedProblemDTO) => {
          return problem.value;
        },
        show: options.statusField,
        width: 100,
        Cell: statusCell,
      },
      { Header: dh('Problem', 'name'), accessor: 'name', minWidth: 200, Cell: ProblemCell },
      {
        Header: dh('Operational data', 'opdata'),
        accessor: 'opdata',
        show: options.opdataField,
        width: 150,
        Cell: OpdataCell,
      },
      {
        Header: dh('Application', 'application'),
        id: 'application',
        show: options.applicationField,
        width: 150,
        accessor: (problem: ProblemDTO) => {
          const tags = problem.tags || [];
          const appTag = tags.find((t) => t.tag === 'Application');
          return appTag?.value ?? '';
        },
        Cell: (props: RTCell<ProblemDTO>) => <span>{props.value}</span>,
      },
      {
        Header: dh('Update', 'update'),
        id: 'update',
        width: 90,
        Cell: (props: { original: any }) => {
          const problem = props.original;
          // @ts-ignore
          return <UpdateCell problem={problem} buttonColor={options.updateButtonColor} />;
        },
      },
      {
        Header: dh('Msg', 'msg'),
        id: 'msg',
        show: options.ackField,
        width: 70,
        // @ts-ignore
        Cell: (props: unknown) => <AckCell {...props} />,
      },
      {
        Header: dh('Tags', 'tags'),
        accessor: 'tags',
        show: options.showTags,
        className: 'problem-tags',
        Cell: (props: unknown) => <TagCell {...(props as any)} onTagClick={this.handleTagClick} />,
      },
      {
        Header: dh('Age', 'age'),
        className: 'problem-age',
        width: 100,
        show: options.ageField,
        accessor: 'timestamp',
        id: 'age',
        Cell: AgeCell,
      },
      {
        Header: dh('Time', 'lastchange'),
        className: 'last-change',
        width: 150,
        accessor: 'timestamp',
        id: 'lastchange',
        Cell: (props: RTCell<ProblemDTO>) =>
          LastChangeCell(props, options.customLastChangeFormat && options.lastChangeFormat),
      },
      {
        Header: dh('Actions', 'actions'),
        id: 'actions',
        show: true,
        className: getStyles().actionColumn,
        width: 130,
        sortable: false,
        filterable: false,
        Cell: (props: { original: any }) => {
          const original = props.original;
          return <ActionButtons original={original} />;
        },
      },
      {
        Header: dh('Ticket ID', 'ticketid'),
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
      this.buildInfoColumn(options.infoTrigger),
    ];

    const ordered = sortColumnsByOrder(columns, this.state.columnOrder);
    const result: any[] = [];
    for (const column of ordered) {
      if (column.show || column.show === undefined) {
        delete column.show;
        result.push(column);
      }
    }
    visibleColumnIds = result.map((c) => getColumnId(c)).filter((id): id is string => !!id);
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
    // First get basic filtered problems
    let filteredProblems = this.props.problems;
    const severityObject = scopeVariables.find((variable) => variable.name === 'Severity');

    console.log(this.props.problems);

    if (severityObject) {
      // @ts-ignore
      selectedSeverityValues = severityObject.options
        .filter((option: any) => option.selected)
        .map((option) => option.value);

      let selectedProblems = filteredProblems.filter((problem) => selectedSeverityValues.includes(problem.severity));
      filteredProblems = selectedProblems;
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
        filteredProblems = this.props.problems;
      }
    }

    const problemsToRender = filteredProblems;
    const popupMode = panelOptions.infoTrigger === 'hover popup' || panelOptions.infoTrigger === 'click popup';
    const popupProblem = this.state.infoPopupProblem;

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
          getTrProps={(state: any, rowInfo: any) => {
            if (
              rowInfo &&
              rowInfo.original &&
              rowInfo.original.eventid &&
              this.state.viewedProblems.has(rowInfo.original.eventid)
            ) {
              return {
                style: {
                  opacity: 0.55,
                  transition: 'opacity 0.2s ease',
                },
              };
            }
            return {};
          }}
        />
        {popupMode && (
          <Modal
            title="Problem details"
            isOpen={!!popupProblem}
            onDismiss={this.closeInfoPopup}
            className={getStyles().infoPopupModal}
          >
            {popupProblem && (
              <div className={cx('panel-problems', getStyles().infoPopupContent)}>
                <div className="ReactTable" style={{ height: 'auto', overflow: 'visible', display: 'block' }}>
                  <currentProblem.Provider value={popupProblem}>
                    <ProblemDetails
                      original={popupProblem}
                      row={popupProblem}
                      index={0}
                      viewIndex={0}
                      level={0}
                      nestingPath={[]}
                      rootWidth={1400}
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
                </div>
              </div>
            )}
          </Modal>
        )}
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
  props: RTCell<ExtendedProblemDTO>,
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
  // if (markAckEvents && problem.acknowledged === '1') {
  //   color = ackEventColor;
  // }

  return (
    <div className="severity-cell" style={{ background: color }}>
      {severityDesc.severity}
    </div>
  );
}

const DEFAULT_OK_COLOR = 'rgb(56, 189, 113)';
const DEFAULT_PROBLEM_COLOR = 'rgb(215, 0, 0)';

function StatusCell(props: RTCell<ExtendedProblemDTO>, highlightNewerThan?: string) {
  let status;
  let color;

  if (props.value === '1') {
    status = 'PROBLEM';
    color = DEFAULT_PROBLEM_COLOR;
  } else {
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

function IPCell(props: { problem: ProblemDTO }) {
  const problem = props.problem;
  let ip;
  const tags = problem.tags || [];
  tags.forEach((tag) => {
    if (tag.tag === 'IP') {
      ip = tag.value;
    }
  });
  return <span>{ip ?? ''}</span>;
}

function StatusIconCell(props: RTCell<ExtendedProblemDTO>, highlightNewerThan?: string) {
  const displayAsOk = props.value === '0';
  const status = displayAsOk ? 'ok' : 'problem';

  let newProblem = false;
  if (highlightNewerThan) {
    newProblem = isNewProblem(props.original, highlightNewerThan);
  }
  const className = cx(
    'zbx-problem-status-icon',
    { 'problem-status--new': newProblem },
    { 'zbx-problem': props.value === '1' },
    { 'zbx-ok': displayAsOk }
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
    infoPopupModal: css`
      width: 90%;
      max-width: 1400px;
      top: 50%;
      transform: translateY(-50%);
    `,
    infoPopupContent: css`
      .problem-details-container {
        max-height: none !important;
        opacity: 1 !important;
        overflow: visible !important;
        transition: none !important;
        box-shadow: none !important;
      }
    `,
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
