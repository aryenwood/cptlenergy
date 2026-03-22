const { onDocumentUpdated, onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

// Triggered by client writing to notifications/{notifId} — sends push then deletes the doc.
// No direct HTTP call from client = no CORS issues.
exports.wcProcessNotification = onDocumentCreated('notifications/{notifId}', async (event) => {
  const data = event.data.data();
  const { targetUid, title, body, notifData } = data;

  const db = getFirestore();
  const userDoc = await db.collection('users').doc(targetUid).get();
  if (!userDoc.exists) return null;

  const fcmToken = userDoc.data().fcmToken;
  if (!fcmToken) return null;

  const message = {
    token: fcmToken,
    notification: { title, body },
    data: notifData || {},
    webpush: {
      fcmOptions: { link: 'https://cptlenergy.netlify.app' }
    }
  };

  await getMessaging().send(message);

  // Delete the notification request after sending
  await event.data.ref.delete();

  return null;
});

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
