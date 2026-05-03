#!/usr/bin/env node
/**
 * Marstek Jupiter C+ Home Assistant Add-on
 * Entry point - connects to MQTT, handles discovery, polling and health
 */

import pino from 'pino';
import { loadConfig } from './config';
import { createMqttClient, MqttClient } from './mqttClient';
import { createHealthServer } from './health';
import { CloudBridge } from './cloudBridge';

const logger = pino({
  level: process.env['LOG_LEVEL'] || 'info',
  transport: process.env['LOG_PRETTY'] === 'true' 
    ? { target: 'pino-pretty', options: { colorize: true } } 
    : undefined,
});

let mqttConnected = false;

async function main() {
  logger.info('Marstek Jupiter C+ Add-on v1.0.0');
  
  let config;
  try {
    config = loadConfig();
    logger.info({ 
      device: config.deviceType, 
      id: config.deviceId,
      broker: config.brokerId,
      cloud: config.useCloudBridge 
    }, 'Config loaded');
  } catch (err) {
    logger.fatal({ err }, 'Failed to load configuration');
    process.exit(1);
  }

  // Start health server first (HA watchdog needs this)
  const healthServer = createHealthServer(
    config.healthPort, 
    logger, 
    () => mqttConnected
  );

  // Optional: Cloud-MQTT Bridge
  let cloudBridge: CloudBridge | undefined;
  if (config.useCloudBridge && config.cloudCredentials && config.cloudBrokerUrl) {
    cloudBridge = new CloudBridge({
      deviceType: config.deviceType,
      deviceId: config.deviceId,
      brokerId: config.brokerId,
      localBrokerUrl: config.mqttBrokerUrl,
      cloudBrokerUrl: config.cloudBrokerUrl,
      cloudCredentials: config.cloudCredentials,
      logger,
    });
    const bridgeStarted = await cloudBridge.start();
    if (!bridgeStarted) {
      logger.warn('Cloud bridge failed to start — continuing without cloud bridge');
      cloudBridge = undefined;
    }
  } else if (config.useCloudBridge && !config.cloudBrokerUrl) {
    logger.warn('Cloud bridge requested but cloudBrokerUrl is not configured. Set it explicitly or rely on hame-relay auto-discovery.');
  }

  let client: MqttClient;
  try {
    client = createMqttClient(config, logger);
    await client.connect();
    mqttConnected = true;
    logger.info('MQTT client connected');
    await client.publishDiscovery();
    logger.info('HA Discovery published');
    client.startPolling();
    logger.info({ interval: config.pollingInterval }, 'Polling started');
  } catch (err) {
    logger.fatal({ err }, 'Failed to start MQTT client');
    process.exit(1);
  }

  // Update health check to use actual client connection state
  healthServer.isHealthy = () => client.getConnected();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    mqttConnected = false;
    try {
      await client.disconnect();
    } catch (err) {
      logger.error({ err }, 'Error during disconnect');
    }
    healthServer.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Unhandled error');
  process.exit(1);
});
