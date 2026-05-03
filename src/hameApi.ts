/**
 * Hame / Marstek Cloud API Client
 * Based on reverse-engineered endpoints from tomquist/hame-relay and community
 */

import crypto from 'crypto';
import fetch from 'node-fetch';
import { Logger } from 'pino';

const HAME_API_BASE = 'https://eu.hamedata.com';

export interface HameDevice {
  devid: string;
  mac: string;
  name: string;
  type: string;
  version: string;
  salt?: string;
}

export interface HameCredentials {
  username: string;
  password: string;
}

interface LoginResponse {
  code: string;
  msg: string;
  token?: string;
  data?: Array<{
    devid: string;
    name: string;
    sn: string | null;
    mac: string;
    type: string;
    access: string;
    bluetooth_name: string;
  }>;
}

interface DeviceListResponse {
  code: number;
  msg: string;
  data?: Array<{
    devid: string;
    name: string;
    mac: string;
    type: string;
    version: string;
    salt?: string;
  }>;
}

function md5Hash(input: string): string {
  return crypto.createHash('md5').update(input).digest('hex');
}

export class HameApiClient {
  private token: string | null = null;
  private logger: Logger;
  private credentials: HameCredentials | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async login(credentials: HameCredentials): Promise<boolean> {
    this.credentials = credentials;
    const pwdHash = md5Hash(credentials.password);

    try {
      const url = `${HAME_API_BASE}/app/Solar/v2_get_device.php?mailbox=${encodeURIComponent(credentials.username)}&pwd=${pwdHash}`;
      this.logger.debug({ url: url.replace(pwdHash, '***') }, 'Hame API login request');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Dart/2.19 (dart:io)',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        this.logger.error({ status: response.status }, 'Hame API login HTTP error');
        return false;
      }

      const data = await response.json() as LoginResponse;
      this.logger.debug({ code: data.code, msg: data.msg }, 'Hame API login response');

      if (data.code === '4') {
        this.logger.error('Hame API login failed: incorrect password');
        return false;
      }

      if (!data.token) {
        this.logger.error({ code: data.code, msg: data.msg }, 'Hame API login returned no token');
        return false;
      }

      this.token = data.token;
      this.logger.info('Hame Cloud login successful');
      return true;
    } catch (err) {
      this.logger.error({ err }, 'Hame API login error');
      return false;
    }
  }

  async getDevices(): Promise<HameDevice[]> {
    if (!this.token || !this.credentials) {
      this.logger.error('Not authenticated');
      return [];
    }

    try {
      const url = `${HAME_API_BASE}/ems/api/v1/getDeviceList?mailbox=${encodeURIComponent(this.credentials.username)}&token=${encodeURIComponent(this.token)}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Dart/2.19 (dart:io)',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        this.logger.error({ status: response.status }, 'Failed to query devices');
        return [];
      }

      const data = await response.json() as DeviceListResponse;
      if (!data.data) {
        return [];
      }

      const devices = data.data.map((d) => ({
        devid: d.devid,
        mac: d.mac,
        name: d.name,
        type: d.type,
        version: d.version,
        salt: d.salt,
      }));

      this.logger.info({ count: devices.length }, 'Devices discovered from Hame Cloud');
      return devices;
    } catch (err) {
      this.logger.error({ err }, 'Device discovery error');
      return [];
    }
  }

  async findDevice(deviceId: string): Promise<HameDevice | null> {
    const devices = await this.getDevices();
    // Match by mac (deviceId is the mac without colons)
    const normalizedId = deviceId.toLowerCase().replace(/:/g, '');
    const device = devices.find((d) => {
      const normalizedMac = d.mac.toLowerCase().replace(/:/g, '');
      return normalizedMac === normalizedId || d.devid === deviceId;
    });
    return device || null;
  }

  getToken(): string | null {
    return this.token;
  }

  isAuthenticated(): boolean {
    return this.token !== null;
  }
}
