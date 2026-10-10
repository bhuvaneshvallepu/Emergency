import { useEffect } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';

function MapCenter({ center, visible }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: false });
    map.invalidateSize({ pan: false });
  }, [center, map, visible]);

  return null;
}

export default function ServiceMap({ center, locationPermission, services, onSelect, visible }) {
  return (
    <div className="h-[42vh] min-h-72 sm:h-[480px]">
      <MapContainer center={center} zoom={14} scrollWheelZoom className="h-full w-full">
        <MapCenter center={center} visible={visible} />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        <Marker position={center}>
          <Popup>{locationPermission === 'granted' ? 'Your device location' : 'Manually selected reference location'}</Popup>
        </Marker>
        {services.filter((item) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))).map((item) => (
          <Marker
            key={item.id}
            position={[Number(item.latitude), Number(item.longitude)]}
            eventHandlers={{ click: () => onSelect(item) }}
          >
            <Popup>
              <div>
                <strong>{item.name}</strong>
                <p>{item.address}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
