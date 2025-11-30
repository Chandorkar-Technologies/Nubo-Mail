import 'dotenv/config';
import { pino } from 'pino';
import { SyncEngine } from './sync-engine.js';
import { DB } from './db.js';
import { Store } from './store.js';
import { HttpServer } from './http-server.js';

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
});

const main = async () => {
    logger.info('Starting IMAP Service...');

    // Validate required environment variables
    const apiKey = process.env.SMTP_SERVICE_API_KEY;
    if (!apiKey) {
        logger.error('SMTP_SERVICE_API_KEY environment variable is required');
        process.exit(1);
    }

    // Start HTTP server for SMTP sending
    const httpPort = parseInt(process.env.HTTP_PORT || '3001', 10);
    const httpServer = new HttpServer(logger, apiKey);
    await httpServer.start(httpPort);
    logger.info({ port: httpPort }, 'HTTP server for SMTP sending started');

    // Check if sync is enabled (can disable if only running as SMTP service)
    const syncEnabled = process.env.SYNC_ENABLED !== 'false';

    if (syncEnabled) {
        const db = new DB(process.env.DATABASE_URL!);
        const store = new Store({
            accountId: process.env.R2_ACCOUNT_ID!,
            accessKeyId: process.env.R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
            bucketName: process.env.R2_BUCKET_NAME!,
        });

        const syncEngine = new SyncEngine(db, store, logger);

        // Start polling loop
        logger.info('Starting sync polling loop...');

        let isRunning = true;

        // Handle graceful shutdown
        process.on('SIGINT', () => {
            logger.info('Stopping IMAP Service...');
            isRunning = false;
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
    } else {
        logger.info('Sync disabled, running in SMTP-only mode');

        // Keep the process running for HTTP server
        process.on('SIGINT', () => {
            logger.info('Shutting down SMTP service...');
            process.exit(0);
        });
    }
};

main().catch((err) => {
    logger.error(err, 'Unhandled exception');
    process.exit(1);
});
