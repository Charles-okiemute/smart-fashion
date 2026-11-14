# Smart Fashion

**Every measure. Every order. Linked.**

A digital fashion record system for small-scale Nigerian tailors. It replaces the paper measurement book and order notebook. Built with plain HTML, CSS and JavaScript. No framework, no server, no database bill.

## Run it

The service worker (offline mode) needs `http://localhost`, so use a local server rather than double-clicking `index.html`.

- **VS Code:** right-click `index.html` > *Open with Live Server* (or click **Go Live**).
- **Python:** in this folder run `python -m http.server 5500`, then open http://localhost:5500
- **Node:** `npx serve`

Double-clicking `index.html` still works, but offline caching is switched off.

## Signing in

1. **Choose a role:** Master Tailor or Apprentice.
2. **Sign in or Create account.** Anyone can create an account with any valid email (full name, email, password; 8+ characters with upper case, lower case and a number). Passwords are stored only as salted hashes. An email belongs to one role, so using it on the other role's card gives a clear message.
3. **Email verification code (2FA).** A 6-digit code, valid for 5 minutes, 3 tries, "Send a new code" with a 30-second cooldown. In **demo mode** the code is shown on screen. With **real email switched on** it is sent to the person's inbox. A new account is only saved once its code is confirmed, which proves the email works.

Also included: temporary lock after 5 wrong passwords, automatic sign-out after 15 minutes of inactivity, "Forgot your password?" reset by emailed code, "Change password" in Settings, and **Settings > Team access** where the Master Tailor creates or removes apprentice accounts.

Role access: the **Master Tailor** sees prices, payments, revenue, receipts and backups and can delete records and manage the team. The **Apprentice** can add clients, record measurements, create orders and move them through the stages, but cannot see prices or revenue or delete anything.

## Send real emails (about 10 minutes, free, no server)

Out of the box the app is in **demo mode**: nothing is emailed. To send real client emails and real login codes, use EmailJS (free plan: about 200 emails a month).

1. Create a free account at **emailjs.com**.
2. **Email Services > Add New Service**, pick Gmail (or Outlook), connect the account that should send the mail. Copy the **Service ID**.
3. **Email Templates > Create New Template.** Set:
   - **To Email:** `{{to_email}}`
   - **Subject:** `{{subject}}`
   - **From Name:** `{{from_name}}`
   - **Content:** `{{message}}`

   Save it and copy the **Template ID**.
4. **Account > General**, copy your **Public Key**. Under **Security**, restrict it to your website's domain once deployed.
5. Open `js/config.js` and paste the three values:

```js
emailjs: { publicKey: 'xxxx', serviceId: 'service_xxxx', templateId: 'template_xxxx' }
```
6. Reload (clear the service worker once, or bump `CACHE_VERSION` in `sw.js`). **Settings > Email delivery** now says **Live**, with a "Send a test email" button.

What then happens:
- Login and password-reset codes go to the person's inbox instead of appearing on screen.
- Order confirmation (Received) and pickup alert (Ready) emails go to the client's address. Cutting and Sewing still send nothing.
- The **Outbox** shows each email as Sending, Delivered or Failed, with a **Retry** button if it fails (for example when offline).
- The demo clients with made-up addresses (example.com) are never emailed, so no quota is wasted.

Honest limits for your defence: the code is created and checked in the browser, which is fine for a demo; a production system would do that on a server. The sending mailbox is the one you connected in EmailJS, and the free plan is limited to about 200 emails a month.

## The rule at the heart of the project

Clients get an email **only** when an order is **Received** (confirmation with due date) and when it is **Ready** (pickup alert). Moving to **Cutting** or **Sewing** changes the status and sends nothing. Each email is logged in the **Outbox**. In demo mode it is only saved; with EmailJS keys in `js/config.js` it is also delivered to the client (`js/mailer.js`). No prices are ever included in an email.

## Files

```
index.html        page shell + icon sprite
css/style.css     blue and white design: Adire pattern, measuring-tape motifs
js/db.js          the "database" layer (localStorage; swap for MySQL later)
js/config.js      EmailJS keys (the only file to edit for real email)
js/mailer.js      sends real email via EmailJS
js/auth.js        accounts, roles, email-code 2FA
js/notify.js      email rules (Received + Ready only)
js/app.js         screens, routing, forms
sw.js             offline caching
manifest.json     install-to-home-screen info
icon.svg          app icon
```

## Put it online (free)

1. Push this folder to a GitHub repository.
2. On vercel.com choose **Add New > Project**, import the repo, Framework Preset **Other**, leave build settings empty, **Deploy**.
3. After editing any file, bump `CACHE_VERSION` in `sw.js` (for example `smartfashion-v3`) so phones pick up the change.

## 2-minute demo script

1. **Login (25s).** Choose *Master Tailor*, tap *Create account*, enter your name, any valid email and a password, then enter the verification code (emailed, or shown on screen in demo mode). "Role, password, then a second factor."
2. **Dashboard (20s).** Point at the tape-style pipeline, the overdue and due-soon counts, and the festive-season load meter. "The tailor sees the whole workshop at a glance."
3. **Find a client fast (15s).** Clients > type "ibra". "Instant search fixes the slow retrieval problem from the report."
4. **Measurements (20s).** Open a client > Record measurements > pick *Agbada*. Show the fields change per garment, enter chest `500` to show validation, toggle cm/inches. "Every save keeps history; the newest is marked Current."
5. **New order (25s).** Orders > New order. Pick the client and garment; show "Reusing current measurements". Create it. Show the toast, then **Outbox**: the confirmation email. Tick *Aso-Ebi group order* to show one event with many clients.
6. **The email rule (15s).** Open the order. Move to *Cutting*, then *Sewing*: "no email". Move to *Ready*: pickup email appears in the Outbox.
7. **Money (10s).** Record a payment, open the receipt, click Print.
8. **Apprentice (15s).** Log out, choose *Apprentice* and create an account with a different email. No prices, no delete buttons. Back as Master: Settings > Team access.
9. **Offline (10s).** In browser DevTools tick *Offline* and reload. The app still opens and shows the Offline badge. Mention the backup export in Settings.

## Limits of the demo (say this in your defence)

- Data is stored in the browser on one device. Export and import move it between devices.
- Accounts live in the browser on one device. Emails are real only after you add EmailJS keys; otherwise they are simulated. A production version would use a hosted database (MySQL, Supabase or Firebase), a real email service and server-side login.
