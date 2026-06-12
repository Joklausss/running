#!/usr/bin/env node
/**
 * Prints the LAN URL (and a QR-code link) so you can quickly open the app on a smartphone.
 * Usage: node scripts/lan-url.mjs [port]   (default port: 5180)
 */
import { networkInterfaces } from 'os';

const port = process.argv[2] ?? '5180';

function getLanIp() {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

const ip = getLanIp();
if (!ip) {
  console.error('Could not find a LAN IP address. Are you connected to a network?');
  process.exit(1);
}

const url = `http://${ip}:${port}`;
const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;

console.log('');
console.log('  ┌─────────────────────────────────────────┐');
console.log(`  │  Local network URL: ${url.padEnd(20)} │`);
console.log('  │                                         │');
console.log('  │  Scan QR code in your browser:          │');
console.log(`  │  ${qr.slice(0, 41)} │`);
console.log(`  │  ${qr.slice(41).padEnd(41)} │`);
console.log('  └─────────────────────────────────────────┘');
console.log('');
console.log('  Note: GPS tracking requires HTTPS.');
console.log('  For GPS on LAN, use: npx ngrok http ' + port);
console.log('');
