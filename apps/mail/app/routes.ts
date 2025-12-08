import { type RouteConfig, index, layout, prefix, route } from '@react-router/dev/routes';

export default [
  index('page.tsx'),
  route('/home', 'home/page.tsx'),

  route('/api/mailto-handler', 'mailto-handler.ts'),

  layout('(full-width)/layout.tsx', [
    route('/about', '(full-width)/about.tsx'),
    route('/terms', '(full-width)/terms.tsx'),
    route('/pricing', '(full-width)/pricing.tsx'),
    route('/privacy', '(full-width)/privacy.tsx'),
    route('/contributors', '(full-width)/contributors.tsx'),
    route('/download', '(full-width)/download.tsx'),
    route('/hr', '(full-width)/hr.tsx'),
    route('/meet/:meetingId', '(full-width)/meet/[meetingId]/page.tsx'),
    route('/drive/shared/:token', '(routes)/drive/shared/[token]/page.tsx'),
    route('/drive/shared/:token/edit', '(routes)/drive/shared/[token]/edit/page.tsx'),
  ]),

  route('/login', '(auth)/login/page.tsx'),
  route('/signup', '(auth)/signup/page.tsx'),
  route('/forgot-password', '(auth)/forgot-password/page.tsx'),
  route('/reset-password', '(auth)/reset-password/page.tsx'),

  // B2B Admin Dashboard
  layout('(routes)/admin/layout.tsx', [
    route('/admin', '(routes)/admin/page.tsx'),
    route('/admin/partners', '(routes)/admin/partners/page.tsx'),
    route('/admin/partners/:id', '(routes)/admin/partners/$id/page.tsx'),
    route('/admin/organizations', '(routes)/admin/organizations/page.tsx'),
    route('/admin/approvals', '(routes)/admin/approvals/page.tsx'),
    route('/admin/pricing', '(routes)/admin/pricing/page.tsx'),
    route('/admin/invoices', '(routes)/admin/invoices/page.tsx'),
    route('/admin/settings', '(routes)/admin/settings/page.tsx'),
  ]),

  // B2B Partner Application (outside layout - no auth required)
  route('/partner/apply', '(routes)/partner/apply/page.tsx'),

  // B2B Partner Dashboard (requires partner auth)
  layout('(routes)/partner/layout.tsx', [
    route('/partner', '(routes)/partner/page.tsx'),
    route('/partner/organizations', '(routes)/partner/organizations/page.tsx'),
    route('/partner/organizations/new', '(routes)/partner/organizations/new/page.tsx'),
    route('/partner/organizations/:id', '(routes)/partner/organizations/$id/page.tsx'),
    route('/partner/storage', '(routes)/partner/storage/page.tsx'),
    route('/partner/invoices', '(routes)/partner/invoices/page.tsx'),
    route('/partner/settings', '(routes)/partner/settings/page.tsx'),
  ]),

  // B2B Workspace Dashboard
  layout('(routes)/workspace/layout.tsx', [
    route('/workspace', '(routes)/workspace/page.tsx'),
    route('/workspace/domains', '(routes)/workspace/domains/page.tsx'),
    route('/workspace/users', '(routes)/workspace/users/page.tsx'),
    route('/workspace/storage', '(routes)/workspace/storage/page.tsx'),
    route('/workspace/archival', '(routes)/workspace/archival/page.tsx'),
    route('/workspace/invoices', '(routes)/workspace/invoices/page.tsx'),
    route('/workspace/settings', '(routes)/workspace/settings/page.tsx'),
  ]),

  layout('(routes)/layout.tsx', [
    route('/developer', '(routes)/developer/page.tsx'),
    route('/meet', '(routes)/meet/page.tsx'),
    route('/drive', '(routes)/drive/page.tsx'),
    route('/chat', '(routes)/chat/page.tsx'),
    route('/calendar', '(routes)/calendar/page.tsx'),
    route('/drive/edit/:fileId', '(routes)/drive/edit/[fileId]/page.tsx'),
    layout(
      '(routes)/mail/layout.tsx',
      prefix('/mail', [
        index('(routes)/mail/page.tsx'),
        route('/create', '(routes)/mail/create/page.tsx'),
        route('/compose', '(routes)/mail/compose/page.tsx'),
        route('/kanban', '(routes)/mail/kanban/page.tsx'),
        route('/teammates', '(routes)/mail/teammates/page.tsx'),
        route('/notifications', '(routes)/mail/notifications/page.tsx'),
        route('/attachments', '(routes)/mail/attachments/page.tsx'),
        route('/under-construction/:path', '(routes)/mail/under-construction/[path]/page.tsx'),
        route('/:folder', '(routes)/mail/[folder]/page.tsx'),
      ]),
    ),
    layout(
      '(routes)/settings/layout.tsx',
      prefix('/settings', [
        index('(routes)/settings/page.tsx'),
        route('/appearance', '(routes)/settings/appearance/page.tsx'),
        route('/connections', '(routes)/settings/connections/page.tsx'),
        route('/danger-zone', '(routes)/settings/danger-zone/page.tsx'),
        route('/general', '(routes)/settings/general/page.tsx'),
        route('/labels', '(routes)/settings/labels/page.tsx'),
        route('/categories', '(routes)/settings/categories/page.tsx'),
        route('/notifications', '(routes)/settings/notifications/page.tsx'),
        route('/privacy', '(routes)/settings/privacy/page.tsx'),
        route('/security', '(routes)/settings/security/page.tsx'),
        route('/shortcuts', '(routes)/settings/shortcuts/page.tsx'),
        route('/nubo-account', '(routes)/settings/nubo-account/page.tsx'),
        route('/*', '(routes)/settings/[...settings]/page.tsx'),
      ]),
    ),
    route('/*', 'meta-files/not-found.ts'),
  ]),
] satisfies RouteConfig;
