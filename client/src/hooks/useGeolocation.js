import { useEffect, useState } from 'react';

const DEFAULT_REFERENCE_LOCATION = { latitude: 17.4474, longitude: 78.3911 };

export function useGeolocation() {
  const [manualLocation, setManualLocation] = useState(DEFAULT_REFERENCE_LOCATION);
  const [location, setLocation] = useState({ ...DEFAULT_REFERENCE_LOCATION, permission: 'demo-reference' });

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocation({ ...DEFAULT_REFERENCE_LOCATION, permission: 'unsupported' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        setLocation({ ...DEFAULT_REFERENCE_LOCATION, permission: 'demo-reference' });
      },
      () => {
        setLocation({ ...DEFAULT_REFERENCE_LOCATION, permission: 'denied' });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  return {
    ...manualLocation,
    permission: location.permission,
    setManualLocation,
  };
}
