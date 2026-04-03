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
const superAdminUid = defineSecret('SUPER_ADMIN_UID');

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

// ── Custom Claims: Server-Side Role Enforcement ─────────────────────────────
// Sets Firebase Auth custom claims (role, orgId, superAdmin) so Firestore
// security rules can validate server-side. Called by client after login.

exports.wcSetClaims = onCall({
  secrets: [superAdminUid],
  cors: true,
  invoker: 'public'
}, async (request) => {
  if (!request.auth) throw new Error('Authentication required');

  const uid = request.auth.uid;
  const db = getFirestore();
  const auth = getAuth();
  const SA_UID = superAdminUid.value();

  // Check if super admin
  if (uid === SA_UID) {
    // SA gets superAdmin claim + orgId from their user doc
    const userDoc = await db.collection('users').doc(uid).get();
    const orgId = userDoc.exists ? userDoc.data().orgId || '' : '';
    await auth.setCustomUserClaims(uid, {
      superAdmin: true,
      role: 'super_admin',
      orgId: orgId
    });
    console.log('[Claims] Super Admin claims set for:', uid, '| orgId:', orgId);
    return { role: 'super_admin', orgId, superAdmin: true };
  }

  // Regular user: read role and orgId from user doc
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) {
    // New user — no claims yet, will be set after onboarding
    return { role: '', orgId: '', superAdmin: false };
  }

  const data = userDoc.data();
  const role = data.role || 'canvasser';
  const orgId = data.orgId || '';

  await auth.setCustomUserClaims(uid, {
    superAdmin: false,
    role: role,
    orgId: orgId
  });

  console.log('[Claims] Claims set for:', uid, '| role:', role, '| orgId:', orgId);
  return { role, orgId, superAdmin: false };
});

// ── Update Claims on Role Change ─────────────────────────────────────────────
// When a user doc is updated (role or orgId changes), refresh their claims
exports.wcUserUpdated = onDocumentUpdated('users/{userId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const uid = event.params.userId;

  // Only update claims if role or orgId changed
  if (before.role === after.role && before.orgId === after.orgId) return null;

  const auth = getAuth();
  const SA_UID = superAdminUid.value();

  const claims = {
    superAdmin: uid === SA_UID,
    role: after.role || 'canvasser',
    orgId: after.orgId || ''
  };

  try {
    await auth.setCustomUserClaims(uid, claims);
    console.log('[Claims] Auto-updated for:', uid, '| role:', claims.role, '| orgId:', claims.orgId);
  } catch (e) {
    console.error('[Claims] Auto-update failed for:', uid, e.message);
  }

  return null;
});

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
  cors: true
}, async (request) => {
  // Require authentication — no anonymous API abuse
  if (!request.auth) throw new Error('Authentication required');

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

// ── Commission Calculator ────────────────────────────────────────────────────
// Triggers when a deal doc is created or updated in organizations/{orgId}/deals/{dealId}
// Calculates commissions for canvasser, closer, and manager override
// Writes results to organizations/{orgId}/commissions/{commissionId}

exports.wcCalcCommission = onDocumentCreated('organizations/{orgId}/deals/{dealId}', async (event) => {
  const deal = event.data.data();
  const orgId = event.params.orgId;
  const dealId = event.params.dealId;
  const db = getFirestore();

  if (!deal || !deal.systemSizeKw || !deal.ppw) {
    console.log('[Commission] Skipping deal', dealId, '— missing systemSizeKw or ppw');
    return null;
  }

  // Load org compensation settings
  let compSettings = { apptSplitPct: 50, overridePerWatt: 0.10 };
  try {
    const compDoc = await db.collection('organizations').doc(orgId).collection('compSettings').doc('default').get();
    if (compDoc.exists) compSettings = Object.assign(compSettings, compDoc.data());
  } catch (_) {}

  const systemWatts = deal.systemSizeKw * 1000;
  const totalDealValue = systemWatts * deal.ppw;

  // Closer commission: PPW * system size
  const closerCommission = totalDealValue;

  // Canvasser commission: split of deal value (if canvasser set the appointment)
  const apptSplitPct = compSettings.apptSplitPct || 50;
  const canvasserCommission = deal.canvasserUid ? (totalDealValue * (apptSplitPct / 100)) : 0;

  // Manager override: per watt
  const overridePerWatt = compSettings.overridePerWatt || 0;
  const managerOverride = systemWatts * overridePerWatt;

  const batch = db.batch();

  // Write closer commission
  if (deal.closerUid) {
    const closerRef = db.collection('organizations').doc(orgId).collection('commissions').doc();
    batch.set(closerRef, {
      dealId, orgId,
      repUid: deal.closerUid,
      repName: deal.closerName || '',
      role: 'closer',
      amount: closerCommission,
      ppw: deal.ppw,
      systemSizeKw: deal.systemSizeKw,
      systemWatts,
      customerName: deal.customerName || '',
      address: deal.address || '',
      status: 'earned',  // earned → paid → clawed
      dealStatus: deal.status || 'signed',
      createdAt: new Date().toISOString()
    });
  }

  // Write canvasser commission (if different from closer)
  if (deal.canvasserUid && deal.canvasserUid !== deal.closerUid) {
    const canvasserRef = db.collection('organizations').doc(orgId).collection('commissions').doc();
    batch.set(canvasserRef, {
      dealId, orgId,
      repUid: deal.canvasserUid,
      repName: deal.canvasserName || '',
      role: 'canvasser',
      amount: canvasserCommission,
      splitPct: apptSplitPct,
      systemSizeKw: deal.systemSizeKw,
      customerName: deal.customerName || '',
      address: deal.address || '',
      status: 'earned',
      dealStatus: deal.status || 'signed',
      createdAt: new Date().toISOString()
    });
  }

  // Write manager override (find all managers in org)
  if (overridePerWatt > 0) {
    try {
      const teamSnap = await db.collection('organizations').doc(orgId).collection('team').get();
      teamSnap.forEach(doc => {
        const member = doc.data();
        if (member.role === 'manager' || member.role === 'master_admin') {
          const mgrRef = db.collection('organizations').doc(orgId).collection('commissions').doc();
          batch.set(mgrRef, {
            dealId, orgId,
            repUid: member.repUid || doc.id,
            repName: member.name || '',
            role: 'override',
            amount: managerOverride,
            overridePerWatt,
            systemSizeKw: deal.systemSizeKw,
            customerName: deal.customerName || '',
            address: deal.address || '',
            status: 'earned',
            dealStatus: deal.status || 'signed',
            createdAt: new Date().toISOString()
          });
        }
      });
    } catch (_) {}
  }

  // Update deal with calculated values
  batch.update(event.data.ref, {
    closerCommission,
    canvasserCommission,
    managerOverride,
    totalDealValue,
    commissionsCalculated: true
  });

  await batch.commit();
  console.log('[Commission] Deal', dealId, ':', deal.systemSizeKw, 'kW @', deal.ppw, '/W =',
    '$' + totalDealValue.toFixed(2), '| closer:', '$' + closerCommission.toFixed(2),
    '| canvasser:', '$' + canvasserCommission.toFixed(2), '| override:', '$' + managerOverride.toFixed(2));

  return null;
});

// ── Deal Status Updated: handle clawbacks ─────────────────────────────────────
exports.wcDealUpdated = onDocumentUpdated('organizations/{orgId}/deals/{dealId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const orgId = event.params.orgId;
  const dealId = event.params.dealId;

  // Only act on status changes
  if (before.status === after.status) return null;

  const db = getFirestore();

  // Deal cancelled + commissions were already paid → clawback
  if (after.status === 'cancelled' && before.status !== 'cancelled') {
    const commSnap = await db.collection('organizations').doc(orgId)
      .collection('commissions').where('dealId', '==', dealId).get();

    const batch = db.batch();
    commSnap.forEach(doc => {
      const comm = doc.data();
      if (comm.status === 'paid') {
        batch.update(doc.ref, { status: 'clawed', clawedAt: new Date().toISOString() });
      } else if (comm.status === 'earned') {
        batch.update(doc.ref, { status: 'cancelled', cancelledAt: new Date().toISOString() });
      }
    });
    await batch.commit();
    console.log('[Commission] Clawback processed for deal', dealId);
  }

  // Deal installed → lock commissions (no future clawback possible)
  if (after.status === 'installed' && before.status !== 'installed') {
    const commSnap = await db.collection('organizations').doc(orgId)
      .collection('commissions').where('dealId', '==', dealId).get();

    const batch = db.batch();
    commSnap.forEach(doc => {
      if (doc.data().status === 'earned') {
        batch.update(doc.ref, { status: 'locked', lockedAt: new Date().toISOString() });
      }
    });
    await batch.commit();
    console.log('[Commission] Commissions locked (installed) for deal', dealId);
  }

  return null;
});

// ── Get My Commissions (callable) ────────────────────────────────────────────
// Reps call this to get their commission summary
exports.wcGetCommissions = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new Error('Authentication required');

  const uid = request.auth.uid;
  const orgId = request.auth.token.orgId;
  if (!orgId) throw new Error('No org assigned');

  const db = getFirestore();
  const { period } = request.data || {};

  // Build date filter
  let startDate = null;
  const now = new Date();
  if (period === 'week') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  } else if (period === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1);
  }
  // Default: all time (no filter)

  let query = db.collection('organizations').doc(orgId)
    .collection('commissions')
    .where('repUid', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(200);

  const snap = await query.get();
  const commissions = [];
  let totalEarned = 0, totalPaid = 0, totalClawed = 0, totalPending = 0;

  snap.forEach(doc => {
    const c = doc.data();
    // Apply date filter client-side (Firestore can't filter string dates + other where)
    if (startDate && new Date(c.createdAt) < startDate) return;
    commissions.push({ id: doc.id, ...c });
    if (c.status === 'earned' || c.status === 'locked') totalPending += c.amount;
    if (c.status === 'paid') totalPaid += c.amount;
    if (c.status === 'clawed') totalClawed += c.amount;
  });

  totalEarned = totalPending + totalPaid;

  return {
    commissions,
    summary: {
      totalEarned: Math.round(totalEarned * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalPending: Math.round(totalPending * 100) / 100,
      totalClawed: Math.round(totalClawed * 100) / 100,
      dealCount: commissions.length
    }
  };
});
