import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import { DB } from './db.js';
import { Store } from './store.js';
import type { Logger } from 'pino';

export class SyncEngine {
    constructor(
        private db: DB,
        private store: Store,
        private logger: Logger
    ) { }

    async run() {
        this.logger.info('SyncEngine running...');
        const connections = await this.db.getImapConnections();
        this.logger.info(`Found ${connections.length} IMAP connections`);

        for (const conn of connections) {
            await this.syncConnection(conn);
        }
    }

    private async syncConnection(conn: any) {
        this.logger.info(`Syncing connection ${conn.id} (${conn.email})`);

        const config = conn.config;
        if (!config) {
            this.logger.warn(`Skipping connection ${conn.id} - no config`);
            return;
        }

        const client = new ImapFlow({
            host: config.imap.host,
            port: config.imap.port,
            secure: config.imap.secure,
            auth: {
                user: config.auth.user,
                pass: config.auth.pass,
            },
            logger: false, // Disable internal logger to avoid noise
        });

        try {
            await client.connect();
            this.logger.info('Connected to IMAP server');

            const lock = await client.getMailboxLock('INBOX');
            try {
                // Fetch latest messages
                // TODO: Use uidValidity and modseq for incremental sync in future
                // For now, fetching last 20 messages to demonstrate flow
                for await (const message of client.fetch('1:*', { envelope: true, source: true, uid: true })) {
                    if (!message.source) {
                        continue;
                    }

                    const parsed: ParsedMail = await simpleParser(message.source);

                    if (!message.envelope?.date) {
                        continue;
                    }

                    const threadId = message.uid.toString(); // Simple thread ID for now
                    const messageId = message.envelope.messageId || `${threadId}@${config.host}`;

                    // 1. Save body to R2
                    const emailBodyData = {
                        id: message.uid.toString(),
                        threadId: threadId,
                        snippet: parsed.text?.substring(0, 100),
                        payload: {
                            headers: (Array.from(parsed.headers || new Map()) as [string, any][]).map(([key, value]) => ({
                                name: key,
                                value,
                            })),
                            body: parsed.html || parsed.textAsHtml || parsed.text,
                        },
                    };

                    const bodyR2Key = await this.store.saveEmail(conn.id, threadId, emailBodyData);

                    // 2. Save metadata to Postgres
                    const emailMetadata = {
                        id: crypto.randomUUID(), // Internal ID
                        threadId: threadId,
                        connectionId: conn.id,
                        messageId: messageId,
                        inReplyTo: message.envelope.inReplyTo,
                        references: null, // TODO: Parse References header from parsed.headers
                        subject: message.envelope.subject,
                        from: message.envelope.from?.[0] || { name: 'Unknown', address: 'unknown' },
                        to: message.envelope.to || [],
                        cc: message.envelope.cc || [],
                        bcc: message.envelope.bcc || [],
                        replyTo: message.envelope.replyTo || [],
                        snippet: parsed.text?.substring(0, 100),
                        bodyR2Key: bodyR2Key,
                        bodyHtml: parsed.html || parsed.textAsHtml || parsed.text, // Store body in DB for local dev
                        internalDate: message.envelope.date.getTime(),
                        isRead: message.flags?.has('\\Seen') ?? false,
                        isStarred: message.flags?.has('\\Flagged') ?? false,
                        labels: ['INBOX'], // Default label
                    };

                    await this.db.saveEmailMetadata(emailMetadata);
                    this.logger.info(`Saved email ${message.uid}`);
                }
            } finally {
                lock.release();
            }

            await client.logout();
        } catch (error) {
            this.logger.error(error, `Failed to sync connection ${conn.id}`);
        }
    }
}
