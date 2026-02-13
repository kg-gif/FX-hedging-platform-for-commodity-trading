"""Delete ALL test data from ap_exposures table"""

import os
os.environ['DATABASE_URL'] = 'postgresql://birk_user:XbCWbLZ70FhdgPrho9J3rlNO1AVhohvN@dpg-d4sl43qli9vc73eiem90-a.frankfurt-postgres.render.com/birk_db'

from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    # Delete ALL records
    result = conn.execute(text("DELETE FROM ap_exposures"))
    conn.commit()
    print(f"✅ Deleted {result.rowcount} records")
    print("✅ ap_exposures table is now empty!")
    print("✅ Ready for fresh upload!")