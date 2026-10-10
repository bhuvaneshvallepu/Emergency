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
