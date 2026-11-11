import { db, save } from './store';
import { hashPassword } from './auth';
import { DEMO_ACCOUNTS } from './seed';

/** Creates demo credentials once; never writes to Supabase. */
export function ensureDemoAccounts() {
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
