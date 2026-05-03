/**
 * Hame / Marstek Cloud API Client
 * Handles login and device discovery
 */

import fetch from 'node-fetch';
import { Logger } from 'pino';

const HAME_API_BASE = 'https://eu.hamedata.com/apigateway';

export interface HameDevice {
  deviceId: string;
  deviceType: string;
  productName: string;
  online: boolean;
  version?: string;
}

export interface HameCredentials {
  username: string;
  password: string;
}

interface LoginResponse {
  data?: {
    token?: string;
    userId?: string;
  };
  message?: string;
}

interface DeviceListResponse {
  data?: Array<{
    deviceId: string;
    deviceType: string;
    productName: string;
    online: boolean;
    version?: string;
  }>;
}

export class HameApiClient {
  private token: string | null = null;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async login(credentials: HameCredentials): Promise<boolean> {
    try {
      const response = await fetch(`${HAME_API_BASE}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: credentials.username,
          password: credentials.password,
          type: '3', // mobile app type
        }),
      });

      if (!response.ok) {
        this.logger.error({ status: response.status }, 'Hame API login failed');
        return false;
      }

      const data = await response.json() as LoginResponse;
      if (data.data?.token) {
        this.token = data.data.token;
        this.logger.info('Hame Cloud login successful');
        return true;
      }

      this.logger.error({ message: data.message }, 'Hame API login returned no token');
      return false;
    } catch (err) {
      this.logger.error({ err }, 'Hame API login error');
      return false;
    }
  }

  async getDevices(): Promise<HameDevice[]> {
    if (!this.token) {
      this.logger.error('Not authenticated');
      return [];
    }

    try {
      const response = await fetch(`${HAME_API_BASE}/device/queryDevice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': this.token,
        },
        body: JSON.stringify({}),
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
        deviceId: d.deviceId,
        deviceType: d.deviceType,
        productName: d.productName,
        online: d.online,
        version: d.version,
      }));

      this.logger.info({ count: devices.length }, 'Devices discovered');
      return devices;
    } catch (err) {
      this.logger.error({ err }, 'Device discovery error');
      return [];
    }
  }

  async findDevice(deviceId: string): Promise<HameDevice | null> {
    const devices = await this.getDevices();
    const device = devices.find((d) => d.deviceId.toLowerCase() === deviceId.toLowerCase());
    return device || null;
  }
}
