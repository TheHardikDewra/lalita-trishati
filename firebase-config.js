/* ========================================
   Firebase configuration for cloud sync.

   These values are public identifiers, not secrets - data access
   is enforced by firestore.rules (a signed-in user can only touch
   documents under their own uid).

   All the sadhana apps share ONE Firebase project, so a single
   login works everywhere. `appId` below is the per-app namespace
   (the doc id under users/{uid}/apps/), and `fields` maps this
   app's localStorage keys onto how each one merges across devices.

   While apiKey/projectId are still REPLACE_ME, sync.js stays fully
   dormant and the app runs exactly as it did before, offline-first.
   ======================================== */

window.SADHANA_SYNC_CONFIG = {
  appId: 'lalita-trishati',
  deviceKey: 'lt_device_id',
  fields: [
    { name: 'learned',  key: 'lt_learned',        merge: 'idset'     },
    { name: 'srs',      key: 'lt_srs',            merge: 'srs'       },
    { name: 'notes',    key: 'lt_notes',          merge: 'notes'     },
    { name: 'sadhana',  key: 'lt_sadhana',        merge: 'sadhana'   },
    { name: 'chantPos', key: 'lt_chant_pos',      merge: 'bookmark'  },
  ],
  firebase: {
    apiKey: 'REPLACE_ME',
    authDomain: 'REPLACE_ME.firebaseapp.com',
    projectId: 'REPLACE_ME',
    storageBucket: 'REPLACE_ME.firebasestorage.app',
    messagingSenderId: 'REPLACE_ME',
    appId: 'REPLACE_ME',
  },
};
