# DNS Setup Guide for Email Security

## SPF Record Setup (Required for Email Deliverability)

Add this SPF record to your domain's DNS settings:

```
Type: TXT
Name: @ (or your domain)
Value: v=spf1 include:_spf.google.com include:mailgun.org ~all
TTL: 3600
```

## DKIM Record Setup (Recommended)

Add this DKIM record for better email authentication:

```
Type: TXT
Name: default._domainkey
Value: v=DKIM1; k=rsa; p=YOUR_DKIM_PUBLIC_KEY
TTL: 3600
```

## DMARC Record Setup (Advanced)

Add this DMARC record for email policy:

```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@hydrogenro.com
TTL: 3600
```

## How to Add DNS Records:

1. **Go to your domain registrar** (GoDaddy, Namecheap, etc.)
2. **Access DNS Management**
3. **Add the above records**
4. **Wait 24-48 hours for propagation**

## Benefits:
- ✅ Prevents email spoofing
- ✅ Improves email deliverability
- ✅ Reduces spam score
- ✅ Better email reputation
