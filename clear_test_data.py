"""Quick script to clear test data from ap_exposures table"""

import os
os.environ['DATABASE_URL'] = 'postgresql://birk_user:XbCWbLZ70FhdgPrho9J3rlNO1AVhohvN@dpg-d4sl43qli9vc73eiem90-a.frankfurt-postgres.render.com/birk_db'

from database import engine
from sqlalchemy import text

# Delete old test data
with engine.connect() as conn:
    result = conn.execute(
        text("DELETE FROM ap_exposures WHERE tenant_id = '00000000-0000-0000-0000-000000000001'")
    )
    conn.commit()
    print(f"✅ Deleted {result.rowcount} old test records")
    print("✅ Ready to upload again!")