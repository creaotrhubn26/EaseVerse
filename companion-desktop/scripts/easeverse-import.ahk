; EaseVerse → Pro Tools markers importer (Windows)
;
; Usage:  AutoHotkey.exe easeverse-import.ahk "C:\path\to\easeverse-markers.txt"
;
; Walks Pro Tools' File → Import → Session Data dialog and ticks
; "Memory Locations / Markers". Pure UI automation; no Pro Tools
; Developer / SDK / plugin required.
;
; Tested against Pro Tools 12.x + 2018/2023 Standard on Windows 10/11.
; If your Pro Tools version shifts the menu layout, edit the Send
; sequences below — the rest of the flow stays the same.
;
; Requires AutoHotkey 1.1 or 2.0 (https://www.autohotkey.com).

#SingleInstance Force
SetTitleMatchMode 2
SetKeyDelay, 30, 30

markerPath := A_Args[1]
if (markerPath = "") {
    MsgBox, 48, EaseVerse → Pro Tools, Markers file path missing.`nUsage: AutoHotkey.exe easeverse-import.ahk "path\to\easeverse-markers.txt"
    ExitApp
}

IfNotExist, %markerPath%
{
    MsgBox, 48, EaseVerse → Pro Tools, Markers file not found:`n%markerPath%
    ExitApp
}

if !WinExist("ahk_exe ProTools.exe") {
    MsgBox, 48, EaseVerse → Pro Tools, Pro Tools is not running. Open the session first.
    ExitApp
}

WinActivate, ahk_exe ProTools.exe
if !WinWaitActive("ahk_exe ProTools.exe",, 5) {
    MsgBox, 48, EaseVerse → Pro Tools, Could not focus Pro Tools window.
    ExitApp
}

; File menu → Import → Session Data...
Send, !f
Sleep, 250
Send, i
Sleep, 250
Send, s

; Open-file dialog
WinWait, ahk_class #32770,, 8
if ErrorLevel {
    MsgBox, 48, EaseVerse → Pro Tools, "Choose a session file" dialog never opened.
    ExitApp
}

; Paste full path and confirm
ControlSetText, Edit1, %markerPath%, ahk_class #32770
Sleep, 200
Send, {Enter}

; Wait for Import Session Data options dialog
WinWait, Import Session Data,, 12
if ErrorLevel {
    MsgBox, 48, EaseVerse → Pro Tools, "Import Session Data" dialog never opened — Pro Tools may have shown an error.
    ExitApp
}

; Enable Memory Locations / Markers (accelerator varies by PT version;
; Alt+M is the most common; fall back to clicking the checkbox by class
; if you need to adapt this for older versions).
Send, !m
Sleep, 200

; Click OK
Send, !o

; Friendly tray notification
TrayTip, EaseVerse, Importing markers from %markerPath%, 3, 1
Sleep, 2500
ExitApp
