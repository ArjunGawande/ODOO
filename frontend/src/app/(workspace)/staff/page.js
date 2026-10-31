import {
  Alert,
  Badge,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  Pagination,
  SearchBox,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/components/ui';
import { requirePermission } from '@/lib/auth/guards';
import { parsePagination } from '@backend/lib/pagination';
import { listStaff } from '@backend/services/users';

import { ResendInviteForm } from './ResendInviteForm';
import { StaffStatusForm } from './StaffStatusForm';

export const metadata = { title: 'Staff' };

function StatusBadge({ member }) {
  if (!member.is_active) return <Badge tone="neutral">Inactive</Badge>;
  if (member.invite_expired) return <Badge tone="danger">Invite expired</Badge>;
  if (member.invite_pending) return <Badge tone="warning">Invite pending</Badge>;
  return <Badge tone="success">Active</Badge>;
}

function emptyMessage(q, total) {
  if (total > 0) return { title: 'No staff on this page', description: 'Go back to an earlier page.' };
  if (q) return { title: 'No staff match your search', description: 'Try a different name or email.' };
  return { title: 'No staff yet', description: 'Invite your first team member.' };
}

export default async function StaffPage({ searchParams }) {
  await requirePermission('staff.manage');

  // `invited` is a one-time notice, so it must not follow the paging links.
  const { invited, ...listParams } = await searchParams;
  const { page, pageSize, offset, q } = parsePagination(listParams);
  const { rows, total } = await listStaff({ q, limit: pageSize, offset });

  return (
    <>
      <PageHeader
        title="Staff"
        description="Invite team members and control who can log in."
        actions={<LinkButton href="/staff/new">Invite staff</LinkButton>}
      />

      {invited === 'sent' ? (
        <Alert tone="success" className="mb-4">
          Invite sent. The link is valid for 72 hours.
        </Alert>
      ) : null}
      {invited === 'unsent' ? (
        <Alert tone="warning" className="mb-4">
          The account was created, but the invite email could not be sent. Resend the invite
          below, or they can set a password with &quot;Forgot password&quot; on the login page.
        </Alert>
      ) : null}

      <div className="mb-4">
        <SearchBox
          basePath="/staff"
          params={listParams}
          value={q}
          label="Search staff"
          placeholder="Search by name or email"
        />
      </div>

      <Card flush>
        {rows.length === 0 ? (
          <EmptyState {...emptyMessage(q, total)} />
        ) : (
          <Table caption="Staff members">
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Status</TH>
                <TH>
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((member) => (
                <TR key={member.id}>
                  <TD>{member.name}</TD>
                  <TD>{member.email}</TD>
                  <TD>
                    <StatusBadge member={member} />
                  </TD>
                  <TD>
                    <div className="flex items-start justify-end gap-2">
                      {member.is_active && member.invite_pending ? (
                        <ResendInviteForm userId={member.id} userName={member.name} />
                      ) : null}
                      <StaffStatusForm
                        userId={member.id}
                        userName={member.name}
                        isActive={member.is_active}
                      />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination
          page={page}
          total={total}
          pageSize={pageSize}
          basePath="/staff"
          params={listParams}
        />
      </Card>
    </>
  );
}
