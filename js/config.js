/* Site config: third-party keys and the shared namespace. Loaded first. */
(function () {
  'use strict';
  const R = (window.Ruski = window.Ruski || {});
  R.config = {
    /* Firebase web config. These values are public by design (they ship in every Firebase web app);
       what protects the data is the database rules, not this object. */
    firebase: {
      apiKey: 'AIzaSyAtQIPJ9xUQAKUDFoci4XUeUtR3olULNfg',
      authDomain: 'fisher-ruski-tracker.firebaseapp.com',
      databaseURL: 'https://fisher-ruski-tracker-default-rtdb.firebaseio.com',
      projectId: 'fisher-ruski-tracker',
      storageBucket: 'fisher-ruski-tracker.firebasestorage.app',
      messagingSenderId: '957714588163',
      appId: '1:957714588163:web:3df268d93fbdc4ea932436'
    },
    dataPath: 'fisherRuskiData',
    emailjsKey: 'pyEFhKTszWQu0O5ZC',
    signupUrl: 'https://forms.gle/NxPr1EjSLEgggZzS7'
  };
})();
