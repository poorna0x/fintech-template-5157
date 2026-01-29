# Database Storage Analysis: Jobs + Parts Used

## Scenario
- **20 jobs per day**
- **10 parts (items) per job**
- **Total parts records:** 20 × 10 = 200 records/day

---

## Storage Calculation

### 1. Jobs Table Storage

#### Per Job Record Size:
- **id** (UUID): 16 bytes
- **job_number** (VARCHAR 50): ~15 bytes average
- **customer_id** (UUID): 16 bytes
- **service_type** (VARCHAR 20): ~5 bytes
- **service_sub_type** (VARCHAR 50): ~15 bytes
- **brand** (VARCHAR 100): ~20 bytes
- **model** (VARCHAR 100): ~20 bytes
- **assigned_technician_id** (UUID, nullable): ~16 bytes
- **assigned_date** (TIMESTAMP, nullable): ~8 bytes
- **assigned_by** (UUID, nullable): ~16 bytes
- **scheduled_date** (DATE): ~8 bytes
- **scheduled_time_slot** (VARCHAR 20): ~10 bytes
- **estimated_duration** (INTEGER): ~4 bytes
- **service_address** (JSONB): ~150 bytes (address object)
- **service_location** (JSONB): ~50 bytes (lat/lng)
- **status** (VARCHAR 20): ~10 bytes
- **priority** (VARCHAR 20): ~8 bytes
- **description** (TEXT): ~200 bytes average
- **requirements** (JSONB): ~300 bytes (lead_source, cost_range, etc.)
- **estimated_cost** (DECIMAL): ~8 bytes
- **actual_cost** (DECIMAL, nullable): ~8 bytes
- **start_time** (TIMESTAMP, nullable): ~8 bytes
- **end_time** (TIMESTAMP, nullable): ~8 bytes
- **actual_duration** (INTEGER, nullable): ~4 bytes
- **customer_feedback** (JSONB, nullable): ~100 bytes
- **payment_status** (VARCHAR 20): ~8 bytes
- **payment_method** (VARCHAR 20, nullable): ~8 bytes
- **payment_amount** (DECIMAL, nullable): ~8 bytes
- **before_photos** (JSONB): ~200 bytes (array of URLs)
- **after_photos** (JSONB): ~200 bytes (array of URLs)
- **invoice_url** (TEXT, nullable): ~50 bytes
- **warranty_url** (TEXT, nullable): ~50 bytes
- **created_at** (TIMESTAMP): ~8 bytes
- **updated_at** (TIMESTAMP): ~8 bytes
- **completed_at** (TIMESTAMP, nullable): ~8 bytes
- **images** (JSONB): ~100 bytes
- **follow_up_date** (DATE, nullable): ~8 bytes
- **follow_up_time** (VARCHAR 10, nullable): ~5 bytes
- **follow_up_notes** (TEXT, nullable): ~50 bytes
- **follow_up_scheduled_by** (UUID, nullable): ~16 bytes
- **follow_up_scheduled_at** (TIMESTAMP, nullable): ~8 bytes
- **denial_reason** (TEXT, nullable): ~50 bytes
- **denied_at** (TIMESTAMP, nullable): ~8 bytes
- **completion_notes** (TEXT, nullable): ~100 bytes
- **completed_by** (UUID, nullable): ~16 bytes
- **denied_by** (VARCHAR 255, nullable): ~20 bytes
- **lead_cost** (DECIMAL): ~8 bytes

**Total per job:** ~1,800 bytes = **~1.8 KB**

**PostgreSQL overhead:**
- Row header: ~24 bytes
- NULL bitmap: ~4 bytes
- Alignment padding: ~4 bytes
- **Total overhead:** ~32 bytes

**Actual storage per job:** ~1,832 bytes = **~1.8 KB**

---

### 2. job_parts_used Table Storage

#### Per Part Record Size:
- **id** (UUID): 16 bytes
- **job_id** (UUID): 16 bytes
- **technician_id** (UUID): 16 bytes
- **inventory_id** (UUID): 16 bytes
- **quantity_used** (INTEGER): ~4 bytes
- **created_at** (TIMESTAMP): ~8 bytes
- **created_by** (UUID, nullable): ~16 bytes

**Total per part:** ~92 bytes

**PostgreSQL overhead:**
- Row header: ~24 bytes
- NULL bitmap: ~2 bytes
- Alignment padding: ~2 bytes
- **Total overhead:** ~28 bytes

**Actual storage per part:** ~120 bytes = **~0.12 KB**

---

## Daily Storage Calculation

### Jobs:
- 20 jobs/day × 1.8 KB = **36 KB/day**

### Parts Used:
- 200 parts/day × 0.12 KB = **24 KB/day**

### Indexes (estimated 20% overhead):
- Jobs indexes: ~7 KB/day
- Parts indexes: ~5 KB/day
- **Total indexes:** ~12 KB/day

### **Total Daily Storage:**
- Jobs: 36 KB
- Parts: 24 KB
- Indexes: 12 KB
- **Total: 72 KB/day**

---

## Monthly Storage Calculation

### Base Data:
- 72 KB/day × 30 days = **2.16 MB/month**

### Additional Considerations:

#### 1. **Table Bloat (PostgreSQL)**
- Vacuum needed periodically
- Estimated 10-20% overhead
- **Additional:** ~0.4 MB/month

#### 2. **WAL (Write-Ahead Log)**
- Temporary until checkpoint
- ~2x write size
- **Additional:** ~1.3 MB/month (temporary)

#### 3. **Index Maintenance**
- B-tree indexes grow with data
- ~15% of table size
- **Additional:** ~0.3 MB/month

### **Total Monthly Storage:**
- Base data: 2.16 MB
- Bloat overhead: 0.4 MB
- Index growth: 0.3 MB
- **Total: ~2.86 MB/month**

---

## Annual Storage

- **Monthly:** 2.86 MB
- **Annual:** 2.86 MB × 12 = **~34.3 MB/year**

---

## Storage Breakdown by Table

| Table | Records/Day | Size/Record | Daily Storage | Monthly Storage |
|-------|------------|-------------|---------------|-----------------|
| **jobs** | 20 | 1.8 KB | 36 KB | 1.08 MB |
| **job_parts_used** | 200 | 0.12 KB | 24 KB | 0.72 MB |
| **Indexes** | - | - | 12 KB | 0.36 MB |
| **Overhead** | - | - | - | 0.7 MB |
| **TOTAL** | 220 | - | **72 KB** | **~2.86 MB** |

---

## Supabase Storage Limits

### Free Tier:
- **Database Storage:** 500 MB
- **Your Usage:** 2.86 MB/month
- **Percentage:** 0.57% of limit
- **Time to fill:** ~175 months (14+ years)

### Pro Tier ($25/month):
- **Database Storage:** 8 GB
- **Your Usage:** 2.86 MB/month
- **Percentage:** 0.036% of limit
- **Time to fill:** ~2,800 months (233+ years)

---

## Growth Projections

### Scenario 1: 2x Growth (40 jobs/day)
- **Monthly:** ~5.7 MB/month
- **Annual:** ~68.4 MB/year
- **Still well within free tier**

### Scenario 2: 5x Growth (100 jobs/day)
- **Monthly:** ~14.3 MB/month
- **Annual:** ~171.6 MB/year
- **Still well within free tier**

### Scenario 3: 10x Growth (200 jobs/day)
- **Monthly:** ~28.6 MB/month
- **Annual:** ~343.2 MB/year
- **Still well within free tier**

---

## Cost Analysis

### Supabase Free Tier:
- **Cost:** $0
- **Storage:** 500 MB included
- **Your usage:** 2.86 MB/month
- **Remaining:** 497.14 MB

### Supabase Pro Tier:
- **Cost:** $25/month
- **Storage:** 8 GB included
- **Your usage:** 2.86 MB/month
- **Remaining:** 7.997 GB

### Storage-Only Cost (if exceeded):
- **Supabase:** $0.125/GB/month
- **Your cost:** $0.00036/month (negligible)

---

## Optimization Opportunities

### 1. **Archive Old Data**
- Move jobs older than 1 year to archive table
- **Savings:** ~50% after first year

### 2. **Compress JSONB Fields**
- Use compression for large JSONB fields
- **Savings:** ~30-40% on JSONB data

### 3. **Partition Tables**
- Partition by date for faster queries
- **Savings:** Better performance, similar storage

### 4. **Clean Up Photos**
- Store photos in object storage (Supabase Storage)
- Store only URLs in database
- **Savings:** ~50% on photo-related fields

---

## Summary

### Current Usage (20 jobs/day, 10 parts/job):
- **Daily Storage:** 72 KB
- **Monthly Storage:** ~2.86 MB
- **Annual Storage:** ~34.3 MB

### Key Points:
✅ **Extremely efficient storage** - only 2.86 MB/month  
✅ **Well within free tier** - 0.57% of 500 MB limit  
✅ **14+ years** to fill free tier at current rate  
✅ **Scales to 10x** and still within free tier  
✅ **No storage cost concerns** for foreseeable future  

### Recommendations:
1. ✅ **No immediate action needed** - storage is minimal
2. ✅ **Monitor after 1 year** - consider archiving old data
3. ✅ **Consider photo optimization** - move to object storage if photos grow
4. ✅ **Regular vacuum** - keep tables optimized

---

*Last Updated: January 2026*
