import { WorkspaceFrame } from './WorkspaceFrame';
import { navItemsFor } from './nav';

/** Filters the nav on the server, so hidden links never reach the browser. */
export function WorkspaceShell({ user, children }) {
  return (
    <WorkspaceFrame items={navItemsFor(user)} user={user}>
      {children}
    </WorkspaceFrame>
  );
}
