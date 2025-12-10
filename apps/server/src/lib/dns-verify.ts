/**
 * DNS Verification Service
 * Verifies MX, SPF, DKIM, and DMARC records for domains
 */

import { Resolver } from 'dns/promises';

const resolver = new Resolver();

export interface DnsVerificationResult {
  mx: { verified: boolean; records: string[]; expected: string };
  spf: { verified: boolean; record: string | null; expected: string };
  dkim: { verified: boolean; record: string | null; selector: string };
  dmarc: { verified: boolean; record: string | null; expected: string };
  allVerified: boolean;
}

/**
 * Verify all DNS records for a domain
 */
export async function verifyDomainDns(
  domainName: string,
  options: {
    expectedMx?: string;
    expectedSpfInclude?: string;
    dkimSelector?: string;
  } = {}
): Promise<DnsVerificationResult> {
  const expectedMx = options.expectedMx || 'mail.nubo.email';
  const expectedSpfInclude = options.expectedSpfInclude || '_spf.nubo.email';
  const dkimSelector = options.dkimSelector || 'dkim';

  const [mxResult, spfResult, dkimResult, dmarcResult] = await Promise.all([
    verifyMxRecord(domainName, expectedMx),
    verifySpfRecord(domainName, expectedSpfInclude),
    verifyDkimRecord(domainName, dkimSelector),
    verifyDmarcRecord(domainName),
  ]);

  const allVerified =
    mxResult.verified && spfResult.verified && dkimResult.verified && dmarcResult.verified;

  return {
    mx: mxResult,
    spf: spfResult,
    dkim: dkimResult,
    dmarc: dmarcResult,
    allVerified,
  };
}

/**
 * Verify MX record
 */
export async function verifyMxRecord(
  domainName: string,
  expectedMx: string
): Promise<{ verified: boolean; records: string[]; expected: string }> {
  try {
    const mxRecords = await resolver.resolveMx(domainName);
    const records = mxRecords.map((r) => r.exchange.toLowerCase());

    // Check if any MX record matches the expected value
    const verified = records.some(
      (record) =>
        record === expectedMx.toLowerCase() ||
        record === `${expectedMx.toLowerCase()}.`
    );

    return { verified, records, expected: expectedMx };
  } catch {
    return { verified: false, records: [], expected: expectedMx };
  }
}

/**
 * Verify SPF record
 */
export async function verifySpfRecord(
  domainName: string,
  expectedInclude: string
): Promise<{ verified: boolean; record: string | null; expected: string }> {
  try {
    const txtRecords = await resolver.resolveTxt(domainName);
    const flatRecords = txtRecords.map((r) => r.join(''));

    // Find SPF record
    const spfRecord = flatRecords.find((r) => r.toLowerCase().startsWith('v=spf1'));

    if (!spfRecord) {
      return {
        verified: false,
        record: null,
        expected: `v=spf1 include:${expectedInclude} ~all`,
      };
    }

    // Check if the SPF record includes the expected value
    const verified = spfRecord.toLowerCase().includes(`include:${expectedInclude.toLowerCase()}`);

    return {
      verified,
      record: spfRecord,
      expected: `v=spf1 include:${expectedInclude} ~all`,
    };
  } catch {
    return {
      verified: false,
      record: null,
      expected: `v=spf1 include:${expectedInclude} ~all`,
    };
  }
}

/**
 * Verify DKIM record
 */
export async function verifyDkimRecord(
  domainName: string,
  selector: string
): Promise<{ verified: boolean; record: string | null; selector: string }> {
  try {
    const dkimHost = `${selector}._domainkey.${domainName}`;
    const txtRecords = await resolver.resolveTxt(dkimHost);
    const flatRecords = txtRecords.map((r) => r.join(''));

    // Find DKIM record
    const dkimRecord = flatRecords.find((r) => r.toLowerCase().startsWith('v=dkim1'));

    if (!dkimRecord) {
      return { verified: false, record: null, selector };
    }

    // Basic verification - just check if it has the required fields
    const verified =
      dkimRecord.toLowerCase().includes('k=rsa') &&
      dkimRecord.toLowerCase().includes('p=');

    return { verified, record: dkimRecord, selector };
  } catch {
    return { verified: false, record: null, selector };
  }
}

/**
 * Verify DMARC record
 */
export async function verifyDmarcRecord(
  domainName: string
): Promise<{ verified: boolean; record: string | null; expected: string }> {
  try {
    const dmarcHost = `_dmarc.${domainName}`;
    const txtRecords = await resolver.resolveTxt(dmarcHost);
    const flatRecords = txtRecords.map((r) => r.join(''));

    // Find DMARC record
    const dmarcRecord = flatRecords.find((r) => r.toLowerCase().startsWith('v=dmarc1'));

    if (!dmarcRecord) {
      return {
        verified: false,
        record: null,
        expected: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@nubo.email',
      };
    }

    // Basic verification - just check if it has a policy
    const verified = dmarcRecord.toLowerCase().includes('p=');

    return {
      verified,
      record: dmarcRecord,
      expected: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@nubo.email',
    };
  } catch {
    return {
      verified: false,
      record: null,
      expected: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@nubo.email',
    };
  }
}

/**
 * Quick check if a domain has basic MX records pointing to us
 */
export async function hasValidMx(
  domainName: string,
  expectedMx = 'mail.nubo.email'
): Promise<boolean> {
  const result = await verifyMxRecord(domainName, expectedMx);
  return result.verified;
}
