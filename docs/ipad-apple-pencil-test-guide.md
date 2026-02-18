# iPad Apple Pencil Lyrics Writing - Test Guide

**Test Date:** February 17, 2026  
**Version:** EaseVerse 1.0  
**Device Required:** iPad with Apple Pencil (any generation)  
**OS Required:** iPadOS with Scribble support

---

## ✅ Pre-Test Checklist

### Server Status
- [x] Server running: http://localhost:5059
- [x] Health check: `{"ok":true}`
- [x] No TypeScript errors in lyrics.tsx or PencilInkLayer.tsx

### Code Verification
- [x] Paper Mode toggle implemented (lines 1597-1614 in lyrics.tsx)
- [x] TextInput with Scribble support (lines 1632-1658 in lyrics.tsx)
- [x] PencilInkLayer component integrated (line 1662 in lyrics.tsx)
- [x] Pen/Highlighter/Eraser tools implemented (PencilInkLayer.tsx)
- [x] Pressure sensitivity enabled (lines 289-293 in PencilInkLayer.tsx)
- [x] Undo/redo system (60-state history)

---

## 🧪 Test Workflow

### **1. Launch App on iPad**

**Steps:**
1. Open EaseVerse app on your iPad
2. Navigate to **Lyrics** tab (bottom navigation)
3. Verify you see "Apple Pencil" badge at top
4. Confirm "Paper Mode Off" toggle is visible (iPad-only feature)

**Expected Results:**
- Green "Apple Pencil" badge with pencil icon visible
- Toggle button present (gray background when off)
- Regular text editor visible

**Status:** [ ] Pass [ ] Fail  
**Notes:** _______________________

---

### **2. Enable Paper Mode**

**Steps:**
1. Tap "Paper Mode Off" toggle button
2. Observe the visual change
3. Verify hint text appears below editor

**Expected Results:**
- Toggle text changes to "Paper Mode On"
- Background changes to active state
- 36 horizontal guide lines appear (34px spacing)
- Hint text displays: "Tip: use Apple Pencil Scribble, then open Ink On for pen/highlighter..."
- Editor area shows lined paper effect

**Status:** [ ] Pass [ ] Fail  
**Notes:** _______________________

---

### **3. Test iOS Scribble (Handwriting → Text Conversion)**

**Steps:**
1. With Paper Mode enabled, tap in the lyrics editor
2. Using Apple Pencil, write "Hello World" in handwriting
3. Observe as letters convert to typed text automatically
4. Write a full sentence: "This is a test verse"
5. Add line break and write another line

**Expected Results:**
- Handwriting converts to typed text in real-time
- No visual drawing remains (text only)
- Auto-save triggers after 700ms (watch for save indicator)
- Text appears in standard font, not handwriting
- Cursor follows writing position
- Lines align with paper guides

**Test Phrases:**
- [ ] "Hello World" → converts correctly
- [ ] "Verse 1" → capitalizes properly
- [ ] "This is a beautiful melody" → full sentence works
- [ ] Line breaks → create new lines correctly

**Status:** [ ] Pass [ ] Fail  
**Notes:** _______________________

---

### **4. Test Section Headers with Scribble**

**Steps:**
1. Write in handwriting: "Verse 1"
2. Press return
3. Write some lyrics
4. Press return twice
5. Write "Chorus" in handwriting
6. Add lyrics for chorus

**Expected Results:**
- "Verse 1" and "Chorus" headers convert to text
- Section parsing recognizes headers (check Structure tab)
- Auto-numbering works if you write multiple verses
- Section cards appear in Structure tab

**Test Section Headers:**
- [ ] Verse 1
- [ ] Pre-Chorus
- [ ] Chorus
- [ ] Bridge
- [ ] Final Chorus

**Status:** [ ] Pass [ ] Fail  
**Notes:** _______________________

---

### **5. Enable Ink On (Drawing Annotations)**

**Steps:**
1. After writing some text with Scribble, close the keyboard
2. Look for "Ink On" toggle (should appear when Paper Mode is on)
3. Tap "Ink On" toggle
4. Observe toolbar appearing at top

**Expected Results:**
- Toolbar slides down showing:
  - Pen tool (selected by default)
  - Highlighter tool
  - Eraser tool
  - Color swatches (6 colors + highlighter yellow)
  - Width/size selector (4 presets)
  - Undo/Redo buttons
  - Stylus Priority toggle
  - Pressure Sensitivity toggle
- Drawing canvas overlays the text
- Scribble still works underneath

**Status:** [ ] Pass [ ] Fail  
**Notes:** _______________________

---

### **6. Test Pen Tool**

**Steps:**
1. With Ink On enabled, ensure Pen is selected
2. Select color: Dark Slate (#1E293B)
3. Select width: 3.2 (second preset)
4. Draw a circle around a word
5. Draw an underline under a phrase
6. Vary pressure while drawing

**Expected Results:**
- Smooth pen strokes appear
- Color matches selection
- Pressure affects stroke width (lighter = thinner, harder = thicker)
- Strokes follow Apple Pencil movement accurately
- No lag or jitter
- Strokes remain when you lift pencil

**Test Different Widths:**
- [ ] 2.2 (finest)
- [ ] 3.2 (normal)
- [ ] 4.4 (bold)
- [ ] 6.0 (thickest)

**Test Different Colors:**
- [ ] #1E293B (Dark Slate) - default
- [ ] #0F172A (Nearly Black)
- [ ] #1D4ED8 (Blue)
- [ ] #EA580C (Orange)
- [ ] #065F46 (Green)
- [ ] #B91C1C (Red)

**Status:** [ ] Pass [ ] Fail  
**Notes:** _______________________

---

### **7. Test Highlighter Tool**

**Steps:**
1. Tap Highlighter icon in toolbar
2. Verify color automatically switches to yellow (#FACC15)
3. Select width: 24 (medium-wide)
4. Draw over a word or phrase like highlighting paper
5. Observe transparency/opacity

**Expected Results:**
- Highlighter color is yellow
- Opacity is ~36% (semi-transparent)
- Can see text through highlights
- Width is appropriate for highlighting text
- Smooth strokes like pen

**Test Highlighting:**
- [ ] Single word
- [ ] Full phrase
- [ ] Multiple lines
- [ ] Overlapping highlights (transparency stacks)

**Status:** [ ] Pass [ ] Fail  
**Notes:** _______________________

---

### **8. Test Eraser Tool**

**Steps:**
1. Tap Eraser icon in toolbar
2. Select size: 24 (medium)
3. Observe eraser cursor appears as you move pencil
4. Erase one of the pen strokes you drew earlier
5. Try erasing a highlight
6. Test different eraser sizes

**Expected Results:**
- Circular cursor shows eraser position and size
- Touching strokes removes them completely (not partial)
- Entire stroke is removed on first touch
- Works on both pen and highlighter strokes
- Eraser cursor updates with size selection
- Text underneath is NOT affected

**Test Eraser Sizes:**
- [ ] 16 (small - precise)
- [ ] 24 (medium)
- [ ] 34 (large)
- [ ] 46 (extra large - quick cleanup)

**Status:** [ ] Pass [ ] Fail  
**Notes:** _______________________

---

### **9. Test Undo/Redo**

**Steps:**
1. Draw 3 new pen strokes (circles, lines, etc.)
2. Tap Undo button (↶ icon) 3 times
3. Verify strokes disappear in reverse order
4. Tap Redo button (↷ icon) 2 times
5. Verify 2 strokes reappear

**Expected Results:**
- Undo removes most recent stroke first
- Each tap removes one stroke
- Undo works for pen, highlighter, and eraser actions
- Redo restores strokes in correct order
- Undo/Redo buttons gray out when stack is empty
- History persists up to 60 states

**Test Undo/Redo:**
- [ ] Undo pen stroke
- [ ] Undo highlighter stroke
- [ ] Undo eraser action
- [ ] Redo restores correctly
- [ ] Multiple undo/redo cycles work

**Status:** [ ] Pass [ ] Fail  
**Notes:** _______________________

---

### **10. Test Stylus Priority**

**Steps:**
1. Toggle "Stylus Priority" OFF in toolbar
2. Try drawing with Apple Pencil
3. Try drawing with your finger
4. Toggle "Stylus Priority" ON
5. Try drawing with Apple Pencil
6. Try drawing with your finger

**Expected Results:**
- **Stylus Priority OFF:**
  - Both Apple Pencil and finger can draw
  - No distinction between input methods
- **Stylus Priority ON (default):**
  - Only Apple Pencil can draw
  - Finger touch shows hint: "Use Apple Pencil to draw, or turn off Stylus Priority"
  - Hint auto-hides after 2 seconds
  - Prevents accidental finger marks while writing

**Status:** [ ] Pass [ ] Fail  
**Notes:** _______________________

---

### **11. Test Pressure Sensitivity**

**Steps:**
1. Ensure Pen tool selected with width 3.2
2. Toggle "Pressure Sensitivity" ON (default)
3. Draw a stroke with very light pressure
4. Draw a stroke with medium pressure
5. Draw a stroke with heavy pressure
6. Toggle "Pressure Sensitivity" OFF
7. Draw strokes with varying pressure

**Expected Results:**
- **Pressure Sensitivity ON:**
  - Light pressure = thinner strokes (~75% of base width)
  - Heavy pressure = thicker strokes (~155% of base width)
  - Stroke width varies smoothly within a single stroke
  - Natural handwriting feel
- **Pressure Sensitivity OFF:**
  - Consistent width regardless of pressure
  - All strokes same thickness
  - Useful for uniform annotations

**Status:** [ ] Pass [ ] Fail  
**Notes:** _______________________

---

### **12. Test Combined Workflow (Scribble + Ink)**

**Steps:**
1. Start fresh with Paper Mode ON, Ink On OFF
2. Use Scribble to write: "Verse 1" + lyrics (3-4 lines)
3. Enable Ink On
4. Use Pen (blue color) to circle important words
5. Use Highlighter to highlight key phrases
6. Disable Ink On
7. Use Scribble to add more lyrics
8. Enable Ink On again
9. Add more annotations

**Expected Results:**
- Scribble text entry and Ink annotations work independently
- Toggling Ink On/Off doesn't affect text or drawings
- Can alternate between modes seamlessly
- Annotations persist when Ink is toggled off/on
- Text and annotations layer correctly (drawings on top)
- Auto-save works throughout

**Status:** [ ] Pass [ ] Fail  
**Notes:** _______________________

---

### **13. Test Paper Mode Toggle with Content**

**Steps:**
1. Create content: text + annotations
2. Toggle Paper Mode OFF
3. Verify content remains
4. Verify guide lines disappear
5. Toggle Paper Mode ON again
6. Verify guide lines reappear
7. Verify annotations still visible

**Expected Results:**
- Paper guide lines show/hide correctly
- Text content persists regardless of mode
- Ink annotations remain visible in both modes
- No data loss when toggling
- Layout adjusts appropriately

**Status:** [ ] Pass [ ] Fail  
**Notes:** _______________________

---

### **14. Test Session Persistence**

**Steps:**
1. Create text with Scribble
2. Add ink annotations
3. Force close the app (swipe up from multitasking)
4. Relaunch app
5. Navigate to Lyrics tab
6. Open the same song

**Expected Results:**
- Text content restored
- Ink annotations restored
- Paper Mode setting remembered (session-based)
- Undo/redo history cleared (new session)
- All strokes render correctly

**Status:** [ ] Pass [ ] Fail  
**Notes:** _______________________

---

### **15. Test Auto-Save Integration**

**Steps:**
1. Write text with Scribble: "This is a new verse"
2. Wait 700ms
3. Check if save indicator appears (implementation dependent)
4. Switch to Library tab
5. Switch back to Lyrics tab
6. Verify text is still there

**Expected Results:**
- Auto-save triggers after 700ms debounce
- Text persists across tab switches
- No manual save required
- Seamless user experience

**Status:** [ ] Pass [ ] Fail  
**Notes:** _______________________

---

### **16. Test Clear/Reset**

**Steps:**
1. Create several ink strokes
2. Look for Clear button in toolbar (if implemented)
3. Test clearing all ink while preserving text

**Expected Results:**
- Clear button removes all ink annotations
- Text content remains unchanged
- Undo/redo history cleared after clear
- Can start fresh annotations

**Status:** [ ] Pass [ ] Fail  
**Notes:** _______________________

---

## 🎯 Complete Workflow Test Scenario

### Real-World Song Writing Test

**Objective:** Write a complete song verse with annotations like you would naturally use the feature.

**Steps:**
1. Enable Paper Mode
2. Use Scribble to write:
   ```
   Verse 1
   The melody starts to fade away
   Like whispers in the morning light
   I'm searching for the words to say
   Before we lose the night
   
   Chorus
   Hold on to this moment
   Don't let it slip away
   ```

3. Enable Ink On
4. Use Blue Pen (3.2 width) to:
   - Circle "whispers" (word to emphasize vocally)
   - Circle "searching" (another emphasis point)
   - Draw a breath mark after "say"

5. Use Highlighter to:
   - Highlight "Hold on to this moment" (hook line)
   - Highlight "Don't let it slip away" (repeated phrase)

6. Switch to Structure tab
7. Verify sections recognized:
   - Verse 1 (with 4 lines)
   - Chorus (with 2 lines)

8. Return to Lyrics tab
9. Disable Ink On
10. Use Scribble to add:
    ```
    Verse 2
    The silence speaks in volumes now
    Each heartbeat marks the time
    ```

11. Enable Ink On
12. Add pen annotations to new verse

**Expected Results:**
- [ ] Complete workflow feels natural
- [ ] Switching between Scribble and Ink is intuitive
- [ ] Paper Mode guides help with handwriting alignment
- [ ] Annotations layer properly over text
- [ ] Section parsing works correctly
- [ ] Auto-save preserves everything
- [ ] No performance issues or lag
- [ ] Undo/redo works throughout

**Status:** [ ] Pass [ ] Fail  
**Overall Experience Rating:** ___ / 10  
**Notes:** _______________________

---

## 🐛 Bug Tracking

### Issues Found During Testing

| Test Step | Issue Description | Severity | Reproduction Steps |
|-----------|------------------|----------|-------------------|
| | | | |
| | | | |
| | | | |

**Severity Levels:**
- **Critical:** Blocks core functionality
- **High:** Major feature broken
- **Medium:** Feature works but has issues
- **Low:** Minor cosmetic or edge case

---

## 📊 Testing Summary

### Feature Coverage
- [ ] Paper Mode toggle - ___% working
- [ ] iOS Scribble handwriting conversion - ___% working  
- [ ] Pen tool - ___% working
- [ ] Highlighter tool - ___% working
- [ ] Eraser tool - ___% working
- [ ] Pressure sensitivity - ___% working
- [ ] Stylus priority - ___% working
- [ ] Undo/Redo - ___% working
- [ ] Session persistence - ___% working
- [ ] Auto-save integration - ___% working

### Overall Assessment
- **Total Tests:** 16
- **Passed:** ___
- **Failed:** ___
- **Success Rate:** ___%

### Recommendation
- [ ] **READY FOR PRODUCTION** - All tests passed, no critical issues
- [ ] **READY WITH MINOR ISSUES** - Works well, minor bugs documented
- [ ] **NEEDS FIXES** - Several issues must be addressed
- [ ] **BLOCKED** - Critical failures prevent usage

---

## 🔧 Technical Details

### Implementation Verified
- **Paper Mode State:** Line 261 in lyrics.tsx
- **TextInput with Scribble:** Lines 1632-1658 in lyrics.tsx
- **PencilInkLayer Integration:** Line 1662 in lyrics.tsx
- **Pen/Highlighter/Eraser Tools:** PencilInkLayer.tsx
- **Pressure Sensitivity Algorithm:** Lines 252-256 in PencilInkLayer.tsx
- **Undo/Redo System:** 60-state history, lines 72-99 in PencilInkLayer.tsx
- **Color Presets:** 6 colors + highlighter yellow (line 57)
- **Width Presets:** Pen: 2.2-6px (line 56), Eraser: 16-46px (line 58)

### Key Features
1. **iOS Scribble:** Built-in iPadOS feature (automatic handwriting → text)
2. **PencilInkLayer:** Custom SVG drawing overlay (manual annotations)
3. **Paper Mode:** 36 guide lines, 34px spacing, lined notebook effect
4. **Auto-Save:** 700ms debounce
5. **Section Parsing:** Automatic recognition of Verse/Chorus/Bridge headers
6. **Quadratic Bezier Smoothing:** Natural curve rendering for strokes

---

## 📝 Tester Notes

**Device:** _______________  
**iPadOS Version:** _______________  
**Apple Pencil Generation:** _______________  
**Date Tested:** _______________  
**Tester Name:** _______________  

**Additional Comments:**
_______________________
_______________________
_______________________

---

## ✅ Sign-Off

- [ ] All critical features tested
- [ ] No blockers found
- [ ] Documentation complete
- [ ] Ready for user testing/production

**Signed:** _______________ **Date:** _______________
