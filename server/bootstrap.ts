import { db, save } from './store';
import { hashPassword } from './auth';
import { DEMO_ACCOUNTS } from './seed';
import { dataMode } from './supabase';

/** Creates demo credentials once for the isolated demo mode; never in the real project. */
export function ensureDemoAccounts() {
  if (dataMode() === 'supabase') return;
  let changed = false;
  for (const account of DEMO_ACCOUNTS) {
    const user = db.users.find((u) => u.email === account.email);
    if (user && !db.passwordHashes[user.id]) {
      db.passwordHashes[user.id] = hashPassword(account.password);
      changed = true;
    }
  }
  if (changed) save();
}
