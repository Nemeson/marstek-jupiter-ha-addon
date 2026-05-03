/**
 * Real MQTT Cloud Bridge Test for Marstek Jupiter C+
 * Connects to Hame Cloud MQTT over TLS and tries to subscribe to device topics
 * 
 * Usage:
 *   $env:CLOUD_USERNAME="..."; $env:CLOUD_PASSWORD="..."; npx ts-node scripts/test-mqtt-bridge.ts
 */

import mqtt from 'mqtt';
import { HameApiClient } from '../src/hameApi';
import { buildDeviceTopic, buildControlTopic } from '../src/encryption';

const username = process.env['CLOUD_USERNAME'] || '';
const password = process.env['CLOUD_PASSWORD'] || '';

if (!username || !password) {
  console.error('Please set CLOUD_USERNAME and CLOUD_PASSWORD environment variables.');
  process.exit(1);
}

const DEVICE_TYPE = 'JPLS-8H';
const DEVICE_ID = 'YOUR_DEVICE_ID';
const BROKER_ID = 'hame-2025';
const CLOUD_BROKER = process.env['CLOUD_BROKER_URL'] || '';

async function main() {
  console.log('=== Real MQTT Cloud Bridge Test ===\n');

  // Step 1: Login to Hame API to verify credentials and get context
  console.log('Step 1: Hame API Login...');
  const logger = {
    info: console.log,
    warn: console.warn,
    error: console.error,
    debug: (...args: any[]) => {}, // silent debug
    trace: (...args: any[]) => {},
  };
  const hameApi = new HameApiClient(logger as any);
  const loggedIn = await hameApi.login({ username, password });
  if (!loggedIn) {
    console.error('Hame API login failed!');
    process.exit(1);
  }
  console.log('Hame API login: OK\n');

  // Step 2: Build MQTT topics for the device
  const { oldTopic, newTopic } = buildDeviceTopic(BROKER_ID, DEVICE_TYPE, DEVICE_ID);
  const { oldControlTopic, newControlTopic } = buildControlTopic(BROKER_ID, DEVICE_TYPE, DEVICE_ID);

  console.log('Step 2: MQTT Topics:');
  console.log(`  Device (old): ${oldTopic}`);
  console.log(`  Device (new): ${newTopic}`);
  console.log(`  Control (old): ${oldControlTopic}`);
  console.log(`  Control (new): ${newControlTopic}`);

  if (!CLOUD_BROKER) {
    console.error(`
ERROR: CLOUD_BROKER_URL is not set!`);
    console.error(`  The Hame Cloud MQTT broker address could not be determined.`);
    console.error(`  Please set CLOUD_BROKER_URL, e.g.:`);
    console.error(`    $env:CLOUD_BROKER_URL="mqtts://<broker>:<port>"`);
    console.error(`  Or discover it from the Marstek app traffic / device provisioning.`);
    process.exit(1);
  }

  // Step 3: Connect to Cloud MQTT over TLS
  console.log(`\nStep 3: Connecting to ${CLOUD_BROKER} ...`);

  const client = mqtt.connect(CLOUD_BROKER, {
    clientId: `test-bridge-${DEVICE_ID}-${Date.now()}`,
    // Hame MQTT uses the Hame account email as username and password directly
    username: username,
    password: password,
    reconnectPeriod: 10000,
    connectTimeout: 30000,
    clean: true,
    rejectUnauthorized: true,
  });

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.error('\nMQTT connection timeout (30s)');
      client.end();
      reject(new Error('MQTT connection timeout'));
    }, 35000);

    client.on('connect', () => {
      console.log('MQTT Cloud broker: CONNECTED ✓');
      clearTimeout(timeout);

      // Subscribe to both old and new topic patterns
      const topics = [oldTopic, newTopic, oldControlTopic, newControlTopic];
      console.log('\nStep 4: Subscribing to topics...');
      
      client.subscribe(topics, { qos: 1 }, (err, granted) => {
        if (err) {
          console.error('Subscribe failed:', err.message);
          client.end();
          reject(err);
          return;
        }
        console.log('Subscribe results:');
        for (const g of granted || []) {
          console.log(`  ${g.topic} → qos ${g.qos}`);
        }

        // Wait for messages
        console.log('\nStep 5: Listening for messages (30 seconds)...');
        console.log('Press Ctrl+C to stop early\n');

        let msgCount = 0;
        const msgTimeout = setTimeout(() => {
          console.log(`\nNo messages received in 30s.`);
          console.log(`(This is normal if the device isn't publishing right now)`);
          client.end();
          resolve();
        }, 30000);

        client.on('message', (topic, message) => {
          msgCount++;
          const msgStr = message.toString();
          console.log(`\n[MESSAGE #${msgCount}] Topic: ${topic}`);
          console.log(`Payload: ${msgStr.substring(0, 500)}${msgStr.length > 500 ? '...' : ''}`);
          
          // Stop after first message for quick test
          clearTimeout(msgTimeout);
          client.end();
          resolve();
        });
      });
    });

    client.on('error', (err) => {
      console.error('\nMQTT Error:', err.message);
    });

    client.on('offline', () => {
      console.error('\nMQTT Client went offline');
    });

    client.on('close', () => {
      console.log('\nMQTT Connection closed');
    });
  });
}

main().then(() => {
  console.log('\nTest completed.');
  process.exit(0);
}).catch((err) => {
  console.error('\nTest failed:', err.message);
  process.exit(1);
});