/"""
 * MQTT Client with Home Assistant Discovery
 * Handles connection, polling, and entity publishing
"""

import mqtt from 'mqtt';
import { AppConfig } from './config';
import { Commands } from './commands';
import { parsePayload, getNumber, getBoolean } from './parser';
import { Logger } from 'pino';

export interface MqttClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publishDiscovery(): Promise<void>;
}

interface DeviceState {
  soc?: number;
  batteryEnergy?: number;
  batteryWorkingStatus?: string;
  combinedPower?: number;
  gridPower?: number;
  pv1Power?: number;
  pv2Power?: number;
  pv3Power?: number;
  pv4Power?: number;
  dailyCharging?: number;
  dailyDischarging?: number;
  workingMode?: string;
  surplusFeedIn?: boolean;
  depthOfDischarge?: number;
  wifiSignal?: number;
  online: boolean;
}

export function createMqttClient(config: AppConfig, logger: Logger): MqttClient {
  const { deviceType, deviceId, mqttTopicPrefix } = config;
  const baseTopic = `${mqttTopicPrefix}/${deviceType}/device/${deviceId}`;
  const availabilityTopic = `${mqttTopicPrefix}/${deviceType}/availability/${deviceId}`;
  const controlTopic = `${mqttTopicPrefix}/${deviceType}/control/${deviceId}`;

  let client: mqtt.MqttClient | null = null;
  let state: DeviceState = { online: false };
  let pollingTimer: ReturnType<typeof setInterval> | null = null;

  // Device topics (legacy/cloud)
  const deviceDataTopic = `hame_energy/${deviceType}/device/${deviceId}/ctrl`;
  const deviceDataNewTopic = `marstek_energy/${deviceType}/device/${deviceId}/ctrl`;
  const deviceControlTopic = `hame_energy/${deviceType}/App/${deviceId}/ctrl`;
  const deviceControlNewTopic = `marstek_energy/${deviceType}/App/${deviceId}/ctrl`;

  function updateStateFromPayload(payload: ReturnType<typeof parsePayload>) {
    state.soc = getNumber(payload, 'cel_c', state.soc);
    state.batteryEnergy = getNumber(payload, 'cel_p', state.batteryEnergy) / 100;
    state.combinedPower = getNumber(payload, 'grd_o', state.combinedPower);
    state.gridPower = getNumber(payload, 'grd_d', state.gridPower);
    state.pv1Power = getNumber(payload, 'pv1_p');
    state.pv2Power = getNumber(payload, 'pv2_p');
    state.pv3Power = getNumber(payload, 'pv3_p');
    state.pv4Power = getNumber(payload, 'pv4_p');
    state.dailyCharging = getNumber(payload, 'ele_d', state.dailyCharging) / 100;
    state.dailyDischarging = getNumber(payload, 'grd_d', state.dailyDischarging) / 100;
    state.workingMode = getNumber(payload, 'wor_m') === 1 ? 'automatic' : 'manual';
    state.surplusFeedIn = getBoolean(payload, 'ful_d', state.surplusFeedIn);
    state.depthOfDischarge = getNumber(payload, 'dod', state.depthOfDischarge);
    state.wifiSignal = getNumber(payload, 'wif_s', state.wifiSignal);
    state.online = true;
  }

  async function publishSensor(topic: string, value: unknown, unit?: string) {
    if (!client || !client.connected) return;
    await client.publishAsync(`${baseTopic}/${topic}`, JSON.stringify({ value, unit, ts: Date.now() }), { retain: false });
  }

  async function publishAllSensors() {
    if (state.soc !== undefined) await publishSensor('soc', state.soc, '%');
    if (state.batteryEnergy !== undefined) await publishSensor('batteryEnergy', state.batteryEnergy, 'kWh');
    if (state.combinedPower !== undefined) await publishSensor('combinedPower', state.combinedPower, 'W');
    if (state.pv1Power !== undefined) await publishSensor('pv1Power', state.pv1Power, 'W');
    if (state.pv2Power !== undefined) await publishSensor('pv2Power', state.pv2Power, 'W');
    if (state.pv3Power !== undefined) await publishSensor('pv3Power', state.pv3Power, 'W');
    if (state.pv4Power !== undefined) await publishSensor('pv4Power', state.pv4Power, 'W');
    if (state.dailyCharging !== undefined) await publishSensor('dailyCharging', state.dailyCharging, 'kWh');
    if (state.dailyDischarging !== undefined) await publishSensor('dailyDischarging', state.dailyDischarging, 'kWh');
    if (state.workingMode) await publishSensor('workingMode', state.workingMode);
    if (state.surplusFeedIn !== undefined) await publishSensor('surplusFeedIn', state.surplusFeedIn);
    if (state.depthOfDischarge !== undefined) await publishSensor('depthOfDischarge', state.depthOfDischarge, '%');
    if (state.wifiSignal !== undefined) await publishSensor('wifiSignal', state.wifiSignal, 'dBm');
  }

  async function publishAvailability() {
    if (!client || !client.connected) return;
    await client.publishAsync(availabilityTopic, state.online ? 'online' : 'offline', { retain: true });
  }

  async function sendCommand(payload: string) {
    if (!client || !client.connected) return;
    logger.debug({ payload }, 'Sending command');
    await client.publishAsync(deviceControlTopic, payload, { qos: 1 });
    await client.publishAsync(deviceControlNewTopic, payload, { qos: 1 });
  }

  async function poll() {
    await sendCommand(Commands.refresh());
    if (config.pollCellData) {
      await sendCommand(Commands.getBmsInfo());
    }
  }

  async function publishDiscovery() {
    const deviceInfo = {
      identifiers: [`${deviceType}_${deviceId}`],
      name: `Marstek Jupiter ${deviceType}`,
      manufacturer: 'Marstek',
      model: deviceType,
      sw_version: '1.0.0',
    };

    const sensors = [
      { name: 'SOC', objectId: 'soc', deviceTopic: 'soc', unit: '%', deviceClass: 'battery' },
      { name: 'Battery Energy', objectId: 'battery_energy', deviceTopic: 'batteryEnergy', unit: 'kWh' },
      { name: 'Combined Power', objectId: 'combined_power', deviceTopic: 'combinedPower', unit: 'W', deviceClass: 'power' },
      { name: 'PV1 Power', objectId: 'pv1_power', deviceTopic: 'pv1Power', unit: 'W', deviceClass: 'power' },
      { name: 'PV2 Power', objectId: 'pv2_power', deviceTopic: 'pv2Power', unit: 'W', deviceClass: 'power' },
      { name: 'PV3 Power', objectId: 'pv3_power', deviceTopic: 'pv3Power', unit: 'W', deviceClass: 'power' },
      { name: 'PV4 Power', objectId: 'pv4_power', deviceTopic: 'pv4Power', unit: 'W', deviceClass: 'power' },
      { name: 'Daily Charging', objectId: 'daily_charging', deviceTopic: 'dailyCharging', unit: 'kWh', deviceClass: 'energy' },
      { name: 'Daily Discharging', objectId: 'daily_discharging', deviceTopic: 'dailyDischarging', unit: 'kWh', deviceClass: 'energy' },
      { name: 'WiFi Signal', objectId: 'wifi_signal', deviceTopic: 'wifiSignal', unit: 'dBm', deviceClass: 'signal_strength' },
      { name: 'Depth of Discharge', objectId: 'depth_of_discharge', deviceTopic: 'depthOfDischarge', unit: '%' },
    ];

    for (const sensor of sensors) {
      const discoveryTopic = `homeassistant/sensor/${deviceType}_${deviceId}/${sensor.objectId}/config`;
      const discoveryPayload = {
        name: sensor.name,
        state_topic: `${baseTopic}/${sensor.deviceTopic}`,
        availability_topic: availabilityTopic,
        unique_id: `${deviceType}_${deviceId}_${sensor.objectId}`,
        device: deviceInfo,
        unit_of_measurement: sensor.unit,
        value_template: `{{ value_json.value }}`,
        ...(sensor.deviceClass ? { device_class: sensor.deviceClass } : {}),
      };
      if (client && client.connected) {
        await client.publishAsync(discoveryTopic, JSON.stringify(discoveryPayload), { retain: true });
      }
    }

    // Switch for surplus feed-in
    const switchDiscoveryTopic = `homeassistant/switch/${deviceType}_${deviceId}/surplus_feed_in/config`;
    await client!.publishAsync(switchDiscoveryTopic, JSON.stringify({
      name: 'Surplus Feed-In',
      state_topic: `${baseTopic}/surplusFeedIn`,
      command_topic: `${controlTopic}/surplus-feed-in`,
      availability_topic: availabilityTopic,
      unique_id: `${deviceType}_${deviceId}_surplus_feed_in`,
      device: deviceInfo,
      payload_on: 'ON',
      payload_off: 'OFF',
      value_template: `{{ 'ON' if value_json.value else 'OFF' }}`,
    }), { retain: true });

    // Select for working mode
    const selectDiscoveryTopic = `homeassistant/select/${deviceType}_${deviceId}/working_mode/config`;
    await client!.publishAsync(selectDiscoveryTopic, JSON.stringify({
      name: 'Working Mode',
      state_topic: `${baseTopic}/workingMode`,
      command_topic: `${controlTopic}/working-mode`,
      availability_topic: availabilityTopic,
      unique_id: `${deviceType}_${deviceId}_working_mode`,
      device: deviceInfo,
      options: ['automatic', 'manual'],
      value_template: `{{ value_json.value }}`,
    }), { retain: true });

    logger.info('HA Discovery published for all entities');
  }

  return {
    async connect() {
      return new Promise<void>((resolve, reject) => {
        const url = config.mqttBrokerUrl;
        const opts: mqtt.IClientOptions = {
          clientId: `marstek-jupiter-${deviceId}-${Date.now()}`,
          ...(config.mqttUsername ? { username: config.mqttUsername } : {}),
          ...(config.mqttPassword ? { password: config.mqttPassword } : {}),
          reconnectPeriod: 5000,
          connectTimeout: 30000,
          clean: true,
        };

        client = mqtt.connect(url, opts);

        client.on('connect', () => {
          logger.info('MQTT connected');
          client!.subscribe([deviceDataTopic, deviceDataNewTopic, `${controlTopic}/#`], (err) => {
            if (err) {
              logger.error({ err }, 'Subscription failed');
              reject(err);
            } else {
              logger.info('Subscribed to device topics');
              resolve();
            }
          });
        });

        client.on('message', async (topic, message) => {
          const msg = message.toString();
          logger.debug({ topic, msg }, 'Message received');

          if (topic === deviceDataTopic || topic === deviceDataNewTopic) {
            const payload = parsePayload(msg);
            updateStateFromPayload(payload);
            await publishAllSensors();
            await publishAvailability();
          } else if (topic.startsWith(controlTopic)) {
            const command = topic.substring(controlTopic.length + 1);
            if (command === 'working-mode') {
              const mode = msg === 'automatic' ? 1 : 2;
              await sendCommand(Commands.setWorkingMode(msg as 'automatic' | 'manual'));
            } else if (command === 'surplus-feed-in') {
              const enabled = msg === 'ON';
              await sendCommand(Commands.setSurplusFeedIn(enabled));
            }
          }
        });

        client.on('error', (err) => {
          logger.error({ err }, 'MQTT error');
        });

        client.on('close', () => {
          logger.warn('MQTT connection closed');
        });
      });
    },

    async disconnect() {
      if (pollingTimer) clearInterval(pollingTimer);
      if (client) {
        await publishAvailability();
        client.end();
        client = null;
      }
    },

    async publishDiscovery() {
      return publishDiscovery();
    },
  };
}
