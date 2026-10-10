import axios from 'axios';

const demoFacilities = [
  {
    id: 'facility-1',
    name: 'Mercy General Hospital',
    category: 'hospital',
    latitude: 40.715,
    longitude: -74.009,
    address: '24 Willow Ave, New York, NY',
    phone: '+1-212-555-1000',
    distanceKm: 0.7,
    verified: false,
    demo: true,
  },
  {
    id: 'facility-2',
    name: 'City Police Precinct 8',
    category: 'police',
    latitude: 40.713,
    longitude: -74.002,
    address: '142 East 8th St, New York, NY',
    phone: '+1-212-555-3100',
    distanceKm: 1.1,
    verified: false,
    demo: true,
  },
  {
    id: 'facility-3',
    name: 'Harbor Fire Station 5',
    category: 'fire',
    latitude: 40.718,
    longitude: -74.015,
    address: '88 River Street, New York, NY',
    phone: '+1-212-555-4200',
    distanceKm: 1.4,
    verified: false,
    demo: true,
  },
];

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function findNearbyServices({ lat, lng, category = 'hospital' }) {
  if (!lat || !lng) {
    throw new Error('Location coordinates are required.');
  }

  const apiKey = process.env.PLACES_API_KEY;

  if (!apiKey) {
    const facilities = demoFacilities
      .filter((facility) => facility.category === category || category === 'all')
      .map((facility) => ({
        ...facility,
        distanceKm: Number(calculateDistanceKm(lat, lng, facility.latitude, facility.longitude).toFixed(2)),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return {
      mode: 'demo',
      label: 'Demo data – not live verified service data',
      facilities,
    };
  }

  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', {
      params: {
        location: `${lat},${lng}`,
        radius: 5000,
        type: category,
        key: apiKey,
      },
    });

    return {
      mode: 'live',
      label: 'Live provider results',
      facilities: (response.data.results || []).slice(0, 10).map((item) => ({
        id: item.place_id,
        name: item.name,
        category,
        latitude: item.geometry?.location?.lat,
        longitude: item.geometry?.location?.lng,
        address: item.vicinity,
        phone: item.formatted_phone_number || 'Not available',
        distanceKm: Number(calculateDistanceKm(lat, lng, item.geometry?.location?.lat, item.geometry?.location?.lng).toFixed(2)),
        verified: !!item.business_status,
      })),
    };
  } catch (error) {
    return {
      mode: 'demo',
      label: 'Provider unavailable – using demo mode fallback',
      facilities: demoFacilities
        .filter((facility) => facility.category === category || category === 'all')
        .map((facility) => ({
          ...facility,
          distanceKm: Number(calculateDistanceKm(lat, lng, facility.latitude, facility.longitude).toFixed(2)),
        })),
    };
  }
}
