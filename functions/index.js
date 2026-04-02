process.env.GOOGLE_CLOUD_PROJECT = 'wc-app-alpha';

const { onDocumentUpdated, onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { getAuth } = require('firebase-admin/auth');
const Anthropic = require('@anthropic-ai/sdk');

const anthropicKey = defineSecret('ANTHROPIC_API_KEY');
const netlifyToken = defineSecret('NETLIFY_TOKEN');

const app = initializeApp({
  credential: applicationDefault(),
  projectId: 'wc-app-alpha'
});

// ── Helper: resolve the org's custom domain for push notification click URL ──
async function _getOrgClickUrl(orgId) {
  if (!orgId) return 'https://thewcapp.netlify.app';
  try {
    const doc = await getFirestore().collection('organizations').doc(orgId).get();
    if (doc.exists && doc.data().customDomain) {
      return 'https://' + doc.data().customDomain;
    }
  } catch (_) {}
  return 'https://thewcapp.netlify.app';
}

// ── Helper: get all org custom domains for CORS ──
async function _getAllOrgDomains() {
  const defaults = [
    'https://thewcapp.netlify.app',
    'http://localhost',
    'http://localhost:3000',
    'http://127.0.0.1'
  ];
  try {
    const snap = await getFirestore().collection('organizations').get();
    snap.forEach(doc => {
      const d = doc.data().customDomain;
      if (d) defaults.push('https://' + d);
    });
  } catch (_) {}
  return defaults;
}

// ── Push Notification Processor ──────────────────────────────────────────────
// Triggered by client writing to notifications/{notifId} — sends push then deletes the doc.
exports.wcProcessNotification = onDocumentCreated('notifications/{notifId}', async (event) => {
  const data = event.data.data();
  const { targetUid, title, body, notifData } = data;

  const db = getFirestore();
  const userDoc = await db.collection('users').doc(targetUid).get();
  if (!userDoc.exists) return null;

  const fcmToken = userDoc.data().fcmToken;
  if (!fcmToken) return null;

  // Resolve click URL from the user's org
  const userOrgId = userDoc.data().orgId || '';
  const clickUrl = await _getOrgClickUrl(userOrgId);

  const message = {
    token: fcmToken,
    notification: { title, body },
    data: notifData || {},
    webpush: {
      fcmOptions: { link: clickUrl }
    }
  };

  await getMessaging().send(message);
  await event.data.ref.delete();

  return null;
});

// ── Invite Redeemed Notifier ─────────────────────────────────────────────────
// Triggered when a rep redeems an invite — notifies the manager directly via FCM
exports.wcInviteRedeemed = onDocumentUpdated('invites/{code}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  if (before.used === false && after.used === true) {
    const db = getFirestore();
    const orgId = after.orgId;
    const usedByUid = after.usedBy;

    const repDoc = await db.collection('users').doc(usedByUid).get();
    const repName = repDoc.exists ? repDoc.data().name : 'A new rep';
    const role = after.role || 'canvasser';

    // Find the org creator/manager to notify
    const managerDoc = await db.collection('users').doc(orgId).get();
    if (!managerDoc.exists) return null;

    const fcmToken = managerDoc.data().fcmToken;
    if (!fcmToken) return null;

    const clickUrl = await _getOrgClickUrl(orgId);

    const message = {
      token: fcmToken,
      notification: {
        title: '🎉 New Rep Joined',
        body: `${repName} just joined your team as ${role}`,
      },
      webpush: {
        fcmOptions: { link: clickUrl }
      }
    };

    return getMessaging().send(message);
  }
  return null;
});

// ── Org Created: Full zero-touch provisioning ────────────────────────────────
// When a new org is created with a customDomain, automatically:
//   0. Create Netlify site + deploy from GitHub repo
//   1. Add to Firebase Auth authorized domains
//   2. Add to API key website restrictions
//   3. Add to OAuth client origins + redirect URIs
const PROJECT_NUMBER = '932560435629';
const OAUTH_CLIENT_ID = '932560435629-p4r35knsn4cul61sk94qqjn7qau34al3.apps.googleusercontent.com';
const GITHUB_REPO = 'aryenwood/The-WC-App';
const NETLIFY_TEAM_SLUG = 'aryen';

// Helper: Netlify API request
async function netlifyApi(method, path, body) {
  const https = require('https');
  const token = netlifyToken.value();
  const data = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.netlify.com', path: '/api/v1' + path, method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(body || '{}'));
        else reject(new Error(`Netlify ${res.statusCode}: ${body.slice(0, 300)}`));
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

exports.wcOrgCreated = onDocumentCreated({
  document: 'organizations/{orgId}',
  secrets: [netlifyToken]
}, async (event) => {
  const data = event.data.data();
  const domain = data.customDomain;
  if (!domain) return null;

  const siteName = domain.replace('.netlify.app', '');
  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase'] });
  const gcpClient = await auth.getClient();
  const projectId = 'wc-app-alpha';
  const origin = 'https://' + domain;
  const results = {};

  // ── Step 0: Create Netlify site linked to GitHub repo ──
  try {
    const site = await netlifyApi('POST', '/' + NETLIFY_TEAM_SLUG + '/sites', {
      name: siteName,
      repo: {
        provider: 'github',
        repo: GITHUB_REPO,
        private: false,
        branch: 'main',
        cmd: '',
        dir: ''
      }
    });
    results.netlify = site.id;
    console.log('[OrgCreated] Step 0 DONE — Netlify site:', siteName, '| id:', site.id);
    // Save site ID to org doc
    await getFirestore().collection('organizations').doc(event.params.orgId).update({ netlifySiteId: site.id });
  } catch (e) {
    if (e.message && e.message.includes('422')) {
      console.log('[OrgCreated] Step 0 SKIP — site already exists:', siteName);
    } else {
      console.error('[OrgCreated] Step 0 FAIL:', e.message);
    }
  }

  // ── Step 1: Firebase Auth authorized domains ──
  try {
    const configUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;
    const configRes = await gcpClient.request({ url: configUrl });
    const currentDomains = configRes.data.authorizedDomains || [];
    if (!currentDomains.includes(domain)) {
      currentDomains.push(domain);
      await gcpClient.request({ url: configUrl + '?updateMask=authorizedDomains', method: 'PATCH', data: { authorizedDomains: currentDomains } });
      console.log('[OrgCreated] Step 1 DONE — Auth domain:', domain);
    } else {
      console.log('[OrgCreated] Step 1 SKIP — already authorized:', domain);
    }
  } catch (e) { console.error('[OrgCreated] Step 1 FAIL:', e.message); }

  // ── Step 2: API key website restrictions ──
  try {
    const listUrl = `https://apikeys.googleapis.com/v2/projects/${projectId}/locations/global/keys`;
    const listRes = await gcpClient.request({ url: listUrl });
    const keys = listRes.data.keys || [];
    const webKey = keys.find(k => k.restrictions && k.restrictions.browserKeyRestrictions);
    if (webKey) {
      const referrers = webKey.restrictions.browserKeyRestrictions.allowedReferrers || [];
      const pattern = origin + '/*';
      if (!referrers.includes(pattern)) {
        referrers.push(pattern);
        webKey.restrictions.browserKeyRestrictions.allowedReferrers = referrers;
        await gcpClient.request({
          url: `https://apikeys.googleapis.com/v2/${webKey.name}?updateMask=restrictions.browserKeyRestrictions`,
          method: 'PATCH', data: { restrictions: webKey.restrictions }
        });
        console.log('[OrgCreated] Step 2 DONE — API key referrer:', pattern);
      } else {
        console.log('[OrgCreated] Step 2 SKIP — referrer exists:', pattern);
      }
    }
  } catch (e) { console.error('[OrgCreated] Step 2 FAIL:', e.message); }

  // ── Step 3: OAuth client origins + redirect URIs ──
  try {
    const oauthName = `projects/${PROJECT_NUMBER}/brands/-/oauthClients/${OAUTH_CLIENT_ID}`;
    const oauthUrl = `https://oauthplatform.googleapis.com/v1/${oauthName}`;
    const oauthRes = await gcpClient.request({ url: oauthUrl });
    const clientData = oauthRes.data;
    const origins = clientData.allowedJavascriptOrigins || [];
    const redirects = clientData.allowedRedirectUris || [];
    const redirect = origin + '/__/auth/handler';
    let changed = false;
    if (!origins.includes(origin)) { origins.push(origin); changed = true; }
    if (!redirects.includes(redirect)) { redirects.push(redirect); changed = true; }
    if (changed) {
      await gcpClient.request({
        url: oauthUrl + '?updateMask=allowedJavascriptOrigins,allowedRedirectUris',
        method: 'PATCH', data: { allowedJavascriptOrigins: origins, allowedRedirectUris: redirects }
      });
      console.log('[OrgCreated] Step 3 DONE — OAuth origin:', origin);
    } else {
      console.log('[OrgCreated] Step 3 SKIP — OAuth already configured');
    }
  } catch (e) {
    console.error('[OrgCreated] Step 3 FAIL:', e.message);
    console.log('[OrgCreated] Manual: add', origin, 'to OAuth client JS origins +', origin + '/__/auth/handler', 'to redirects');
  }

  // ── Write provisioning status to org doc ──
  try {
    await getFirestore().collection('organizations').doc(event.params.orgId).update({
      provisionedAt: new Date().toISOString(),
      provisioningResults: results
    });
  } catch (_) {}

  return null;
});

// ── AI Brain Trainer (Claude API proxy) ──────────────────────────────────────
exports.wcAiChat = onCall({
  secrets: [anthropicKey],
  cors: true,  // Allow all origins — auth is enforced by Firebase callable
  invoker: 'public'
}, async (request) => {
  const { messages, system } = request.data;

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('messages array required');
  }

  const client = new Anthropic({ apiKey: anthropicKey.value() });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: system || '',
    messages: messages
  });

  const reply = response.content[0]?.text || '';
  return { reply };
});
