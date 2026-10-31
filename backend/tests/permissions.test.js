import { describe, expect, it } from 'vitest';

import { PERMISSIONS, ROLES, can, homeForRole } from '@backend/lib/auth/permissions';

const MATRIX = {
  'workspace.view': { admin: true, staff: true, customer: false },
  'portal.view': { admin: false, staff: false, customer: true },
  'staff.manage': { admin: true, staff: false, customer: false },
  'products.read': { admin: true, staff: true, customer: false },
  'products.write': { admin: true, staff: false, customer: false },
  'plans.read': { admin: true, staff: true, customer: false },
  'plans.write': { admin: true, staff: false, customer: false },
};

describe('can', () => {
  const cases = Object.entries(MATRIX).flatMap(([permission, roles]) =>
    Object.entries(roles).map(([role, allowed]) => [role, permission, allowed]),
  );

  it.each(cases)('%s + %s = %s', (role, permission, allowed) => {
    expect(can({ role }, permission)).toBe(allowed);
  });

  it('covers exactly the contract permissions and roles', () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual(Object.keys(MATRIX).sort());
    expect(ROLES).toEqual(['admin', 'staff', 'customer']);
  });

  it('denies a missing user, unknown role and unknown permission', () => {
    expect(can(null, 'workspace.view')).toBe(false);
    expect(can(undefined, 'workspace.view')).toBe(false);
    expect(can({ role: 'root' }, 'workspace.view')).toBe(false);
    expect(can({ role: 'admin' }, 'nope')).toBe(false);
    expect(can({ role: 'admin' }, 'constructor')).toBe(false);
  });
});

describe('homeForRole', () => {
  it('sends each role home', () => {
    expect(homeForRole('admin')).toBe('/dashboard');
    expect(homeForRole('staff')).toBe('/dashboard');
    expect(homeForRole('customer')).toBe('/portal');
  });

  it('does not send an unknown role to /login, which would loop', () => {
    expect(homeForRole('root')).toBe('/forbidden');
  });
});
