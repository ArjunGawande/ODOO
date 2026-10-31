import { WorkspaceShell } from '@/components/shell/WorkspaceShell';
import { requirePermission } from '@/lib/auth/guards';

// This guard only protects the shell. Every page and action still does its own check.
export default async function WorkspaceLayout({ children }) {
  const user = await requirePermission('workspace.view');
  return <WorkspaceShell user={user}>{children}</WorkspaceShell>;
}
