import pg from 'pg';
// We might need to define schema locally or import if possible.
// For this MVP, we'll use raw SQL or simple query builder usage.

export class DB {
    private pool: pg.Pool;

    constructor(connectionString: string) {
        this.pool = new pg.Pool({
            connectionString,
        });
        // Add bodyHtml column if it doesn't exist (for local development)
        this.ensureBodyHtmlColumn();
    }

    private async ensureBodyHtmlColumn() {
        const client = await this.pool.connect();
        try {
            await client.query(`
                ALTER TABLE "mail0_email"
                ADD COLUMN IF NOT EXISTS "body_html" text;
            `);
            console.log('[DB] Ensured body_html column exists');
        } catch (err) {
            console.error('[DB] Failed to add body_html column', err);
        } finally {
            client.release();
        }
    }

    async getImapConnections() {
        const client = await this.pool.connect();
        try {
            const res = await client.query(`
                SELECT * FROM "mail0_connection" 
                WHERE "provider_id" = 'imap'
            `);
            return res.rows;
        } finally {
            client.release();
        }
    }

    async saveEmailMetadata(email: any) {
        const client = await this.pool.connect();
        try {
            // Upsert email metadata
            // Using ON CONFLICT to avoid duplicates if we process the same email twice
            await client.query(`
                INSERT INTO "mail0_email" (
                    "id", "thread_id", "connection_id", "message_id",
                    "in_reply_to", "references", "subject", "from", "to",
                    "cc", "bcc", "reply_to", "snippet", "body_r2_key", "body_html",
                    "internal_date", "is_read", "is_starred", "labels",
                    "created_at", "updated_at"
                ) VALUES (
                    $1, $2, $3, $4,
                    $5, $6, $7, $8, $9,
                    $10, $11, $12, $13, $14, $15,
                    $16, $17, $18, $19,
                    NOW(), NOW()
                )
                ON CONFLICT ("id") DO UPDATE SET
                    "is_read" = EXCLUDED."is_read",
                    "is_starred" = EXCLUDED."is_starred",
                    "labels" = EXCLUDED."labels",
                    "body_html" = EXCLUDED."body_html",
                    "updated_at" = NOW()
            `, [
                email.id, email.threadId, email.connectionId, email.messageId,
                email.inReplyTo, email.references, email.subject, JSON.stringify(email.from), JSON.stringify(email.to),
                JSON.stringify(email.cc), JSON.stringify(email.bcc), JSON.stringify(email.replyTo), email.snippet, email.bodyR2Key, email.bodyHtml,
                new Date(email.internalDate), email.isRead, email.isStarred, JSON.stringify(email.labels)
            ]);
        } finally {
            client.release();
        }
    }
}
