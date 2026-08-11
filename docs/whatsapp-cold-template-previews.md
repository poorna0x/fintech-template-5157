# WhatsApp cold templates — live preview (Eleven RO & Hydrogen RO)

Generated: **11 Aug 2026, 3:02 pm IST** · WABA `1854517668845707`

How to read this doc:
- **Message** = what the customer sees in WhatsApp (sample vars filled: Rahul, amounts, dates).
- **Buttons** = Meta template quick-action row under the message (cold / outside 24h window only).
- **Text us** appears in the *message body* on letter/PDF templates (Meta blocks `wa.me` on URL buttons).
- **24h window open** → CRM sends free-form text instead; wording matches these templates.

| Call us (voice) | Eleven RO | Hydrogen RO |
|---|---|---|
| Main line | 9880693311 | 8884944288 |
| Website | elevenro.com | hydrogenro.com |
| Pay now link | elevenro.com/p/{code} | hydrogenro.com/p/{code} |

---

## Eleven RO

### Balance due letter v4 (Pay now)

#### `svc_balance_due_letter_ero_v4`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul,
This is an update from Eleven RO regarding your pending payment for water purifier service.

Amount pending: INR 500
Due date: 15 Aug 2026
Invoice / Job: RO2608121234

Thank you for choosing Eleven RO.
Call:
9880693311
Email:
mail@elevenro.com
Website:
elevenro.com
Text us:
https://wa.me/919880693311

Tap Pay now below or reply on this chat if you have already paid.
```

**Buttons:** **Call us** → `+919880693311` · **Pay now** → https://elevenro.com/p/pay123456

---

### Booking confirm / cancel v2

#### `svc_booking_cancelled_ero_v2`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, your Eleven RO water purifier service booking for Tue 12 Aug, 2:00 PM has been cancelled. Reply BOOK on this chat to reschedule, or use Call / Text us / Book below.
```

**Buttons:** **Call us** → `+919880693311` · **Text us** → https://wa.me/919880693311 · **Book online** → https://elevenro.com/book

---

#### `svc_booking_confirmed_ero_v2`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, your Eleven RO water purifier service booking RO2608121234 is confirmed for Tue 12 Aug, 2:00 PM. Reply on this chat if you need to change the date or time.
```

**Buttons:** **Call us** → `+919880693311` · **Website** → https://elevenro.com · **Text us** → https://wa.me/919880693311

---

### Booking CTA

#### `existing_service_schedule_ero_cta`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, this is Eleven RO. Our records show your RO service visit can be scheduled. Please reply BOOK on this chat to confirm a convenient time, or use Call / Book below for assistance.
```

**Buttons:** **Call us** → `+919880693311` · **Text us** → https://wa.me/919880693311 · **Book online** → https://elevenro.com/book

---

#### `missed_call_callback_ero_cta`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, this is Eleven RO. We tried to reach you and could not connect. Please reply on this chat so we can assist with your RO service, or use Call / Book below.
```

**Buttons:** **Call us** → `+919880693311` · **Text us** → https://wa.me/919880693311 · **Book online** → https://elevenro.com/book

---

#### `reschedule_visit_ero_cta`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, your Eleven RO visit is set for Mon 12 Aug, 10:00 AM. To reschedule, reply on this chat or use Call / Book online below.
```

**Buttons:** **Call us** → `+919880693311` · **Text us** → https://wa.me/919880693311 · **Book online** → https://elevenro.com/book

---

#### `unregistered_number_service_ero_cta`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi there, this is Eleven RO. This WhatsApp number is not linked to a service account in our system. Reply BOOK on this chat with your name and service address to register your request, or use Call / Book below for assistance.
```

**Buttons:** **Call us** → `+919880693311` · **Text us** → https://wa.me/919880693311 · **Book online** → https://elevenro.com/book

---

### Cold PDF v2

#### `svc_doc_amc_ero_v2`

Meta status: _not on WABA yet_

📎 **PDF attached** (document header — bill / invoice / AMC / etc.)

**Message**

```
Hi Rahul,
Your AMC agreement is attached.

Thank you for choosing Eleven RO.
Call:
9880693311
Email:
mail@elevenro.com
Website:
elevenro.com
Text us:
https://wa.me/919880693311

Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+919880693311` · **Website** → https://elevenro.com

---

#### `svc_doc_bill_ero_v2`

Meta status: _not on WABA yet_

📎 **PDF attached** (document header — bill / invoice / AMC / etc.)

**Message**

```
Hi Rahul,
Your service bill is attached.

Thank you for choosing Eleven RO.
Call:
9880693311
Email:
mail@elevenro.com
Website:
elevenro.com
Text us:
https://wa.me/919880693311

Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+919880693311` · **Website** → https://elevenro.com

---

#### `svc_doc_generic_ero_v2`

Meta status: _not on WABA yet_

📎 **PDF attached** (document header — bill / invoice / AMC / etc.)

**Message**

```
Hi Rahul,
Your document is attached.

Thank you for choosing Eleven RO.
Call:
9880693311
Email:
mail@elevenro.com
Website:
elevenro.com
Text us:
https://wa.me/919880693311

Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+919880693311` · **Website** → https://elevenro.com

---

#### `svc_doc_invoice_ero_v2`

Meta status: _not on WABA yet_

📎 **PDF attached** (document header — bill / invoice / AMC / etc.)

**Message**

```
Hi Rahul,
Your tax invoice is attached.

Thank you for choosing Eleven RO.
Call:
9880693311
Email:
mail@elevenro.com
Website:
elevenro.com
Text us:
https://wa.me/919880693311

Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+919880693311` · **Website** → https://elevenro.com

---

#### `svc_doc_quotation_ero_v2`

Meta status: _not on WABA yet_

📎 **PDF attached** (document header — bill / invoice / AMC / etc.)

**Message**

```
Hi Rahul,
Your quotation is attached.

Thank you for choosing Eleven RO.
Call:
9880693311
Email:
mail@elevenro.com
Website:
elevenro.com
Text us:
https://wa.me/919880693311

Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+919880693311` · **Website** → https://elevenro.com

---

#### `svc_doc_receipt_ero_v2`

Meta status: _not on WABA yet_

📎 **PDF attached** (document header — bill / invoice / AMC / etc.)

**Message**

```
Hi Rahul,
Your payment receipt is attached.

Thank you for choosing Eleven RO.
Call:
9880693311
Email:
mail@elevenro.com
Website:
elevenro.com
Text us:
https://wa.me/919880693311

Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+919880693311` · **Website** → https://elevenro.com

---

#### `svc_doc_warranty_ero_v2`

Meta status: _not on WABA yet_

📎 **PDF attached** (document header — bill / invoice / AMC / etc.)

**Message**

```
Hi Rahul,
Your warranty card is attached.

Thank you for choosing Eleven RO.
Call:
9880693311
Email:
mail@elevenro.com
Website:
elevenro.com
Text us:
https://wa.me/919880693311

Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+919880693311` · **Website** → https://elevenro.com

---

### Core UTILITY

#### `svc_booking_confirmed_ero`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, your Eleven RO water purifier service booking RO2608121234 is confirmed for Tue 12 Aug, 2:00 PM. Reply on this chat if you need to change the date or time.
```

**Buttons:** **Call us** → `+919880693311`

---

#### `svc_visit_cancelled_ero`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, your Eleven RO water purifier service visit scheduled for Tue 12 Aug, 10:00 AM has been cancelled. Reply on this chat if you would like to rebook.
```

**Buttons:** **Call us** → `+919880693311`

---

### Existing customer book

#### `existing_service_schedule_ero_cta_v2`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is Eleven RO. Your RO service visit is due. Reply BOOK on this chat to pick date and time — we already have your details on file. Or tap Book online below.
```

**Buttons:** **Book online** → https://elevenro.com/book

---

### Job done v2

#### `svc_job_done_ero_v2`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Poorna Shetty, Your Water Purifier Service is completed. Amount of INR 1500 has been collected. Thank you for choosing us. Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+919880693311`

---

### Job done v3

#### `svc_job_done_ero_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Poorna Shetty, Your Water Purifier Service is completed. Amount of INR 1500 has been collected. Thank you for choosing Eleven RO. Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+919880693311` · **Website** → https://elevenro.com · **Review** → https://www.google.com/maps/search/?api=1&query=Eleven+RO+Anjanapura+Bengaluru

---

### Letter format v3

#### `svc_balance_due_letter_ero_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul,
This is an update from Eleven RO regarding your pending payment for water purifier service.

Amount pending: INR 500
Due date: 15 Aug 2026
Invoice / Job: RO2608121234

Thank you for choosing Eleven RO.
Call:
9880693311
Email:
mail@elevenro.com
Website:
elevenro.com
Text us:
https://wa.me/919880693311

Tap Pay now below or reply on this chat if you have already paid.
```

**Buttons:** **Call us** → `+919880693311` · **Website** → https://elevenro.com

---

#### `svc_booking_cancelled_letter_ero_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul,
This is an update from Eleven RO regarding your water purifier service booking.

Your booking for Tue 12 Aug, 2:00 PM has been cancelled.

Thank you for choosing Eleven RO.
Call:
9880693311
Email:
mail@elevenro.com
Website:
elevenro.com
Text us:
https://wa.me/919880693311

Reply BOOK on this chat to reschedule.
```

**Buttons:** **Call us** → `+919880693311` · **Website** → https://elevenro.com

---

#### `svc_booking_confirmed_letter_ero_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul,
This is an update from Eleven RO regarding your service booking.

Booking: RO2608121234
Confirmed for: Tue 12 Aug, 2:00 PM

Thank you for choosing Eleven RO.
Call:
9880693311
Email:
mail@elevenro.com
Website:
elevenro.com
Text us:
https://wa.me/919880693311

Reply on this chat if you need to change the date or time.
```

**Buttons:** **Call us** → `+919880693311` · **Website** → https://elevenro.com

---

#### `svc_job_done_letter_ero_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul,
This is an update from Eleven RO regarding your completed water purifier service.

Amount collected: INR 1500
Invoice / Job: RO2608121234

Thank you for choosing Eleven RO.
Call:
9880693311
Email:
mail@elevenro.com
Website:
elevenro.com
Text us:
https://wa.me/919880693311

Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+919880693311` · **Website** → https://elevenro.com

---

#### `svc_service_due_letter_ero_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul,
This is an update from Eleven RO regarding your scheduled water purifier service.

Service due around: your upcoming service visit

Thank you for choosing Eleven RO.
Call:
9880693311
Email:
mail@elevenro.com
Website:
elevenro.com
Text us:
https://wa.me/919880693311

Reply BOOK on this chat to pick date and time — we already have your details on file.
```

**Buttons:** **Call us** → `+919880693311` · **Website** → https://elevenro.com

---

### Service due book CTA

#### `svc_service_due_ero_cta_v2`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, your water purifier service is due around Tue 12 Aug 2026. Reply BOOK on this chat to pick date and time — we already have your details on file. Or tap Book online below.
```

**Buttons:** **Book online** → https://elevenro.com/book

---

### Service due CTA

#### `svc_service_due_ero_cta`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, your water purifier service is due around Tue 12 Aug 2026. Reply BOOK on this chat to schedule a visit — we will ask for your preferred date and time. Or use Call / Website / Book below.
```

**Buttons:** **Call us** → `+919880693311` · **Text us** → https://wa.me/919880693311 · **Book online** → https://elevenro.com/book

---

### WFS ask location

#### `svc_wfs_ask_loc_ero`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is Eleven RO Water Filter Service. Please share your Google Maps location pin on this chat so we can continue your water filter service request.
```

**Buttons:** **Call us** → `+919880693311` · **Website** → https://elevenro.com

---

### WFS ask location (short)

#### `svc_wfs_ask_loc_simple_ero`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, please share your Google Maps location pin on this chat. — Eleven RO Water Filter Service
```

**Buttons:** **Call us** → `+919880693311` · **Website** → https://elevenro.com

---

### WFS collect info

#### `svc_wfs_collect_ero`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is Eleven RO Water Filter Service. For serving you better we need certain information from you — such as your location and a photo of your purifier. Please share your location here on this chat; we will guide you step by step.
```

**Buttons:** _No buttons_

---

### WFS greeting v3

#### `svc_wfs_hi_from_ero_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is a message about your Eleven RO water purifier service account. Please reply on this chat.
```

**Buttons:** _No buttons_

---

#### `svc_wfs_just_hi_ero_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is an update regarding your Eleven RO water purifier service account. Please reply on this chat.
```

**Buttons:** _No buttons_

---

### WFS hello

#### `svc_wfs_hello_ero_v2`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is a message about your Eleven RO water purifier service account. Please reply on this chat if you need assistance.
```

**Buttons:** _No buttons_

---

### WFS hi from (legacy)

#### `svc_wfs_hi_from_ero_v2`

Meta status: _not on WABA yet_

**Message**

```
Hi Rahul, this is a message from Eleven RO Water Filter Service.
```

**Buttons:** _No buttons_

---

### WFS just hi (legacy)

#### `svc_wfs_just_hi_ero`

Meta status: _not on WABA yet_

**Message**

```
Hi Rahul. Please reply on this chat.
```

**Buttons:** _No buttons_

---

### WFS simple hi

#### `svc_wfs_hi_ero_v2`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is a message about your Eleven RO water purifier service account. Please reply on this chat.
```

**Buttons:** _No buttons_

---

## Hydrogen RO

### Balance due letter v4 (Pay now)

#### `svc_balance_due_letter_hro_v4`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul,
This is an update from Hydrogen RO regarding your pending payment for water purifier service.

Amount pending: INR 500
Due date: 15 Aug 2026
Invoice / Job: RO2608121234

Thank you for choosing Hydrogen RO.
Call:
8884944288
Email:
mail@hydrogenro.com
Website:
hydrogenro.com
Text us:
https://wa.me/918884944288

Tap Pay now below or reply on this chat if you have already paid.
```

**Buttons:** **Call us** → `+918884944288` · **Pay now** → https://hydrogenro.com/p/pay123456

---

### Booking confirm / cancel v2

#### `svc_booking_cancelled_hro_v2`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, your Hydrogen RO water purifier service booking for Tue 12 Aug, 2:00 PM has been cancelled. Reply BOOK on this chat to reschedule, or use Call / Text us / Book below.
```

**Buttons:** **Call us** → `+918884944288` · **Text us** → https://wa.me/918884944288 · **Book online** → https://hydrogenro.com/book

---

#### `svc_booking_confirmed_hro_v2`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, your Hydrogen RO water purifier service booking RO2608121234 is confirmed for Tue 12 Aug, 2:00 PM. Reply on this chat if you need to change the date or time.
```

**Buttons:** **Call us** → `+918884944288` · **Website** → https://hydrogenro.com · **Text us** → https://wa.me/918884944288

---

### Booking CTA

#### `existing_service_schedule_hro_cta`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, this is Hydrogen RO. Our records show your RO service visit can be scheduled. Please reply BOOK on this chat to confirm a convenient time, or use Call / Book below for assistance.
```

**Buttons:** **Call us** → `+918884944288` · **Text us** → https://wa.me/918884944288 · **Book online** → https://hydrogenro.com/book

---

#### `missed_call_callback_hro_cta`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, this is Hydrogen RO. We tried to reach you and could not connect. Please reply on this chat so we can assist with your RO service, or use Call / Book below.
```

**Buttons:** **Call us** → `+918884944288` · **Text us** → https://wa.me/918884944288 · **Book online** → https://hydrogenro.com/book

---

#### `reschedule_visit_hro_cta`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, your Hydrogen RO visit is set for Mon 12 Aug, 10:00 AM. To reschedule, reply on this chat or use Call / Book online below.
```

**Buttons:** **Call us** → `+918884944288` · **Text us** → https://wa.me/918884944288 · **Book online** → https://hydrogenro.com/book

---

#### `unregistered_number_service_hro_cta`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi there, this is Hydrogen RO. This WhatsApp number is not linked to a service account in our system. Reply BOOK on this chat with your name and service address to register your request, or use Call / Book below for assistance.
```

**Buttons:** **Call us** → `+918884944288` · **Text us** → https://wa.me/918884944288 · **Book online** → https://hydrogenro.com/book

---

### Cold PDF v2

#### `svc_doc_amc_hro_v2`

Meta status: _not on WABA yet_

📎 **PDF attached** (document header — bill / invoice / AMC / etc.)

**Message**

```
Hi Rahul,
Your AMC agreement is attached.

Thank you for choosing Hydrogen RO.
Call:
8884944288
Email:
mail@hydrogenro.com
Website:
hydrogenro.com
Text us:
https://wa.me/918884944288

Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+918884944288` · **Website** → https://hydrogenro.com

---

#### `svc_doc_bill_hro_v2`

Meta status: _not on WABA yet_

📎 **PDF attached** (document header — bill / invoice / AMC / etc.)

**Message**

```
Hi Rahul,
Your service bill is attached.

Thank you for choosing Hydrogen RO.
Call:
8884944288
Email:
mail@hydrogenro.com
Website:
hydrogenro.com
Text us:
https://wa.me/918884944288

Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+918884944288` · **Website** → https://hydrogenro.com

---

#### `svc_doc_generic_hro_v2`

Meta status: _not on WABA yet_

📎 **PDF attached** (document header — bill / invoice / AMC / etc.)

**Message**

```
Hi Rahul,
Your document is attached.

Thank you for choosing Hydrogen RO.
Call:
8884944288
Email:
mail@hydrogenro.com
Website:
hydrogenro.com
Text us:
https://wa.me/918884944288

Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+918884944288` · **Website** → https://hydrogenro.com

---

#### `svc_doc_invoice_hro_v2`

Meta status: _not on WABA yet_

📎 **PDF attached** (document header — bill / invoice / AMC / etc.)

**Message**

```
Hi Rahul,
Your tax invoice is attached.

Thank you for choosing Hydrogen RO.
Call:
8884944288
Email:
mail@hydrogenro.com
Website:
hydrogenro.com
Text us:
https://wa.me/918884944288

Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+918884944288` · **Website** → https://hydrogenro.com

---

#### `svc_doc_quotation_hro_v2`

Meta status: _not on WABA yet_

📎 **PDF attached** (document header — bill / invoice / AMC / etc.)

**Message**

```
Hi Rahul,
Your quotation is attached.

Thank you for choosing Hydrogen RO.
Call:
8884944288
Email:
mail@hydrogenro.com
Website:
hydrogenro.com
Text us:
https://wa.me/918884944288

Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+918884944288` · **Website** → https://hydrogenro.com

---

#### `svc_doc_receipt_hro_v2`

Meta status: _not on WABA yet_

📎 **PDF attached** (document header — bill / invoice / AMC / etc.)

**Message**

```
Hi Rahul,
Your payment receipt is attached.

Thank you for choosing Hydrogen RO.
Call:
8884944288
Email:
mail@hydrogenro.com
Website:
hydrogenro.com
Text us:
https://wa.me/918884944288

Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+918884944288` · **Website** → https://hydrogenro.com

---

#### `svc_doc_warranty_hro_v2`

Meta status: _not on WABA yet_

📎 **PDF attached** (document header — bill / invoice / AMC / etc.)

**Message**

```
Hi Rahul,
Your warranty card is attached.

Thank you for choosing Hydrogen RO.
Call:
8884944288
Email:
mail@hydrogenro.com
Website:
hydrogenro.com
Text us:
https://wa.me/918884944288

Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+918884944288` · **Website** → https://hydrogenro.com

---

### Core UTILITY

#### `svc_booking_confirmed_hro`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, your Hydrogen RO water purifier service booking RO2608121234 is confirmed for Tue 12 Aug, 2:00 PM. Reply on this chat if you need to change the date or time.
```

**Buttons:** **Call us** → `+919880693311`

---

#### `svc_visit_cancelled_hro`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, your Hydrogen RO water purifier service visit scheduled for Tue 12 Aug, 10:00 AM has been cancelled. Reply on this chat if you would like to rebook.
```

**Buttons:** **Call us** → `+919880693311`

---

### Existing customer book

#### `existing_service_schedule_hro_cta_v2`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is Hydrogen RO. Your RO service visit is due. Reply BOOK on this chat to pick date and time — we already have your details on file. Or tap Book online below.
```

**Buttons:** **Book online** → https://hydrogenro.com/book

---

### Job done v2

#### `svc_job_done_hro_v2`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Poorna Shetty, Your Water Purifier Service is completed. Amount of INR 1500 has been collected. Thank you for choosing us. Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+918884944288`

---

### Job done v3

#### `svc_job_done_hro_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Poorna Shetty, Your Water Purifier Service is completed. Amount of INR 1500 has been collected. Thank you for choosing Hydrogen RO. Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+918884944288` · **Website** → https://hydrogenro.com · **Review** → https://www.google.com/maps/search/?api=1&query=Hydrogen+RO+Seshadripuram+Bengaluru

---

### Letter format v3

#### `svc_balance_due_letter_hro_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul,
This is an update from Hydrogen RO regarding your pending payment for water purifier service.

Amount pending: INR 500
Due date: 15 Aug 2026
Invoice / Job: RO2608121234

Thank you for choosing Hydrogen RO.
Call:
8884944288
Email:
mail@hydrogenro.com
Website:
hydrogenro.com
Text us:
https://wa.me/918884944288

Tap Pay now below or reply on this chat if you have already paid.
```

**Buttons:** **Call us** → `+918884944288` · **Website** → https://hydrogenro.com

---

#### `svc_booking_cancelled_letter_hro_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul,
This is an update from Hydrogen RO regarding your water purifier service booking.

Your booking for Tue 12 Aug, 2:00 PM has been cancelled.

Thank you for choosing Hydrogen RO.
Call:
8884944288
Email:
mail@hydrogenro.com
Website:
hydrogenro.com
Text us:
https://wa.me/918884944288

Reply BOOK on this chat to reschedule.
```

**Buttons:** **Call us** → `+918884944288` · **Website** → https://hydrogenro.com

---

#### `svc_booking_confirmed_letter_hro_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul,
This is an update from Hydrogen RO regarding your service booking.

Booking: RO2608121234
Confirmed for: Tue 12 Aug, 2:00 PM

Thank you for choosing Hydrogen RO.
Call:
8884944288
Email:
mail@hydrogenro.com
Website:
hydrogenro.com
Text us:
https://wa.me/918884944288

Reply on this chat if you need to change the date or time.
```

**Buttons:** **Call us** → `+918884944288` · **Website** → https://hydrogenro.com

---

#### `svc_job_done_letter_hro_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul,
This is an update from Hydrogen RO regarding your completed water purifier service.

Amount collected: INR 1500
Invoice / Job: RO2608121234

Thank you for choosing Hydrogen RO.
Call:
8884944288
Email:
mail@hydrogenro.com
Website:
hydrogenro.com
Text us:
https://wa.me/918884944288

Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+918884944288` · **Website** → https://hydrogenro.com

---

#### `svc_service_due_letter_hro_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul,
This is an update from Hydrogen RO regarding your scheduled water purifier service.

Service due around: your upcoming service visit

Thank you for choosing Hydrogen RO.
Call:
8884944288
Email:
mail@hydrogenro.com
Website:
hydrogenro.com
Text us:
https://wa.me/918884944288

Reply BOOK on this chat to pick date and time — we already have your details on file.
```

**Buttons:** **Call us** → `+918884944288` · **Website** → https://hydrogenro.com

---

### Service due book CTA

#### `svc_service_due_hro_cta_v2`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, your water purifier service is due around Tue 12 Aug 2026. Reply BOOK on this chat to pick date and time — we already have your details on file. Or tap Book online below.
```

**Buttons:** **Book online** → https://hydrogenro.com/book

---

### Service due CTA

#### `svc_service_due_hro_cta`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, your water purifier service is due around Tue 12 Aug 2026. Reply BOOK on this chat to schedule a visit — we will ask for your preferred date and time. Or use Call / Website / Book below.
```

**Buttons:** **Call us** → `+918884944288` · **Text us** → https://wa.me/918884944288 · **Book online** → https://hydrogenro.com/book

---

### WFS ask location

#### `svc_wfs_ask_loc_hro`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is Hydrogen RO Water Filter Service. Please share your Google Maps location pin on this chat so we can continue your water filter service request.
```

**Buttons:** **Call us** → `+919880693311` · **Website** → https://hydrogenro.com

---

### WFS ask location (short)

#### `svc_wfs_ask_loc_simple_hro`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, please share your Google Maps location pin on this chat. — Hydrogen RO Water Filter Service
```

**Buttons:** **Call us** → `+919880693311` · **Website** → https://hydrogenro.com

---

### WFS collect info

#### `svc_wfs_collect_hro`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is Hydrogen RO Water Filter Service. For serving you better we need certain information from you — such as your location and a photo of your purifier. Please share your location here on this chat; we will guide you step by step.
```

**Buttons:** _No buttons_

---

### WFS greeting v3

#### `svc_wfs_hi_from_hro_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is a message about your Hydrogen RO water purifier service account. Please reply on this chat.
```

**Buttons:** _No buttons_

---

#### `svc_wfs_just_hi_hro_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is an update regarding your Hydrogen RO water purifier service account. Please reply on this chat.
```

**Buttons:** _No buttons_

---

### WFS hello

#### `svc_wfs_hello_hro_v2`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is a message about your Hydrogen RO water purifier service account. Please reply on this chat if you need assistance.
```

**Buttons:** _No buttons_

---

### WFS hi from (legacy)

#### `svc_wfs_hi_from_hro`

Meta status: _not on WABA yet_

**Message**

```
Hi Rahul, hi from Hydrogen RO Water Filter Service.
```

**Buttons:** _No buttons_

---

### WFS just hi (legacy)

#### `svc_wfs_just_hi_hro`

Meta status: _not on WABA yet_

**Message**

```
Hi Rahul. Please reply on this chat.
```

**Buttons:** _No buttons_

---

### WFS simple hi

#### `svc_wfs_hi_hro_v2`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is a message about your Hydrogen RO water purifier service account. Please reply on this chat.
```

**Buttons:** _No buttons_

---

## Shared

### Core UTILITY

#### `svc_amc_expiry_notice`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, your AMC for your water purifier is due to end on 31 Dec 2026. Reply on this chat to renew or schedule a visit.
```

**Buttons:** **Call us** → `+919880693311`

---

#### `svc_ask_flat`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is Eleven RO Water Filter Service. Please reply with your building / flat / house number on this chat, or reply Skip if you do not have one.
```

**Buttons:** _No buttons_

---

#### `svc_ask_location`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is Eleven RO Water Filter Service. Please share your Google Maps location pin on this chat so we can continue your water filter service request.
```

**Buttons:** _No buttons_

---

#### `svc_ask_photo`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is Eleven RO Water Filter Service. Please send a clear photo of your water purifier on this chat so we can continue your water filter service request.
```

**Buttons:** _No buttons_

---

#### `svc_balance_due`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, a balance of INR 800 is pending for your recent service. Reply on this chat to confirm payment details.
```

**Buttons:** **Call us** → `+919880693311`

---

#### `svc_doc_pdf_v2`

Meta status: `APPROVED` UTILITY

📎 **PDF attached** (document header — bill / invoice / AMC / etc.)

**Message**

```
Hi Rahul, your service bill is attached. Reply on this chat if you need any help.
```

**Buttons:** **Call us** → `+919880693311`

---

#### `svc_hello`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, hello — this is regarding your water purifier service account. Please reply on this chat if you need any assistance.
```

**Buttons:** _No buttons_

---

#### `svc_job_done`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, your water purifier service has been completed. Amount collected: INR 1500. Reply on this chat if you need support.
```

**Buttons:** **Call us** → `+919880693311`

---

#### `svc_missed_call`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, we tried to reach you and could not connect. Please reply on this chat so we can assist with your water purifier service.
```

**Buttons:** _No buttons_

---

#### `svc_parts_ready`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, the spare parts required for your water purifier service have arrived. Reply on this chat and we will schedule the technician visit.
```

**Buttons:** **Call us** → `+919880693311`

---

#### `svc_payment_received`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, we have received payment of INR 1500 for your service. Reply on this chat for any questions.
```

**Buttons:** **Call us** → `+919880693311`

---

#### `svc_service_request`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, regarding your water purifier service account: reply on this chat to continue your service request or schedule a technician visit.
```

**Buttons:** **Call us** → `+919880693311`

---

#### `svc_smoke_update`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, this is an update about your water purifier service request. Please reply on this chat if you need help.
```

**Buttons:** _No buttons_

---

#### `svc_tech_assigned`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, technician Suresh has been assigned for your service visit. Reply on this chat for assistance.
```

**Buttons:** **Call us** → `+919880693311`

---

#### `svc_tech_delayed`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, our technician is slightly delayed for Tue 12 Aug, 10:00 AM. Sorry for the inconvenience — we will update you on this chat shortly.
```

**Buttons:** **Call us** → `+919880693311`

---

#### `svc_visit_confirmed`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, your water purifier service booking RO2608121234 is confirmed for Tue 12 Aug, 2:00 PM. Reply on this chat if you need to change it.
```

**Buttons:** **Call us** → `+919880693311`

---

#### `svc_visit_reminder`

Meta status: `APPROVED` UTILITY

**Message**

```
Hi Rahul, reminder: your water purifier service visit is scheduled for Tue 12 Aug, 10:00 AM. Reply on this chat to confirm or reschedule.
```

**Buttons:** **Call us** → `+919880693311`

---

### WFS ask location

#### `svc_wfs_ask_loc`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is Water Filter Service. Please share your Google Maps location pin on this chat so we can continue your water filter service request.
```

**Buttons:** **Call us** → `+919880693311`

---

### WFS ask location (short)

#### `svc_wfs_ask_loc_simple`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, please share your Google Maps location pin on this chat. — Water Filter Service
```

**Buttons:** **Call us** → `+919880693311`

---

### WFS collect info

#### `svc_wfs_collect`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is Water Filter Service. For serving you better we need certain information from you — such as your location and a photo of your purifier. Please share your location here on this chat; we will guide you step by step.
```

**Buttons:** _No buttons_

---

### WFS greeting v3

#### `svc_wfs_hello_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is a message about your water purifier service account. Please reply on this chat if you need assistance.
```

**Buttons:** _No buttons_

---

#### `svc_wfs_hi_from_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is a message about your water purifier service account. Please reply on this chat.
```

**Buttons:** _No buttons_

---

#### `svc_wfs_hi_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is a message about your water purifier service account. Please reply on this chat.
```

**Buttons:** _No buttons_

---

#### `svc_wfs_just_hi_v3`

Meta status: `PENDING` UTILITY

**Message**

```
Hi Rahul, this is an update regarding your water purifier service account. Please reply on this chat.
```

**Buttons:** _No buttons_

---

### WFS hello

#### `svc_wfs_hello`

Meta status: _not on WABA yet_

**Message**

```
Hi Rahul, this is Water Filter Service. Please reply on this chat if you need help with your water purifier.
```

**Buttons:** _No buttons_

---

### WFS hi from (legacy)

#### `svc_wfs_hi_from`

Meta status: _not on WABA yet_

**Message**

```
Hi Rahul, hi from Water Filter Service.
```

**Buttons:** _No buttons_

---

### WFS just hi (legacy)

#### `svc_wfs_just_hi`

Meta status: _not on WABA yet_

**Message**

```
Hi Rahul. Please reply on this chat.
```

**Buttons:** _No buttons_

---

### WFS simple hi

#### `svc_wfs_hi`

Meta status: _not on WABA yet_

**Message**

```
Hi Rahul, hi from Water Filter Service. Please reply on this chat.
```

**Buttons:** _No buttons_

---
