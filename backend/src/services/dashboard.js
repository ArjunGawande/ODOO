import { db } from '../lib/db';

import { sellablePlansQuery } from './plans';

/**
 * The dashboard's counts in one query. `onDate` is a YYYY-MM-DD string. "On sale"
 * is the same filter listSellablePlans uses, so the card and the list can't disagree.
 * Returns { activeProducts, activePlans, plansOnSale, customers }.
 */
export async function getDashboardCounts(onDate, trx = db) {
  const count = (query, alias) => query.count('*').as(alias);
  return trx
    .select(
      count(trx('products').where('is_active', true), 'activeProducts'),
      count(trx('plans').where('is_active', true), 'activePlans'),
      count(sellablePlansQuery(onDate, trx), 'plansOnSale'),
      count(trx('users').where({ role: 'customer', is_active: true }), 'customers'),
    )
    .first();
}
