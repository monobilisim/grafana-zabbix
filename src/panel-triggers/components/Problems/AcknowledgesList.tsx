import React from 'react';
import { ZBXAcknowledge } from '../../../datasource/types';
import { getBackendSrv, getAppEvents, locationService } from '@grafana/runtime';

interface AcknowledgesListProps {
  acknowledges: ZBXAcknowledge[];
}

interface AckUserInfo {
  displayName: string;
  isGrafanaUser: boolean;
  grafanaLogin?: string;
  grafanaUserId?: number;
}

function parseJSONObject(str?: string): any | null {
  if (!str) {
    return null;
  }
  try {
    const parsed = JSON.parse(str);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function getAckUserInfo(ack: ZBXAcknowledge): AckUserInfo {
  const parsed = parseJSONObject(ack.message);
  if (parsed) {
    const displayName = parsed.grafanaUser || `${ack.name || ''} ${ack.surname || ''}`.trim() || ack.user;
    return {
      displayName: displayName || 'İsimsiz Kullanıcı',
      isGrafanaUser: true,
      grafanaLogin: parsed.grafanaUser,
      grafanaUserId: typeof parsed.grafanaUserId === 'number' ? parsed.grafanaUserId : undefined,
    };
  }
  const fullName = `${ack.name || ''} ${ack.surname || ''}`.trim();
  return {
    displayName: fullName || ack.user || ack.alias || 'İsimsiz Kullanıcı',
    isGrafanaUser: false,
  };
}

function getAckMessageText(ack: ZBXAcknowledge): string {
  const parsed = parseJSONObject(ack.message);
  if (parsed) {
    return parsed.message ?? '';
  }
  return ack.message ?? '';
}

export default function AcknowledgesList(props: AcknowledgesListProps) {
  const { acknowledges } = props;
  return (
    <div className="problem-ack-list">
      <div className="problem-ack-col problem-ack-time">
        {acknowledges.map((ack) => (
          <span key={ack.acknowledgeid} className="problem-ack-time">
            {ack.time}
          </span>
        ))}
      </div>
      <div className="problem-ack-col problem-ack-user">
        {acknowledges.map((ack) => {
          const info = getAckUserInfo(ack);
          if (info.isGrafanaUser) {
            return (
              <span key={ack.acknowledgeid} className="problem-ack-user">
                {info.displayName}
              </span>
            );
          }
          return (
            <span key={ack.acknowledgeid} className="problem-ack-user">
              {info.displayName}
              <span className="problem-ack-source"> (Zabbix)</span>
            </span>
          );
        })}
      </div>
      <div className="problem-ack-col problem-ack-message">
        {acknowledges.map((ack) => (
          <span key={ack.acknowledgeid} className="problem-ack-message">
            {getAckMessageText(ack)}
          </span>
        ))}
      </div>
    </div>
  );
}
