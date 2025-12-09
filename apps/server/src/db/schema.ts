import {
  pgTableCreator,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  primaryKey,
  unique,
  index,
  bigint,
  decimal,
  date,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { defaultUserSettings } from '../lib/schemas';

export const createTable = pgTableCreator((name) => `mail0_${name}`);

export const user = createTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  defaultConnectionId: text('default_connection_id'),
  customPrompt: text('custom_prompt'),
  phoneNumber: text('phone_number').unique(),
  phoneNumberVerified: boolean('phone_number_verified'),
  // Nubo username - unique identifier for sharing (e.g., koolninad@nubo.email)
  username: text('username').unique(),
});

export const session = createTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [
    index('session_user_id_idx').on(t.userId),
    index('session_expires_at_idx').on(t.expiresAt),
  ],
);

export const subscription = createTable(
  'subscription',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    razorpaySubscriptionId: text('razorpay_subscription_id').unique(),
    planId: text('plan_id').notNull(), // 'free', 'pro_monthly', 'pro_annual'
    status: text('status').notNull(), // 'created', 'active', 'cancelled', 'paused', 'completed'
    currentPeriodStart: timestamp('current_period_start'),
    currentPeriodEnd: timestamp('current_period_end'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [
    index('subscription_user_id_idx').on(t.userId),
    index('subscription_status_idx').on(t.status),
    index('subscription_razorpay_id_idx').on(t.razorpaySubscriptionId),
  ],
);

export const usageTracking = createTable(
  'usage_tracking',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    feature: text('feature').notNull(), // 'chatMessages', 'connections', 'brainActivity'
    count: integer('count').notNull().default(0),
    periodStart: timestamp('period_start').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [
    index('usage_tracking_user_id_idx').on(t.userId),
    index('usage_tracking_feature_idx').on(t.feature),
    index('usage_tracking_period_idx').on(t.periodStart),
    index('usage_tracking_user_period_feature_idx').on(t.userId, t.periodStart, t.feature),
  ],
);

export const account = createTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [
    index('account_user_id_idx').on(t.userId),
    index('account_provider_user_id_idx').on(t.providerId, t.userId),
    index('account_expires_at_idx').on(t.accessTokenExpiresAt),
  ],
);

export const userHotkeys = createTable(
  'user_hotkeys',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    shortcuts: jsonb('shortcuts').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [index('user_hotkeys_shortcuts_idx').on(t.shortcuts)],
);

export const verification = createTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [
    index('verification_identifier_idx').on(t.identifier),
    index('verification_expires_at_idx').on(t.expiresAt),
  ],
);

export const earlyAccess = createTable(
  'early_access',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    isEarlyAccess: boolean('is_early_access').notNull().default(false),
    hasUsedTicket: text('has_used_ticket').default(''),
  },
  (t) => [index('early_access_is_early_access_idx').on(t.isEarlyAccess)],
);

export const connection = createTable(
  'connection',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name'),
    picture: text('picture'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    scope: text('scope').notNull(),
    providerId: text('provider_id').$type<'google' | 'microsoft' | 'imap'>().notNull(),
    expiresAt: timestamp('expires_at'),
    config: jsonb('config'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [
    unique().on(t.userId, t.email),
    index('connection_user_id_idx').on(t.userId),
    index('connection_expires_at_idx').on(t.expiresAt),
    index('connection_provider_id_idx').on(t.providerId),
  ],
);

export const email = createTable(
  'email',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id').notNull(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connection.id, { onDelete: 'cascade' }),
    messageId: text('message_id').notNull(), // Internet Message ID
    inReplyTo: text('in_reply_to'),
    references: text('references'),
    subject: text('subject'),
    from: jsonb('from').notNull(), // { name, address }
    to: jsonb('to').notNull(), // [{ name, address }]
    cc: jsonb('cc'),
    bcc: jsonb('bcc'),
    replyTo: jsonb('reply_to'),
    snippet: text('snippet'),
    bodyR2Key: text('body_r2_key'), // Key in R2 bucket
    bodyHtml: text('body_html'), // Full HTML body (for local dev, null in prod)
    internalDate: timestamp('internal_date').notNull(),
    isRead: boolean('is_read').default(false),
    isStarred: boolean('is_starred').default(false),
    labels: jsonb('labels'), // IMAP folders/labels
    attachments: jsonb('attachments'), // [{ filename, contentType, size, contentId, r2Key }]
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('email_connection_id_idx').on(t.connectionId),
    index('email_thread_id_idx').on(t.threadId),
    index('email_message_id_idx').on(t.messageId),
    index('email_internal_date_idx').on(t.internalDate),
  ],
);

// Kanban Board Schema
export const kanbanBoard = createTable(
  'kanban_board',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connection.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [
    index('kanban_board_user_id_idx').on(t.userId),
    index('kanban_board_connection_id_idx').on(t.connectionId),
    index('kanban_board_default_idx').on(t.userId, t.isDefault),
  ],
);

export const kanbanColumn = createTable(
  'kanban_column',
  {
    id: text('id').primaryKey(),
    boardId: text('board_id')
      .notNull()
      .references(() => kanbanBoard.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [
    index('kanban_column_board_id_idx').on(t.boardId),
    index('kanban_column_board_position_idx').on(t.boardId, t.position),
  ],
);

export const kanbanEmailMapping = createTable(
  'kanban_email_mapping',
  {
    id: text('id').primaryKey(),
    columnId: text('column_id')
      .notNull()
      .references(() => kanbanColumn.id, { onDelete: 'cascade' }),
    threadId: text('thread_id').notNull(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connection.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [
    unique().on(t.threadId, t.connectionId),
    index('kanban_email_column_id_idx').on(t.columnId),
    index('kanban_email_thread_id_idx').on(t.threadId),
    index('kanban_email_connection_id_idx').on(t.connectionId),
  ],
);

export const summary = createTable(
  'summary',
  {
    messageId: text('message_id').primaryKey(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connection.id, { onDelete: 'cascade' }),
    saved: boolean('saved').notNull().default(false),
    tags: text('tags'),
    suggestedReply: text('suggested_reply'),
  },
  (t) => [
    index('summary_connection_id_idx').on(t.connectionId),
    index('summary_connection_id_saved_idx').on(t.connectionId, t.saved),
    index('summary_saved_idx').on(t.saved),
  ],
);

// Testing
export const note = createTable(
  'note',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    threadId: text('thread_id').notNull(),
    content: text('content').notNull(),
    color: text('color').notNull().default('default'),
    isPinned: boolean('is_pinned').default(false),
    order: integer('order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('note_user_id_idx').on(t.userId),
    index('note_thread_id_idx').on(t.threadId),
    index('note_user_thread_idx').on(t.userId, t.threadId),
    index('note_is_pinned_idx').on(t.isPinned),
  ],
);

export const userSettings = createTable(
  'user_settings',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' })
      .unique(),
    settings: jsonb('settings')
      .$type<typeof defaultUserSettings>()
      .notNull()
      .default(defaultUserSettings),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [index('user_settings_settings_idx').on(t.settings)],
);

export const writingStyleMatrix = createTable(
  'writing_style_matrix',
  {
    connectionId: text()
      .notNull()
      .references(() => connection.id, { onDelete: 'cascade' }),
    numMessages: integer().notNull(),
    // TODO: way too much pain to get this type to work,
    // revisit later
    style: jsonb().$type<unknown>().notNull(),
    updatedAt: timestamp()
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return [
      primaryKey({
        columns: [table.connectionId],
      }),
      index('writing_style_matrix_style_idx').on(table.style),
    ];
  },
);

export const jwks = createTable(
  'jwks',
  {
    id: text('id').primaryKey(),
    publicKey: text('public_key').notNull(),
    privateKey: text('private_key').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [index('jwks_created_at_idx').on(t.createdAt)],
);

export const oauthApplication = createTable(
  'oauth_application',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    icon: text('icon'),
    metadata: text('metadata'),
    clientId: text('client_id').unique(),
    clientSecret: text('client_secret'),
    redirectURLs: text('redirect_u_r_ls'),
    type: text('type'),
    disabled: boolean('disabled'),
    userId: text('user_id'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [
    index('oauth_application_user_id_idx').on(t.userId),
    index('oauth_application_disabled_idx').on(t.disabled),
  ],
);

export const oauthAccessToken = createTable(
  'oauth_access_token',
  {
    id: text('id').primaryKey(),
    accessToken: text('access_token').unique(),
    refreshToken: text('refresh_token').unique(),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    clientId: text('client_id'),
    userId: text('user_id'),
    scopes: text('scopes'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [
    index('oauth_access_token_user_id_idx').on(t.userId),
    index('oauth_access_token_client_id_idx').on(t.clientId),
    index('oauth_access_token_expires_at_idx').on(t.accessTokenExpiresAt),
  ],
);

export const oauthConsent = createTable(
  'oauth_consent',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id'),
    userId: text('user_id'),
    scopes: text('scopes'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
    consentGiven: boolean('consent_given'),
  },
  (t) => [
    index('oauth_consent_user_id_idx').on(t.userId),
    index('oauth_consent_client_id_idx').on(t.clientId),
    index('oauth_consent_given_idx').on(t.consentGiven),
  ],
);

// LiveKit Meeting tables
export const livekitMeeting = createTable(
  'livekit_meeting',
  {
    id: text('id').primaryKey(),
    roomName: text('room_name').notNull().unique(),
    title: text('title').notNull(),
    description: text('description'),
    hostId: text('host_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    scheduledFor: timestamp('scheduled_for'),
    startedAt: timestamp('started_at'),
    endedAt: timestamp('ended_at'),
    duration: integer('duration'), // in seconds
    status: text('status').notNull().default('scheduled'), // scheduled, active, ended, cancelled
    maxParticipants: integer('max_participants').default(50),
    recordingEnabled: boolean('recording_enabled').default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('livekit_meeting_host_id_idx').on(t.hostId),
    index('livekit_meeting_room_name_idx').on(t.roomName),
    index('livekit_meeting_status_idx').on(t.status),
    index('livekit_meeting_scheduled_for_idx').on(t.scheduledFor),
  ],
);

export const livekitParticipant = createTable(
  'livekit_participant',
  {
    id: text('id').primaryKey(),
    meetingId: text('meeting_id')
      .notNull()
      .references(() => livekitMeeting.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    identity: text('identity').notNull(), // LiveKit participant identity
    name: text('name').notNull(),
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
    leftAt: timestamp('left_at'),
    duration: integer('duration'), // seconds in meeting
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('livekit_participant_meeting_id_idx').on(t.meetingId),
    index('livekit_participant_user_id_idx').on(t.userId),
    index('livekit_participant_identity_idx').on(t.identity),
  ],
);

export const livekitRecording = createTable(
  'livekit_recording',
  {
    id: text('id').primaryKey(),
    meetingId: text('meeting_id')
      .notNull()
      .references(() => livekitMeeting.id, { onDelete: 'cascade' }),
    egressId: text('egress_id').notNull(), // LiveKit egress ID
    r2Key: text('r2_key').notNull(),
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size'), // bytes
    duration: integer('duration'), // seconds
    format: text('format').default('mp4'),
    status: text('status').notNull().default('processing'), // processing, ready, failed
    startedAt: timestamp('started_at').notNull(),
    endedAt: timestamp('ended_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('livekit_recording_meeting_id_idx').on(t.meetingId),
    index('livekit_recording_egress_id_idx').on(t.egressId),
    index('livekit_recording_status_idx').on(t.status),
  ],
);

export const emailTemplate = createTable(
  'email_template',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    subject: text('subject'),
    body: text('body'),
    to: jsonb('to'),
    cc: jsonb('cc'),
    bcc: jsonb('bcc'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('idx_mail0_email_template_user_id').on(t.userId),
    unique('mail0_email_template_user_id_name_unique').on(t.userId, t.name),
  ],
);

// Nubo Drive - Cloud Storage
export const driveFolder = createTable(
  'drive_folder',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    parentId: text('parent_id'), // null for root folders
    color: text('color'), // optional folder color
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('drive_folder_user_id_idx').on(t.userId),
    index('drive_folder_parent_id_idx').on(t.parentId),
    index('drive_folder_user_parent_idx').on(t.userId, t.parentId),
  ],
);

export const driveFile = createTable(
  'drive_file',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    folderId: text('folder_id').references(() => driveFolder.id, { onDelete: 'set null' }), // null for root
    name: text('name').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(), // bytes
    r2Key: text('r2_key').notNull(), // path in R2 bucket: drive/{userId}/{fileId}/{filename}
    thumbnailR2Key: text('thumbnail_r2_key'), // optional thumbnail for images/docs
    // Import tracking
    importSource: text('import_source'), // 'google_drive', 'onedrive', 'upload', 'email_attachment'
    sourceFileId: text('source_file_id'), // original file ID from source (for deduplication)
    // Metadata
    isStarred: boolean('is_starred').default(false),
    isTrashed: boolean('is_trashed').default(false),
    trashedAt: timestamp('trashed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('drive_file_user_id_idx').on(t.userId),
    index('drive_file_folder_id_idx').on(t.folderId),
    index('drive_file_user_folder_idx').on(t.userId, t.folderId),
    index('drive_file_mime_type_idx').on(t.mimeType),
    index('drive_file_is_trashed_idx').on(t.isTrashed),
    index('drive_file_is_starred_idx').on(t.isStarred),
    index('drive_file_import_source_idx').on(t.importSource, t.sourceFileId),
  ],
);

// Track import jobs from Google Drive / OneDrive
export const driveImportJob = createTable(
  'drive_import_job',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    source: text('source').notNull(), // 'google_drive', 'onedrive'
    status: text('status').notNull().default('pending'), // 'pending', 'in_progress', 'completed', 'failed'
    totalFiles: integer('total_files').default(0),
    processedFiles: integer('processed_files').default(0),
    failedFiles: integer('failed_files').default(0),
    errorMessage: text('error_message'),
    // Store selected file IDs from source
    sourceFileIds: jsonb('source_file_ids').$type<string[]>(),
    targetFolderId: text('target_folder_id').references(() => driveFolder.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('drive_import_job_user_id_idx').on(t.userId),
    index('drive_import_job_status_idx').on(t.status),
    index('drive_import_job_source_idx').on(t.source),
  ],
);

// Drizzle relations for drive tables (required for ctx.db.query API)
export const driveFolderRelations = relations(driveFolder, ({ one, many }) => ({
  user: one(user, {
    fields: [driveFolder.userId],
    references: [user.id],
  }),
  parent: one(driveFolder, {
    fields: [driveFolder.parentId],
    references: [driveFolder.id],
    relationName: 'folderHierarchy',
  }),
  children: many(driveFolder, { relationName: 'folderHierarchy' }),
  files: many(driveFile),
}));

export const driveFileRelations = relations(driveFile, ({ one }) => ({
  user: one(user, {
    fields: [driveFile.userId],
    references: [user.id],
  }),
  folder: one(driveFolder, {
    fields: [driveFile.folderId],
    references: [driveFolder.id],
  }),
}));

export const driveImportJobRelations = relations(driveImportJob, ({ one }) => ({
  user: one(user, {
    fields: [driveImportJob.userId],
    references: [user.id],
  }),
  targetFolder: one(driveFolder, {
    fields: [driveImportJob.targetFolderId],
    references: [driveFolder.id],
  }),
}));

// Drive Sharing - Share files and folders with other users or via links
export const driveShare = createTable(
  'drive_share',
  {
    id: text('id').primaryKey(),
    // Owner of the file/folder
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Either file or folder (one must be set)
    fileId: text('file_id').references(() => driveFile.id, { onDelete: 'cascade' }),
    folderId: text('folder_id').references(() => driveFolder.id, { onDelete: 'cascade' }),
    // Who it's shared with (null for public/link shares)
    sharedWithUserId: text('shared_with_user_id').references(() => user.id, { onDelete: 'cascade' }),
    sharedWithUsername: text('shared_with_username'), // Nubo username
    sharedWithEmail: text('shared_with_email'), // External email for invites
    // Access level
    accessLevel: text('access_level').notNull().default('view'), // 'view', 'edit', 'admin'
    // Share type
    shareType: text('share_type').notNull(), // 'user', 'link', 'email_invite'
    // For public/link shares
    shareToken: text('share_token').unique(),
    // Optional password for link shares
    password: text('password'),
    // Expiration
    expiresAt: timestamp('expires_at'),
    // Metadata
    message: text('message'), // Optional message when sharing
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('drive_share_user_id_idx').on(t.userId),
    index('drive_share_file_id_idx').on(t.fileId),
    index('drive_share_folder_id_idx').on(t.folderId),
    index('drive_share_shared_with_user_idx').on(t.sharedWithUserId),
    index('drive_share_token_idx').on(t.shareToken),
    index('drive_share_type_idx').on(t.shareType),
  ],
);

// Track share access history
export const driveShareAccess = createTable(
  'drive_share_access',
  {
    id: text('id').primaryKey(),
    shareId: text('share_id')
      .notNull()
      .references(() => driveShare.id, { onDelete: 'cascade' }),
    accessedByUserId: text('accessed_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    accessedByEmail: text('accessed_by_email'),
    accessedAt: timestamp('accessed_at').notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
  },
  (t) => [
    index('drive_share_access_share_id_idx').on(t.shareId),
    index('drive_share_access_user_id_idx').on(t.accessedByUserId),
  ],
);

// Relations for sharing tables
export const driveShareRelations = relations(driveShare, ({ one, many }) => ({
  owner: one(user, {
    fields: [driveShare.userId],
    references: [user.id],
    relationName: 'shareOwner',
  }),
  sharedWithUser: one(user, {
    fields: [driveShare.sharedWithUserId],
    references: [user.id],
    relationName: 'shareRecipient',
  }),
  file: one(driveFile, {
    fields: [driveShare.fileId],
    references: [driveFile.id],
  }),
  folder: one(driveFolder, {
    fields: [driveShare.folderId],
    references: [driveFolder.id],
  }),
  accessHistory: many(driveShareAccess),
}));

export const driveShareAccessRelations = relations(driveShareAccess, ({ one }) => ({
  share: one(driveShare, {
    fields: [driveShareAccess.shareId],
    references: [driveShare.id],
  }),
  accessedByUser: one(user, {
    fields: [driveShareAccess.accessedByUserId],
    references: [user.id],
  }),
}));

// ==================== PUSH NOTIFICATIONS ====================

export const pushSubscription = createTable(
  'push_subscription',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // The push subscription endpoint URL
    endpoint: text('endpoint').notNull(),
    // Keys for encryption (p256dh and auth)
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    // Device/browser info for user to manage subscriptions
    userAgent: text('user_agent'),
    deviceName: text('device_name'),
    // Notification preferences
    notifyNewEmails: boolean('notify_new_emails').default(true),
    notifyMentions: boolean('notify_mentions').default(true),
    notifyImportant: boolean('notify_important').default(true),
    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at'),
  },
  (t) => [
    index('push_subscription_user_id_idx').on(t.userId),
    index('push_subscription_endpoint_idx').on(t.endpoint),
  ],
);

export const pushSubscriptionRelations = relations(pushSubscription, ({ one }) => ({
  user: one(user, {
    fields: [pushSubscription.userId],
    references: [user.id],
  }),
}));

// ==================== NUBO CALENDAR ====================

// Calendar - User's calendars (like Google Calendar's multiple calendars)
export const calendar = createTable(
  'calendar',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color').notNull().default('#3b82f6'), // Default blue
    isDefault: boolean('is_default').default(false),
    isVisible: boolean('is_visible').default(true),
    // External calendar sync
    source: text('source').$type<'local' | 'google' | 'microsoft'>().default('local'),
    sourceCalendarId: text('source_calendar_id'), // External calendar ID for synced calendars
    syncToken: text('sync_token'), // For incremental sync
    lastSyncedAt: timestamp('last_synced_at'),
    // Timestamps
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('calendar_user_id_idx').on(t.userId),
    index('calendar_source_idx').on(t.source),
    index('calendar_is_default_idx').on(t.userId, t.isDefault),
  ],
);

// Calendar Event - Individual events
export const calendarEvent = createTable(
  'calendar_event',
  {
    id: text('id').primaryKey(),
    calendarId: text('calendar_id')
      .notNull()
      .references(() => calendar.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Basic event info
    title: text('title').notNull(),
    description: text('description'),
    location: text('location'),
    color: text('color'), // Override calendar color
    // Time
    startTime: timestamp('start_time').notNull(),
    endTime: timestamp('end_time').notNull(),
    timezone: text('timezone').default('UTC'),
    isAllDay: boolean('is_all_day').default(false),
    // Recurrence (RRULE format stored as JSON)
    isRecurring: boolean('is_recurring').default(false),
    recurrenceRule: jsonb('recurrence_rule').$type<{
      frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
      interval: number;
      count?: number;
      until?: string;
      byDay?: string[];
      byMonthDay?: number[];
      byMonth?: number[];
      bySetPos?: number[];
      weekStart?: string;
      exceptions?: string[];
    }>(),
    // For recurring event instances
    isRecurringInstance: boolean('is_recurring_instance').default(false),
    originalEventId: text('original_event_id'), // Parent recurring event
    originalStartTime: timestamp('original_start_time'), // Original time before modification
    recurrenceStatus: text('recurrence_status').$type<'confirmed' | 'cancelled' | 'modified'>(),
    // External sync
    source: text('source').$type<'local' | 'google' | 'microsoft'>().default('local'),
    sourceEventId: text('source_event_id'), // External event ID
    // Status
    status: text('status').$type<'confirmed' | 'tentative' | 'cancelled'>().default('confirmed'),
    // Video conferencing
    conferenceUrl: text('conference_url'),
    conferenceType: text('conference_type').$type<'nubo_meet' | 'google_meet' | 'zoom' | 'teams'>(),
    // Metadata
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('calendar_event_calendar_id_idx').on(t.calendarId),
    index('calendar_event_user_id_idx').on(t.userId),
    index('calendar_event_start_time_idx').on(t.startTime),
    index('calendar_event_end_time_idx').on(t.endTime),
    index('calendar_event_time_range_idx').on(t.startTime, t.endTime),
    index('calendar_event_recurring_idx').on(t.isRecurring),
    index('calendar_event_original_event_idx').on(t.originalEventId),
    index('calendar_event_source_idx').on(t.source, t.sourceEventId),
  ],
);

// Event Attendees - People invited to events
export const calendarEventAttendee = createTable(
  'calendar_event_attendee',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => calendarEvent.id, { onDelete: 'cascade' }),
    // Attendee info
    email: text('email').notNull(),
    name: text('name'),
    // Response status
    responseStatus: text('response_status')
      .$type<'needsAction' | 'accepted' | 'declined' | 'tentative'>()
      .default('needsAction'),
    // Role
    isOrganizer: boolean('is_organizer').default(false),
    isOptional: boolean('is_optional').default(false),
    // If attendee is a Nubo user
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    // Timestamps
    respondedAt: timestamp('responded_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('calendar_event_attendee_event_id_idx').on(t.eventId),
    index('calendar_event_attendee_email_idx').on(t.email),
    index('calendar_event_attendee_user_id_idx').on(t.userId),
    unique('calendar_event_attendee_unique').on(t.eventId, t.email),
  ],
);

// Event Reminders - Notifications before events
export const calendarEventReminder = createTable(
  'calendar_event_reminder',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => calendarEvent.id, { onDelete: 'cascade' }),
    // Reminder timing (minutes before event)
    minutesBefore: integer('minutes_before').notNull(),
    // Reminder method
    method: text('method').$type<'email' | 'push' | 'popup'>().default('push'),
    // Whether reminder was sent
    isSent: boolean('is_sent').default(false),
    sentAt: timestamp('sent_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('calendar_event_reminder_event_id_idx').on(t.eventId),
    index('calendar_event_reminder_sent_idx').on(t.isSent),
  ],
);

// Calendar Sharing - Share calendars with other users
export const calendarShare = createTable(
  'calendar_share',
  {
    id: text('id').primaryKey(),
    calendarId: text('calendar_id')
      .notNull()
      .references(() => calendar.id, { onDelete: 'cascade' }),
    // Who it's shared with
    sharedWithUserId: text('shared_with_user_id').references(() => user.id, { onDelete: 'cascade' }),
    sharedWithEmail: text('shared_with_email'), // For external invites
    // Access level
    accessLevel: text('access_level')
      .$type<'freeBusy' | 'read' | 'write' | 'admin'>()
      .default('read'),
    // Status
    status: text('status').$type<'pending' | 'accepted' | 'declined'>().default('pending'),
    // Timestamps
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('calendar_share_calendar_id_idx').on(t.calendarId),
    index('calendar_share_shared_with_user_idx').on(t.sharedWithUserId),
    index('calendar_share_status_idx').on(t.status),
    unique('calendar_share_unique').on(t.calendarId, t.sharedWithUserId),
  ],
);

// AI Chat History for Calendar - Store conversation context
export const calendarAiChat = createTable(
  'calendar_ai_chat',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id').notNull(),
    role: text('role').$type<'user' | 'assistant' | 'system'>().notNull(),
    content: text('content').notNull(),
    // Tool calls and results
    toolCalls: jsonb('tool_calls').$type<{
      name: string;
      arguments: Record<string, unknown>;
      result?: unknown;
    }[]>(),
    // Timestamps
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('calendar_ai_chat_user_id_idx').on(t.userId),
    index('calendar_ai_chat_conversation_id_idx').on(t.conversationId),
    index('calendar_ai_chat_user_conversation_idx').on(t.userId, t.conversationId),
  ],
);

// Calendar Relations
export const calendarRelations = relations(calendar, ({ one, many }) => ({
  user: one(user, {
    fields: [calendar.userId],
    references: [user.id],
  }),
  events: many(calendarEvent),
  shares: many(calendarShare),
}));

export const calendarEventRelations = relations(calendarEvent, ({ one, many }) => ({
  calendar: one(calendar, {
    fields: [calendarEvent.calendarId],
    references: [calendar.id],
  }),
  user: one(user, {
    fields: [calendarEvent.userId],
    references: [user.id],
  }),
  originalEvent: one(calendarEvent, {
    fields: [calendarEvent.originalEventId],
    references: [calendarEvent.id],
    relationName: 'recurringInstances',
  }),
  recurringInstances: many(calendarEvent, { relationName: 'recurringInstances' }),
  attendees: many(calendarEventAttendee),
  reminders: many(calendarEventReminder),
}));

export const calendarEventAttendeeRelations = relations(calendarEventAttendee, ({ one }) => ({
  event: one(calendarEvent, {
    fields: [calendarEventAttendee.eventId],
    references: [calendarEvent.id],
  }),
  user: one(user, {
    fields: [calendarEventAttendee.userId],
    references: [user.id],
  }),
}));

export const calendarEventReminderRelations = relations(calendarEventReminder, ({ one }) => ({
  event: one(calendarEvent, {
    fields: [calendarEventReminder.eventId],
    references: [calendarEvent.id],
  }),
}));

export const calendarShareRelations = relations(calendarShare, ({ one }) => ({
  calendar: one(calendar, {
    fields: [calendarShare.calendarId],
    references: [calendar.id],
  }),
  sharedWithUser: one(user, {
    fields: [calendarShare.sharedWithUserId],
    references: [user.id],
  }),
}));

export const calendarAiChatRelations = relations(calendarAiChat, ({ one }) => ({
  user: one(user, {
    fields: [calendarAiChat.userId],
    references: [user.id],
  }),
}));

// ==================== B2B ENTERPRISE: ADMIN/PARTNER/WORKSPACE ====================

// ==================== ADMIN ROLES & USERS ====================

// Admin roles with permissions
export const adminRole = createTable(
  'admin_role',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    displayName: text('display_name').notNull(),
    permissions: jsonb('permissions').$type<string[]>().notNull(), // Array of permission strings
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('admin_role_name_idx').on(t.name)],
);

// Admin users (Nubo team members)
export const adminUser = createTable(
  'admin_user',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' })
      .unique(),
    roleId: text('role_id').references(() => adminRole.id, { onDelete: 'set null' }),
    isSuperAdmin: boolean('is_super_admin').default(false),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('admin_user_user_id_idx').on(t.userId),
    index('admin_user_role_id_idx').on(t.roleId),
    index('admin_user_is_active_idx').on(t.isActive),
  ],
);

// ==================== PARTNER TIERS ====================

// Partner tier configuration (admin-editable)
export const partnerTier = createTable(
  'partner_tier',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(), // entry, bronze, silver, gold
    displayName: text('display_name').notNull(), // "Entry Partner", "Gold Partner", etc.
    discountPercentage: decimal('discount_percentage', { precision: 5, scale: 2 }).notNull(),
    minQuarterlySales: decimal('min_quarterly_sales', { precision: 15, scale: 2 }).notNull(),
    maxQuarterlySales: decimal('max_quarterly_sales', { precision: 15, scale: 2 }), // NULL for unlimited (gold)
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('partner_tier_name_idx').on(t.name),
    index('partner_tier_sort_order_idx').on(t.sortOrder),
  ],
);

// ==================== PARTNERSHIP APPLICATIONS ====================

// Partnership applications (submitted via landing page)
export const partnershipApplication = createTable(
  'partnership_application',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    companyName: text('company_name').notNull(),
    companyWebsite: text('company_website'),
    companyAddress: text('company_address'),
    companyGst: text('company_gst'),
    contactName: text('contact_name').notNull(),
    contactEmail: text('contact_email').notNull(),
    contactPhone: text('contact_phone'),
    expectedMonthlySales: decimal('expected_monthly_sales', { precision: 15, scale: 2 }),
    businessDescription: text('business_description'),
    status: text('status').$type<'pending' | 'approved' | 'rejected'>().default('pending'),
    reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at'),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('partnership_application_user_id_idx').on(t.userId),
    index('partnership_application_status_idx').on(t.status),
    index('partnership_application_email_idx').on(t.contactEmail),
  ],
);

// ==================== PARTNERS ====================

// Approved partners (resellers)
export const partner = createTable(
  'partner',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' })
      .unique(),
    applicationId: text('application_id').references(() => partnershipApplication.id, {
      onDelete: 'set null',
    }),
    companyName: text('company_name').notNull(),
    companyWebsite: text('company_website'),
    companyAddress: text('company_address'),
    companyGst: text('company_gst'),
    // Contact information
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    // Address fields
    city: text('city'),
    state: text('state'),
    country: text('country').default('India'),
    postalCode: text('postal_code'),
    // Tax information
    panNumber: text('pan_number'),
    tierId: text('tier_id').references(() => partnerTier.id, { onDelete: 'set null' }),
    tierName: text('tier_name').default('entry'), // Cached for quick access: entry, bronze, silver, gold
    discountPercentage: decimal('discount_percentage', { precision: 5, scale: 2 }).default('20.00'),
    // Storage pool (partners buy storage, then allocate to organizations)
    allocatedStorageBytes: bigint('allocated_storage_bytes', { mode: 'number' }).default(0),
    usedStorageBytes: bigint('used_storage_bytes', { mode: 'number' }).default(0),
    isActive: boolean('is_active').default(true),
    suspendedAt: timestamp('suspended_at'),
    suspensionReason: text('suspension_reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('partner_user_id_idx').on(t.userId),
    index('partner_tier_id_idx').on(t.tierId),
    index('partner_tier_name_cached_idx').on(t.tierName),
    index('partner_is_active_idx').on(t.isActive),
    index('partner_company_name_idx').on(t.companyName),
  ],
);

// Partner quarterly sales tracking (for tier progression/demotion)
export const partnerQuarterlySales = createTable(
  'partner_quarterly_sales',
  {
    id: text('id').primaryKey(),
    partnerId: text('partner_id')
      .notNull()
      .references(() => partner.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    quarter: integer('quarter').notNull(), // 1, 2, 3, 4
    totalSales: decimal('total_sales', { precision: 15, scale: 2 }).default('0'),
    tierAtEnd: text('tier_at_end'), // Tier at the end of this quarter
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('partner_quarterly_sales_unique').on(t.partnerId, t.year, t.quarter),
    index('partner_quarterly_sales_partner_id_idx').on(t.partnerId),
    index('partner_quarterly_sales_year_quarter_idx').on(t.year, t.quarter),
  ],
);

// ==================== ORGANIZATIONS ====================

// Organizations (partner's customers or direct retail customers)
export const organization = createTable(
  'organization',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    partnerId: text('partner_id').references(() => partner.id, { onDelete: 'set null' }), // NULL for direct retail customers
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    billingEmail: text('billing_email'),
    billingAddress: text('billing_address'),
    gstNumber: text('gst_number'),
    isRetail: boolean('is_retail').default(false), // TRUE if not via partner
    // Storage allocation from partner or direct purchase
    totalStorageBytes: bigint('total_storage_bytes', { mode: 'number' }).default(0),
    usedStorageBytes: bigint('used_storage_bytes', { mode: 'number' }).default(0),
    isActive: boolean('is_active').default(true),
    suspendedAt: timestamp('suspended_at'),
    suspensionReason: text('suspension_reason'),
    // Nubo Chat (Rocket.Chat) workspace
    rocketChatWorkspaceId: text('rocket_chat_workspace_id'),
    rocketChatWorkspaceUrl: text('rocket_chat_workspace_url'),
    // Hybrid mail (Google Workspace / Office 365 integration)
    hybridMailEnabled: boolean('hybrid_mail_enabled').default(false),
    hybridMailProvider: text('hybrid_mail_provider').$type<'google_workspace' | 'office365' | null>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('organization_partner_id_idx').on(t.partnerId),
    index('organization_owner_user_id_idx').on(t.ownerUserId),
    index('organization_is_retail_idx').on(t.isRetail),
    index('organization_is_active_idx').on(t.isActive),
    index('organization_name_idx').on(t.name),
  ],
);

// ==================== ORGANIZATION DOMAINS ====================

// Domains for organizations
export const organizationDomain = createTable(
  'organization_domain',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    domainName: text('domain_name').notNull().unique(),
    isPrimary: boolean('is_primary').default(false),
    // DNS Verification
    dnsVerified: boolean('dns_verified').default(false),
    dnsVerifiedAt: timestamp('dns_verified_at'),
    // DNS Records (to display to user for setup)
    mxRecord: text('mx_record'),
    spfRecord: text('spf_record'),
    dkimRecord: text('dkim_record'),
    dkimSelector: text('dkim_selector'),
    dmarcRecord: text('dmarc_record'),
    // Archival configuration
    archivalEnabled: boolean('archival_enabled').default(false),
    archivalStorageBytes: bigint('archival_storage_bytes', { mode: 'number' }).default(0),
    archivalUsedBytes: bigint('archival_used_bytes', { mode: 'number' }).default(0),
    // Status
    status: text('status')
      .$type<'pending' | 'dns_pending' | 'active' | 'suspended'>()
      .default('pending'),
    approvedBy: text('approved_by').references(() => user.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('organization_domain_org_id_idx').on(t.organizationId),
    index('organization_domain_domain_name_idx').on(t.domainName),
    index('organization_domain_status_idx').on(t.status),
    index('organization_domain_is_primary_idx').on(t.organizationId, t.isPrimary),
  ],
);

// ==================== ORGANIZATION USERS ====================

// Users within an organization (email accounts)
export const organizationUser = createTable(
  'organization_user',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    domainId: text('domain_id')
      .notNull()
      .references(() => organizationDomain.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }), // Link to main users table after provisioning
    emailAddress: text('email_address').notNull().unique(), // user@domain.com
    nuboUsername: text('nubo_username').unique(), // unique@nubo.email identifier
    displayName: text('display_name'),
    // Storage allocation (can split between mailbox and drive)
    mailboxStorageBytes: bigint('mailbox_storage_bytes', { mode: 'number' }).default(0),
    mailboxUsedBytes: bigint('mailbox_used_bytes', { mode: 'number' }).default(0),
    driveStorageBytes: bigint('drive_storage_bytes', { mode: 'number' }).default(0),
    driveUsedBytes: bigint('drive_used_bytes', { mode: 'number' }).default(0),
    // IMAP/SMTP credentials (manually configured initially)
    imapHost: text('imap_host'),
    imapPort: integer('imap_port'),
    imapUsername: text('imap_username'),
    imapPasswordEncrypted: text('imap_password_encrypted'),
    smtpHost: text('smtp_host'),
    smtpPort: integer('smtp_port'),
    smtpUsername: text('smtp_username'),
    smtpPasswordEncrypted: text('smtp_password_encrypted'),
    // Nubo Pro subscription
    hasProSubscription: boolean('has_pro_subscription').default(false),
    proSubscriptionType: text('pro_subscription_type').$type<'monthly' | 'yearly'>(),
    proSubscriptionExpiresAt: timestamp('pro_subscription_expires_at'),
    // Status
    status: text('status').$type<'pending' | 'active' | 'suspended'>().default('pending'),
    provisionedBy: text('provisioned_by').references(() => user.id, { onDelete: 'set null' }),
    provisionedAt: timestamp('provisioned_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('organization_user_org_id_idx').on(t.organizationId),
    index('organization_user_domain_id_idx').on(t.domainId),
    index('organization_user_user_id_idx').on(t.userId),
    index('organization_user_email_idx').on(t.emailAddress),
    index('organization_user_nubo_username_idx').on(t.nuboUsername),
    index('organization_user_status_idx').on(t.status),
    index('organization_user_has_pro_idx').on(t.hasProSubscription),
  ],
);

// ==================== PRICING & PLANS ====================

// Plan categories (unlimited_user, limited_user, archival)
export const planCategory = createTable(
  'plan_category',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(), // unlimited_user, limited_user, archival
    displayName: text('display_name').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').default(0),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('plan_category_name_idx').on(t.name),
    index('plan_category_is_active_idx').on(t.isActive),
  ],
);

// Plan variants (storage tiers)
export const planVariant = createTable(
  'plan_variant',
  {
    id: text('id').primaryKey(),
    categoryId: text('category_id')
      .notNull()
      .references(() => planCategory.id, { onDelete: 'cascade' }),
    name: text('name').notNull(), // 5gb, 10gb, etc.
    displayName: text('display_name').notNull(),
    storageBytes: bigint('storage_bytes', { mode: 'number' }).notNull(),
    // Retail prices (for direct customers)
    retailPriceMonthly: decimal('retail_price_monthly', { precision: 15, scale: 2 }).notNull(),
    retailPriceYearly: decimal('retail_price_yearly', { precision: 15, scale: 2 }).notNull(),
    // Partner base prices (before tier discount)
    partnerPriceMonthly: decimal('partner_price_monthly', { precision: 15, scale: 2 }).notNull(),
    partnerPriceYearly: decimal('partner_price_yearly', { precision: 15, scale: 2 }).notNull(),
    currency: text('currency').default('INR'),
    isActive: boolean('is_active').default(true),
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('plan_variant_category_id_idx').on(t.categoryId),
    index('plan_variant_name_idx').on(t.name),
    index('plan_variant_is_active_idx').on(t.isActive),
    index('plan_variant_sort_order_idx').on(t.sortOrder),
    unique('plan_variant_category_name_unique').on(t.categoryId, t.name),
  ],
);

// Multi-currency pricing for plan variants
export const planVariantPrice = createTable(
  'plan_variant_price',
  {
    id: text('id').primaryKey(),
    variantId: text('variant_id')
      .notNull()
      .references(() => planVariant.id, { onDelete: 'cascade' }),
    currency: text('currency').notNull(),
    retailPriceMonthly: decimal('retail_price_monthly', { precision: 15, scale: 2 }).notNull(),
    retailPriceYearly: decimal('retail_price_yearly', { precision: 15, scale: 2 }).notNull(),
    partnerPriceMonthly: decimal('partner_price_monthly', { precision: 15, scale: 2 }).notNull(),
    partnerPriceYearly: decimal('partner_price_yearly', { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('plan_variant_price_unique').on(t.variantId, t.currency),
    index('plan_variant_price_variant_id_idx').on(t.variantId),
    index('plan_variant_price_currency_idx').on(t.currency),
  ],
);

// Nubo Pro subscription pricing
export const proSubscriptionPrice = createTable(
  'pro_subscription_price',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    monthlyPrice: decimal('monthly_price', { precision: 15, scale: 2 }).notNull(),
    yearlyPrice: decimal('yearly_price', { precision: 15, scale: 2 }).notNull(),
    currency: text('currency').default('INR'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('pro_subscription_price_is_active_idx').on(t.isActive),
    index('pro_subscription_price_currency_idx').on(t.currency),
  ],
);

// ==================== PARTNER STORAGE PURCHASES ====================

// Partner storage pool purchases
export const partnerStoragePurchase = createTable(
  'partner_storage_purchase',
  {
    id: text('id').primaryKey(),
    partnerId: text('partner_id')
      .notNull()
      .references(() => partner.id, { onDelete: 'cascade' }),
    storageBytes: bigint('storage_bytes', { mode: 'number' }).notNull(),
    amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
    currency: text('currency').default('INR'),
    status: text('status')
      .$type<'pending' | 'approved' | 'rejected' | 'cancelled'>()
      .default('pending'),
    approvedBy: text('approved_by').references(() => user.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at'),
    invoiceId: text('invoice_id'), // Will reference invoice table
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('partner_storage_purchase_partner_id_idx').on(t.partnerId),
    index('partner_storage_purchase_status_idx').on(t.status),
  ],
);

// ==================== INVOICING ====================

// Invoices
export const invoice = createTable(
  'invoice',
  {
    id: text('id').primaryKey(),
    invoiceNumber: text('invoice_number').notNull().unique(),
    type: text('type').$type<'partner' | 'organization' | 'user'>().notNull(),
    partnerId: text('partner_id').references(() => partner.id, { onDelete: 'set null' }),
    organizationId: text('organization_id').references(() => organization.id, {
      onDelete: 'set null',
    }),
    // Billing details (captured at invoice time)
    billingName: text('billing_name'),
    billingEmail: text('billing_email'),
    billingAddress: text('billing_address'),
    gstNumber: text('gst_number'),
    // Amounts
    subtotal: decimal('subtotal', { precision: 15, scale: 2 }).notNull(),
    gstPercentage: decimal('gst_percentage', { precision: 5, scale: 2 }).default('18.00'),
    gstAmount: decimal('gst_amount', { precision: 15, scale: 2 }).notNull(),
    totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull(),
    currency: text('currency').default('INR'),
    // Billing period
    billingPeriodStart: date('billing_period_start'),
    billingPeriodEnd: date('billing_period_end'),
    dueDate: date('due_date').notNull(),
    // Status
    status: text('status')
      .$type<'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'>()
      .default('draft'),
    paidAt: timestamp('paid_at'),
    paymentMethod: text('payment_method'),
    razorpayPaymentId: text('razorpay_payment_id'),
    razorpayOrderId: text('razorpay_order_id'),
    // PDF and notifications
    pdfUrl: text('pdf_url'),
    pdfR2Key: text('pdf_r2_key'),
    sentAt: timestamp('sent_at'),
    reminderSentAt: timestamp('reminder_sent_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('invoice_invoice_number_idx').on(t.invoiceNumber),
    index('invoice_type_idx').on(t.type),
    index('invoice_partner_id_idx').on(t.partnerId),
    index('invoice_organization_id_idx').on(t.organizationId),
    index('invoice_status_idx').on(t.status),
    index('invoice_due_date_idx').on(t.dueDate),
    index('invoice_razorpay_order_id_idx').on(t.razorpayOrderId),
  ],
);

// Invoice line items
export const invoiceLineItem = createTable(
  'invoice_line_item',
  {
    id: text('id').primaryKey(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoice.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    quantity: integer('quantity').default(1),
    unitPrice: decimal('unit_price', { precision: 15, scale: 2 }).notNull(),
    totalPrice: decimal('total_price', { precision: 15, scale: 2 }).notNull(),
    planVariantId: text('plan_variant_id').references(() => planVariant.id, {
      onDelete: 'set null',
    }),
    organizationUserId: text('organization_user_id').references(() => organizationUser.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('invoice_line_item_invoice_id_idx').on(t.invoiceId),
    index('invoice_line_item_plan_variant_id_idx').on(t.planVariantId),
  ],
);

// ==================== PAYMENT TRANSACTIONS ====================

// Payment transactions (for tracking all payments)
export const paymentTransaction = createTable(
  'payment_transaction',
  {
    id: text('id').primaryKey(),
    invoiceId: text('invoice_id').references(() => invoice.id, { onDelete: 'set null' }),
    partnerId: text('partner_id').references(() => partner.id, { onDelete: 'set null' }),
    organizationId: text('organization_id').references(() => organization.id, {
      onDelete: 'set null',
    }),
    amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
    currency: text('currency').default('INR'),
    // Razorpay details
    razorpayOrderId: text('razorpay_order_id'),
    razorpayPaymentId: text('razorpay_payment_id'),
    razorpaySignature: text('razorpay_signature'),
    // Status
    status: text('status').$type<'pending' | 'success' | 'failed' | 'refunded'>().default('pending'),
    paymentMethod: text('payment_method'),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('payment_transaction_invoice_id_idx').on(t.invoiceId),
    index('payment_transaction_partner_id_idx').on(t.partnerId),
    index('payment_transaction_organization_id_idx').on(t.organizationId),
    index('payment_transaction_status_idx').on(t.status),
    index('payment_transaction_razorpay_order_id_idx').on(t.razorpayOrderId),
    index('payment_transaction_razorpay_payment_id_idx').on(t.razorpayPaymentId),
  ],
);

// ==================== RAZORPAY SUBSCRIPTIONS ====================

// Razorpay subscriptions (for recurring billing)
export const razorpaySubscription = createTable(
  'razorpay_subscription',
  {
    id: text('id').primaryKey(),
    razorpaySubscriptionId: text('razorpay_subscription_id').unique(),
    partnerId: text('partner_id').references(() => partner.id, { onDelete: 'set null' }),
    organizationId: text('organization_id').references(() => organization.id, {
      onDelete: 'set null',
    }),
    organizationUserId: text('organization_user_id').references(() => organizationUser.id, {
      onDelete: 'set null',
    }),
    planVariantId: text('plan_variant_id').references(() => planVariant.id, {
      onDelete: 'set null',
    }),
    billingCycle: text('billing_cycle').$type<'monthly' | 'yearly'>(),
    amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
    currency: text('currency').default('INR'),
    status: text('status')
      .$type<'created' | 'active' | 'paused' | 'cancelled' | 'completed'>()
      .default('created'),
    nextBillingAt: timestamp('next_billing_at'),
    cancelledAt: timestamp('cancelled_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('razorpay_subscription_razorpay_id_idx').on(t.razorpaySubscriptionId),
    index('razorpay_subscription_partner_id_idx').on(t.partnerId),
    index('razorpay_subscription_organization_id_idx').on(t.organizationId),
    index('razorpay_subscription_org_user_id_idx').on(t.organizationUserId),
    index('razorpay_subscription_status_idx').on(t.status),
  ],
);

// ==================== EMAIL ARCHIVAL ====================

// Email archival configuration
export const emailArchival = createTable(
  'email_archival',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    domainId: text('domain_id')
      .notNull()
      .references(() => organizationDomain.id, { onDelete: 'cascade' }),
    planVariantId: text('plan_variant_id').references(() => planVariant.id, {
      onDelete: 'set null',
    }),
    storageBytes: bigint('storage_bytes', { mode: 'number' }).notNull(),
    usedBytes: bigint('used_bytes', { mode: 'number' }).default(0),
    retentionDays: integer('retention_days').default(2555), // ~7 years default
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('email_archival_organization_id_idx').on(t.organizationId),
    index('email_archival_domain_id_idx').on(t.domainId),
    index('email_archival_is_active_idx').on(t.isActive),
    unique('email_archival_domain_unique').on(t.domainId),
  ],
);

// ==================== APPROVAL REQUESTS ====================

// Approval request queue (for admin to approve various requests)
export const approvalRequest = createTable(
  'approval_request',
  {
    id: text('id').primaryKey(),
    type: text('type')
      .$type<'domain' | 'user' | 'storage' | 'archival' | 'organization'>()
      .notNull(),
    requestorType: text('requestor_type').$type<'partner' | 'organization'>().notNull(),
    requestorPartnerId: text('requestor_partner_id').references(() => partner.id, {
      onDelete: 'cascade',
    }),
    requestorOrganizationId: text('requestor_organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),
    targetOrganizationId: text('target_organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),
    targetDomainId: text('target_domain_id').references(() => organizationDomain.id, {
      onDelete: 'cascade',
    }),
    targetUserId: text('target_user_id').references(() => organizationUser.id, {
      onDelete: 'cascade',
    }),
    // Flexible data storage for request details
    requestData: jsonb('request_data').$type<Record<string, unknown>>().notNull(),
    status: text('status').$type<'pending' | 'approved' | 'rejected'>().default('pending'),
    reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at'),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('approval_request_type_idx').on(t.type),
    index('approval_request_requestor_type_idx').on(t.requestorType),
    index('approval_request_requestor_partner_id_idx').on(t.requestorPartnerId),
    index('approval_request_requestor_org_id_idx').on(t.requestorOrganizationId),
    index('approval_request_status_idx').on(t.status),
    index('approval_request_created_at_idx').on(t.createdAt),
  ],
);

// ==================== B2B RELATIONS ====================

// Admin Role Relations
export const adminRoleRelations = relations(adminRole, ({ many }) => ({
  adminUsers: many(adminUser),
}));

export const adminUserRelations = relations(adminUser, ({ one }) => ({
  user: one(user, {
    fields: [adminUser.userId],
    references: [user.id],
  }),
  role: one(adminRole, {
    fields: [adminUser.roleId],
    references: [adminRole.id],
  }),
}));

// Partner Tier Relations
export const partnerTierRelations = relations(partnerTier, ({ many }) => ({
  partners: many(partner),
}));

// Partnership Application Relations
export const partnershipApplicationRelations = relations(partnershipApplication, ({ one }) => ({
  user: one(user, {
    fields: [partnershipApplication.userId],
    references: [user.id],
  }),
  reviewer: one(user, {
    fields: [partnershipApplication.reviewedBy],
    references: [user.id],
    relationName: 'applicationReviewer',
  }),
}));

// Partner Relations
export const partnerRelations = relations(partner, ({ one, many }) => ({
  user: one(user, {
    fields: [partner.userId],
    references: [user.id],
  }),
  application: one(partnershipApplication, {
    fields: [partner.applicationId],
    references: [partnershipApplication.id],
  }),
  tier: one(partnerTier, {
    fields: [partner.tierId],
    references: [partnerTier.id],
  }),
  organizations: many(organization),
  quarterlySales: many(partnerQuarterlySales),
  storagePurchases: many(partnerStoragePurchase),
  invoices: many(invoice),
  paymentTransactions: many(paymentTransaction),
  razorpaySubscriptions: many(razorpaySubscription),
}));

// Partner Quarterly Sales Relations
export const partnerQuarterlySalesRelations = relations(partnerQuarterlySales, ({ one }) => ({
  partner: one(partner, {
    fields: [partnerQuarterlySales.partnerId],
    references: [partner.id],
  }),
}));

// Partner Storage Purchase Relations
export const partnerStoragePurchaseRelations = relations(partnerStoragePurchase, ({ one }) => ({
  partner: one(partner, {
    fields: [partnerStoragePurchase.partnerId],
    references: [partner.id],
  }),
  approver: one(user, {
    fields: [partnerStoragePurchase.approvedBy],
    references: [user.id],
  }),
}));

// Organization Relations
export const organizationRelations = relations(organization, ({ one, many }) => ({
  partner: one(partner, {
    fields: [organization.partnerId],
    references: [partner.id],
  }),
  owner: one(user, {
    fields: [organization.ownerUserId],
    references: [user.id],
  }),
  domains: many(organizationDomain),
  users: many(organizationUser),
  invoices: many(invoice),
  paymentTransactions: many(paymentTransaction),
  razorpaySubscriptions: many(razorpaySubscription),
  archivalConfigs: many(emailArchival),
}));

// Organization Domain Relations
export const organizationDomainRelations = relations(organizationDomain, ({ one, many }) => ({
  organization: one(organization, {
    fields: [organizationDomain.organizationId],
    references: [organization.id],
  }),
  approver: one(user, {
    fields: [organizationDomain.approvedBy],
    references: [user.id],
  }),
  users: many(organizationUser),
  archivalConfig: one(emailArchival),
}));

// Organization User Relations
export const organizationUserRelations = relations(organizationUser, ({ one }) => ({
  organization: one(organization, {
    fields: [organizationUser.organizationId],
    references: [organization.id],
  }),
  domain: one(organizationDomain, {
    fields: [organizationUser.domainId],
    references: [organizationDomain.id],
  }),
  user: one(user, {
    fields: [organizationUser.userId],
    references: [user.id],
  }),
  provisioner: one(user, {
    fields: [organizationUser.provisionedBy],
    references: [user.id],
    relationName: 'userProvisioner',
  }),
}));

// Plan Category Relations
export const planCategoryRelations = relations(planCategory, ({ many }) => ({
  variants: many(planVariant),
}));

// Plan Variant Relations
export const planVariantRelations = relations(planVariant, ({ one, many }) => ({
  category: one(planCategory, {
    fields: [planVariant.categoryId],
    references: [planCategory.id],
  }),
  prices: many(planVariantPrice),
  invoiceLineItems: many(invoiceLineItem),
  razorpaySubscriptions: many(razorpaySubscription),
  archivalConfigs: many(emailArchival),
}));

// Plan Variant Price Relations
export const planVariantPriceRelations = relations(planVariantPrice, ({ one }) => ({
  variant: one(planVariant, {
    fields: [planVariantPrice.variantId],
    references: [planVariant.id],
  }),
}));

// Invoice Relations
export const invoiceRelations = relations(invoice, ({ one, many }) => ({
  partner: one(partner, {
    fields: [invoice.partnerId],
    references: [partner.id],
  }),
  organization: one(organization, {
    fields: [invoice.organizationId],
    references: [organization.id],
  }),
  lineItems: many(invoiceLineItem),
  paymentTransactions: many(paymentTransaction),
}));

// Invoice Line Item Relations
export const invoiceLineItemRelations = relations(invoiceLineItem, ({ one }) => ({
  invoice: one(invoice, {
    fields: [invoiceLineItem.invoiceId],
    references: [invoice.id],
  }),
  planVariant: one(planVariant, {
    fields: [invoiceLineItem.planVariantId],
    references: [planVariant.id],
  }),
  organizationUser: one(organizationUser, {
    fields: [invoiceLineItem.organizationUserId],
    references: [organizationUser.id],
  }),
}));

// Payment Transaction Relations
export const paymentTransactionRelations = relations(paymentTransaction, ({ one }) => ({
  invoice: one(invoice, {
    fields: [paymentTransaction.invoiceId],
    references: [invoice.id],
  }),
  partner: one(partner, {
    fields: [paymentTransaction.partnerId],
    references: [partner.id],
  }),
  organization: one(organization, {
    fields: [paymentTransaction.organizationId],
    references: [organization.id],
  }),
}));

// Razorpay Subscription Relations
export const razorpaySubscriptionRelations = relations(razorpaySubscription, ({ one }) => ({
  partner: one(partner, {
    fields: [razorpaySubscription.partnerId],
    references: [partner.id],
  }),
  organization: one(organization, {
    fields: [razorpaySubscription.organizationId],
    references: [organization.id],
  }),
  organizationUser: one(organizationUser, {
    fields: [razorpaySubscription.organizationUserId],
    references: [organizationUser.id],
  }),
  planVariant: one(planVariant, {
    fields: [razorpaySubscription.planVariantId],
    references: [planVariant.id],
  }),
}));

// Email Archival Relations
export const emailArchivalRelations = relations(emailArchival, ({ one }) => ({
  organization: one(organization, {
    fields: [emailArchival.organizationId],
    references: [organization.id],
  }),
  domain: one(organizationDomain, {
    fields: [emailArchival.domainId],
    references: [organizationDomain.id],
  }),
  planVariant: one(planVariant, {
    fields: [emailArchival.planVariantId],
    references: [planVariant.id],
  }),
}));

// Approval Request Relations
export const approvalRequestRelations = relations(approvalRequest, ({ one }) => ({
  requestorPartner: one(partner, {
    fields: [approvalRequest.requestorPartnerId],
    references: [partner.id],
  }),
  requestorOrganization: one(organization, {
    fields: [approvalRequest.requestorOrganizationId],
    references: [organization.id],
    relationName: 'requestorOrg',
  }),
  targetOrganization: one(organization, {
    fields: [approvalRequest.targetOrganizationId],
    references: [organization.id],
    relationName: 'targetOrg',
  }),
  targetDomain: one(organizationDomain, {
    fields: [approvalRequest.targetDomainId],
    references: [organizationDomain.id],
  }),
  targetUser: one(organizationUser, {
    fields: [approvalRequest.targetUserId],
    references: [organizationUser.id],
  }),
  reviewer: one(user, {
    fields: [approvalRequest.reviewedBy],
    references: [user.id],
  }),
}));
