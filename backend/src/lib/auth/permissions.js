// One matrix, one place. Pages and actions ask can(), never compare user.role.
// Pure data, so client components may import it too.

export const ROLES = ['admin', 'staff', 'customer'];

export const PERMISSIONS = {
  'workspace.view': ['admin', 'staff'],
  'portal.view': ['customer'],
  'staff.manage': ['admin'],
  'products.read': ['admin', 'staff'],
  'products.write': ['admin'],
  'plans.read': ['admin', 'staff'],
  'plans.write': ['admin'],
};

/** True when the user's role holds the permission. Null user or unknown permission: false. */
export function can(user, permission) {
  if (!user || !Object.hasOwn(PERMISSIONS, permission)) return false;
  return PERMISSIONS[permission].includes(user.role);
}

export function homeForRole(role) {
  if (role === 'admin' || role === 'staff') return '/dashboard';
  if (role === 'customer') return '/portal';
  // Not /login: that page sends logged-in users home, which would loop.
  return '/forbidden';
}
