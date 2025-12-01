import nodemailer from 'nodemailer';
import type { Logger } from 'pino';

export class SmtpService {
    constructor(private logger: Logger) { }

    async sendEmail(connection: any, emailOptions: {
        from: string;
        to: string[];
        cc?: string[];
        bcc?: string[];
        subject: string;
        text?: string;
        html?: string;
    }) {
        this.logger.info(`Sending email from ${emailOptions.from} to ${emailOptions.to.join(', ')}`);

        const config = connection.config;

        // Log the raw config structure to debug
        this.logger.info(`[SMTP] Raw config structure: ${JSON.stringify(config, null, 2)}`);

        // IMAP connections can store SMTP config in different formats:
        // 1. Nested: config.smtp.host, config.smtp.port, config.smtp.secure
        // 2. Flat prefixed: config.smtpHost, config.smtpPort, config.smtpSecure
        // Auth is stored under config.auth
        const smtpHost = config.smtp?.host || config.smtpHost;
        const smtpPort = config.smtp?.port || config.smtpPort;
        const authConfig = config.auth;

        // Determine secure setting based on port:
        // - Port 465: implicit TLS (secure: true)
        // - Port 587/25: STARTTLS (secure: false, Nodemailer upgrades automatically)
        // Override any stored value since the port determines the protocol
        const smtpSecure = smtpPort === 465;

        this.logger.info(`[SMTP] Using SMTP config: host=${smtpHost}, port=${smtpPort}, secure=${smtpSecure} (auto-detected from port)`);

        if (!smtpHost || !authConfig) {
            this.logger.error(`[SMTP] Invalid config structure:`, {
                hasSmtp: !!config.smtp,
                hasSmtpHost: !!config.smtpHost,
                hasAuth: !!config.auth,
                smtpHost,
            });
            throw new Error(`Invalid SMTP configuration for connection ${connection.id}`);
        }

        // Create reusable transporter object using the default SMTP transport
        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure, // true for 465, false for other ports
            auth: {
                user: authConfig.user,
                pass: authConfig.pass,
            },
        });

        try {
            // send mail with defined transport object
            const info = await transporter.sendMail({
                from: emailOptions.from,
                to: emailOptions.to,
                cc: emailOptions.cc,
                bcc: emailOptions.bcc,
                subject: emailOptions.subject,
                text: emailOptions.text,
                html: emailOptions.html,
            });

            this.logger.info(`Message sent: ${info.messageId}`);
            return info;
        } catch (error) {
            this.logger.error(error, `Failed to send email for connection ${connection.id}`);
            throw error;
        }
    }
}
