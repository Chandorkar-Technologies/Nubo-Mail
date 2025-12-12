/**
 * Mailcow API Service
 * Provides integration with Mailcow mail server for:
 * - Domain management (create, read, update, delete)
 * - Mailbox management (create, read, update, delete)
 * - Alias management (create, read, update, delete)
 * - DKIM key management
 * - DNS record generation
 */

import { env } from '../env';

// Types for Mailcow API responses
export interface MailcowDomain {
  domain_name: string;
  description: string;
  aliases: number;
  mailboxes: number;
  defquota: number;
  maxquota: number;
  quota: number;
  relayhost: string;
  backupmx: number;
  gal: number;
  active: number;
  relay_all_recipients: number;
  relay_unknown_only: number;
  created: string;
  modified: string;
}

export interface MailcowMailbox {
  username: string;
  active: number;
  active_int: number;
  domain: string;
  name: string;
  local_part: string;
  quota: number;
  messages: number;
  attributes: {
    force_pw_update: string;
    tls_enforce_in: string;
    tls_enforce_out: string;
    sogo_access: string;
    imap_access: string;
    pop3_access: string;
    smtp_access: string;
    sieve_access: string;
    relayhost: string;
    passwd_update: string;
    mailbox_format: string;
    quarantine_notification: string;
    quarantine_category: string;
  };
  quota_used: number;
  percent_in_use: number;
  created: string;
  modified: string;
  last_imap_login: number;
  last_smtp_login: number;
  last_pop3_login: number;
}

export interface MailcowAlias {
  id: number;
  domain: string;
  address: string;
  goto: string;
  active: number;
  created: string;
  modified: string;
}

export interface MailcowDkim {
  pubkey: string;
  length: string;
  dkim_txt: string;
  dkim_selector: string;
  privkey: string;
}

export interface MailcowApiResponse {
  type?: 'success' | 'danger' | 'error';
  log?: string[];
  msg?: string | string[];
}

// Configuration - uses Cloudflare Workers environment
const getConfig = () => ({
  apiUrl: env.MAILCOW_API_URL || 'https://mail.nubo.email',
  apiKey: env.MAILCOW_API_KEY || '',
});

class MailcowApiService {
  private getBaseUrl(): string {
    return getConfig().apiUrl;
  }

  private getApiKey(): string {
    return getConfig().apiKey;
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: Record<string, unknown>
  ): Promise<T> {
    const baseUrl = this.getBaseUrl();
    const apiKey = this.getApiKey();
    const url = `${baseUrl}/api/v1${endpoint}`;

    console.log(`[Mailcow API] ${method} ${endpoint}`);
    console.log(`[Mailcow API] Base URL: ${baseUrl}`);
    console.log(`[Mailcow API] API Key configured: ${apiKey ? 'yes (' + apiKey.substring(0, 4) + '...)' : 'NO - MISSING!'}`);

    if (!apiKey) {
      throw new Error('Mailcow API key not configured. Please set MAILCOW_API_KEY secret.');
    }

    const headers: Record<string, string> = {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
      console.log(`[Mailcow API] Request body:`, JSON.stringify(body));
    }

    const response = await fetch(url, options);
    const responseText = await response.text();

    console.log(`[Mailcow API] Response status: ${response.status}`);
    console.log(`[Mailcow API] Response body: ${responseText.substring(0, 500)}`);

    if (!response.ok) {
      throw new Error(`Mailcow API error: ${response.status} - ${responseText}`);
    }

    // Parse JSON response
    try {
      return JSON.parse(responseText) as T;
    } catch {
      console.error(`[Mailcow API] Failed to parse JSON response: ${responseText}`);
      throw new Error(`Mailcow API returned invalid JSON: ${responseText}`);
    }
  }

  // ==================== Domain Operations ====================

  /**
   * Get all domains
   */
  async getDomains(): Promise<MailcowDomain[]> {
    return this.request<MailcowDomain[]>('/get/domain/all');
  }

  /**
   * Get a specific domain
   */
  async getDomain(domainName: string): Promise<MailcowDomain> {
    return this.request<MailcowDomain>(`/get/domain/${domainName}`);
  }

  /**
   * Create a new domain
   */
  async createDomain(params: {
    domain: string;
    description?: string;
    aliases?: number;
    mailboxes?: number;
    defquota?: number; // Default quota in MB
    maxquota?: number; // Max quota in MB
    quota?: number; // Total quota in MB
    active?: number;
    restart_sogo?: number;
    gal?: number;
    backupmx?: number;
    relay_all_recipients?: number;
    relay_unknown_only?: number;
  }): Promise<MailcowApiResponse> {
    return this.request<MailcowApiResponse>('/add/domain', 'POST', {
      domain: params.domain,
      description: params.description || '',
      aliases: params.aliases || 400,
      mailboxes: params.mailboxes || 10,
      defquota: params.defquota || 1024, // 1GB default
      maxquota: params.maxquota || 10240, // 10GB max
      quota: params.quota || 10240, // 10GB total
      active: params.active ?? 1,
      restart_sogo: params.restart_sogo ?? 1,
      gal: params.gal ?? 1,
      backupmx: params.backupmx ?? 0,
      relay_all_recipients: params.relay_all_recipients ?? 0,
      relay_unknown_only: params.relay_unknown_only ?? 0,
    });
  }

  /**
   * Update a domain
   */
  async updateDomain(
    domainName: string,
    params: Partial<{
      description: string;
      aliases: number;
      mailboxes: number;
      defquota: number;
      maxquota: number;
      quota: number;
      active: number;
      gal: number;
      backupmx: number;
      relay_all_recipients: number;
      relay_unknown_only: number;
    }>
  ): Promise<MailcowApiResponse> {
    return this.request<MailcowApiResponse>('/edit/domain', 'POST', {
      items: [domainName],
      attr: params,
    });
  }

  /**
   * Delete a domain
   */
  async deleteDomain(domainName: string): Promise<MailcowApiResponse> {
    return this.request<MailcowApiResponse>('/delete/domain', 'POST', {
      items: [domainName],
    });
  }

  // ==================== Mailbox Operations ====================

  /**
   * Get all mailboxes
   */
  async getMailboxes(): Promise<MailcowMailbox[]> {
    return this.request<MailcowMailbox[]>('/get/mailbox/all');
  }

  /**
   * Get mailboxes for a specific domain
   */
  async getMailboxesByDomain(domain: string): Promise<MailcowMailbox[]> {
    const allMailboxes = await this.getMailboxes();
    return allMailboxes.filter(mb => mb.domain === domain);
  }

  /**
   * Get a specific mailbox
   */
  async getMailbox(email: string): Promise<MailcowMailbox | null> {
    try {
      const mailboxes = await this.getMailboxes();
      return mailboxes.find(mb => mb.username === email) || null;
    } catch {
      return null;
    }
  }

  /**
   * Create a new mailbox
   */
  async createMailbox(params: {
    local_part: string;
    domain: string;
    name: string;
    password: string;
    password2?: string;
    quota?: number; // Quota in MB
    active?: number;
    force_pw_update?: number;
    tls_enforce_in?: number;
    tls_enforce_out?: number;
    sogo_access?: number;
    imap_access?: number;
    pop3_access?: number;
    smtp_access?: number;
    sieve_access?: number;
  }): Promise<MailcowApiResponse> {
    return this.request<MailcowApiResponse>('/add/mailbox', 'POST', {
      local_part: params.local_part,
      domain: params.domain,
      name: params.name,
      password: params.password,
      password2: params.password2 || params.password,
      quota: params.quota || 1024, // 1GB default
      active: params.active ?? 1,
      force_pw_update: params.force_pw_update ?? 0,
      tls_enforce_in: params.tls_enforce_in ?? 1,
      tls_enforce_out: params.tls_enforce_out ?? 1,
      sogo_access: params.sogo_access ?? 1,
      imap_access: params.imap_access ?? 1,
      pop3_access: params.pop3_access ?? 1,
      smtp_access: params.smtp_access ?? 1,
      sieve_access: params.sieve_access ?? 1,
    });
  }

  /**
   * Update a mailbox
   */
  async updateMailbox(
    email: string,
    params: Partial<{
      name: string;
      quota: number;
      active: number;
      force_pw_update: number;
      sogo_access: number;
      imap_access: number;
      pop3_access: number;
      smtp_access: number;
      sieve_access: number;
    }>
  ): Promise<MailcowApiResponse> {
    return this.request<MailcowApiResponse>('/edit/mailbox', 'POST', {
      items: [email],
      attr: params,
    });
  }

  /**
   * Update mailbox password
   */
  async updateMailboxPassword(
    email: string,
    password: string
  ): Promise<MailcowApiResponse> {
    return this.request<MailcowApiResponse>('/edit/mailbox', 'POST', {
      items: [email],
      attr: {
        password: password,
        password2: password,
      },
    });
  }

  /**
   * Delete a mailbox
   */
  async deleteMailbox(email: string): Promise<MailcowApiResponse> {
    return this.request<MailcowApiResponse>('/delete/mailbox', 'POST', {
      items: [email],
    });
  }

  // ==================== Alias Operations ====================

  /**
   * Get all aliases
   */
  async getAliases(): Promise<MailcowAlias[]> {
    const result = await this.request<MailcowAlias[] | Record<string, never>>('/get/alias/all');
    // Mailcow returns {} for empty aliases
    if (Array.isArray(result)) {
      return result;
    }
    return [];
  }

  /**
   * Get aliases for a specific domain
   */
  async getAliasesByDomain(domain: string): Promise<MailcowAlias[]> {
    const allAliases = await this.getAliases();
    return allAliases.filter(alias => alias.domain === domain);
  }

  /**
   * Create a new alias
   */
  async createAlias(params: {
    address: string; // The alias address (e.g., alias@domain.com)
    goto: string; // Destination email(s), comma-separated
    active?: number;
    sogo_visible?: number;
  }): Promise<MailcowApiResponse> {
    return this.request<MailcowApiResponse>('/add/alias', 'POST', {
      address: params.address,
      goto: params.goto,
      active: params.active ?? 1,
      sogo_visible: params.sogo_visible ?? 1,
    });
  }

  /**
   * Update an alias
   */
  async updateAlias(
    aliasId: number,
    params: Partial<{
      address: string;
      goto: string;
      active: number;
    }>
  ): Promise<MailcowApiResponse> {
    return this.request<MailcowApiResponse>('/edit/alias', 'POST', {
      items: [aliasId],
      attr: params,
    });
  }

  /**
   * Delete an alias
   */
  async deleteAlias(aliasId: number): Promise<MailcowApiResponse> {
    return this.request<MailcowApiResponse>('/delete/alias', 'POST', {
      items: [aliasId],
    });
  }

  // ==================== DKIM Operations ====================

  /**
   * Get DKIM key for a domain
   */
  async getDkim(domainName: string): Promise<MailcowDkim | null> {
    try {
      return await this.request<MailcowDkim>(`/get/dkim/${domainName}`);
    } catch {
      return null;
    }
  }

  /**
   * Generate DKIM key for a domain
   */
  async generateDkim(params: {
    domain: string;
    dkim_selector?: string;
    key_size?: number;
  }): Promise<MailcowApiResponse> {
    return this.request<MailcowApiResponse>('/add/dkim', 'POST', {
      domains: params.domain,
      dkim_selector: params.dkim_selector || 'dkim',
      key_size: params.key_size || 2048,
    });
  }

  /**
   * Delete DKIM key for a domain
   */
  async deleteDkim(domainName: string): Promise<MailcowApiResponse> {
    return this.request<MailcowApiResponse>('/delete/dkim', 'POST', {
      items: [domainName],
    });
  }

  // ==================== DNS Records Generation ====================

  /**
   * Generate DNS records for a domain
   */
  async generateDnsRecords(domainName: string): Promise<{
    mx: { type: string; host: string; value: string; priority: number };
    spf: { type: string; host: string; value: string };
    dkim: { type: string; host: string; value: string } | null;
    dmarc: { type: string; host: string; value: string };
  }> {
    // Get DKIM record if available
    const dkim = await this.getDkim(domainName);

    return {
      mx: {
        type: 'MX',
        host: '@',
        value: 'mail.nubo.email',
        priority: 10,
      },
      spf: {
        type: 'TXT',
        host: '@',
        value: 'v=spf1 include:_spf.nubo.email ~all',
      },
      dkim: dkim
        ? {
            type: 'TXT',
            host: `${dkim.dkim_selector}._domainkey`,
            value: dkim.dkim_txt,
          }
        : null,
      dmarc: {
        type: 'TXT',
        host: '_dmarc',
        value: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@nubo.email',
      },
    };
  }

  // ==================== Utility Methods ====================

  /**
   * Check if a domain exists
   */
  async domainExists(domainName: string): Promise<boolean> {
    try {
      console.log(`[Mailcow] Checking if domain exists: ${domainName}`);
      const domain = await this.getDomain(domainName);
      // Mailcow returns empty array or object with no domain_name if domain doesn't exist
      const exists = domain && typeof domain === 'object' && 'domain_name' in domain && domain.domain_name === domainName;
      console.log(`[Mailcow] Domain ${domainName} exists: ${exists}`, domain);
      return exists;
    } catch (error) {
      console.log(`[Mailcow] Domain check error for ${domainName}:`, error);
      return false;
    }
  }

  /**
   * Check if a mailbox exists
   */
  async mailboxExists(email: string): Promise<boolean> {
    const mailbox = await this.getMailbox(email);
    return mailbox !== null;
  }

  /**
   * Get IMAP/SMTP configuration for a mailbox
   */
  getMailboxConfig(_email: string): {
    imap: { host: string; port: number; security: string };
    smtp: { host: string; port: number; security: string };
  } {
    return {
      imap: {
        host: 'mail.nubo.email',
        port: 993,
        security: 'SSL/TLS',
      },
      smtp: {
        host: 'mail.nubo.email',
        port: 465,
        security: 'SSL/TLS',
      },
    };
  }
}

// Export singleton instance
export const mailcowApi = new MailcowApiService();

// Export class for custom instances
export { MailcowApiService };
