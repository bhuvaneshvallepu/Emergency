import { useEffect, useState } from 'react';

export function useGeolocation() {
  const [manualLocation, setManualLocation] = useState({ latitude: 17.4474, longitude: 78.3911 });
  const [location, setLocation] = useState({ latitude: 17.4474, longitude: 78.3911, permission: 'reading' });

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocation({ latitude: 17.4474, longitude: 78.3911, permission: 'unsupported' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          permission: 'granted',
        };
        setLocation(nextLocation);
        setManualLocation(nextLocation);
      },
      () => {
        setLocation({ latitude: 17.4474, longitude: 78.3911, permission: 'denied' });
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
