/* ==========================================================================
   Smart Fashion  |  notify.js  |  Email notification rules (from the project report)
   --------------------------------------------------------------------------
   RULE:  Only TWO events send an email to the client:
            1. Order created  -> status "Received" -> order confirmation (with due date)
            2. Status "Ready" -> pickup alert
          "Cutting" and "Sewing" only update the status. NO email.
   This keeps messages meaningful and saves data/cost for small tailors.

   Every email is logged in the Outbox (notifications table). With real email
   switched on in js/config.js it is also delivered to the client; otherwise it is
   only saved (demo). No money is ever included in an email.
   ========================================================================== */

const Notify = (() => {
  'use strict';

  const brand = () => (window.SF_CONFIG && window.SF_CONFIG.workshopName) || 'Smart Fashion';   // set in config.js
  const EMAIL_STATUSES = ['Received', 'Ready'];

  const shouldEmail = status => EMAIL_STATUSES.includes(status);

  function longDate(iso) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB',
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Build the subject + body for the right type of message.
  function build(order, client, type) {
    const first = client.client_name.split(' ')[0];
    const ref = `#${String(order.order_id).padStart(4, '0')}`;
    if (type === 'confirmation') {
      return {
        subject: `${brand()}: we have received your ${order.garment_style} order ${ref}`,
        body:
`Dear ${first},

Thank you for your order. We have recorded your ${order.garment_style}${order.group_name ? ' for "' + order.group_name + '"' : ''} and your measurements are on file.

Order reference: ${ref}
Expected completion: ${longDate(order.due_date)}

We will message you again as soon as it is ready for pickup.

Warm regards,
Your tailor, via ${brand()}`
      };
    }
    return {
      subject: `${brand()}: your ${order.garment_style} is ready for pickup ${ref}`,
      body:
`Dear ${first},

Good news. Your ${order.garment_style} (order ${ref}) is finished and ready for pickup.

Please bring your order reference when you come.

Warm regards,
Your tailor, via ${brand()}`
    };
  }

  // Hand a logged email to the mail service, then record what happened.
  function deliver(n, clientName) {
    Mailer.send({ to: n.to, toName: clientName, subject: n.subject, message: n.body }).then(r => {
      const done = DB.updateNotification(n.id, { status: r.ok ? 'sent' : 'failed', error: r.ok ? '' : (r.error || 'Unknown error') });
      if (api.onUpdate && done) api.onUpdate(done);
    });
  }

  /**
   * Called whenever an order is created or its status changes.
   * Returns the logged notification, or null when the rules say "no email".
   * With real email switched on (js/config.js) the message is also delivered
   * to the client's address; otherwise it is only saved in the Outbox (demo).
   */
  function send(order, client, status, opts = {}) {
    if (!shouldEmail(status)) return null;                 // Cutting / Sewing: stop here.
    const type = status === 'Received' ? 'confirmation' : 'pickup';
    const msg = build(order, client, type);
    const live = !opts.noDeliver && Mailer.canDeliverTo(client.client_email);
    const n = DB.addNotification({
      order_id: order.order_id, to: client.client_email, subject: msg.subject, body: msg.body,
      type, sent_at: opts.sentAt, status: live ? 'sending' : 'demo'
    });
    if (live) deliver(n, client.client_name);   // real delivery via EmailJS (see mailer.js)
    return n;
  }

  function retry(id) {
    const n = DB.getNotification(id); if (!n) return;
    const c = DB.getClients().find(x => x.client_email === n.to);
    DB.updateNotification(id, { status: 'sending', error: '' });
    deliver(DB.getNotification(id), c ? c.client_name : '');
    return DB.getNotification(id);
  }

  const api = { shouldEmail, send, build, retry, onUpdate: null };

  return api;
})();
