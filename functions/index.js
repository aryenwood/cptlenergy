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

// ── Org Created: Auto-whitelist Firebase Auth domain ─────────────────────────
// When a new org is created with a customDomain, add it to Firebase Auth authorized domains
exports.wcOrgCreated = onDocumentCreated('organizations/{orgId}', async (event) => {
  const data = event.data.data();
  const domain = data.customDomain;
  if (!domain) return null;

  try {
    // Use Google Identity Toolkit REST API to add authorized domain
    const { GoogleAuth } = require('google-auth-library');
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase'] });
    const client = await auth.getClient();
    const projectId = 'wc-app-alpha';

    // Get current config
    const configUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;
    const configRes = await client.request({ url: configUrl });
    const currentDomains = configRes.data.authorizedDomains || [];

    if (currentDomains.includes(domain)) {
      console.log('[OrgCreated] Domain already authorized:', domain);
      return null;
    }

    // Add new domain
    currentDomains.push(domain);
    await client.request({
      url: configUrl + '?updateMask=authorizedDomains',
      method: 'PATCH',
      data: { authorizedDomains: currentDomains }
    });

    console.log('[OrgCreated] Domain authorized for Firebase Auth:', domain);
    return null;
  } catch (e) {
    console.error('[OrgCreated] Failed to authorize domain:', domain, e.message);
    return null;
  }
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
