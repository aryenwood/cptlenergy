const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

// Send push notification to a specific user by uid
exports.wcSendPush = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in');
  }

  const { targetUid, title, body, data: notifData } = request.data;

  if (!targetUid || !title || !body) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const db = getFirestore();
  const userDoc = await db.collection('users').doc(targetUid).get();

  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'Target user not found');
  }

  const fcmToken = userDoc.data().fcmToken;
  if (!fcmToken) {
    console.log(`[FCM] No token for user ${targetUid}`);
    return { success: false, reason: 'no_token' };
  }

  const message = {
    token: fcmToken,
    notification: { title, body },
    data: notifData || {},
    webpush: {
      fcmOptions: {
        link: 'https://cptlenergy.netlify.app'
      }
    }
  };

  try {
    const response = await getMessaging().send(message);
    console.log(`[FCM] Sent to ${targetUid}:`, response);
    return { success: true, messageId: response };
  } catch (err) {
    console.error('[FCM] Send failed:', err);
    throw new HttpsError('internal', err.message);
  }
});

// Triggered when a rep redeems an invite
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

    const managerDoc = await db.collection('users').doc(orgId).get();
    if (!managerDoc.exists) return null;

    const fcmToken = managerDoc.data().fcmToken;
    if (!fcmToken) return null;

    const message = {
      token: fcmToken,
      notification: {
        title: '🎉 New Rep Joined',
        body: `${repName} just joined your team as ${role}`,
      },
      webpush: {
        fcmOptions: { link: 'https://cptlenergy.netlify.app' }
      }
    };

    return getMessaging().send(message);
  }
  return null;
});
