import semver from 'semver';
import { ZBXScript } from '../../../datasource/zabbix/connectors/zabbix_api/types';

// Fallback for Zabbix < 7.0, where script.execute has no `manualinput`
// parameter and scripts have no "Enable user input" dropdown. On those servers
// each e-mail group is a separate script named "Send Email <group>", so the
// group is chosen by picking a different scriptid instead of by sending
// manualinput.
const LEGACY_SCRIPT_PREFIX = 'Send Email ';

export interface LegacyEmailScripts {
  // Group labels, i.e. the part after "Send Email ".
  companies: string[];
  // Group label -> scriptid of the script that mails that group.
  scriptIdByCompany: Record<string, string>;
}

// True when the datasource's Zabbix server predates the manualinput parameter.
// Any detection failure returns false so the normal 7.0+ path stays in charge.
export const usesLegacyEmailScripts = async (ds: any): Promise<boolean> => {
  try {
    const version: string = await ds?.zabbix?.getVersion();
    const coerced = semver.coerce(version);
    return coerced ? semver.lt(coerced, '7.0.0') : false;
  } catch {
    return false;
  }
};

// Collect the per-group "Send Email <group>" scripts. The plain "Send Email"
// script has no suffix, so it is skipped and never offered as a group.
export const resolveLegacyEmailScripts = (scripts: ZBXScript[]): LegacyEmailScripts => {
  const scriptIdByCompany: Record<string, string> = {};

  for (const script of scripts ?? []) {
    const name = (script?.name ?? '').trim();
    if (!name.startsWith(LEGACY_SCRIPT_PREFIX)) {
      continue;
    }
    const company = name.slice(LEGACY_SCRIPT_PREFIX.length).trim();
    if (company && script.scriptid) {
      scriptIdByCompany[company] = script.scriptid;
    }
  }

  return { companies: Object.keys(scriptIdByCompany), scriptIdByCompany };
};
