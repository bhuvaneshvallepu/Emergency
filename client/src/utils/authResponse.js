export function readAuthResponse(data) {
  const token = typeof data?.token === 'string' ? data.token.trim() : '';
  const user = data?.user;

  if (
    !token
    || typeof user?.id !== 'string'
    || !user.id
    || typeof user.name !== 'string'
    || !user.name
    || typeof user.email !== 'string'
    || !user.email
  ) {
    return null;
  }

  return { token, user };
}

export function getAuthResponseIssue(data) {
  const payload = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  if (typeof payload.token !== 'string' || !payload.token.trim()) {
    return 'Missing token';
  }
  if (!payload.user || typeof payload.user !== 'object' || Array.isArray(payload.user)) {
    return 'Missing user profile';
  }

  const missingFields = ['id', 'name', 'email'].filter((field) => (
    typeof payload.user[field] !== 'string' || !payload.user[field].trim()
  ));
  return missingFields.length ? `Missing user profile fields: ${missingFields.join(', ')}` : null;
}
