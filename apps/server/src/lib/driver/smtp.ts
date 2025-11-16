import { createTransport } from 'worker-mailer';
import type { IOutgoingMessage } from '../../types';
import { createMimeMessage } from 'mimetext';

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

export class SMTPClient {
  constructor(private config: SMTPConfig) {}

  /**
   * Send email via SMTP
   */
  async sendEmail(data: IOutgoingMessage): Promise<{ id?: string | null }> {
    try {
      // Create SMTP transport
      const transporter = createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: {
          user: this.config.username,
          pass: this.config.password,
        },
      });

      // Build email message using mimetext
      const msg = createMimeMessage();

      // Set sender
      msg.setSender({
        name: data.headers?.['From'] || this.config.username.split('@')[0],
        addr: this.config.username,
      });

      // Set recipients
      msg.setRecipients(data.to.map((t) => ({ name: t.name, addr: t.email })));

      if (data.cc && data.cc.length > 0) {
        msg.setCc(data.cc.map((c) => ({ name: c.name, addr: c.email })));
      }

      if (data.bcc && data.bcc.length > 0) {
        msg.setBcc(data.bcc.map((b) => ({ name: b.name, addr: b.email })));
      }

      // Set subject
      msg.setSubject(data.subject);

      // Set message content (HTML)
      msg.setMessage('text/html', data.message);

      // Add custom headers
      if (data.headers) {
        Object.entries(data.headers).forEach(([key, value]) => {
          if (key !== 'From' && key !== 'To' && key !== 'Subject') {
            msg.setHeader(key, value);
          }
        });
      }

      // Add thread headers for replies
      if (data.threadId) {
        msg.setHeader('In-Reply-To', data.threadId);
        msg.setHeader('References', data.threadId);
      }

      // Add attachments
      if (data.attachments && data.attachments.length > 0) {
        for (const attachment of data.attachments) {
          msg.addAttachment({
            filename: attachment.name,
            contentType: attachment.type,
            data: attachment.base64,
            encoding: 'base64',
          });
        }
      }

      // Get raw MIME message
      const rawMessage = msg.asRaw();

      // Send email
      const info = await transporter.sendMail({
        from: this.config.username,
        to: data.to.map((t) => t.email).join(', '),
        cc: data.cc?.map((c) => c.email).join(', '),
        bcc: data.bcc?.map((b) => b.email).join(', '),
        subject: data.subject,
        html: data.message,
        // Use raw MIME message if attachments are present
        raw: data.attachments && data.attachments.length > 0 ? rawMessage : undefined,
      });

      return { id: info.messageId || null };
    } catch (error: any) {
      console.error('SMTP send error:', error);
      throw new Error(`Failed to send email via SMTP: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Verify SMTP connection
   */
  async verifyConnection(): Promise<boolean> {
    try {
      const transporter = createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: {
          user: this.config.username,
          pass: this.config.password,
        },
      });

      await transporter.verify();
      return true;
    } catch (error: any) {
      console.error('SMTP verification error:', error);
      throw new Error(`SMTP connection failed: ${error.message || 'Unknown error'}`);
    }
  }
}
