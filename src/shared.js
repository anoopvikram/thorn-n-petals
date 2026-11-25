const storageKeyPrefix = 'petals-';

export function formatPrice(amount) {
  return '₹' + amount.toLocaleString('en-IN');
}

export function formatPickupTime(timestamp) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(timestamp);
}

export function readSavedValue(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(storageKeyPrefix + key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveValue(key, value) {
  localStorage.setItem(storageKeyPrefix + key, JSON.stringify(value));
}

export async function requestApi(endpoint, body) {
  const options = body === undefined
    ? {cache:'no-store'}
    : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      };
  const response = await fetch('/api/' + endpoint, options);
  const data = await response.json().catch(() => ({ message: 'Unable to reach the café.' }));
  if (!response.ok) throw Error(data.message);
  return data;
}

// Keep existing imports working until their call sites move to the named helpers.
export {
  formatPrice as money,
  formatPickupTime as when,
  readSavedValue as read,
  saveValue as save,
  requestApi as api,
};
