// Postgres error helpers. On a violation `err.constraint` is the constraint name,
// or the index name for a unique index such as products_name_active_unique.

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';

function matches(err, code, constraintName) {
  if (err?.code !== code) return false;
  return constraintName === undefined || err.constraint === constraintName;
}

export function isUniqueViolation(err, constraintName) {
  return matches(err, UNIQUE_VIOLATION, constraintName);
}

export function isForeignKeyViolation(err, constraintName) {
  return matches(err, FOREIGN_KEY_VIOLATION, constraintName);
}

export function isCheckViolation(err, constraintName) {
  return matches(err, CHECK_VIOLATION, constraintName);
}
