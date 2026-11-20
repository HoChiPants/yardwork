const lifetime = 24 * 60 * 60 * 1000;

export function freshStoreCheck(checkedAt: string, now: number) {
  const age = now - Date.parse(checkedAt);
  return age >= 0 && age < lifetime;
}

export function nextStoreCheckChange(checks: readonly { checkedAt: string }[], now: number) {
  let next = Infinity;
  for (const { checkedAt } of checks) {
    const checked = Date.parse(checkedAt);
    const change = checked > now ? checked : checked + lifetime;
    if (change > now) next = Math.min(next, change);
  }
  return Number.isFinite(next) ? next : null;
}
