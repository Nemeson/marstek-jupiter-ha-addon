#!/usr/bin/env node
/**
 * Local network scanner to find Marstek Jupiter C+
 * Usage: node find-device.js
 */
const { exec } = require('child_process');
const util = require('util');
const os = require('os');
const net = require('net');
const dns = require('dns');

const execAsync = util.promisify(exec);
const MAC_PATTERN = /XX:XX:XX:XX:XX:XX/i;
const HOSTNAME_PATTERN = /marstek/i;
const KNOWN_PORTS = [80, 8080, 1883, 8883]; // HTTP, HTTP-Alt, MQTT, MQTT-TLS

function getLocalNetworks() {
  const interfaces = os.networkInterfaces();
  const networks = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal && addr.netmask) {
        const ipParts = addr.address.split('.');
        const maskParts = addr.netmask.split('.');
        const network = ipParts.map((p, i) => (parseInt(p) & parseInt(maskParts[i]))).join('.');
        networks.push({ interface: name, ip: addr.address, network, netmask: addr.netmask });
      }
    }
  }
  return networks;
}

async function scanWithArp(network) {
  console.log(`Scanning ${network} via ARP...`);
  const results = [];
  try {
    // Windows: arp -a to get ARP table
    const { stdout } = await execAsync('arp -a');
    const lines = stdout.split('\n');
    for (const line of lines) {
      // Parse ARP entry:   192.168.178.45     24-21-5e-db-48-c9   dynamisch
      const match = line.match(/(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F-:]{17})/);
      if (match) {
        const ip = match[1];
        const mac = match[2].toLowerCase();
        if (mac.includes('24-21-5e') || mac.includes('24:21:5e')) {
          results.push({ ip, mac: mac.replace(/-/g, ':') });
        }
      }
    }
  } catch (e) {
    console.error('ARP scan failed:', e.message);
  }
  return results;
}

async function pingSweep(network) {
  console.log(`Ping sweep on ${network}.0/24...`);
  const promises = [];
  for (let i = 1; i < 255; i++) {
    const ip = `${network}.${i}`;
    promises.push(
      new Promise((resolve) => {
        exec(`ping -n 1 -w 1000 ${ip}`, (err, stdout) => {
          if (!err && stdout.includes('TTL=')) {
            resolve(ip);
          } else {
            resolve(null);
          }
        });
      })
    );
  }
  const results = await Promise.all(promises);
  return results.filter(Boolean);
}

async function checkPort(ip, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
    socket.connect(port, ip);
  });
}

async function reverseDns(ip) {
  return new Promise((resolve) => {
    dns.reverse(ip, (err, hostnames) => {
      resolve(err ? [] : hostnames);
    });
  });
}

async function findDevice() {
  console.log('=== Marstek Jupiter C+ Local Network Scanner ===\n');
  console.log('Target MAC: XX:XX:XX:XX:XX:XX');
  console.log('Target Hostname: marstek*\n');

  const networks = getLocalNetworks();
  console.log('Local networks found:');
  for (const n of networks) {
    console.log(`  ${n.interface}: ${n.ip} (${n.network}.0/24)`);
  }
  console.log();

  let candidates = [];

  // Method 1: ARP table
  for (const n of networks) {
    const arpResults = await scanWithArp(n.network);
    candidates.push(...arpResults);
  }

  if (candidates.length > 0) {
    console.log('\nDevice found via ARP:');
    for (const c of candidates) {
      console.log(`  IP: ${c.ip}, MAC: ${c.mac}`);
    }
  }

  // Method 2: Ping sweep + hostname check
  const activeHosts = [];
  for (const n of networks) {
    const hosts = await pingSweep(n.network);
    activeHosts.push(...hosts);
  }

  console.log(`\n${activeHosts.length} active hosts found.`);

  // Check hostnames and ports
  for (const ip of activeHosts) {
    const hostnames = await reverseDns(ip);
    const isMarstek = hostnames.some(h => HOSTNAME_PATTERN.test(h));
    if (isMarstek) {
      console.log(`\n✅ Found by hostname: ${ip} (${hostnames.join(', ')})`);
      candidates.push({ ip, hostname: hostnames[0] });
    }
  }

  // Port scan on candidates
  const uniqueCandidates = [...new Map(candidates.map(c => [c.ip, c])).values()];

  if (uniqueCandidates.length === 0) {
    console.log('\n❌ Device not found. Trying port scan on all active hosts...');
    for (const ip of activeHosts.slice(0, 20)) { // Limit to first 20 for speed
      for (const port of KNOWN_PORTS) {
        const open = await checkPort(ip, port);
        if (open) {
          console.log(`  ${ip}:${port} OPEN`);
          uniqueCandidates.push({ ip, port });
        }
      }
    }
  }

  // Final report
  console.log('\n=== Results ===');
  if (uniqueCandidates.length === 0) {
    console.log('❌ No Marstek device found on the local network.');
    console.log('Suggestions:');
    console.log('  1. Check if the device is powered on and connected to WiFi.');
    console.log('  2. Verify the MAC address on the device label.');
    console.log('  3. Check your router admin page for connected devices.');
  } else {
    console.log(`✅ Found ${uniqueCandidates.length} candidate(s):`);
    for (const c of uniqueCandidates) {
      console.log(`  IP: ${c.ip}${c.mac ? `, MAC: ${c.mac}` : ''}${c.hostname ? `, Hostname: ${c.hostname}` : ''}`);
      for (const port of KNOWN_PORTS) {
        const open = await checkPort(c.ip, port);
        console.log(`    Port ${port}: ${open ? 'OPEN ✅' : 'closed'}`);
      }
    }
  }

  // Try HTTP API test
  if (uniqueCandidates.length > 0) {
    const testIp = uniqueCandidates[0].ip;
    console.log(`\n=== Testing HTTP API on ${testIp}:80 ===`);
    try {
      const { stdout } = await execAsync(`curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://${testIp}:80/`);
      console.log(`HTTP Status: ${stdout}`);
    } catch (e) {
      console.log(`HTTP connection failed: ${e.message}`);
    }
  }
}

findDevice().catch(console.error);
