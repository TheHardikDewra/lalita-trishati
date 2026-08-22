/* ========================================
   Firebase configuration for cloud sync.

   These values are public identifiers, not secrets - data access
   is enforced by firestore.rules (a signed-in user can only touch
   documents under their own uid).

   All the sadhana apps share ONE Firebase project, so a single
   login works everywhere. `appId` below is the per-app namespace
   (the doc id under users/{uid}/apps/), and `fields` maps this
   app's localStorage keys onto how each one merges across devices.

   Sync is live against the shared 'Sadhana Apps' Firebase project.
   Blanking apiKey/projectId puts sync back to sleep without
   touching anything else - the app stays fully usable offline.
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
    apiKey: 'AIzaSyDjhN4HagHlUt0EvTMJd5T-g5N01Ntv95M',
    authDomain: 'sadhana-apps-hd.firebaseapp.com',
    projectId: 'sadhana-apps-hd',
    storageBucket: 'sadhana-apps-hd.firebasestorage.app',
    messagingSenderId: '555145234754',
    appId: '1:555145234754:web:d3bee0ad4b693b06ba60db',
  },
};
