import { useEffect, useState } from 'react';

const DEFAULT_REFERENCE_LOCATION = { latitude: 17.4474, longitude: 78.3911 };

export function useGeolocation() {
  const [manualLocation, setManualLocation] = useState(DEFAULT_REFERENCE_LOCATION);
  const [manualLocationEntered, setManualLocationEntered] = useState(false);
  const [location, setLocation] = useState(() => ({
    ...DEFAULT_REFERENCE_LOCATION,
    permission: typeof navigator !== 'undefined' && navigator.geolocation ? 'reading' : 'unsupported',
  }));

  useEffect(() => {
    let active = true;
    if (!navigator.geolocation) {
      return () => { active = false; };
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!active) return;
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          permission: 'granted',
        });
      },
      () => {
        if (active) setLocation({ ...DEFAULT_REFERENCE_LOCATION, permission: 'denied' });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
    return () => { active = false; };
  }, []);

  const updateManualLocation = (update) => {
    setManualLocation((previous) => (typeof update === 'function' ? update(previous) : update));
    setManualLocationEntered(true);
  };

  return {
    ...(location.permission === 'granted' ? location : manualLocation),
    permission: location.permission,
    manualLocationEntered,
    setManualLocation: updateManualLocation,
  };
}
