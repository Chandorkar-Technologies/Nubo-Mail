import nodemailer from 'nodemailer';
import type { Logger } from 'pino';

export interface SmtpConnection {
    id: string;
    config: {
        host: string;
        port: number;
        secure: boolean;
        auth: {
            user: string;
            pass: string;
        };
    };
}

export interface EmailOptions {
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    replyTo?: string;
    subject: string;
    text?: string;
    html?: string;
    inReplyTo?: string;
    references?: string;
    attachments?: Array<{
        filename: string;
        content: Buffer;
        contentType?: string;
    }>;
}

export class SmtpService {
    constructor(private logger: Logger) { }

    async sendEmail(connection: SmtpConnection, emailOptions: EmailOptions) {
        this.logger.info({
            from: emailOptions.from,
            to: emailOptions.to,
            subject: emailOptions.subject,
            host: connection.config.host,
            port: connection.config.port,
        }, 'Sending email via SMTP');

        const config = connection.config;
        if (!config || !config.auth) {
            throw new Error(`Invalid SMTP configuration for connection ${connection.id}`);
        }

        // Create reusable transporter object using the default SMTP transport
        const transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure, // true for 465, false for other ports
            auth: {
                user: config.auth.user,
                pass: config.auth.pass,
            },
            // Connection timeout settings
            connectionTimeout: 30000, // 30 seconds
            greetingTimeout: 30000,
            socketTimeout: 60000,
        });

        try {
            // Build mail options
            const mailOptions: nodemailer.SendMailOptions = {
                from: emailOptions.from,
                to: emailOptions.to,
                cc: emailOptions.cc,
                bcc: emailOptions.bcc,
                subject: emailOptions.subject,
                text: emailOptions.text,
                html: emailOptions.html,
            };

            // Add optional headers
            if (emailOptions.replyTo) {
                mailOptions.replyTo = emailOptions.replyTo;
            }

            if (emailOptions.inReplyTo) {
                mailOptions.inReplyTo = emailOptions.inReplyTo;
            }

            if (emailOptions.references) {
                mailOptions.references = emailOptions.references;
            }

            // Add attachments if present
            if (emailOptions.attachments && emailOptions.attachments.length > 0) {
                mailOptions.attachments = emailOptions.attachments.map(att => ({
                    filename: att.filename,
                    content: att.content,
                    contentType: att.contentType,
                }));
            }

            // send mail with defined transport object
            const info = await transporter.sendMail(mailOptions);

            this.logger.info({ messageId: info.messageId }, 'Email sent successfully');
            return info;
        } catch (error) {
            this.logger.error(error, `Failed to send email for connection ${connection.id}`);
            throw error;
        }
    }
}
