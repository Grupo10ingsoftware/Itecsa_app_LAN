export function generateUsername(firstName, lastName) {
  const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z]/g, '')
  const name = normalize(firstName)
  const surname = normalize(lastName)
  return name && surname ? `${name.slice(0, 2)}.${surname}` : ''
}
