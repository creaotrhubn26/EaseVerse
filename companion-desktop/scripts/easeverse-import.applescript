-- EaseVerse → Pro Tools markers importer (macOS)
--
-- Usage:  osascript easeverse-import.applescript "/path/to/easeverse-markers.txt"
--
-- Walks Pro Tools' File → Import → Session Data dialog and ticks
-- "Memory Locations / Markers" via macOS UI scripting. No Pro Tools
-- Developer / SDK / plugin required.
--
-- IMPORTANT: This script needs Accessibility permission. The first run
-- will prompt; grant it under System Settings → Privacy & Security →
-- Accessibility → add the calling app (Terminal / Tauri Companion).
--
-- Tested against Pro Tools 12.x on macOS 13+.

on run argv
    if (count of argv) < 1 then
        display dialog "Markers file path missing." & return & ¬
            "Usage: osascript easeverse-import.applescript \"/path/to/easeverse-markers.txt\"" buttons {"OK"} default button 1
        return
    end if
    set markerPath to item 1 of argv

    -- Confirm file exists
    set posixFile to POSIX file markerPath as alias
    if posixFile is missing value then
        display dialog "Markers file not found:" & return & markerPath buttons {"OK"} default button 1
        return
    end if

    -- Bring Pro Tools to front
    try
        tell application "Pro Tools" to activate
    on error
        display dialog "Pro Tools is not running. Open the session first." buttons {"OK"} default button 1
        return
    end try
    delay 0.6

    tell application "System Events"
        tell process "Pro Tools"
            -- File → Import → Session Data…
            click menu item "Session Data…" of menu "Import" of menu item "Import" of menu "File" of menu bar 1
            delay 0.9

            -- Use Go-To-Folder so we can paste a full POSIX path
            keystroke "g" using {command down, shift down}
            delay 0.4
            keystroke markerPath
            delay 0.3
            keystroke return
            delay 0.6
            keystroke return -- confirm file selection

            -- Wait for Import Session Data dialog, then enable
            -- Memory Locations / Markers checkbox if present.
            delay 1.2
            try
                tell window 1
                    click checkbox "Memory Locations / Markers" of group 1
                end tell
            on error
                -- Older Pro Tools versions name this differently. Producer
                -- can tick it manually if it doesn't auto-enable.
            end try
            delay 0.3
            keystroke return -- OK
        end tell
    end tell
end run
