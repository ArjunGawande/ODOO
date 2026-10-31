import { isValidDateString, todayInBusinessTz } from '../lib/dates';
import { db } from '../lib/db';
import { isUniqueViolation } from '../lib/errors';
import { DEFAULT_PAGE_SIZE, likePattern } from '../lib/pagination';

const NAME_INDEX = 'plans_name_active_unique';

/**
 * A failure the user can act on. `code` is name_taken, not_found or archived, and
 * `field` names the form field the message belongs to, when there is one.
 */
export class PlanError extends Error {
  constructor(code, message, field) {
    super(message);
    this.name = 'PlanError';
    this.code = code;
    this.field = field;
  }
}

function nameTaken(name) {
  return new PlanError('name_taken', `An active plan is already called "${name}".`, 'name');
}

function notFound() {
  return new PlanError('not_found', 'This plan no longer exists.');
}

function assertDate(value) {
  if (!isValidDateString(value)) throw new TypeError(`Invalid date: ${String(value)}`);
}

// Options are written on every save. Knex drops undefined keys from an update,
// so an option missing here would silently keep its old value.
function planColumns(values) {
  return {
    name: values.name,
    price: values.price,
    billing_period: values.billing_period,
    min_quantity: values.min_quantity,
    start_date: values.start_date,
    end_date: values.end_date,
    auto_close: Boolean(values.auto_close),
    can_close_early: Boolean(values.can_close_early),
    can_pause: Boolean(values.can_pause),
    can_renew: Boolean(values.can_renew),
  };
}

async function assertNameFree(name, excludeId, trx) {
  const query = trx('plans').where('is_active', true).whereRaw('lower(name) = lower(?)', [name]);
  if (excludeId !== undefined) query.whereNot('id', excludeId);
  if (await query.first('id')) throw nameTaken(name);
}

/**
 * 'scheduled', 'on_sale' or 'ended', from the dates alone. `today` and the plan's
 * dates are YYYY-MM-DD strings, which sort in calendar order. Both ends of the
 * range are on sale. Whether the plan is archived is a separate question.
 */
export function planAvailability(plan, today = todayInBusinessTz()) {
  assertDate(today);
  if (today < plan.start_date) return 'scheduled';
  if (today > plan.end_date) return 'ended';
  return 'on_sale';
}

/** One page of plans: { rows, total }. `status` is 'active' or 'archived'. */
export async function listPlans(
  { q = '', status = 'active', pageSize = DEFAULT_PAGE_SIZE, offset = 0 } = {},
  trx = db,
) {
  const matching = () => {
    const query = trx('plans').where('is_active', status !== 'archived');
    if (q) query.whereRaw('lower(name) LIKE lower(?)', [likePattern(q)]);
    return query;
  };
  const { total } = await matching().count({ total: '*' }).first();
  const rows = await matching()
    .select('*')
    .orderByRaw('lower(name), id')
    .limit(pageSize)
    .offset(offset);
  return { rows, total };
}

/**
 * The one definition of "can be sold on this date": active and inside the sale
 * window, inclusive of both ends. A query builder, so it can be listed or counted.
 */
export function sellablePlansQuery(onDate, trx = db) {
  assertDate(onDate);
  return trx('plans')
    .where('is_active', true)
    .where('start_date', '<=', onDate)
    .where('end_date', '>=', onDate);
}

/** Active plans that can be sold on `onDate`, inclusive of both ends. */
export async function listSellablePlans(onDate = todayInBusinessTz(), trx = db) {
  return sellablePlansQuery(onDate, trx).orderByRaw('lower(name), id');
}

/** The plan with this id, active or archived, or null. */
export async function getPlan(id, trx = db) {
  return (await trx('plans').where({ id }).first()) ?? null;
}

/** Throws PlanError (name_taken). */
export async function createPlan(values, trx = db) {
  await assertNameFree(values.name, undefined, trx);
  try {
    const [plan] = await trx('plans').insert(planColumns(values)).returning('*');
    return plan;
  } catch (err) {
    // Two requests can both pass the check above.
    if (isUniqueViolation(err, NAME_INDEX)) throw nameTaken(values.name);
    throw err;
  }
}

/**
 * Archived plans are read-only until restored, because later scenes will refer to
 * them. Throws PlanError (name_taken, not_found, archived).
 */
export async function updatePlan(id, values, trx = db) {
  await assertNameFree(values.name, id, trx);
  let plan;
  try {
    [plan] = await trx('plans')
      .where({ id, is_active: true })
      .update(planColumns(values))
      .returning('*');
  } catch (err) {
    if (isUniqueViolation(err, NAME_INDEX)) throw nameTaken(values.name);
    throw err;
  }
  if (plan) return plan;
  if (await getPlan(id, trx)) {
    throw new PlanError('archived', 'This plan is archived. Restore it before editing.');
  }
  throw notFound();
}

/** Archiving twice is harmless. Throws PlanError (not_found). */
export async function archivePlan(id, trx = db) {
  const [plan] = await trx('plans')
    .where({ id, is_active: true })
    .update({ is_active: false })
    .returning('*');
  if (plan) return plan;
  const existing = await getPlan(id, trx);
  if (!existing) throw notFound();
  return existing;
}

/** Restoring twice is harmless. Throws PlanError (name_taken, not_found). */
export async function restorePlan(id, trx = db) {
  const existing = await getPlan(id, trx);
  if (!existing) throw notFound();
  if (existing.is_active) return existing;

  const clash = () =>
    new PlanError(
      'name_taken',
      `An active plan is already called "${existing.name}". Rename or archive that plan, then restore this one.`,
    );
  try {
    await assertNameFree(existing.name, id, trx);
    const [plan] = await trx('plans').where({ id }).update({ is_active: true }).returning('*');
    return plan ?? existing;
  } catch (err) {
    if (err instanceof PlanError || isUniqueViolation(err, NAME_INDEX)) throw clash();
    throw err;
  }
}
