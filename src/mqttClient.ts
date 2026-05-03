import mqtt from 'mqtt';
import { AppConfig } from './config';
import { Commands } from './commands';
import { parsePayload, getNumber, getBoolean, getString } from './parser';
import { Logger } from 'pino';
import { buildDeviceTopic, buildControlTopic } from './encryption';

export interface MqttClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publishDiscovery(): Promise<void>;
  startPolling(): void;
  getConnected(): boolean;
}

interface TimePeriodState {
  startHour?: number;
  startMinute?: number;
  endHour?: number;
  endMinute?: number;
  power?: number;
  enabled?: boolean;
  weekday?: number; // bitmask
}

interface DeviceState {
  soc?: number;
  batteryEnergy?: number;
  batteryWorkingStatus?: string;
  combinedPower?: number;
  gridPower?: number;
  gridImport?: number;
  gridExport?: number;
  pv1Power?: number;
  pv2Power?: number;
  pv3Power?: number;
  pv4Power?: number;
  dailyCharging?: number;
  dailyDischarging?: number;
  monthlyCharging?: number;
  monthlyDischarging?: number;
  yearlyCharging?: number;
  yearlyDischarging?: number;
  workingMode?: string;
  workingStatus?: string;
  ctStatus?: string;
  ctType?: string;
  phaseType?: string;
  rechargeMode?: string;
  surplusFeedIn?: boolean;
  depthOfDischarge?: number;
  wifiSignal?: number;
  wifiName?: string;
  inverterTemp?: number;
  batteryTemp?: number;
  batteryStatus?: string;
  errorCode?: number;
  alarmCode?: number;
  autoSwitchWorkingMode?: string;
  httpServerType?: string;
  timePeriods: TimePeriodState[];
  online: boolean;
  lastSeen?: number;
  cellData?: Record<string, number>;
  // Version sensors
  bmsVersion?: string;
  mpptVersion?: string;
  inverterVersion?: string;
  emsVersion?: string;
  deviceVersion?: string;
}

interface RetryState {
  attempt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

const TIME_PERIOD_COUNT = 5;

export function createMqttClient(config: AppConfig, logger: Logger): MqttClient {
  const { deviceType, deviceId, mqttTopicPrefix, brokerId, pollingInterval, pollCellData, responseTimeout } = config;
  const baseTopic = `${mqttTopicPrefix}/${deviceType}/device/${deviceId}`;
  const availabilityTopic = `${mqttTopicPrefix}/${deviceType}/availability/${deviceId}`;
  const controlTopic = `${mqttTopicPrefix}/${deviceType}/control/${deviceId}`;
  const stateTopic = `${mqttTopicPrefix}/${deviceType}/state/${deviceId}`;

  const { oldTopic, newTopic } = buildDeviceTopic(brokerId, deviceType, deviceId);
  const { oldControlTopic, newControlTopic } = buildControlTopic(brokerId, deviceType, deviceId);

  logger.debug({ oldTopic, newTopic, oldControlTopic, newControlTopic }, 'Topics resolved');

  let client: mqtt.MqttClient | null = null;
  let state: DeviceState = { online: false, timePeriods: Array(TIME_PERIOD_COUNT).fill({}) };
  let pollingTimer: ReturnType<typeof setInterval> | null = null;
  let connected = false;
  let discoveryPublished = false;
  let reconnectCount = 0;
  const commandRetries = new Map<string, RetryState>();

  function updateStateFromPayload(payload: ReturnType<typeof parsePayload>) {
    state.soc = getNumber(payload, 'cel_c', state.soc);
    state.batteryEnergy = getNumber(payload, 'cel_p', state.batteryEnergy) / 100;
    state.combinedPower = getNumber(payload, 'grd_o', state.combinedPower);
    state.gridPower = getNumber(payload, 'grd_d', state.gridPower);
    // Grid import/export split
    const gridRaw = getNumber(payload, 'grd_d', 0);
    if (gridRaw >= 0) {
      state.gridImport = gridRaw;
      state.gridExport = 0;
    } else {
      state.gridImport = 0;
      state.gridExport = Math.abs(gridRaw);
    }
    state.pv1Power = getNumber(payload, 'pv1_p');
    state.pv2Power = getNumber(payload, 'pv2_p');
    state.pv3Power = getNumber(payload, 'pv3_p');
    state.pv4Power = getNumber(payload, 'pv4_p');
    state.dailyCharging = getNumber(payload, 'ele_d', state.dailyCharging) / 100;
    state.dailyDischarging = getNumber(payload, 'grd_d', state.dailyDischarging) / 100;
    state.monthlyCharging = getNumber(payload, 'mon_c', state.monthlyCharging) / 100;
    state.monthlyDischarging = getNumber(payload, 'mon_d', state.monthlyDischarging) / 100;
    state.yearlyCharging = getNumber(payload, 'yea_c', state.yearlyCharging) / 100;
    state.yearlyDischarging = getNumber(payload, 'yea_d', state.yearlyDischarging) / 100;
    state.workingMode = getNumber(payload, 'wor_m') === 1 ? 'automatic' : 'manual';
    state.workingStatus = getString(payload, 'wor_s', state.workingStatus);
    state.ctStatus = getString(payload, 'ct_s', state.ctStatus);
    state.ctType = getString(payload, 'ct_t', state.ctType);
    state.phaseType = getString(payload, 'ph_t', state.phaseType);
    state.rechargeMode = getString(payload, 're_m', state.rechargeMode);
    state.surplusFeedIn = getBoolean(payload, 'ful_d', state.surplusFeedIn);
    state.depthOfDischarge = getNumber(payload, 'dod', state.depthOfDischarge);
    state.wifiSignal = getNumber(payload, 'wif_s', state.wifiSignal);
    state.wifiName = getString(payload, 'wif_n', state.wifiName);
    state.inverterTemp = getNumber(payload, 'inv_t', state.inverterTemp);
    state.batteryTemp = getNumber(payload, 'bat_t', state.batteryTemp);
    state.batteryStatus = getString(payload, 'bat_s', state.batteryStatus);
    state.errorCode = getNumber(payload, 'err_c', state.errorCode);
    state.alarmCode = getNumber(payload, 'ala_c', state.alarmCode);
    state.autoSwitchWorkingMode = getString(payload, 'aut_m', state.autoSwitchWorkingMode);
    state.httpServerType = getString(payload, 'srv_t', state.httpServerType);

    // Version sensors
    state.bmsVersion = getString(payload, 'bms_v', state.bmsVersion);
    state.mpptVersion = getString(payload, 'mppt_v', state.mpptVersion);
    state.inverterVersion = getString(payload, 'inv_v', state.inverterVersion);
    state.emsVersion = getString(payload, 'ems_v', state.emsVersion);
    state.deviceVersion = getString(payload, 'dev_v', state.deviceVersion);

    // Time-period state extraction for 5 periods
    for (let i = 0; i < TIME_PERIOD_COUNT; i++) {
      const tp = state.timePeriods[i] || {};
      tp.startHour = getNumber(payload, `th${i}`, tp.startHour);
      tp.startMinute = getNumber(payload, `tm${i}`, tp.startMinute);
      tp.endHour = getNumber(payload, `eh${i}`, tp.endHour);
      tp.endMinute = getNumber(payload, `em${i}`, tp.endMinute);
      tp.power = getNumber(payload, `vv${i}`, tp.power);
      tp.enabled = getBoolean(payload, `as${i}`, tp.enabled);
      tp.weekday = getNumber(payload, `wk${i}`, tp.weekday);
      state.timePeriods[i] = tp;
    }

    state.online = true;
    state.lastSeen = Date.now();

    // Extract cell data if present (cel_0, cel_1, ...)
    const cellData: Record<string, number> = {};
    for (const key of Object.keys(payload)) {
      if (key.startsWith('cel_') && key !== 'cel_c' && key !== 'cel_p') {
        cellData[key] = getNumber(payload, key);
      }
    }
    if (Object.keys(cellData).length > 0) {
      state.cellData = cellData;
    }
  }

  async function publishSensor(topic: string, value: unknown, unit?: string, deviceClass?: string) {
    if (!client || !client.connected) return;
    const payload: Record<string, unknown> = { value, ts: Date.now() };
    if (unit) payload.unit = unit;
    if (deviceClass) payload.device_class = deviceClass;
    await client.publishAsync(`${baseTopic}/${topic}`, JSON.stringify(payload), { retain: false });
  }

  async function publishAllSensors() {
    if (state.soc !== undefined) await publishSensor('soc', state.soc, '%', 'battery');
    if (state.batteryEnergy !== undefined) await publishSensor('batteryEnergy', state.batteryEnergy, 'kWh', 'energy');
    if (state.combinedPower !== undefined) await publishSensor('combinedPower', state.combinedPower, 'W', 'power');
    if (state.gridImport !== undefined) await publishSensor('gridImport', state.gridImport, 'W', 'power');
    if (state.gridExport !== undefined) await publishSensor('gridExport', state.gridExport, 'W', 'power');
    if (state.pv1Power !== undefined) await publishSensor('pv1Power', state.pv1Power, 'W', 'power');
    if (state.pv2Power !== undefined) await publishSensor('pv2Power', state.pv2Power, 'W', 'power');
    if (state.pv3Power !== undefined) await publishSensor('pv3Power', state.pv3Power, 'W', 'power');
    if (state.pv4Power !== undefined) await publishSensor('pv4Power', state.pv4Power, 'W', 'power');
    if (state.dailyCharging !== undefined) await publishSensor('dailyCharging', state.dailyCharging, 'kWh', 'energy');
    if (state.dailyDischarging !== undefined) await publishSensor('dailyDischarging', state.dailyDischarging, 'kWh', 'energy');
    if (state.monthlyCharging !== undefined) await publishSensor('monthlyCharging', state.monthlyCharging, 'kWh', 'energy');
    if (state.monthlyDischarging !== undefined) await publishSensor('monthlyDischarging', state.monthlyDischarging, 'kWh', 'energy');
    if (state.yearlyCharging !== undefined) await publishSensor('yearlyCharging', state.yearlyCharging, 'kWh', 'energy');
    if (state.yearlyDischarging !== undefined) await publishSensor('yearlyDischarging', state.yearlyDischarging, 'kWh', 'energy');
    if (state.workingMode) await publishSensor('workingMode', state.workingMode);
    if (state.workingStatus) await publishSensor('workingStatus', state.workingStatus);
    if (state.ctStatus) await publishSensor('ctStatus', state.ctStatus);
    if (state.ctType) await publishSensor('ctType', state.ctType);
    if (state.phaseType) await publishSensor('phaseType', state.phaseType);
    if (state.rechargeMode) await publishSensor('rechargeMode', state.rechargeMode);
    if (state.surplusFeedIn !== undefined) await publishSensor('surplusFeedIn', state.surplusFeedIn);
    if (state.depthOfDischarge !== undefined) await publishSensor('depthOfDischarge', state.depthOfDischarge, '%');
    if (state.wifiSignal !== undefined) await publishSensor('wifiSignal', state.wifiSignal, 'dBm', 'signal_strength');
    if (state.wifiName) await publishSensor('wifiName', state.wifiName);
    if (state.inverterTemp !== undefined) await publishSensor('inverterTemp', state.inverterTemp, '°C', 'temperature');
    if (state.batteryTemp !== undefined) await publishSensor('batteryTemp', state.batteryTemp, '°C', 'temperature');
    if (state.batteryStatus) await publishSensor('batteryStatus', state.batteryStatus);
    if (state.errorCode !== undefined) await publishSensor('errorCode', state.errorCode);
    if (state.alarmCode !== undefined) await publishSensor('alarmCode', state.alarmCode);
    if (state.autoSwitchWorkingMode) await publishSensor('autoSwitchWorkingMode', state.autoSwitchWorkingMode);
    if (state.httpServerType) await publishSensor('httpServerType', state.httpServerType);

    // Version sensors
    if (state.bmsVersion) await publishSensor('bmsVersion', state.bmsVersion);
    if (state.mpptVersion) await publishSensor('mpptVersion', state.mpptVersion);
    if (state.inverterVersion) await publishSensor('inverterVersion', state.inverterVersion);
    if (state.emsVersion) await publishSensor('emsVersion', state.emsVersion);
    if (state.deviceVersion) await publishSensor('deviceVersion', state.deviceVersion);

    // Time-period sensors for 5 periods
    for (let i = 0; i < TIME_PERIOD_COUNT; i++) {
      const tp = state.timePeriods[i];
      if (tp.startHour !== undefined) await publishSensor(`timePeriod${i}StartHour`, tp.startHour, 'h');
      if (tp.startMinute !== undefined) await publishSensor(`timePeriod${i}StartMinute`, tp.startMinute, 'min');
      if (tp.endHour !== undefined) await publishSensor(`timePeriod${i}EndHour`, tp.endHour, 'h');
      if (tp.endMinute !== undefined) await publishSensor(`timePeriod${i}EndMinute`, tp.endMinute, 'min');
      if (tp.power !== undefined) await publishSensor(`timePeriod${i}Power`, tp.power, 'W', 'power');
      if (tp.enabled !== undefined) await publishSensor(`timePeriod${i}Enabled`, tp.enabled);
      if (tp.weekday !== undefined) await publishSensor(`timePeriod${i}Weekday`, tp.weekday);
    }

    // Publish cell-level data
    if (state.cellData) {
      for (const [cellKey, cellValue] of Object.entries(state.cellData)) {
        await publishSensor(`cell_${cellKey}`, cellValue, 'V', 'voltage');
      }
    }

    // Publish consolidated state JSON for advanced users
    if (client && client.connected) {
      await client.publishAsync(stateTopic, JSON.stringify({ ...state, ts: Date.now() }), { retain: false });
    }
  }

  async function publishAvailability() {
    if (!client || !client.connected) return;
    const isOnline = state.online && state.lastSeen && (Date.now() - state.lastSeen < (pollingInterval * 1000 * 3));
    await client.publishAsync(availabilityTopic, isOnline ? 'online' : 'offline', { retain: true });
  }

  async function sendCommandWithRetry(payload: string, maxRetries = 3) {
    if (!client || !client.connected) {
      logger.warn({ payload }, 'Cannot send command - not connected');
      return;
    }

    const retryKey = payload;
    const retryState = commandRetries.get(retryKey);

    async function attempt(attemptNum: number) {
      try {
        logger.debug({ payload, attempt: attemptNum }, 'Sending command');
        await client!.publishAsync(oldControlTopic, payload, { qos: 1 });
        await client!.publishAsync(newControlTopic, payload, { qos: 1 });
        commandRetries.delete(retryKey);
        logger.debug({ payload }, 'Command sent successfully');
      } catch (err) {
        logger.error({ err, payload, attempt: attemptNum }, 'Command failed');
        if (attemptNum < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attemptNum), 10000);
          const timer = setTimeout(() => attempt(attemptNum + 1), delay);
          commandRetries.set(retryKey, { attempt: attemptNum + 1, timer });
        } else {
          commandRetries.delete(retryKey);
          logger.error({ payload }, 'Command failed permanently after retries');
        }
      }
    }

    // Cancel any existing retry for this command
    if (retryState?.timer) clearTimeout(retryState.timer);
    commandRetries.delete(retryKey);

    await attempt(1);
  }

  async function poll() {
    await sendCommandWithRetry(Commands.refresh());
    if (pollCellData) {
      await sendCommandWithRetry(Commands.getBmsInfo());
    }
  }

  async function sendTimePeriodCommand(index: number) {
    const tp = state.timePeriods[index];
    if (!tp) return;

    const startTime = tp.startHour !== undefined && tp.startMinute !== undefined
      ? `${tp.startHour}:${tp.startMinute.toString().padStart(2, '0')}`
      : undefined;
    const endTime = tp.endHour !== undefined && tp.endMinute !== undefined
      ? `${tp.endHour}:${tp.endMinute.toString().padStart(2, '0')}`
      : undefined;

    const cmd = Commands.setTimePeriod(
      index,
      startTime,
      endTime,
      tp.enabled,
      tp.power,
      tp.weekday
    );
    logger.debug({ cmd, index, state: { startTime, endTime, enabled: tp.enabled, power: tp.power, weekday: tp.weekday } }, 'Sending time-period command');
    await sendCommandWithRetry(cmd);
  }

  async function publishDiscovery() {
    if (!client || !client.connected) {
      logger.warn('Cannot publish discovery - not connected');
      return;
    }

    const deviceInfo = {
      identifiers: [`${deviceType}_${deviceId}`],
      name: `Marstek Jupiter ${deviceType}`,
      manufacturer: 'HAME Energy',
      model: deviceType,
      sw_version: '1.0.0',
    };

    const sensors = [
      { name: 'SOC', objectId: 'soc', deviceTopic: 'soc', unit: '%', deviceClass: 'battery' },
      { name: 'Battery Energy', objectId: 'battery_energy', deviceTopic: 'batteryEnergy', unit: 'kWh', deviceClass: 'energy' },
      { name: 'Combined Power', objectId: 'combined_power', deviceTopic: 'combinedPower', unit: 'W', deviceClass: 'power' },
      { name: 'Grid Import', objectId: 'grid_import', deviceTopic: 'gridImport', unit: 'W', deviceClass: 'power' },
      { name: 'Grid Export', objectId: 'grid_export', deviceTopic: 'gridExport', unit: 'W', deviceClass: 'power' },
      { name: 'PV1 Power', objectId: 'pv1_power', deviceTopic: 'pv1Power', unit: 'W', deviceClass: 'power' },
      { name: 'PV2 Power', objectId: 'pv2_power', deviceTopic: 'pv2Power', unit: 'W', deviceClass: 'power' },
      { name: 'PV3 Power', objectId: 'pv3_power', deviceTopic: 'pv3Power', unit: 'W', deviceClass: 'power' },
      { name: 'PV4 Power', objectId: 'pv4_power', deviceTopic: 'pv4Power', unit: 'W', deviceClass: 'power' },
      { name: 'Daily Charging', objectId: 'daily_charging', deviceTopic: 'dailyCharging', unit: 'kWh', deviceClass: 'energy' },
      { name: 'Daily Discharging', objectId: 'daily_discharging', deviceTopic: 'dailyDischarging', unit: 'kWh', deviceClass: 'energy' },
      { name: 'Monthly Charging', objectId: 'monthly_charging', deviceTopic: 'monthlyCharging', unit: 'kWh', deviceClass: 'energy' },
      { name: 'Monthly Discharging', objectId: 'monthly_discharging', deviceTopic: 'monthlyDischarging', unit: 'kWh', deviceClass: 'energy' },
      { name: 'Yearly Charging', objectId: 'yearly_charging', deviceTopic: 'yearlyCharging', unit: 'kWh', deviceClass: 'energy' },
      { name: 'Yearly Discharging', objectId: 'yearly_discharging', deviceTopic: 'yearlyDischarging', unit: 'kWh', deviceClass: 'energy' },
      { name: 'WiFi Signal', objectId: 'wifi_signal', deviceTopic: 'wifiSignal', unit: 'dBm', deviceClass: 'signal_strength' },
      { name: 'WiFi Name', objectId: 'wifi_name', deviceTopic: 'wifiName' },
      { name: 'Depth of Discharge', objectId: 'depth_of_discharge', deviceTopic: 'depthOfDischarge', unit: '%' },
      { name: 'Inverter Temp', objectId: 'inverter_temp', deviceTopic: 'inverterTemp', unit: '°C', deviceClass: 'temperature' },
      { name: 'Battery Temp', objectId: 'battery_temp', deviceTopic: 'batteryTemp', unit: '°C', deviceClass: 'temperature' },
      { name: 'Battery Status', objectId: 'battery_status', deviceTopic: 'batteryStatus' },
      { name: 'Working Status', objectId: 'working_status', deviceTopic: 'workingStatus' },
      { name: 'CT Status', objectId: 'ct_status', deviceTopic: 'ctStatus' },
      { name: 'CT Type', objectId: 'ct_type', deviceTopic: 'ctType' },
      { name: 'Phase Type', objectId: 'phase_type', deviceTopic: 'phaseType' },
      { name: 'Recharge Mode', objectId: 'recharge_mode', deviceTopic: 'rechargeMode' },
      { name: 'Error Code', objectId: 'error_code', deviceTopic: 'errorCode' },
      { name: 'Alarm Code', objectId: 'alarm_code', deviceTopic: 'alarmCode' },
      { name: 'Auto Switch Working Mode', objectId: 'auto_switch_working_mode', deviceTopic: 'autoSwitchWorkingMode' },
      { name: 'HTTP Server Type', objectId: 'http_server_type', deviceTopic: 'httpServerType' },
      // Version sensors
      { name: 'BMS Version', objectId: 'bms_version', deviceTopic: 'bmsVersion' },
      { name: 'MPPT Version', objectId: 'mppt_version', deviceTopic: 'mpptVersion' },
      { name: 'Inverter Version', objectId: 'inverter_version', deviceTopic: 'inverterVersion' },
      { name: 'EMS Version', objectId: 'ems_version', deviceTopic: 'emsVersion' },
      { name: 'Device Version', objectId: 'device_version', deviceTopic: 'deviceVersion' },
    ];

    for (const sensor of sensors) {
      const discoveryTopic = `homeassistant/sensor/${deviceType}_${deviceId}/${sensor.objectId}/config`;
      const discoveryPayload: Record<string, unknown> = {
        name: sensor.name,
        state_topic: `${baseTopic}/${sensor.deviceTopic}`,
        availability_topic: availabilityTopic,
        unique_id: `${deviceType}_${deviceId}_${sensor.objectId}`,
        device: deviceInfo,
        value_template: `{{ value_json.value }}`,
      };
      if (sensor.unit) discoveryPayload.unit_of_measurement = sensor.unit;
      if (sensor.deviceClass) discoveryPayload.device_class = sensor.deviceClass;

      try {
        await client.publishAsync(discoveryTopic, JSON.stringify(discoveryPayload), { retain: true });
      } catch (err) {
        logger.error({ err, topic: discoveryTopic }, 'Failed to publish sensor discovery');
      }
    }

    // Switch for surplus feed-in
    const switchDiscoveryTopic = `homeassistant/switch/${deviceType}_${deviceId}/surplus_feed_in/config`;
    try {
      await client.publishAsync(switchDiscoveryTopic, JSON.stringify({
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
    } catch (err) {
      logger.error({ err }, 'Failed to publish switch discovery');
    }

    // Select for working mode
    const selectDiscoveryTopic = `homeassistant/select/${deviceType}_${deviceId}/working_mode/config`;
    try {
      await client.publishAsync(selectDiscoveryTopic, JSON.stringify({
        name: 'Working Mode',
        state_topic: `${baseTopic}/workingMode`,
        command_topic: `${controlTopic}/working-mode`,
        availability_topic: availabilityTopic,
        unique_id: `${deviceType}_${deviceId}_working_mode`,
        device: deviceInfo,
        options: ['automatic', 'manual'],
        value_template: `{{ value_json.value }}`,
      }), { retain: true });
    } catch (err) {
      logger.error({ err }, 'Failed to publish select discovery');
    }

    // Number for depth of discharge (DOD) 30-88%
    const numberDiscoveryTopic = `homeassistant/number/${deviceType}_${deviceId}/depth_of_discharge/config`;
    try {
      await client.publishAsync(numberDiscoveryTopic, JSON.stringify({
        name: 'Depth of Discharge',
        state_topic: `${baseTopic}/depthOfDischarge`,
        command_topic: `${controlTopic}/depth-of-discharge`,
        availability_topic: availabilityTopic,
        unique_id: `${deviceType}_${deviceId}_depth_of_discharge_number`,
        device: deviceInfo,
        min: 30,
        max: 88,
        step: 1,
        unit_of_measurement: '%',
        value_template: `{{ value_json.value }}`,
      }), { retain: true });
    } catch (err) {
      logger.error({ err }, 'Failed to publish number discovery');
    }

    // Buttons: Refresh, Factory Reset, Sync Time
    const buttons = [
      { name: 'Refresh', objectId: 'refresh', payload: 'PRESS' },
      { name: 'Factory Reset', objectId: 'factory_reset', payload: 'PRESS' },
      { name: 'Sync Time', objectId: 'sync_time', payload: 'PRESS' },
    ];

    for (const btn of buttons) {
      const btnTopic = `homeassistant/button/${deviceType}_${deviceId}/${btn.objectId}/config`;
      try {
        await client.publishAsync(btnTopic, JSON.stringify({
          name: btn.name,
          command_topic: `${controlTopic}/${btn.objectId}`,
          availability_topic: availabilityTopic,
          unique_id: `${deviceType}_${deviceId}_${btn.objectId}`,
          device: deviceInfo,
          payload_press: btn.payload,
        }), { retain: true });
      } catch (err) {
        logger.error({ err, objectId: btn.objectId }, 'Failed to publish button discovery');
      }
    }

    // Time-Period Entities for 5 periods (0-4)
    for (let i = 0; i < TIME_PERIOD_COUNT; i++) {
      // Number: Start Hour
      const tpStartHourTopic = `homeassistant/number/${deviceType}_${deviceId}/time_period_${i}_start_hour/config`;
      try {
        await client.publishAsync(tpStartHourTopic, JSON.stringify({
          name: `Time Period ${i} Start Hour`,
          state_topic: `${baseTopic}/timePeriod${i}StartHour`,
          command_topic: `${controlTopic}/time-period-${i}-start-hour`,
          availability_topic: availabilityTopic,
          unique_id: `${deviceType}_${deviceId}_time_period_${i}_start_hour`,
          device: deviceInfo,
          min: 0,
          max: 23,
          step: 1,
          unit_of_measurement: 'h',
          value_template: `{{ value_json.value }}`,
        }), { retain: true });
      } catch (err) {
        logger.error({ err, index: i }, 'Failed to publish time-period start-hour discovery');
      }

      // Number: Start Minute
      const tpStartMinuteTopic = `homeassistant/number/${deviceType}_${deviceId}/time_period_${i}_start_minute/config`;
      try {
        await client.publishAsync(tpStartMinuteTopic, JSON.stringify({
          name: `Time Period ${i} Start Minute`,
          state_topic: `${baseTopic}/timePeriod${i}StartMinute`,
          command_topic: `${controlTopic}/time-period-${i}-start-minute`,
          availability_topic: availabilityTopic,
          unique_id: `${deviceType}_${deviceId}_time_period_${i}_start_minute`,
          device: deviceInfo,
          min: 0,
          max: 59,
          step: 1,
          unit_of_measurement: 'min',
          value_template: `{{ value_json.value }}`,
        }), { retain: true });
      } catch (err) {
        logger.error({ err, index: i }, 'Failed to publish time-period start-minute discovery');
      }

      // Number: End Hour
      const tpEndHourTopic = `homeassistant/number/${deviceType}_${deviceId}/time_period_${i}_end_hour/config`;
      try {
        await client.publishAsync(tpEndHourTopic, JSON.stringify({
          name: `Time Period ${i} End Hour`,
          state_topic: `${baseTopic}/timePeriod${i}EndHour`,
          command_topic: `${controlTopic}/time-period-${i}-end-hour`,
          availability_topic: availabilityTopic,
          unique_id: `${deviceType}_${deviceId}_time_period_${i}_end_hour`,
          device: deviceInfo,
          min: 0,
          max: 23,
          step: 1,
          unit_of_measurement: 'h',
          value_template: `{{ value_json.value }}`,
        }), { retain: true });
      } catch (err) {
        logger.error({ err, index: i }, 'Failed to publish time-period end-hour discovery');
      }

      // Number: End Minute
      const tpEndMinuteTopic = `homeassistant/number/${deviceType}_${deviceId}/time_period_${i}_end_minute/config`;
      try {
        await client.publishAsync(tpEndMinuteTopic, JSON.stringify({
          name: `Time Period ${i} End Minute`,
          state_topic: `${baseTopic}/timePeriod${i}EndMinute`,
          command_topic: `${controlTopic}/time-period-${i}-end-minute`,
          availability_topic: availabilityTopic,
          unique_id: `${deviceType}_${deviceId}_time_period_${i}_end_minute`,
          device: deviceInfo,
          min: 0,
          max: 59,
          step: 1,
          unit_of_measurement: 'min',
          value_template: `{{ value_json.value }}`,
        }), { retain: true });
      } catch (err) {
        logger.error({ err, index: i }, 'Failed to publish time-period end-minute discovery');
      }

      // Number: Power
      const tpPowerTopic = `homeassistant/number/${deviceType}_${deviceId}/time_period_${i}_power/config`;
      try {
        await client.publishAsync(tpPowerTopic, JSON.stringify({
          name: `Time Period ${i} Power`,
          state_topic: `${baseTopic}/timePeriod${i}Power`,
          command_topic: `${controlTopic}/time-period-${i}-power`,
          availability_topic: availabilityTopic,
          unique_id: `${deviceType}_${deviceId}_time_period_${i}_power`,
          device: deviceInfo,
          min: 0,
          max: 10000,
          step: 1,
          unit_of_measurement: 'W',
          value_template: `{{ value_json.value }}`,
        }), { retain: true });
      } catch (err) {
        logger.error({ err, index: i }, 'Failed to publish time-period power discovery');
      }

      // Switch: Enabled
      const tpEnabledTopic = `homeassistant/switch/${deviceType}_${deviceId}/time_period_${i}_enabled/config`;
      try {
        await client.publishAsync(tpEnabledTopic, JSON.stringify({
          name: `Time Period ${i} Enabled`,
          state_topic: `${baseTopic}/timePeriod${i}Enabled`,
          command_topic: `${controlTopic}/time-period-${i}-enabled`,
          availability_topic: availabilityTopic,
          unique_id: `${deviceType}_${deviceId}_time_period_${i}_enabled`,
          device: deviceInfo,
          payload_on: 'on',
          payload_off: 'off',
          value_template: `{{ 'on' if value_json.value else 'off' }}`,
        }), { retain: true });
      } catch (err) {
        logger.error({ err, index: i }, 'Failed to publish time-period enabled discovery');
      }

      // Text: Weekday (0-6 bitmask)
      const tpWeekdayTopic = `homeassistant/text/${deviceType}_${deviceId}/time_period_${i}_weekday/config`;
      try {
        await client.publishAsync(tpWeekdayTopic, JSON.stringify({
          name: `Time Period ${i} Weekday`,
          state_topic: `${baseTopic}/timePeriod${i}Weekday`,
          command_topic: `${controlTopic}/time-period-${i}-weekday`,
          availability_topic: availabilityTopic,
          unique_id: `${deviceType}_${deviceId}_time_period_${i}_weekday`,
          device: deviceInfo,
          value_template: `{{ value_json.value }}`,
        }), { retain: true });
      } catch (err) {
        logger.error({ err, index: i }, 'Failed to publish time-period weekday discovery');
      }
    }

    discoveryPublished = true;
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
          resubscribe: true,
        };

        client = mqtt.connect(url, opts);

        client.on('connect', async () => {
          connected = true;
          reconnectCount = 0;
          logger.info('MQTT connected');

          try {
            await client!.subscribe([oldTopic, newTopic, `${controlTopic}/#`], { qos: 1 });
            logger.info('Subscribed to device topics');
          } catch (err) {
            logger.error({ err }, 'Subscription failed');
          }

          // Republish discovery after reconnection
          if (!discoveryPublished) {
            try {
              await publishDiscovery();
            } catch (err) {
              logger.error({ err }, 'Discovery publish failed');
            }
          }

          resolve();
        });

        client.on('reconnect', () => {
          reconnectCount++;
          logger.warn({ attempt: reconnectCount }, 'MQTT reconnecting...');
          connected = false;
          discoveryPublished = false;
        });

        client.on('message', async (topic, message) => {
          const msg = message.toString();
          logger.trace({ topic, msg }, 'Message received');

          if (topic === oldTopic || topic === newTopic) {
            const payload = parsePayload(msg);
            updateStateFromPayload(payload);
            await publishAllSensors();
            await publishAvailability();
          } else if (topic.startsWith(controlTopic)) {
            const command = topic.substring(controlTopic.length + 1);
            logger.debug({ command, value: msg }, 'Control command received');

            if (command === 'working-mode') {
              await sendCommandWithRetry(Commands.setWorkingMode(msg as 'automatic' | 'manual'));
            } else if (command === 'surplus-feed-in') {
              const enabled = msg === 'ON';
              await sendCommandWithRetry(Commands.setSurplusFeedIn(enabled));
            } else if (command === 'depth-of-discharge') {
              const depth = parseInt(msg, 10);
              if (!isNaN(depth)) {
                await sendCommandWithRetry(Commands.setDischargeDepth(depth));
              }
            } else if (command === 'refresh') {
              await sendCommandWithRetry(Commands.refresh());
            } else if (command === 'factory-reset') {
              await sendCommandWithRetry(Commands.factoryReset());
            } else if (command === 'sync-time') {
              await sendCommandWithRetry(Commands.syncTime());
            } else if (command.startsWith('time-period-')) {
              // Parse: time-period-{index}-{field}
              const match = command.match(/^time-period-(\d+)-(.+)$/);
              if (match) {
                const index = parseInt(match[1], 10);
                const field = match[2];
                if (index >= 0 && index < TIME_PERIOD_COUNT) {
                  if (!state.timePeriods[index]) state.timePeriods[index] = {};
                  const tp = state.timePeriods[index];

                  if (field === 'enabled') {
                    tp.enabled = msg === 'on';
                    await publishSensor(`timePeriod${index}Enabled`, tp.enabled);
                  } else if (field === 'start-hour') {
                    tp.startHour = parseInt(msg, 10);
                    await publishSensor(`timePeriod${index}StartHour`, tp.startHour, 'h');
                  } else if (field === 'start-minute') {
                    tp.startMinute = parseInt(msg, 10);
                    await publishSensor(`timePeriod${index}StartMinute`, tp.startMinute, 'min');
                  } else if (field === 'end-hour') {
                    tp.endHour = parseInt(msg, 10);
                    await publishSensor(`timePeriod${index}EndHour`, tp.endHour, 'h');
                  } else if (field === 'end-minute') {
                    tp.endMinute = parseInt(msg, 10);
                    await publishSensor(`timePeriod${index}EndMinute`, tp.endMinute, 'min');
                  } else if (field === 'power') {
                    tp.power = parseInt(msg, 10);
                    await publishSensor(`timePeriod${index}Power`, tp.power, 'W', 'power');
                  } else if (field === 'weekday') {
                    tp.weekday = parseInt(msg, 10);
                    await publishSensor(`timePeriod${index}Weekday`, tp.weekday);
                  }

                  await sendTimePeriodCommand(index);
                }
              }
            }
          }
        });

        client.on('error', (err) => {
          logger.error({ err }, 'MQTT error');
          connected = false;
        });

        client.on('close', () => {
          if (connected) {
            logger.warn('MQTT connection closed');
            connected = false;
            discoveryPublished = false;
          }
        });

        client.on('offline', () => {
          logger.warn('MQTT client offline');
          connected = false;
          discoveryPublished = false;
        });

        // Timeout for initial connection
        const timeout = setTimeout(() => {
          if (!connected) {
            reject(new Error(`MQTT connection timeout after ${responseTimeout}s`));
          }
        }, responseTimeout * 1000);

        client.on('connect', () => {
          clearTimeout(timeout);
        });
      });
    },

    async disconnect() {
      if (pollingTimer) clearInterval(pollingTimer);
      // Clear any pending retries
      for (const [, retryState] of commandRetries) {
        if (retryState.timer) clearTimeout(retryState.timer);
      }
      commandRetries.clear();

      if (client) {
        connected = false;
        discoveryPublished = false;
        try {
          await publishAvailability();
        } catch (err) {
          logger.error({ err }, 'Failed to publish offline availability');
        }
        client.end();
        client = null;
      }
    },

    async publishDiscovery() {
      return publishDiscovery();
    },

    startPolling() {
      if (pollingTimer) clearInterval(pollingTimer);
      poll().catch((err) => logger.error({ err }, 'Initial poll error'));
      pollingTimer = setInterval(() => {
        poll().catch((err) => logger.error({ err }, 'Poll error'));
      }, pollingInterval * 1000);
      logger.info({ interval: pollingInterval }, 'Polling loop started');
    },

    getConnected() {
      return connected && client !== null && client.connected;
    },
  };
}
