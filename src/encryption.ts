/**
 * Topic ID Encryption for Marstek/Hame Cloud Broker
 * AES-128-CBC with zero IV (matching hame-relay / hm2mqtt behavior)
 */

import crypto from 'crypto';

// Static key used by hm2mqtt for legacy topics
const STATIC_KEY = '!@#$%^&*()_+{}[]';

/**
 * Calculate encrypted topic ID for newer broker generation (hame-2025 / marstek_energy)
 * Uses AES-128-CBC with a zero-initialized IV
 */
export function calculateNewVersionTopicId(key: string | Buffer, mac: string): string {
  const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key, 'ascii');
  const iv = Buffer.alloc(16, 0);
  const cipher = crypto.createCipheriv('aes-128-cbc', keyBuffer.slice(0, 16), iv);
  const encrypted = Buffer.concat([cipher.update(mac, 'ascii'), cipher.final()]);
  return encrypted.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Get encryption key for a given broker ID
 */
export function getBrokerKey(brokerId: string): string {
  if (brokerId === 'hame-2025') {
    // hame-2025 broker uses the static key for encryption
    return STATIC_KEY;
  }
  // hame-2024 and older use plain MAC without encryption
  return '';
}

/**
 * Check if a broker ID requires encrypted topic IDs
 */
export function requiresEncryption(brokerId: string): boolean {
  return brokerId === 'hame-2025';
}

/**
 * Build device topic with optional encryption
 */
export function buildDeviceTopic(
  brokerId: string,
  deviceType: string,
  deviceId: string
): { oldTopic: string; newTopic: string } {
  const oldTopic = `hame_energy/${deviceType}/device/${deviceId}/ctrl`;

  if (requiresEncryption(brokerId)) {
    const key = getBrokerKey(brokerId);
    const encryptedId = calculateNewVersionTopicId(key, deviceId);
    const newTopic = `marstek_energy/${deviceType}/device/${encryptedId}/ctrl`;
    return { oldTopic, newTopic };
  }

  // For hame-2024, both topics use plain deviceId
  const newTopic = `marstek_energy/${deviceType}/device/${deviceId}/ctrl`;
  return { oldTopic, newTopic };
}

/**
 * Build control topic with optional encryption
 */
export function buildControlTopic(
  brokerId: string,
  deviceType: string,
  deviceId: string
): { oldControlTopic: string; newControlTopic: string } {
  const oldControlTopic = `hame_energy/${deviceType}/App/${deviceId}/ctrl`;

  if (requiresEncryption(brokerId)) {
    const key = getBrokerKey(brokerId);
    const encryptedId = calculateNewVersionTopicId(key, deviceId);
    const newControlTopic = `marstek_energy/${deviceType}/App/${encryptedId}/ctrl`;
    return { oldControlTopic, newControlTopic };
  }

  const newControlTopic = `marstek_energy/${deviceType}/App/${deviceId}/ctrl`;
  return { oldControlTopic, newControlTopic };
}
