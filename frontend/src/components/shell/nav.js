import { can } from '@backend/lib/auth/permissions';

export const WORKSPACE_NAV = [
  { href: '/dashboard', label: 'Dashboard', permission: 'workspace.view' },
  { href: '/products', label: 'Products', permission: 'products.read' },
  { href: '/plans', label: 'Plans', permission: 'plans.read' },
  { href: '/staff', label: 'Staff', permission: 'staff.manage' },
];

/** The links this user may see, as plain { href, label } objects. */
export function navItemsFor(user) {
  return WORKSPACE_NAV.filter((item) => can(user, item.permission)).map(({ href, label }) => ({
    href,
    label,
  }));
}
