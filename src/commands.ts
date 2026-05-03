/**
 * Jupiter C+ Command Builder
 * Generates command payloads for the device
 */

export type CommandType = 
  | 1   // Refresh runtime info
  | 2   // Working mode
  | 3   // Time period settings
  | 4   // Sync time
  | 5   // Factory reset
  | 13  // Surplus feed-in
  | 14  // BMS info
  | 56; // Discharge depth

export interface CommandParams {
  [key: string]: string | number;
}

export function buildCommand(command: CommandType, params: CommandParams = {}): string {
  const entries = Object.entries(params);
  const paramString = entries.length > 0 
    ? ',' + entries.map(([key, value]) => `${key}=${value}`).join(',')
    : '';
  return `cd=${command}${paramString}`;
}

// Predefined commands
export const Commands = {
  refresh: () => buildCommand(1),
  getBmsInfo: () => buildCommand(14),
  setWorkingMode: (mode: 'automatic' | 'manual') => 
    buildCommand(2, { md: mode === 'automatic' ? 1 : 2 }),
  setSurplusFeedIn: (enabled: boolean) => 
    buildCommand(13, { 'full_d': enabled ? 1 : 0 }),
  setDischargeDepth: (depth: number) => {
    const clamped = Math.max(30, Math.min(88, depth));
    return buildCommand(56, { dod: clamped });
  },
  setTimePeriod: (
    index: number,
    startTime?: string, // HH:MM
    endTime?: string,   // HH:MM
    enabled?: boolean,
    power?: number,
    weekdays?: number   // bitmask
  ) => {
    const params: CommandParams = {};
    if (startTime) {
      const [h, m] = startTime.split(':').map(Number);
      params.th = h;
      params.tm = m;
    }
    if (endTime) {
      const [h, m] = endTime.split(':').map(Number);
      params.eh = h;
      params.em = m;
    }
    if (enabled !== undefined) params.as = enabled ? 1 : 0;
    if (power !== undefined) params.vv = power;
    if (weekdays !== undefined) params.wk = weekdays;
    return buildCommand(3, params);
  },
  syncTime: (date: Date = new Date()) => buildCommand(4, {
    yy: date.getFullYear(),
    mm: date.getMonth() + 1,
    rr: date.getDate(),
    hh: date.getHours(),
    mn: date.getMinutes()
  }),
  factoryReset: () => buildCommand(5, { rs: 2 })
};
