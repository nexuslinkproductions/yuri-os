# Local Execution & T7 Protection

## Context

The project is currently in a state where the `/Volumes/T7` drive acts as a read-only synchronization source from another system (Claudio's). Modifying files on T7 can cause catastrophic synchronization errors on the source system.

## Rules

1. **Path Restriction**:
   - Primary development happens locally within `/Users/marcelspatz/NUDIMMUD/`.
   - Before performing any `write_to_file`, `replace_file_content`, or `run_command` that modifies `/Volumes/T7/`, verify it is a supervised "manual" sync-back operation.

2. **T7 to Local (Automatic Ingestion)**:
   - Data synchronized from T7 to the local system should be handled **carefully but automatically**.
   - You are authorized to automate the flow from T7 -> Local.

3. **Local to T7 (Manual/Supervised Sync-Back)**:
   - Moving data from Local -> T7 is a high-risk operation.
   - This must be executed **under explicit supervision and manually** to prevent corruption of the main sync system.
   - Always request confirmation before writing to T7.

4. **Terminal CWD**:
   - Ensure all commands are executed with `Cwd` set to `/Users/marcelspatz/NUDIMMUD/` or a subdirectory thereof unless performing a supervised sync operation.

## Verification

- If you find yourself in a session where the active document is on `/Volumes/T7/`, immediately shift focus to the equivalent file in `/Users/marcelspatz/NUDIMMUD/`.
