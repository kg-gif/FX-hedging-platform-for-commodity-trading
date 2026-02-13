"""Check what's actually in the ap_exposures table"""

import os
os.environ['DATABASE_URL'] = 'postgresql://birk_user:XbCWbLZ70FhdgPrho9J3rlNO1AVhohvN@dpg-d4sl43qli9vc73eiem90-a.frankfurt-postgres.render.com/birk_db'

from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    # Check total records
    result = conn.execute(text("SELECT COUNT(*) FROM ap_exposures"))
    total = result.fetchone()[0]
    print(f"📊 Total records in ap_exposures: {total}")
    
    # Check what tenant_ids exist
    result = conn.execute(text("SELECT DISTINCT tenant_id, COUNT(*) FROM ap_exposures GROUP BY tenant_id"))
    print("\n🏢 Records by tenant_id:")
    for row in result:
        print(f"   - Tenant {row[0]}: {row[1]} records")
    
    # Check a sample record
    result = conn.execute(text("SELECT tenant_id, invoice_number, supplier FROM ap_exposures LIMIT 3"))
    print("\n📋 Sample records:")
    for row in result:
        print(f"   - Tenant: {row[0]}, Invoice: {row[1]}, Supplier: {row[2]}")