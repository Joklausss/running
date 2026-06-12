import { useRef, useState } from 'react';

/**
 * Optional heart-rate monitor over Web Bluetooth (standard Heart Rate Service
 * 0x180D / measurement 0x2A37). Degrades gracefully: `supported` is false on
 * browsers without Web Bluetooth, and connect() is simply never offered.
 */
export function useHeartRate() {
  const hrRef = useRef<number | null>(null);
  const [hr, setHr] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Web Bluetooth isn't in the standard TS DOM lib → access via a cast.
  const nav = navigator as unknown as { bluetooth?: { requestDevice: Function } };
  const supported = typeof navigator !== 'undefined' && !!nav.bluetooth;

  async function connect() {
    if (!supported) return;
    setError(null);
    try {
      const device: any = await nav.bluetooth!.requestDevice({
        filters: [{ services: ['heart_rate'] }],
      });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const char = await service.getCharacteristic('heart_rate_measurement');
      await char.startNotifications();
      char.addEventListener('characteristicvaluechanged', (e: any) => {
        const v: DataView = e.target.value;
        const flags = v.getUint8(0);
        const is16 = flags & 0x1;
        const bpm = is16 ? v.getUint16(1, true) : v.getUint8(1);
        hrRef.current = bpm;
        setHr(bpm);
      });
      device.addEventListener('gattserverdisconnected', () => setConnected(false));
      setConnected(true);
    } catch {
      setError('Connexion à la ceinture cardio impossible.');
    }
  }

  return { hr, hrRef, supported, connected, error, connect };
}
