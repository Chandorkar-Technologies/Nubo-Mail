import 'dotenv/config';
import { createServer } from 'http';
import { pino } from 'pino';
import { SyncEngine } from './sync-engine.js';
import { SmtpService } from './smtp-service.js';
import { DB } from './db.js';
import { Store } from './store.js';

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
});

const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3001', 10);
const SMTP_SERVICE_API_KEY = process.env.SMTP_SERVICE_API_KEY;

// API Key authentication middleware
function authenticateApiKey(authHeader: string | undefined): boolean {
    if (!SMTP_SERVICE_API_KEY) {
        logger.warn('SMTP_SERVICE_API_KEY not configured - rejecting all requests');
        return false;
    }

    if (!authHeader) {
        return false;
    }

    // Support both "Bearer <key>" and raw key
    const key = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : authHeader;

    return key === SMTP_SERVICE_API_KEY;
}

// Parse JSON body from request
async function parseJsonBody(req: any): Promise<any> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: string) => {
            body += chunk;
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}

const main = async () => {
    logger.info('Starting IMAP Service...');

    const db = new DB(process.env.DATABASE_URL!);
    const store = new Store({
        accountId: process.env.R2_ACCOUNT_ID!,
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        bucketName: process.env.R2_BUCKET_NAME!,
    });

    const syncEngine = new SyncEngine(db, store, logger);
    const smtpService = new SmtpService(logger);

    // Create HTTP server for SMTP API
    const server = createServer(async (req, res) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        // Handle preflight
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        // Health check endpoint
        if (req.url === '/health' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', service: 'imap-service' }));
            return;
        }

        // SMTP send endpoint
        if (req.url === '/send' && req.method === 'POST') {
            logger.info('[HTTP] Received /send request');

            // Authenticate
            const authHeader = req.headers['authorization'];
            if (!authenticateApiKey(authHeader as string)) {
                logger.warn('[HTTP] Unauthorized request to /send');
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }

            try {
                const body = await parseJsonBody(req);
                logger.info(`[HTTP] Send request body:`, { connectionId: body.connectionId, to: body.to });

                // Validate required fields
                if (!body.connectionId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'connectionId is required' }));
                    return;
                }
                if (!body.from) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'from is required' }));
                    return;
                }
                if (!body.to || !Array.isArray(body.to) || body.to.length === 0) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'to is required and must be a non-empty array' }));
                    return;
                }
                if (!body.subject) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'subject is required' }));
                    return;
                }

                // Get connection from database
                const connection = await db.getConnectionById(body.connectionId);
                if (!connection) {
                    logger.warn(`[HTTP] Connection not found: ${body.connectionId}`);
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Connection not found' }));
                    return;
                }

                // Parse connection config
                let config;
                try {
                    config = typeof connection.config === 'string'
                        ? JSON.parse(connection.config)
                        : connection.config;
                } catch {
                    logger.error(`[HTTP] Failed to parse connection config`);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid connection configuration' }));
                    return;
                }

                // Send email via SMTP
                const result = await smtpService.sendEmail(
                    { id: connection.id, config },
                    {
                        from: body.from,
                        to: body.to,
                        cc: body.cc,
                        bcc: body.bcc,
                        subject: body.subject,
                        text: body.text,
                        html: body.html,
                    }
                );

                logger.info(`[HTTP] Email sent successfully: ${result.messageId}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    messageId: result.messageId
                }));

            } catch (error: any) {
                logger.error(error, '[HTTP] Error sending email');
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: error.message || 'Failed to send email'
                }));
            }
            return;
        }

        // 404 for unknown routes
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.listen(HTTP_PORT, () => {
        logger.info(`HTTP server listening on port ${HTTP_PORT}`);
    });

    // Start polling loop
    logger.info('Starting polling loop...');

    let isRunning = true;

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        logger.info('Stopping IMAP Service...');
        isRunning = false;
        server.close();
    });

    while (isRunning) {
        try {
            logger.info('Starting sync pass...');
            await syncEngine.run();
            logger.info('Sync pass completed. Waiting 60 seconds...');
        } catch (error) {
            logger.error(error, 'Error during sync pass');
        }

        // Wait for 60 seconds before next pass
        // Using a loop with small delays to allow faster shutdown
        for (let i = 0; i < 60 && isRunning; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    logger.info('IMAP Service stopped.');
};

main().catch((err) => {
    logger.error(err, 'Unhandled exception');
    process.exit(1);
});
