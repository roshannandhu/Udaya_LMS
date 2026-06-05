import asyncio
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env')

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
service_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async def check_db():
    try:
        # Check if table exists by trying to select from it
        resp = service_supabase.table('live_classes').select('id').limit(1).execute()
        print("Success, table exists. Result:", resp.data)
    except Exception as e:
        print("Error checking table:", e)

if __name__ == "__main__":
    asyncio.run(check_db())
