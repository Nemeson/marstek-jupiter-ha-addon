#!/usr/bin/env node
/**
 * Marstek Jupiter C+ Home Assistant Add-on
 * Entry point - connects to MQTT, handles discovery and polling
 */

import pino from 'pino';
import { loadConfig } from './config';
import { createMqttClient, MqttClient } from './mqttClient';

const logger = pino({
  level: process.env['LOG_LEVEL'] || 'info',
  transport: process.env['LOG_PRETTY'] === 'true' 
    ? { target: 'pino-pretty', options: { colorize: true } } 
    : undefined,
});

async function main() {
  logger.info('Marstek Jupiter C+ Add-on v1.0.0');
  
  let config;
  try {
    config = loadConfig();
    logger.info({ device: config.deviceType, id: config.deviceId }, 'Config loaded');
  } catch (err) {
    logger.fatal({ err }, 'Failed to load configuration');
    process.exit(1);
  }

  let client: MqttClient;
  try {
    client = createMqttClient(config, logger);
    await client.connect();
    logger.info('MQTT client connected');
    await client.publishDiscovery();
    logger.info('HA Discovery published');
  } catch (err) {
    logger.fatal({ err }, 'Failed to start MQTT client');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    try {
      await client.disconnect();
    } catch (err) {
      logger.error({ err }, 'Error during disconnect');
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Unhandled error');
  process.exit(1);
});
