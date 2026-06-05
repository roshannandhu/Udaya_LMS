import asyncio
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env')

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
service_supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async def test_db_insert():
    # We will just fetch a random subject class to use its ID
    res = service_supabase.table('subject_classes').select('id, standard_id').limit(1).execute()
    if not res.data:
        print("No subject_classes found to test with.")
        return
    class_id = res.data[0]['id']
    print("Using class_id:", class_id)
    
    insert = {
        "class_id": class_id,
        "title": "Test Title",
        "scheduled_at": "2026-06-03T09:00:00",
        "duration_mins": 60,
        "zoom_meeting_id": "83337778654",
        "zoom_join_url": "https://zoom.us/j/123",
        "zoom_start_url": "https://zoom.us/s/123",
        "status": "scheduled",
        # omitting created_by for this DB test, or fetching a teacher
    }
    
    # fetch a user to use as created_by
    users = service_supabase.auth.admin.list_users()
    if not users:
        print("No users found.")
        return
    insert["created_by"] = users[0].id
    print("Using user_id:", users[0].id)
    
    try:
        result = service_supabase.table("live_classes").insert(insert).execute()
        print("Insert Result:", result.data)
    except Exception as e:
        print("DB Insert Failed:", e)

if __name__ == "__main__":
    asyncio.run(test_db_insert())
