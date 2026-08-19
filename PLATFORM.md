# Hydrogen RO & Eleven RO — how the operation runs

One CRM behind two RO service brands in Bengaluru. This note is the full picture: websites, office, technicians, WhatsApp, money, and Android apps.

Staff use it every day. Customers never log into the CRM. They use the public website, WhatsApp, email, UPI links, and review / warranty / authenticity pages.

---

## Two brands, one backend

**Hydrogen RO** (hydrogenro.com) and **Eleven RO** (elevenro.com) are two public faces. Phone numbers, WhatsApp lines, colours, and SEO are brand-specific. Jobs, customers, technicians, money, and documents live in **one shared system**.

| | Hydrogen RO | Eleven RO |
|---|---|---|
| Site | hydrogenro.com | elevenro.com |
| Phone | +91 88849 44288 | +91 98806 93311 |
| Email | mail@hydrogenro.com | mail@elevenro.com |
| Public positioning | City-wide Bengaluru, same-day RO, commercial plants | Same platform; South Bangalore–led site |

---

## How a job runs

1. **Lead in.** Website book, WhatsApp, phone, Home Triangle / other lead sources, or a walk-in. Office creates or finds the customer and opens a job (service, installation, AMC, and so on).
2. **Assign.** A technician is assigned. They get a push on the phone and, if enabled, WhatsApp. Visit order can be arranged on a map.
3. **On site.** Tech starts work, GPS is available, OTP can be required (for example Home Triangle). Photos of the unit and work are uploaded.
4. **Close.** Complete the job, capture bill / payment photos, spare parts, cash or UPI. Office sees status in real time.
5. **After.** Service bill, tax invoice, quotation, AMC, warranty, or letterhead PDF can be downloaded, emailed, or sent on WhatsApp. Customer can rate the visit. Follow-up dates sit on the dashboard.

---

## Customer website

Each brand has its own public site.

- Home, services, areas, blog, spare parts, warranty, contact
- **Book** — RO / commercial plant / softener, with customer lookup, address and photos
- Public **warranty** lookup and **product QR** genuineness check
- Pay with a short **UPI link** (`/p/…`)
- After a visit: **review** link
- After a document: optional **preview + I Accept**, then the sealed original
- **PDF authenticity** — verify a document by code / hash (footer of generated PDFs)
- Privacy / terms / refund / cookie / disclaimer pages; privacy data request

---

## Admin (office)

Used on the desktop website (`/admin`) and the **HRO Admin** Android app. Managers can be limited; full admins see money, WhatsApp settings, and staff tools.

### Jobs dashboard

- Ongoing, follow-up, denied, completed lists with filters
- Add customer, new job, assign / reassign, complete, edit, photos, history
- Nearby jobs, live technician map, visit order, measure distance
- Calling page, reminders, pending payments, customer merge
- CRM AI assistant for search and “what happened today” style questions
- Quick customer, direct / office sale, amount trackers, sent email log
- Message technician, arrange visit order

### Settings and tools

**Communication**

- Calling
- WhatsApp inbox (read and send)
- WhatsApp settings (send controls, templates, rates, budget, technician push → WhatsApp)
- Email open tracking

**Customers and work**

- Reminders (general and customer)
- Recurring service tracker (six-month / yearly)
- Advanced customer search
- Customer reviews (job ratings)
- Warranty management
- Merge duplicate customers
- Done booking archive

**Technicians**

- Last known location; hours and travel km after 9:00 PM IST
- Add / edit / deactivate technicians
- Location tracking on/off
- Device tracker (app devices, FCM)

**Payments and documents**

- Pending payments
- GST invoices
- AMC list
- PDF authenticity verify
- Letterhead: service report, AMC report, custom document
- Direct / office sale
- Payment QR codes, quick UPI QR, UPI accounts
- QR image generator, common technician QR, product verification QR

**App and data**

- Todo tasks
- Amount trackers
- Dashboard: follow-up glow, non-AMC follow-up count, office pin (avoid-tolls km), PDF compression, job assign WhatsApp popup
- Admin app lock / PIN
- Lead sources and costs (e.g. Home Triangle Service ₹231, Installation / Reinstallation ₹116)
- Privacy Center (data requests, consent)
- CSV data export, storage usage
- AI usage and models
- App crash reports

---

## Technician (field)

Used on the phone as **HRO Technician** and on the web portal (`/technician`). Lead cost is never shown. Jobs are assigned by the office.

- Today’s jobs, start / complete, on-the-way, photos, notes
- Customer OTP when the office requires it
- Create a job for an existing customer (server sets lead cost)
- Bill amount, bill/payment photos, spare parts, cash handover prompts
- QR payments, common QR codes, product verification
- Background location when tracking is on; hours and km digest after 9:00 PM IST
- Office messages, nudges, parts reminders — push and optional WhatsApp

---

## WhatsApp

Official Meta Cloud API on each brand’s business number.

- Inside 24 hours: free-form chat
- Outside 24 hours: approved utility templates (job assigned, documents, reminders, booking, and so on)
- Office inbox: threads, media, reply, cold templates when the window is closed
- Booking bot for new and existing customers
- PDFs (bill, invoice, AMC, quotation, warranty, letterhead) as documents
- Optional **Require Accept**: watermarked preview, then original after Accept
- Technician push categories can be mirrored to the tech’s WhatsApp

---

## Money and documents

- Job profit: amount − spare parts − lead cost − technician commission
- Analytics: billing, lead sources, expenses, completed work
- Generators: service bill, tax invoice, quotation, AMC, warranty, salary slip, letterhead — Email / WhatsApp / download
- Generated customer PDFs carry a verify code and a hash stored in the CRM (not the PDF bytes)
- Pending payments, UPI QR, direct/office sales, amount trackers
- Evening cash / expense checks to technicians and admins

---

## AI in the CRM

Optional assistants for office staff (usage and models in Settings). They do not replace assigning a technician or sending a bill.

- CRM chat: find customers, jobs, AMC, nearby work, day summaries
- Inbox suggest / auto-reply help on WhatsApp threads
- Document draft help on letterhead and similar PDFs

---

## Apps, logins, and who sees what

| Who | Where | What they do |
|---|---|---|
| Customer | Website, WhatsApp, SMS/email links | Book, pay, review, check warranty / authenticity. No CRM login. |
| Admin | hydrogenro.com/admin · HRO-Admin APK | Full office: jobs, money, WhatsApp, staff, documents. |
| Manager | Same admin app, restricted | Day-to-day jobs and customers; not all money/settings. |
| Technician | /technician · HRO-Technician APK | Assigned work, photos, bills, OTP, location. No lead costs. |

**Push.** Custom sounds on admin and technician phones: new jobs, WhatsApp, calls, cash checks, reminders, reviews, and similar. Each person can mute categories.

**Access.** Staff logins, row-level access in the database, privacy requests, and public pages that use one-time tokens (review, accept) — not guessable customer IDs.

**Area.** Bengaluru and roughly 250 km. Maps avoid tolls for technician travel km.

**Reviews.** Star ratings after jobs; Google-review tracking on customers; technician ID cards for the field.
