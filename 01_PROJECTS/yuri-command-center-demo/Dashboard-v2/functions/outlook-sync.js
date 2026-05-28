const https = require('https');
const { checkAuth } = require('./auth-check');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://ops.c2moviez.com';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization'
};

// Microsoft Graph API helper
function graphRequest(method, path, token, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'graph.microsoft.com',
      path: `/v1.0${path}`,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(extraHeaders || {})
      }
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw || '{}') }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Get app-only token using client credentials flow
async function getAppToken() {
  const tenantId = process.env.M365_TENANT_ID;
  const clientId = process.env.M365_CLIENT_ID;
  const clientSecret = process.env.M365_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('M365 credentials not configured. Set M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET in Netlify env vars.');
  }

  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default'
    }).toString();

    const opts = {
      hostname: 'login.microsoftonline.com',
      path: `/${tenantId}/oauth2/v2.0/token`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        const parsed = JSON.parse(raw);
        if (parsed.access_token) resolve(parsed.access_token);
        else reject(new Error(parsed.error_description || 'Token request failed'));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  try {
    const { action, member, events, userEmail } = JSON.parse(event.body || '{}');

    // Map member to email — dynamically from env vars (M365_EMAIL_{SHORT})
    const emailMap = {};
    for (const [key, val] of Object.entries(process.env)) {
      if (key.startsWith('M365_EMAIL_')) emailMap[key.replace('M365_EMAIL_', '')] = val;
    }
    if (!emailMap.CTI) emailMap.CTI = 'claudio@c2moviez.com';
    // SECURITY: Only allow known team emails — prevent spoofing
    const allowedEmails = Object.values(emailMap);
    const targetEmail = allowedEmails.includes(userEmail) ? userEmail : emailMap[member] || emailMap.CTI;
    const token = await getAppToken();

    if (action === 'sync') {
      // Create/update calendar events for the week plan
      const results = [];
      const syncedTicketIds = new Set((events || []).map(e => e.ticketId));

      // Clean up: find existing EXEO events this week that are no longer in the plan
      if (events?.length) {
        try {
          const firstDate = events[0].date;
          const lastDate = events[events.length - 1].date;
          const weekFilter = `start/dateTime ge '${firstDate}T00:00:00' and start/dateTime lt '${lastDate}T23:59:59' and contains(subject,'[')`;
          const weekEvents = await graphRequest('GET', `/users/${targetEmail}/calendar/events?$filter=${encodeURIComponent(weekFilter)}&$top=50`, token);
          if (weekEvents.status === 200 && weekEvents.data.value) {
            for (const existing of weekEvents.data.value) {
              // Check if this is an EXEO-created event (has ticket ID pattern like [medium] C2M-87)
              const match = existing.subject?.match(/\]\s*([A-Z]{2,4}-\d+)/);
              if (match) {
                const ticketId = match[1];
                const eventDate = existing.start?.dateTime?.slice(0, 10);
                // If this ticket is synced to a DIFFERENT day or no longer in plan → delete old event
                const plannedOnThisDay = (events || []).some(e => e.ticketId === ticketId && e.date === eventDate);
                if (!plannedOnThisDay) {
                  await graphRequest('DELETE', `/users/${targetEmail}/calendar/events/${existing.id}`, token);
                  results.push({ ticketId, action: 'removed', date: eventDate });
                }
              }
            }
          }
        } catch(e) { /* cleanup is best-effort */ }
      }

      for (const ev of (events || [])) {
        // Check if event already exists (by subject match on that day)
        const filterDate = (ev.date||'').replace(/[^0-9-]/g,''); // sanitize date
        const safeTicketId = (ev.ticketId||'').replace(/'/g,"''").replace(/[<>]/g,''); // escape OData
        const filter = `start/dateTime ge '${filterDate}T00:00:00' and start/dateTime lt '${filterDate}T23:59:59' and contains(subject,'${safeTicketId}')`;

        const existing = await graphRequest('GET',
          `/users/${targetEmail}/calendar/events?$filter=${encodeURIComponent(filter)}&$top=1`,
          token
        );

        const startTime = ev.startTime || '09:00:00';
        const endTime = ev.endTime || '10:00:00';
        const durationLabel = ev.durationMin ? `${ev.durationMin >= 60 ? (ev.durationMin/60)+'h' : ev.durationMin+'m'}` : '1h';

        const eventBody = {
          subject: `[${ev.priority}] ${ev.ticketId} — ${ev.name}`,
          body: {
            contentType: 'HTML',
            content: `<p><strong>${ev.ticketId}</strong> — ${ev.name}</p>
              <p>Priority: ${ev.priority} | State: ${ev.state} | Assignee: ${ev.assignee} | Est: ${durationLabel}</p>
              <p><a href="${ev.planeUrl}">Open in Plane.so</a></p>`
          },
          start: { dateTime: `${filterDate}T${startTime}`, timeZone: 'Europe/Zurich' },
          end:   { dateTime: `${filterDate}T${endTime}`, timeZone: 'Europe/Zurich' },
          isAllDay: false,
          showAs: 'busy',
          categories: [...new Set(['C2M', ev.project].filter(Boolean))],
          isReminderOn: ev.priority === 'urgent' || ev.priority === 'high'
        };

        if (existing.status === 200 && existing.data.value?.length > 0) {
          const eventId = existing.data.value[0].id;
          const res = await graphRequest('PATCH', `/users/${targetEmail}/calendar/events/${eventId}`, token, eventBody);
          const entry = { ticketId: ev.ticketId, action: 'updated', status: res.status };
          if (res.status >= 400) entry.error = res.data?.error || res.data;
          results.push(entry);
        } else {
          const res = await graphRequest('POST', `/users/${targetEmail}/calendar/events`, token, eventBody);
          const entry = { ticketId: ev.ticketId, action: 'created', status: res.status };
          if (res.status >= 400) entry.error = res.data?.error || res.data;
          results.push(entry);
        }
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...CORS },
        body: JSON.stringify({ ok: true, synced: results.length, results })
      };
    }

    if (action === 'read') {
      // Read calendar events for a date range — returns events with ticket matching
      const startDate = events?.startDate || new Date().toISOString().slice(0, 10);
      const endDateRaw = events?.endDate || (() => { const d = new Date(startDate); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();

      // Prefer header forces Graph API to return dateTime in Europe/Zurich
      const res = await graphRequest('GET',
        `/users/${targetEmail}/calendarView?startDateTime=${startDate}T00:00:00&endDateTime=${endDateRaw}T23:59:59&$top=100&$select=id,subject,start,end,showAs,isAllDay,categories&$orderby=start/dateTime`,
        token,
        null,
        { 'Prefer': 'outlook.timezone="Europe/Zurich"' }
      );

      if (res.status !== 200) {
        return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify({ ok: false, error: 'Calendar read failed', status: res.status }) };
      }

      const calEvents = (res.data.value || []).map(e => {
        const ticketMatch = e.subject?.match(/\b([A-Z][A-Z0-9]{1,3}-\d+)\b/);
        // With Prefer: outlook.timezone="Europe/Zurich", Graph API returns
        // dateTime already in local Swiss time. Format: "2026-04-04T09:00:00.0000000"
        // Just extract date and time directly — no conversion needed.
        const startDT = e.start?.dateTime || '';
        const endDT = e.end?.dateTime || '';
        return {
          id: e.id,
          subject: e.subject || '',
          ticketId: ticketMatch ? ticketMatch[1] : null,
          date: startDT.slice(0, 10),
          startTime: startDT.slice(11, 16),
          endTime: endDT.slice(11, 16),
          isAllDay: e.isAllDay || false,
          showAs: e.showAs || 'busy',
          categories: e.categories || [],
          isTicket: !!ticketMatch
        };
      });

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...CORS },
        body: JSON.stringify({ ok: true, events: calEvents, count: calEvents.length })
      };
    }

    if (action === 'delete') {
      // Delete a calendar event by ID or by subject match on a date
      const { eventId, subject: matchSubject, date: matchDate } = events || {};
      if (eventId) {
        const res = await graphRequest('DELETE', `/users/${targetEmail}/calendar/events/${eventId}`, token);
        return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify({ ok: res.status === 204, status: res.status }) };
      }
      if (matchSubject && matchDate) {
        const filter = `start/dateTime ge '${matchDate}T00:00:00' and start/dateTime lt '${matchDate}T23:59:59' and contains(subject,'${matchSubject.replace(/'/g,"''")}')`;
        const found = await graphRequest('GET', `/users/${targetEmail}/calendar/events?$filter=${encodeURIComponent(filter)}&$top=1`, token);
        if (found.status === 200 && found.data.value?.length > 0) {
          const res = await graphRequest('DELETE', `/users/${targetEmail}/calendar/events/${found.data.value[0].id}`, token);
          return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify({ ok: res.status === 204, deleted: found.data.value[0].subject }) };
        }
        return { statusCode: 404, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify({ ok: false, error: 'Event not found' }) };
      }
      return { statusCode: 400, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify({ error: 'Provide eventId or subject+date' }) };
    }

    if (action === 'check') {
      // Just check if M365 is configured and working
      const me = await graphRequest('GET', `/users/${targetEmail}`, token);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...CORS },
        body: JSON.stringify({ ok: me.status === 200, user: me.data.displayName || targetEmail })
      };
    }

    if (action === 'sendMail') {
      // Send email via Microsoft Graph API
      const { to, cc, subject, bodyHtml, attachments } = events || {};
      if (!to || !subject) return { statusCode: 400, headers: { 'Content-Type':'application/json', ...CORS }, body: JSON.stringify({ error: 'Missing to or subject' }) };

      const mailBody = {
        message: {
          subject,
          body: { contentType: 'HTML', content: bodyHtml || '' },
          toRecipients: (Array.isArray(to) ? to : [to]).map(email => ({ emailAddress: { address: email } })),
          ...(cc ? { ccRecipients: (Array.isArray(cc) ? cc : [cc]).map(email => ({ emailAddress: { address: email } })) } : {}),
          ...(attachments?.length ? {
            attachments: attachments.map(att => ({
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: att.name,
              contentType: att.contentType || 'application/pdf',
              contentBytes: att.contentBytes // base64
            }))
          } : {})
        },
        saveToSentItems: true
      };

      const res = await graphRequest('POST', `/users/${targetEmail}/sendMail`, token, mailBody);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...CORS },
        body: JSON.stringify({ ok: res.status === 202 || res.status === 200, status: res.status })
      };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify({ ok: false, error: e.message })
    };
  }
};
