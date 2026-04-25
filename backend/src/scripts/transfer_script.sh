#!/bin/bash

# ⬡ OPERATION_RUBEDO :: CORE_TRANSFERENCE
# This script migrates the NUDIMMUD infrastructure from SSD to Local Mac.
# EXCLUDES: Images, Videos, Archives, and Heavy Binary Clutter.

SOURCE="/Volumes/T7/NUDIMMUD/"
TARGET="/Users/marcelspatz/NUDIMMUD"

echo "⬡ RUBEDO :: STARTING_TRANSFERENCE..."
echo "⬡ SOURCE: $SOURCE"
echo "⬡ TARGET: $TARGET"

# Check if target exists
mkdir -p "$TARGET"

# Rsync with strict exclusions
rsync -avz \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.DS_Store' \
    --exclude 'BLACKMAIL' \
    --exclude '*.mp4' \
    --exclude '*.mov' \
    --exclude '*.avi' \
    --exclude '*.mkv' \
    --exclude '*.jpg' \
    --exclude '*.jpeg' \
    --exclude '*.png' \
    --exclude '*.gif' \
    --exclude '*.zip' \
    --exclude '*.dmg' \
    --exclude '*.pkg' \
    --exclude '*.iso' \
    --exclude 'backend/data/logs/*.log' \
    "$SOURCE" "$TARGET"

echo "⬡ RUBEDO :: TRANSFERENCE_COMPLETE"
echo "⬡ NEXT_STEP: Update .env with SYSTEM_ROOT=$TARGET"
