import asyncio
import storage as filestore
service_supabase = filestore.get_service_client()
async def test():
    try:
        service_supabase.storage.get_bucket("broadcasts")
        print("Bucket exists!")
    except Exception as e:
        print("Get bucket failed:", e)
        try:
            service_supabase.storage.create_bucket("broadcasts", options={"public": True})
            print("Bucket created!")
        except Exception as e2:
            print("Create bucket failed:", e2)
asyncio.run(test())
