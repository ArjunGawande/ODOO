import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/guards';
import { homeForRole } from '@backend/lib/auth/permissions';

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? homeForRole(user.role) : '/login');
}
