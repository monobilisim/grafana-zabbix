import React from 'react';
import { ProblemDTO, ZBXAcknowledge } from '../../../datasource/types';
import { getAppEvents } from '@grafana/runtime';
import { Button } from '@grafana/ui';

interface DownloadProblemsCsvProps {
  problemsToRender: ProblemDTO[];
}

export const DownloadProblemsCsv: React.FC<DownloadProblemsCsvProps> = ({ problemsToRender }) => {
  const handleDownloadCsv = () => {
    if (!problemsToRender || problemsToRender.length === 0) {
      // @ts-ignore
      getAppEvents().emit('alert-warning', ['No Data', 'There is no data to export.']);
      return;
    }

    const headers = [
      'eventid',
      'host',
      'hostTechName',
      'severity',
      'name',
      'opdata',
      'timestamp',
      'acknowledged',
      'acknowledges',
      'tags',
      'groups',
      'proxy',
    ];
    const csvRows = [];
    csvRows.push(headers.join(','));

    for (const problem of problemsToRender) {
      const values = headers.map((header) => {
        let value = (problem as any)[header];

        if (header === 'tags' && Array.isArray(value)) {
          value = value.map((tag: { tag: string; value: string }) => `${tag.tag}:${tag.value}`).join(';');
        } else if (header === 'groups' && Array.isArray(value)) {
          value = value.map((group: { name: string }) => group.name).join(';');
        } else if (header === 'acknowledges' && Array.isArray(value)) {
          value = value
            .map((ack: ZBXAcknowledge) => {
              const userName = ack.name && ack.surname ? `${ack.name} ${ack.surname}` : ack.user || 'Unknown User';
              const userIdentifier = ack.user && (ack.name || ack.surname) ? `${userName} (${ack.user})` : userName;
              const message = ack.message || '';
              return `${userIdentifier}: ${message}`;
            })
            .join(' | ');
        } else if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value);
        }

        if (typeof value === 'string') {
          value = value.replace(/"/g, '""');
          if (value.includes(',')) {
            value = `"${value}"`;
          }
        }
        return value !== undefined && value !== null ? value : '';
      });
      csvRows.push(values.join(','));
    }

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'problems.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      // @ts-ignore
      getAppEvents().emit('alert-success', ['CSV Downloaded', 'The problems data has been downloaded.']);
    } else {
      // @ts-ignore
      getAppEvents().emit('alert-error', ['Download Error', 'CSV download is not supported by your browser.']);
    }
  };

  return (
    <Button
      icon="download-alt"
      onClick={handleDownloadCsv}
      disabled={!problemsToRender || problemsToRender.length === 0}
      style={{ marginBottom: '10px' }}
    >
      Download CSV
    </Button>
  );
};
