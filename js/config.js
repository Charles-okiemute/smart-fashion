/* ==========================================================================
   Smart Fashion  |  config.js  |  The only file you edit to switch on REAL email
   --------------------------------------------------------------------------
   Real emails (client order updates AND login codes) are sent through EmailJS,
   a free service (about 200 emails a month) that works from a plain website,
   so you do not need a server or a database.

   Setup takes about 10 minutes. Full steps are in README.md ("Send real emails").
   Leave the three values empty to stay in DEMO mode: nothing is sent, login
   codes appear on screen and client emails are saved in the Outbox only.
   ========================================================================== */
window.SF_CONFIG = {
  workshopName: 'Smart Fashion',        // shown as the sender name in emails
  emailjs: {
    publicKey: '5usRkLKhiCoROXnD2',                      // EmailJS > Account > API keys > Public Key
    serviceId: 'service_ccgf5el',                      // EmailJS > Email Services > Service ID
    templateId: 'template_uuyrcqv'                      // EmailJS > Email Templates > Template ID
  }
};
