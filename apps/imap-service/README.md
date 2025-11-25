# IMAP Service

This service handles IMAP synchronization for Zero. It runs as a separate Node.js process (intended for a VM) and syncs emails from IMAP providers to R2 storage, updating the database with metadata.

## Setup

1.  **Install dependencies:**
    ```bash
    pnpm install
    ```

2.  **Environment Variables:**
    Create a `.env` file in `apps/imap-service` with the following:

    ```env
    DATABASE_URL=postgresql://postgres:postgres@localhost:5432/zerodotemail
    R2_ACCOUNT_ID=your_cloudflare_account_id
    R2_ACCESS_KEY_ID=your_r2_access_key_id
    R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
    R2_BUCKET_NAME=threads-staging
    LOG_LEVEL=info
    ```

    *Note: For local development, ensure your local Postgres and R2 credentials are correct.*

## Running

*   **Development:**
    ```bash
    pnpm dev
    ```

*   **Production:**
    ```bash
    pnpm build
    pnpm start
    ```

## Architecture

*   **SyncEngine:** Connects to IMAP servers using `imapflow`.
*   **Store:** Saves raw email JSON to Cloudflare R2.
*   **DB:** Fetches connection details from the Postgres database.

## Integration with Server

The main `apps/server` (Cloudflare Worker) reads the synced emails directly from the R2 bucket using the `fetchImapEmailsFromR2` utility.
