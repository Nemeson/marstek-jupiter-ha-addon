/**
 * Configuration Loader
 * Reads environment variables and provides typed config
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env if present (for local development)
dotenv.config({ path: path.join(process.cwd(), '.env') });

export interface DeviceConfig {
  type: string;
  id: string;
}

export interface AppConfig {
  mqttBrokerUrl: string;
  mqttUsername?: string;
  mqttPassword?: string;
  mqttTopicPrefix: string;
  deviceType: string;
  deviceId: string;
  pollingInterval: number;
  responseTimeout: number;
  pollCellData: boolean;
  logLevel: string;
}

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value !== undefined && value !== 'null' && value !== '') return value;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`Environment variable ${key} is required`);
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value === 'true' || value === '1';
}

export function loadConfig(): AppConfig {
  return {
    mqttBrokerUrl: getEnv('MQTT_BROKER_URL', 'mqtt://localhost:1883'),
    mqttUsername: process.env['MQTT_USERNAME'] || undefined,
    mqttPassword: process.env['MQTT_PASSWORD'] || undefined,
    mqttTopicPrefix: getEnv('MQTT_TOPIC_PREFIX', 'marstek_jupiter'),
    deviceType: getEnv('DEVICE_TYPE', ''),
    deviceId: getEnv('DEVICE_ID', ''),
    pollingInterval: getEnvNumber('MQTT_POLLING_INTERVAL', 60),
    responseTimeout: getEnvNumber('MQTT_RESPONSE_TIMEOUT', 30),
    pollCellData: getEnvBool('POLL_CELL_DATA', false),
    logLevel: getEnv('LOG_LEVEL', 'info'),
  };
}
