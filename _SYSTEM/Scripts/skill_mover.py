#!/usr/bin/env python3
import os
import zipfile
import shutil
import glob

# Paths
YURI_ROOT = "/Users/marcelspatz/YURI"
GEMINI_SKILLS_DIR = "/Users/marcelspatz/.gemini/skills"

def unpack_and_register_skills():
    print(f"Scanning for skills in {YURI_ROOT}...")
    skill_files = glob.glob(os.path.join(YURI_ROOT, "*.skill"))
    
    if not skill_files:
        print("No .skill files found in YURI root.")
        return

    for skill_path in skill_files:
        skill_name = os.path.splitext(os.path.basename(skill_path))[0]
        target_dir = os.path.join(GEMINI_SKILLS_DIR, skill_name)
        
        print(f"Processing {skill_name}...")
        
        try:
            if not os.path.exists(target_dir):
                os.makedirs(target_dir)
            
            with zipfile.ZipFile(skill_path, 'r') as zip_ref:
                zip_ref.extractall(target_dir)
                
            print(f"  Unpacked to {target_dir}")
            
            # Verify SKILL.md
            skill_md = os.path.join(target_dir, "SKILL.md")
            if os.path.exists(skill_md):
                print(f"  Successfully registered: {skill_name}")
            else:
                print(f"  WARNING: SKILL.md not found in {skill_name}")
                
        except Exception as e:
            print(f"  FAILED to unpack {skill_name}: {str(e)}")

if __name__ == "__main__":
    unpack_and_register_skills()
    print("\nSkill migration complete. Run 'gemini skills list' to verify.")
