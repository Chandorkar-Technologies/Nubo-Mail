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
