/**
 * Smoke test for Hame Cloud API
 * Run: npx ts-node scripts/test-hame-api.ts
 */
import { HameApiClient } from '../src/hameApi';

// Read credentials from environment variables (set before running)
// Usage: CLOUD_USERNAME="..." CLOUD_PASSWORD="..." npx ts-node scripts/test-hame-api.ts
const username = process.env['CLOUD_USERNAME'] || '';
const password = process.env['CLOUD_PASSWORD'] || '';

if (!username || !password) {
  console.error('Please set CLOUD_USERNAME and CLOUD_PASSWORD environment variables.');
  console.error('Example: $env:CLOUD_USERNAME="your-email"; $env:CLOUD_PASSWORD="your-password"; npx ts-node scripts/test-hame-api.ts');
  process.exit(1);
}

async function main() {
  console.log('Testing Hame Cloud API...\n');

  // Use a dummy logger (console)
  const logger = {
    info: console.log,
    warn: console.warn,
    error: console.error,
    debug: console.log,
  } as any;

  const client = new HameApiClient(
    logger,
  );

  try {
    console.log('Step 1: Login...');
    const ok = await client.login({
      username,
      password,
    });
    if (!ok) {
      console.error('Login failed');
      process.exit(1);
    }
    console.log(`Login success! Found ${devices.length} device(s).`);
    console.log('Devices:');
    for (const d of devices) {
      console.log(`  - ${d.name} (${d.type}, devid=${d.devid}, mac=${d.mac})`);
    }

    console.log('\nStep 2: Find target device (YOUR_MAC_ADDRESS_HEX)...');
    const device = await client.findDevice('YOUR_MAC_ADDRESS_HEX');
    if (device) {
      console.log(`Found: ${device.name} (${device.type}, v${device.version})`);
      if (device.salt) console.log(`Salt: ${device.salt}`);
    } else {
      console.log('Device NOT found in cloud list.');
    }

    console.log('\nAll tests passed ✅');
  } catch (err: any) {
    console.error('\nTest failed ❌');
    console.error(err.message);
    if (err.responseBody) {
      console.error('Response body:', err.responseBody);
    }
    process.exit(1);
  }
}

main();
