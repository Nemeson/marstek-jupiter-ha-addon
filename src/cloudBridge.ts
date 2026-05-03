/**
 * Cloud-MQTT Bridge
 * Bidirectional forwarding between local Mosquitto and Hame Cloud MQTT
 */

import mqtt from 'mqtt';
import { Logger } from 'pino';
import { HameApiClient, HameCredentials } from './hameApi';
import { buildDeviceTopic, buildControlTopic } from './encryption';

export interface CloudBridgeConfig {
  deviceType: string;
  deviceId: string;
  brokerId: string;
  localBrokerUrl: string;
  cloudBrokerUrl: string;
  cloudCredentials: HameCredentials;
  logger: Logger;
}

export class CloudBridge {
  private localClient: mqtt.MqttClient | null = null;
  private cloudClient: mqtt.MqttClient | null = null;
  private logger: Logger;
  private deviceType: string;
  private deviceId: string;
  private brokerId: string;
  private localBrokerUrl: string;
  private cloudBrokerUrl: string;
  private cloudCredentials: HameCredentials;
  private running = false;

  constructor(config: CloudBridgeConfig) {
    this.logger = config.logger;
    this.deviceType = config.deviceType;
    this.deviceId = config.deviceId;
    this.brokerId = config.brokerId;
    this.localBrokerUrl = config.localBrokerUrl;
    this.cloudBrokerUrl = config.cloudBrokerUrl;
    this.cloudCredentials = config.cloudCredentials;
  }

  async start(): Promise<boolean> {
    if (this.running) {
      this.logger.warn('Cloud bridge already running');
      return true;
    }

    // Authenticate with Hame API first
    const hameApi = new HameApiClient(this.logger);
    const loggedIn = await hameApi.login(this.cloudCredentials);
    if (!loggedIn) {
      this.logger.error('Cloud bridge failed: Hame API login unsuccessful');
      return false;
    }

    // Verify device exists in cloud account
    const device = await hameApi.findDevice(this.deviceId);
    if (!device) {
      this.logger.error({ deviceId: this.deviceId }, 'Cloud bridge failed: Device not found in cloud account');
      return false;
    }

    this.logger.info({ deviceId: device.devid, product: device.name }, 'Cloud device verified');

    // Build topics
    const { oldTopic, newTopic } = buildDeviceTopic(this.brokerId, this.deviceType, this.deviceId);
    const { oldControlTopic, newControlTopic } = buildControlTopic(this.brokerId, this.deviceType, this.deviceId);

    try {
      // Connect to local broker (Home Assistant Mosquitto)
      this.localClient = mqtt.connect(this.localBrokerUrl, {
        clientId: `cloud-bridge-local-${this.deviceId}-${Date.now()}`,
        reconnectPeriod: 5000,
        connectTimeout: 30000,
        clean: true,
      });

      // Connect to cloud broker (Hame Cloud)
      this.cloudClient = mqtt.connect(this.cloudBrokerUrl, {
        clientId: `cloud-bridge-cloud-${this.deviceId}-${Date.now()}`,
        username: this.cloudCredentials.username,
        password: this.cloudCredentials.password,
        reconnectPeriod: 10000,
        connectTimeout: 30000,
        clean: true,
      });

      await this.setupLocalClient(oldTopic, newTopic, oldControlTopic, newControlTopic);
      await this.setupCloudClient(oldTopic, newTopic, oldControlTopic, newControlTopic);

      this.running = true;
      this.logger.info('Cloud-MQTT bridge started successfully');
      return true;
    } catch (err) {
      this.logger.error({ err }, 'Failed to start cloud bridge');
      this.stop();
      return false;
    }
  }

  private async setupLocalClient(oldTopic: string, newTopic: string, oldControlTopic: string, newControlTopic: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Local MQTT connection timeout')), 30000);

      this.localClient!.on('connect', () => {
        this.logger.info('Cloud bridge: connected to local broker');
        clearTimeout(timeout);

        // Subscribe to local control topics (commands from HA)
        const localControlTopics = [
          `marstek_jupiter/${this.deviceType}/control/${this.deviceId}/#`,
        ];
        this.localClient!.subscribe(localControlTopics, (err) => {
          if (err) {
            this.logger.error({ err }, 'Cloud bridge: failed to subscribe to local control topics');
          } else {
            this.logger.info('Cloud bridge: subscribed to local control topics');
          }
        });

        resolve();
      });

      this.localClient!.on('message', (topic, message) => {
        // Forward local control commands to cloud
        if (topic.includes('/control/')) {
          const msg = message.toString();
          this.logger.debug({ topic, msg }, 'Cloud bridge: forwarding local command to cloud');
          this.cloudClient?.publish(oldControlTopic, msg, { qos: 1 });
          this.cloudClient?.publish(newControlTopic, msg, { qos: 1 });
        }
      });

      this.localClient!.on('error', (err) => {
        this.logger.error({ err }, 'Cloud bridge: local MQTT error');
      });

      this.localClient!.on('close', () => {
        this.logger.warn('Cloud bridge: local connection closed');
      });
    });
  }

  private async setupCloudClient(oldTopic: string, newTopic: string, oldControlTopic: string, newControlTopic: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Cloud MQTT connection timeout')), 30000);

      this.cloudClient!.on('connect', () => {
        this.logger.info('Cloud bridge: connected to cloud broker');
        clearTimeout(timeout);

        // Subscribe to cloud device topics (status updates)
        this.cloudClient!.subscribe([oldTopic, newTopic], { qos: 1 }, (err) => {
          if (err) {
            this.logger.error({ err }, 'Cloud bridge: failed to subscribe to cloud topics');
          } else {
            this.logger.info('Cloud bridge: subscribed to cloud device topics');
          }
        });

        resolve();
      });

      this.cloudClient!.on('message', (topic, message) => {
        // Forward cloud device messages to local broker
        const msg = message.toString();
        this.logger.trace({ topic, msg }, 'Cloud bridge: received cloud message');

        // Publish to local broker on the same topics
        this.localClient?.publish(topic, msg, { qos: 1, retain: false });

        // Also publish to a local mapped topic for clarity
        const localMappedTopic = `marstek_jupiter/${this.deviceType}/device/${this.deviceId}/cloud`;
        this.localClient?.publish(localMappedTopic, msg, { qos: 1, retain: false });
      });

      this.cloudClient!.on('error', (err) => {
        this.logger.error({ err }, 'Cloud bridge: cloud MQTT error');
      });

      this.cloudClient!.on('close', () => {
        this.logger.warn('Cloud bridge: cloud connection closed');
      });

      this.cloudClient!.on('offline', () => {
        this.logger.warn('Cloud bridge: cloud client offline');
      });
    });
  }

  stop(): void {
    this.running = false;
    if (this.localClient) {
      this.localClient.end();
      this.localClient = null;
    }
    if (this.cloudClient) {
      this.cloudClient.end();
      this.cloudClient = null;
    }
    this.logger.info('Cloud bridge stopped');
  }

  isRunning(): boolean {
    return this.running;
  }
}
