import asyncio
from main import zoom_get_token, zoom_create_meeting

async def test():
    try:
        print("Getting token...")
        token = await zoom_get_token()
        print("Token retrieved!")
        print("Creating meeting...")
        zoom_data = await zoom_create_meeting(
            topic="Test class",
            start_time="2026-06-03T09:00:00",
            duration_mins=60
        )
        print("Meeting created:", zoom_data)
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
