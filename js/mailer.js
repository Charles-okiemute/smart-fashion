/* ==========================================================================
   Smart Fashion  |  mailer.js  |  Sends real email through EmailJS (REST API)
   --------------------------------------------------------------------------
   One tiny function, Mailer.send(), is used for everything: client order emails
   and login / password-reset codes. No library is needed, just fetch().

   The EmailJS template only needs these variables:
       {{to_email}}  {{to_name}}  {{subject}}  {{message}}  {{from_name}}
   If the keys in config.js are empty, isLive() is false and the app falls back
   to demo mode (nothing is sent).

   SECURITY NOTE (say this in your defence): the public key is designed to be
   visible in the browser, and EmailJS lets you restrict it to your website's
   domain. The one-time code is still generated in the browser, so a production
   system would create and check it on a server. For a student demo this is fine.
   ========================================================================== */

const Mailer = (() => {
  'use strict';

  const ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';
  const cfg = () => ((window.SF_CONFIG && window.SF_CONFIG.emailjs) || {});
  const workshop = () => (window.SF_CONFIG && window.SF_CONFIG.workshopName) || 'Smart Fashion';

  const isLive = () => { const c = cfg(); return !!(c.publicKey && c.serviceId && c.templateId); };

  // The demo clients use made-up addresses; never spend real email quota on them.
  const FAKE = /@(example\.(com|org|net)|smartfashion\.demo)$|\.(test|invalid|localhost)$/i;
  const canDeliverTo = email => isLive() && !FAKE.test(String(email || '').trim());

  async function send({ to, toName, subject, message }) {
    if (!isLive()) return { ok: false, simulated: true, error: 'Email is not connected.' };
    const c = cfg();
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: c.serviceId, template_id: c.templateId, user_id: c.publicKey,
          template_params: { to_email: to, to_name: toName || '', subject, message, from_name: workshop() }
        })
      });
      if (res.ok) return { ok: true };
      const text = (await res.text().catch(() => '')) || '';
      return { ok: false, error: text.slice(0, 160) || ('Email service replied ' + res.status) };
    } catch (e) {
      return { ok: false, error: 'No internet connection.' };
    }
  }

  // Login / reset codes
  function sendCode(email, code, purpose, name) {
    const reset = purpose === 'reset';
    return send({
      to: email, toName: name,
      subject: `${workshop()}: your ${reset ? 'password reset' : 'verification'} code is ${code}`,
      message:
`Your ${workshop()} ${reset ? 'password reset' : 'verification'} code is:

${code}

It expires in 5 minutes. If you did not ask for this, you can ignore this email and nobody can sign in without it.`
    });
  }

  return { isLive, canDeliverTo, send, sendCode };
})();
