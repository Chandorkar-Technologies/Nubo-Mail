import type { MailManager, ManagerConfig, IGetThreadResponse, ParsedDraft } from './types';
import type { IOutgoingMessage, Label, ParsedMessage, DeleteAllSpamResponse } from '../../types';
import type { CreateDraftData } from '../schemas';
import { SMTPClient } from './smtp';
import { CFImap } from 'cf-imap';
import { parseAddressList, parseFrom } from '../email-utils';
import { StandardizedError } from './utils';
import { env } from '../../env';

interface ImapConnectionConfig {
  host: string;
  port: number;
  tls: boolean;
  username: string;
  password: string;
}

interface SmtpConnectionConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

interface ImapMessage {
  uid: number;
  seq: number;
  flags: string[];
  envelope: {
    date: string;
    subject: string;
    from: Array<{ name?: string; mailbox: string; host: string }>;
    to: Array<{ name?: string; mailbox: string; host: string }> | null;
    cc: Array<{ name?: string; mailbox: string; host: string }> | null;
    bcc: Array<{ name?: string; mailbox: string; host: string }> | null;
    'message-id': string;
    'in-reply-to': string | null;
    references: string | null;
  };
  bodyStructure: any;
  body: {
    [key: string]: string | Buffer;
  };
}

export class ImapMailManager implements MailManager {
  private imapConfig: ImapConnectionConfig | null = null;
  private smtpConfig: SmtpConnectionConfig | null = null;
  private smtpClient: SMTPClient | null = null;

  constructor(public config: ManagerConfig) {
    // IMAP config will be loaded when needed from database
  }

  /**
   * Initialize IMAP configuration
   * This should be called with the imapConfig from the database
   */
  public async initialize(
    imapConfig: ImapConnectionConfig,
    smtpConfig?: SmtpConnectionConfig,
  ): Promise<void> {
    this.imapConfig = imapConfig;
    if (smtpConfig) {
      this.smtpConfig = smtpConfig;
      this.smtpClient = new SMTPClient(smtpConfig);
    }
  }

  /**
   * Get IMAP client instance
   */
  private async getImapClient(): Promise<CFImap> {
    if (!this.imapConfig) {
      throw new StandardizedError('IMAP configuration not initialized', 'CONFIGURATION_ERROR');
    }

    const imap = new CFImap({
      host: this.imapConfig.host,
      port: this.imapConfig.port,
      tls: this.imapConfig.tls,
      auth: {
        username: this.imapConfig.username,
        password: this.imapConfig.password,
      },
    });

    await imap.connect();
    return imap;
  }

  /**
   * Parse IMAP email address to Sender format
   */
  private parseAddress(addr: { name?: string; mailbox: string; host: string }): {
    name?: string;
    email: string;
  } {
    return {
      name: addr.name,
      email: `${addr.mailbox}@${addr.host}`,
    };
  }

  /**
   * Parse IMAP message to ParsedMessage
   */
  private async parseMessage(msg: ImapMessage, connectionId: string): Promise<ParsedMessage> {
    const from = msg.envelope.from?.[0];
    const sender = from ? this.parseAddress(from) : { email: 'unknown@unknown.com' };

    const to = msg.envelope.to?.map((addr) => this.parseAddress(addr)) || [];
    const cc = msg.envelope.cc?.map((addr) => this.parseAddress(addr)) || null;
    const bcc = msg.envelope.bcc?.map((addr) => this.parseAddress(addr)) || null;

    // Extract body content
    let body = '';
    let processedHtml = '';

    if (msg.body) {
      // Try to get HTML body first, fall back to text
      if (msg.body['text/html']) {
        const htmlBody = msg.body['text/html'];
        body = typeof htmlBody === 'string' ? htmlBody : htmlBody.toString('utf-8');
        processedHtml = body;
      } else if (msg.body['text/plain']) {
        const textBody = msg.body['text/plain'];
        body = typeof textBody === 'string' ? textBody : textBody.toString('utf-8');
        // Convert plain text to HTML
        processedHtml = `<pre>${body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
      }
    }

    const unread = !msg.flags.includes('\\Seen');
    const isDraft = msg.flags.includes('\\Draft');

    return {
      id: msg.uid.toString(),
      connectionId,
      title: msg.envelope.subject || '(no subject)',
      subject: msg.envelope.subject || '(no subject)',
      tags: [],
      sender,
      to,
      cc,
      bcc,
      tls: true, // Assume TLS for IMAP connections
      receivedOn: new Date(msg.envelope.date).toISOString(),
      unread,
      body,
      processedHtml,
      blobUrl: '',
      messageId: msg.envelope['message-id'],
      inReplyTo: msg.envelope['in-reply-to'] || undefined,
      references: msg.envelope.references || undefined,
      threadId: msg.uid.toString(), // IMAP doesn't have native threading, use UID as thread ID
      attachments: [],
      isDraft,
    };
  }

  /**
   * Get emails from a folder
   */
  public async list(params: {
    folder: string;
    query?: string;
    maxResults?: number;
    labelIds?: string[];
    pageToken?: string | number;
  }): Promise<{
    threads: { id: string; historyId: string | null; $raw?: unknown }[];
    nextPageToken: string | null;
  }> {
    const imap = await this.getImapClient();

    try {
      // Select the folder
      await imap.selectFolder(params.folder || 'INBOX');

      // Search for messages
      const searchCriteria = params.query || 'ALL';
      const uids = await imap.searchEmails({ criteria: searchCriteria });

      // Limit results
      const maxResults = params.maxResults || 50;
      const startIndex = typeof params.pageToken === 'number' ? params.pageToken : 0;
      const limitedUids = uids.slice(startIndex, startIndex + maxResults);

      const threads = limitedUids.map((uid) => ({
        id: uid.toString(),
        historyId: null,
        $raw: { uid },
      }));

      const nextPageToken =
        startIndex + maxResults < uids.length ? startIndex + maxResults : null;

      await imap.logout();

      return {
        threads,
        nextPageToken: nextPageToken !== null ? String(nextPageToken) : null,
      };
    } catch (error) {
      await imap.logout();
      throw error;
    }
  }

  /**
   * Get a specific thread/message by ID
   */
  public async get(id: string): Promise<IGetThreadResponse> {
    const imap = await this.getImapClient();

    try {
      await imap.selectFolder('INBOX');

      // Fetch the message
      const messages = await imap.fetchEmails({
        range: id,
        fetchBody: true,
      });

      if (!messages || messages.length === 0) {
        throw new StandardizedError('Message not found', 'NOT_FOUND');
      }

      const msg = messages[0] as any as ImapMessage;
      const parsedMessage = await this.parseMessage(msg, this.config.auth.userId);

      await imap.logout();

      return {
        messages: [parsedMessage],
        latest: parsedMessage,
        hasUnread: parsedMessage.unread,
        totalReplies: 1,
        labels: [],
        isLatestDraft: parsedMessage.isDraft,
      };
    } catch (error) {
      await imap.logout();
      throw error;
    }
  }

  /**
   * Get user labels/folders
   */
  public async getUserLabels(): Promise<Label[]> {
    const imap = await this.getImapClient();

    try {
      const namespaces = await imap.getNamespaces();
      const namespace = namespaces[0] || '';

      const folders = await imap.getFolders(namespace);

      const labels: Label[] = folders.map((folder, index) => ({
        id: folder.name,
        name: folder.name,
        type: 'user',
        count: 0,
      }));

      // Add standard IMAP folders
      const standardLabels: Label[] = [
        { id: 'INBOX', name: 'Inbox', type: 'system' },
        { id: 'SENT', name: 'Sent', type: 'system' },
        { id: 'DRAFTS', name: 'Drafts', type: 'system' },
        { id: 'TRASH', name: 'Trash', type: 'system' },
        { id: 'SPAM', name: 'Spam', type: 'system' },
      ];

      await imap.logout();

      return [...standardLabels, ...labels];
    } catch (error) {
      await imap.logout();
      throw error;
    }
  }

  /**
   * Mark messages as read
   */
  public async markAsRead(threadIds: string[]): Promise<void> {
    const imap = await this.getImapClient();

    try {
      await imap.selectFolder('INBOX');

      // IMAP STORE command to add \Seen flag
      // Note: cf-imap doesn't have a direct method for this yet
      // This is a placeholder - will need to be implemented when cf-imap supports STORE
      console.log('Mark as read:', threadIds);

      await imap.logout();
    } catch (error) {
      await imap.logout();
      throw error;
    }
  }

  /**
   * Mark messages as unread
   */
  public async markAsUnread(threadIds: string[]): Promise<void> {
    const imap = await this.getImapClient();

    try {
      await imap.selectFolder('INBOX');

      // IMAP STORE command to remove \Seen flag
      // Note: cf-imap doesn't have a direct method for this yet
      // This is a placeholder - will need to be implemented when cf-imap supports STORE
      console.log('Mark as unread:', threadIds);

      await imap.logout();
    } catch (error) {
      await imap.logout();
      throw error;
    }
  }

  /**
   * Get message attachments
   */
  public async getMessageAttachments(id: string): Promise<
    {
      filename: string;
      mimeType: string;
      size: number;
      attachmentId: string;
      headers: { name: string; value: string }[];
      body: string;
    }[]
  > {
    // TODO: Implement attachment fetching
    return [];
  }

  /**
   * Get attachment by ID
   */
  public async getAttachment(messageId: string, attachmentId: string): Promise<string | undefined> {
    // TODO: Implement attachment fetching
    return undefined;
  }

  // ==================== Unsupported Operations for IMAP (Read-Only) ====================

  public async create(data: IOutgoingMessage): Promise<{ id?: string | null }> {
    if (!this.smtpClient) {
      throw new StandardizedError(
        'SMTP configuration not initialized. Cannot send emails.',
        'CONFIGURATION_ERROR',
      );
    }

    return await this.smtpClient.sendEmail(data);
  }

  public async sendDraft(id: string, data: IOutgoingMessage): Promise<void> {
    if (!this.smtpClient) {
      throw new StandardizedError(
        'SMTP configuration not initialized. Cannot send emails.',
        'CONFIGURATION_ERROR',
      );
    }

    await this.smtpClient.sendEmail(data);
  }

  public async createDraft(
    data: CreateDraftData,
  ): Promise<{ id?: string | null; success?: boolean; error?: string }> {
    throw new StandardizedError(
      'Creating drafts via IMAP is not supported.',
      'UNSUPPORTED_OPERATION',
    );
  }

  public async getDraft(id: string): Promise<ParsedDraft> {
    throw new StandardizedError(
      'Getting drafts via IMAP is not supported.',
      'UNSUPPORTED_OPERATION',
    );
  }

  public async listDrafts(params: { q?: string; maxResults?: number; pageToken?: string }): Promise<{
    threads: { id: string; historyId: string | null; $raw: unknown }[];
    nextPageToken: string | null;
  }> {
    throw new StandardizedError(
      'Listing drafts via IMAP is not supported.',
      'UNSUPPORTED_OPERATION',
    );
  }

  public async deleteDraft(id: string): Promise<void> {
    throw new StandardizedError(
      'Deleting drafts via IMAP is not supported.',
      'UNSUPPORTED_OPERATION',
    );
  }

  public async delete(id: string): Promise<void> {
    const imap = await this.getImapClient();

    try {
      await imap.selectFolder('INBOX');

      // IMAP STORE command to add \Deleted flag, then EXPUNGE
      // Note: cf-imap doesn't have a direct method for this yet
      // This is a placeholder
      console.log('Delete message:', id);

      await imap.logout();
    } catch (error) {
      await imap.logout();
      throw error;
    }
  }

  public async count(): Promise<{ count?: number; label?: string }[]> {
    // TODO: Implement message count
    return [];
  }

  public async getTokens(code: string): Promise<{
    tokens: { access_token?: string; refresh_token?: string; expiry_date?: number };
  }> {
    throw new StandardizedError(
      'IMAP uses username/password authentication, not OAuth tokens.',
      'UNSUPPORTED_OPERATION',
    );
  }

  public async getUserInfo(tokens?: ManagerConfig['auth']): Promise<{
    address: string;
    name: string;
    photo: string;
  }> {
    return {
      address: this.config.auth.email,
      name: this.config.auth.email.split('@')[0] || 'IMAP User',
      photo: '',
    };
  }

  public getScope(): string {
    return 'imap';
  }

  public async listHistory<T>(historyId: string): Promise<{ history: T[]; historyId: string }> {
    // IMAP doesn't have a history API like Gmail
    return { history: [], historyId };
  }

  public normalizeIds(id: string[]): { threadIds: string[] } {
    return { threadIds: id };
  }

  public async modifyLabels(
    id: string[],
    options: { addLabels: string[]; removeLabels: string[] },
  ): Promise<void> {
    // TODO: Implement label modification via IMAP STORE command
    console.log('Modify labels:', id, options);
  }

  public async getLabel(id: string): Promise<Label> {
    return {
      id,
      name: id,
      type: 'user',
    };
  }

  public async createLabel(label: {
    name: string;
    color?: { backgroundColor: string; textColor: string };
  }): Promise<void> {
    // TODO: Create IMAP folder
    console.log('Create label:', label);
  }

  public async updateLabel(
    id: string,
    label: { name: string; color?: { backgroundColor: string; textColor: string } },
  ): Promise<void> {
    // TODO: Rename IMAP folder
    console.log('Update label:', id, label);
  }

  public async deleteLabel(id: string): Promise<void> {
    // TODO: Delete IMAP folder
    console.log('Delete label:', id);
  }

  public async getEmailAliases(): Promise<{ email: string; name?: string; primary?: boolean }[]> {
    return [
      {
        email: this.config.auth.email,
        name: this.config.auth.email,
        primary: true,
      },
    ];
  }

  public async revokeToken(token: string): Promise<boolean> {
    // IMAP doesn't use tokens
    return true;
  }

  public async deleteAllSpam(): Promise<DeleteAllSpamResponse> {
    throw new StandardizedError(
      'Deleting all spam via IMAP is not supported.',
      'UNSUPPORTED_OPERATION',
    );
  }

  public async getRawEmail(id: string): Promise<string> {
    const imap = await this.getImapClient();

    try {
      await imap.selectFolder('INBOX');

      const messages = await imap.fetchEmails({
        range: id,
        fetchBody: true,
      });

      if (!messages || messages.length === 0) {
        throw new StandardizedError('Message not found', 'NOT_FOUND');
      }

      const msg = messages[0] as any;

      await imap.logout();

      // Return the raw message
      return JSON.stringify(msg);
    } catch (error) {
      await imap.logout();
      throw error;
    }
  }
}
