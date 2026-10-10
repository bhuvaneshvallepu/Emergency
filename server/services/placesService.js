import axios from 'axios';

const validCategories = new Set(['hospital', 'police', 'fire', 'all']);

const demoFacilities = [
  {
    id: 'facility-1',
    name: 'KPHB Colony Multi-Speciality Hospital',
    category: 'hospital',
    latitude: 17.4474,
    longitude: 78.3911,
    address: 'KPHB Colony, Hyderabad, Telangana, India',
    phone: 'Not available in demo mode',
    verified: false,
    demo: true,
  },
  {
    id: 'facility-2',
    name: 'KPHB Police Station',
    category: 'police',
    latitude: 17.4485,
    longitude: 78.3928,
    address: 'Near KPHB Main Road, Hyderabad, Telangana, India',
    phone: 'Not available in demo mode',
    verified: false,
    demo: true,
  },
  {
    id: 'facility-3',
    name: 'KPHB Fire Station',
    category: 'fire',
    latitude: 17.4453,
    longitude: 78.3895,
    address: 'KPHB Phase 1, Hyderabad, Telangana, India',
    phone: 'Not available in demo mode',
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

function normalizeCategory(category) {
  const current = String(category || 'hospital').trim().toLowerCase();
  return validCategories.has(current) ? current : 'hospital';
}

export async function findNearbyServices({ lat, lng, category = 'hospital' }) {
  const normalizedLat = Number(lat);
  const normalizedLng = Number(lng);
  const normalizedCategory = normalizeCategory(category);

  if (!Number.isFinite(normalizedLat) || !Number.isFinite(normalizedLng) || normalizedLat < -90 || normalizedLat > 90 || normalizedLng < -180 || normalizedLng > 180) {
    throw new Error('Latitude and longitude must be valid geographic coordinates.');
  }

  const apiKey = process.env.PLACES_API_KEY;

  if (!apiKey) {
    const facilities = demoFacilities
      .filter((facility) => normalizedCategory === 'all' || facility.category === normalizedCategory)
      .map((facility) => ({
        ...facility,
        distanceKm: Number(calculateDistanceKm(normalizedLat, normalizedLng, facility.latitude, facility.longitude).toFixed(2)),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return {
      mode: 'demo',
      label: 'Demo data — not live verified service data',
      facilities,
    };
  }

  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', {
      params: {
        location: `${normalizedLat},${normalizedLng}`,
        radius: 5000,
        type: normalizedCategory === 'all' ? 'hospital' : normalizedCategory,
        key: apiKey,
      },
    });

    return {
      mode: 'live',
      label: 'Live provider results',
      facilities: (response.data.results || []).slice(0, 10).map((item) => ({
        id: item.place_id,
        name: item.name,
        category: normalizedCategory,
        latitude: item.geometry?.location?.lat,
        longitude: item.geometry?.location?.lng,
        address: item.vicinity || 'Address unavailable',
        phone: item.formatted_phone_number || 'Not available from provider',
        distanceKm: Number(calculateDistanceKm(normalizedLat, normalizedLng, item.geometry?.location?.lat, item.geometry?.location?.lng).toFixed(2)),
        verified: Boolean(item.business_status),
        demo: false,
      })),
    };
  } catch (error) {
    return {
      mode: 'demo',
      label: 'Provider unavailable — using demo fallback',
      facilities: demoFacilities
        .filter((facility) => normalizedCategory === 'all' || facility.category === normalizedCategory)
        .map((facility) => ({
          ...facility,
          distanceKm: Number(calculateDistanceKm(normalizedLat, normalizedLng, facility.latitude, facility.longitude).toFixed(2)),
        })),
    };
  }
}
