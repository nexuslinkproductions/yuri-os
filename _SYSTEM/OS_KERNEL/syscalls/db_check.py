import sqlite3
import os
import json

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'memory.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn

def test_connectivity():
    try:
        conn = init_db()
        cursor = conn.cursor()
        cursor.execute("SELECT agent_id, status FROM agents")
        agents = cursor.fetchall()
        print(f"✅ Connection successful. Agents found: {len(agents)}")
        for agent in agents:
            print(f"  - {agent[0]}: {agent[1]}")
        conn.close()
    except Exception as e:
        print(f"❌ Connection failed: {e}")

if __name__ == "__main__":
    test_connectivity()
