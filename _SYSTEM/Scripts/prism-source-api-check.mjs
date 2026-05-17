#!/usr/bin/env node

// PRISM source API checker. Verifies linked registry APIs only; it does not ingest demo records.

const checks = [
  {
    key: 'zefix',
    label: 'Swiss Zefix PublicREST OpenAPI',
    url: 'https://www.zefix.admin.ch/ZefixPublicREST/v3/api-docs',
    requiredEnv: ['ZEFIX_API_USERNAME', 'ZEFIX_API_PASSWORD'],
    inspect: async (response) => {
      const spec = await response.json();
      const paths = Object.keys(spec.paths || {});
      return {
        ok: Boolean(spec.openapi && paths.includes('/api/v1/company/search')),
        detail: `${spec.info?.title || 'OpenAPI'} · ${paths.length} paths · auth ${spec.components?.securitySchemes?.['Zefix-Credentials'] ? 'basic' : 'unknown'}`
      };
    }
  },
  {
    key: 'firmafind',
    label: 'FirmaFind public Austrian company search',
    url: 'https://firmafind.at/api/companies/public?q=wien%20gmbh',
    requiredEnv: ['FIRMAFIND_API_KEY'],
    inspect: async (response) => {
      const payload = await response.json();
      return {
        ok: Array.isArray(payload.data),
        detail: `${payload.data?.length || 0} public results · remaining ${payload.meta?.remaining ?? payload.meta?.rateLimit?.remaining ?? 'unknown'}`
      };
    }
  },
  {
    key: 'wirtschaftscompass',
    label: 'Wirtschafts-Compass API documentation',
    url: 'https://api.wirtschaftscompass.at/de/dokumentation',
    requiredEnv: ['WIRTSCHAFTSCOMPASS_API_TOKEN'],
    inspect: async (response) => {
      const text = await response.text();
      return {
        ok: /Bearer Token|WiCo-ID|Wirtschafts-Compass ID/i.test(text),
        detail: 'provider access required for live company data'
      };
    }
  }
];

for (const check of checks) {
  try {
    const response = await fetch(check.url, { headers: { Accept: 'application/json,text/html' } });
    const inspected = response.ok ? await check.inspect(response) : { ok: false, detail: `HTTP ${response.status}` };
    const configured = check.requiredEnv.filter((key) => process.env[key]);
    process.stdout.write(`${inspected.ok ? 'ok' : 'fail'} ${check.key}: ${check.label}\n`);
    process.stdout.write(`  ${check.url}\n`);
    process.stdout.write(`  ${inspected.detail}\n`);
    process.stdout.write(`  env configured: ${configured.length}/${check.requiredEnv.length} (${check.requiredEnv.join(', ')})\n`);
  } catch (error) {
    process.stdout.write(`fail ${check.key}: ${error.message}\n`);
  }
}
