import sys
import os
import json
from datetime import datetime

try:
    from dotenv import load_dotenv
    import videodb
    from videodb.exceptions import AuthenticationError
except ImportError as e:
    print(f"Error importing modules: {e}")
    print("Please ensure you have installed: pip3 install --user videodb python-dotenv")
    sys.exit(1)

# Ensure dotenv is loaded properly
load_dotenv("../../.env")
load_dotenv(".env")

def process_video(url):
    print(f"--- Starting VideoDB Processing for: {url} ---")
    try:
        conn = videodb.connect()
        coll = conn.get_collection()
    except AuthenticationError:
        print("ERROR: AuthenticationError. Check your VIDEO_DB_API_KEY in your .env file")
        sys.exit(1)
    except Exception as e:
         print(f"ERROR: Could not connect to VideoDB: {e}")
         sys.exit(1)

    print("Uploading to VideoDB...")
    try:
        video = coll.upload(url=url)
        print(f"Upload successful. Video ID: {video.id}")
    except Exception as e:
        print(f"Upload failed: {e}")
        sys.exit(1)

    print("Extracting Spoken Words Index (Transcript)...")
    try:
        video.index_spoken_words(force=True)
        text = video.get_transcript_text()
        print("Transcript extracted successfully.")
    except Exception as e:
        print(f"Failed to extract transcript: {e}")
        text = "No transcript could be generated."

    # Save the output into a canonical file
    save_dir = os.path.join(os.path.dirname(__file__), "data", "processed_videos")
    os.makedirs(save_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filepath = os.path.join(save_dir, f"video_{video.id}_{timestamp}.md")
    
    with open(filepath, "w") as f:
        f.write(f"# VideoDB Extraction\n\n")
        f.write(f"**Source URL:** {url}\n")
        f.write(f"**VideoDB ID:** {video.id}\n")
        f.write(f"**Stream Link:** https://console.videodb.io/player?url={video.stream_url}\n\n")
        f.write(f"## Raw Transcript\n\n{text}\n")
        
    print(f"--- SUCCESS: Video processed and saved to {filepath} ---")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 process_video.py <youtube_url>")
        sys.exit(1)
        
    video_url = sys.argv[1]
    process_video(video_url)
