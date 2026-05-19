import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import Colors from '@/constants/colors';
import * as Storage from '@/lib/storage';
import {
  detectSectionsFromStrokes,
  transcribeStrokes,
} from '@/lib/handwriting-client';

type InkTool = 'pen' | 'highlighter' | 'eraser' | 'lasso';
type InkPoint = {
  x: number;
  y: number;
  pressure: number;
};
type InkStroke = {
  id: string;
  tool: Exclude<InkTool, 'eraser'>;
  color: string;
  width: number;
  opacity: number;
  path: string;
  points: InkPoint[];
};
type InkHistoryState = {
  strokes: InkStroke[];
  undo: InkStroke[][];
  redo: InkStroke[][];
};
type InkAction =
  | { type: 'commit'; next: InkStroke[] }
  | { type: 'replace'; strokes: InkStroke[] }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'clear' }
  | { type: 'reset' };

type TouchWithOptionalType = {
  touchType?: unknown;
  force?: unknown;
  locationX?: unknown;
  locationY?: unknown;
};

interface PencilInkLayerProps {
  visible: boolean;
  sessionKey: string;
  onTranscribe?: (text: string) => void;
  onDetectedSections?: (
    sections: { type: string; label: string; lines: string[] }[],
  ) => void;
}

const MAX_HISTORY = 60;
const MIN_POINTS_FOR_STROKE = 2;
const PEN_WIDTH_PRESETS = [2.2, 3.2, 4.4, 6];
const ERASER_SIZE_PRESETS = [16, 24, 34, 46];
const COLOR_PRESETS = ['#1E293B', '#0F172A', '#1D4ED8', '#EA580C', '#065F46', '#B91C1C'];
const HIGHLIGHTER_PRESETS = ['#FACC15', '#F472B6', '#86EFAC', '#7DD3FC'];
const HIGHLIGHTER_COLOR = HIGHLIGHTER_PRESETS[0];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sameStrokeSet(a: InkStroke[], b: InkStroke[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index].id !== b[index].id) {
      return false;
    }
  }
  return true;
}

function historyReducer(state: InkHistoryState, action: InkAction): InkHistoryState {
  switch (action.type) {
    case 'commit': {
      if (sameStrokeSet(state.strokes, action.next)) {
        return state;
      }
      const nextUndo = [...state.undo, state.strokes];
      const cappedUndo = nextUndo.length > MAX_HISTORY ? nextUndo.slice(nextUndo.length - MAX_HISTORY) : nextUndo;
      return {
        strokes: action.next,
        undo: cappedUndo,
        redo: [],
      };
    }
    case 'replace': {
      return { strokes: action.strokes, undo: [], redo: [] };
    }
    case 'undo': {
      if (state.undo.length === 0) {
        return state;
      }
      const previous = state.undo[state.undo.length - 1];
      return {
        strokes: previous,
        undo: state.undo.slice(0, -1),
        redo: [...state.redo, state.strokes],
      };
    }
    case 'redo': {
      if (state.redo.length === 0) {
        return state;
      }
      const next = state.redo[state.redo.length - 1];
      return {
        strokes: next,
        undo: [...state.undo, state.strokes],
        redo: state.redo.slice(0, -1),
      };
    }
    case 'clear': {
      if (state.strokes.length === 0) {
        return state;
      }
      const nextUndo = [...state.undo, state.strokes];
      const cappedUndo = nextUndo.length > MAX_HISTORY ? nextUndo.slice(nextUndo.length - MAX_HISTORY) : nextUndo;
      return {
        strokes: [],
        undo: cappedUndo,
        redo: [],
      };
    }
    case 'reset':
      return { strokes: [], undo: [], redo: [] };
    default:
      return state;
  }
}

function touchFromEvent(event: GestureResponderEvent): TouchWithOptionalType {
  const firstTouch = event.nativeEvent.touches[0];
  if (firstTouch) {
    return firstTouch as TouchWithOptionalType;
  }
  return event.nativeEvent as TouchWithOptionalType;
}

function resolvePoint(event: GestureResponderEvent): InkPoint | null {
  const touch = touchFromEvent(event);
  if (typeof touch.locationX !== 'number' || typeof touch.locationY !== 'number') {
    return null;
  }

  const force = typeof touch.force === 'number' ? touch.force : 1;
  return {
    x: touch.locationX,
    y: touch.locationY,
    pressure: clamp(force, 0.2, 1.8),
  };
}

function resolveStylusIntent(event: GestureResponderEvent): {
  known: boolean;
  isStylus: boolean;
} {
  const touch = touchFromEvent(event);
  const rawTouchType = touch.touchType;
  if (typeof rawTouchType !== 'string') {
    return {
      known: false,
      isStylus: false,
    };
  }

  const normalized = rawTouchType.toLowerCase();
  return {
    known: true,
    isStylus: normalized.includes('stylus') || normalized.includes('pencil'),
  };
}

function pointDistanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }

  const t = clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy), 0, 1);
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  return Math.hypot(px - closestX, py - closestY);
}

function strokeHitsPoint(stroke: InkStroke, point: InkPoint, eraserRadius: number): boolean {
  if (stroke.points.length === 0) {
    return false;
  }

  if (stroke.points.length === 1) {
    const p = stroke.points[0];
    return Math.hypot(point.x - p.x, point.y - p.y) <= eraserRadius + stroke.width / 2;
  }

  for (let index = 1; index < stroke.points.length; index += 1) {
    const previous = stroke.points[index - 1];
    const current = stroke.points[index];
    const distance = pointDistanceToSegment(
      point.x,
      point.y,
      previous.x,
      previous.y,
      current.x,
      current.y
    );
    if (distance <= eraserRadius + stroke.width / 2) {
      return true;
    }
  }

  return false;
}

function pointInPolygon(point: { x: number; y: number }, polygon: InkPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function strokeIntersectsPolygon(stroke: InkStroke, polygon: InkPoint[]): boolean {
  if (polygon.length < 3) return false;
  for (const point of stroke.points) {
    if (pointInPolygon(point, polygon)) return true;
  }
  return false;
}

function translateStroke(stroke: InkStroke, dx: number, dy: number): InkStroke {
  return {
    ...stroke,
    points: stroke.points.map((p) => ({ x: p.x + dx, y: p.y + dy, pressure: p.pressure })),
  };
}

function smoothPathFromPoints(points: InkPoint[]): string {
  if (points.length === 0) {
    return '';
  }
  if (points.length === 1) {
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} l 0.01 0.01`;
  }

  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const midX = (previous.x + current.x) / 2;
    const midY = (previous.y + current.y) / 2;
    path += ` Q ${previous.x.toFixed(2)} ${previous.y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
  }
  const last = points[points.length - 1];
  path += ` T ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  return path;
}

function createInkStroke(
  points: InkPoint[],
  tool: Exclude<InkTool, 'eraser'>,
  color: string,
  baseWidth: number,
  pressureSensitive: boolean
): InkStroke {
  const meanPressure =
    points.reduce((sum, point) => sum + point.pressure, 0) / Math.max(1, points.length);
  const widthMultiplier = pressureSensitive ? clamp(meanPressure, 0.75, 1.55) : 1;
  const opacity = tool === 'highlighter' ? 0.36 : 0.92;

  return {
    id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    tool,
    color,
    width: clamp(baseWidth * widthMultiplier, 1.6, 18),
    opacity,
    path: smoothPathFromPoints(points),
    points,
  };
}

function applyEraser(strokes: InkStroke[], point: InkPoint, eraserRadius: number): InkStroke[] {
  return strokes.filter((stroke) => !strokeHitsPoint(stroke, point, eraserRadius));
}

export default function PencilInkLayer({
  visible,
  sessionKey,
  onTranscribe,
  onDetectedSections,
}: PencilInkLayerProps) {
  const [history, dispatch] = React.useReducer(historyReducer, {
    strokes: [],
    undo: [],
    redo: [],
  });
  const [enabled, setEnabled] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [tool, setTool] = useState<InkTool>('pen');
  const [stylusPriority, setStylusPriority] = useState(true);
  const [pressureSensitive, setPressureSensitive] = useState(true);
  const [selectedColor, setSelectedColor] = useState(COLOR_PRESETS[0]);
  const [highlighterColor, setHighlighterColor] = useState(HIGHLIGHTER_PRESETS[0]);
  const [customColors, setCustomColors] = useState<string[]>([]);
  const [showHexInput, setShowHexInput] = useState(false);
  const [hexDraft, setHexDraft] = useState('');
  const [ocrBusy, setOcrBusy] = useState<null | 'transcribe' | 'sections'>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [stabilization, setStabilization] = useState(false);
  const [lassoPath, setLassoPath] = useState<InkPoint[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const lassoPointsRef = useRef<InkPoint[]>([]);
  const [penWidth, setPenWidth] = useState(3.2);
  const [eraserSize, setEraserSize] = useState(24);
  const [stylusHintVisible, setStylusHintVisible] = useState(false);
  const [draftStroke, setDraftStroke] = useState<InkStroke | null>(null);
  const [eraserPreview, setEraserPreview] = useState<InkStroke[] | null>(null);
  const [eraserCursor, setEraserCursor] = useState<InkPoint | null>(null);

  const activePointsRef = useRef<InkPoint[]>([]);
  const erasingRef = useRef(false);
  const stylusHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    dispatch({ type: 'reset' });
    setEnabled(false);
    setDraftStroke(null);
    setEraserPreview(null);
    setEraserCursor(null);

    let cancelled = false;
    void Storage.getInkStrokes(sessionKey).then((stored) => {
      if (cancelled || !stored || stored.length === 0) return;
      dispatch({ type: 'replace', strokes: stored as InkStroke[] });
    });
    return () => {
      cancelled = true;
    };
  }, [sessionKey]);

  // Persist on commit + every 60s heartbeat as a crash-safety net.
  useEffect(() => {
    void Storage.saveInkStrokes(sessionKey, history.strokes);
  }, [sessionKey, history.strokes]);
  useEffect(() => {
    const interval = setInterval(() => {
      void Storage.saveInkStrokes(sessionKey, history.strokes);
    }, 60_000);
    return () => clearInterval(interval);
  }, [sessionKey, history.strokes]);

  useEffect(() => {
    return () => {
      if (stylusHintTimerRef.current) {
        clearTimeout(stylusHintTimerRef.current);
      }
    };
  }, []);

  const activeToolIsMarker = tool === 'highlighter';
  const activeInkColor = activeToolIsMarker ? highlighterColor : selectedColor;
  const activeInkWidth = tool === 'eraser' ? eraserSize : penWidth;
  const displayedStrokes = eraserPreview ?? history.strokes;

  const showStylusHint = useCallback(() => {
    setStylusHintVisible(true);
    if (stylusHintTimerRef.current) {
      clearTimeout(stylusHintTimerRef.current);
    }
    stylusHintTimerRef.current = setTimeout(() => {
      setStylusHintVisible(false);
    }, 1300);
  }, []);

  const applyToolButton = useCallback((nextTool: InkTool) => {
    setTool(nextTool);
    setSelectedIds([]);
    setLassoPath(null);
    Haptics.selectionAsync();
  }, []);

  const beginStroke = useCallback(
    (point: InkPoint) => {
      activePointsRef.current = [point];
      const baseStroke = createInkStroke(
        activePointsRef.current,
        tool === 'highlighter' ? 'highlighter' : 'pen',
        activeInkColor,
        activeInkWidth,
        pressureSensitive
      );
      setDraftStroke(baseStroke);
    },
    [activeInkColor, activeInkWidth, pressureSensitive, tool]
  );

  const appendStrokePoint = useCallback(
    (point: InkPoint) => {
      let nextPoint = point;
      if (stabilization) {
        const prev = activePointsRef.current[activePointsRef.current.length - 1];
        if (prev) {
          const factor = 0.55;
          nextPoint = {
            x: prev.x * factor + point.x * (1 - factor),
            y: prev.y * factor + point.y * (1 - factor),
            pressure: point.pressure,
          };
        }
      }
      activePointsRef.current = [...activePointsRef.current, nextPoint];
      const nextStroke = createInkStroke(
        activePointsRef.current,
        tool === 'highlighter' ? 'highlighter' : 'pen',
        activeInkColor,
        activeInkWidth,
        pressureSensitive
      );
      setDraftStroke(nextStroke);
    },
    [activeInkColor, activeInkWidth, pressureSensitive, tool]
  );

  const finalizeStroke = useCallback(() => {
    const points = activePointsRef.current;
    if (points.length < MIN_POINTS_FOR_STROKE) {
      setDraftStroke(null);
      activePointsRef.current = [];
      return;
    }
    const completedStroke = createInkStroke(
      points,
      tool === 'highlighter' ? 'highlighter' : 'pen',
      activeInkColor,
      activeInkWidth,
      pressureSensitive
    );
    dispatch({ type: 'commit', next: [...history.strokes, completedStroke] });
    activePointsRef.current = [];
    setDraftStroke(null);
  }, [activeInkColor, activeInkWidth, history.strokes, pressureSensitive, tool]);

  const beginErase = useCallback(
    (point: InkPoint) => {
      erasingRef.current = true;
      const next = applyEraser(history.strokes, point, eraserSize);
      setEraserPreview(next);
      setEraserCursor(point);
    },
    [eraserSize, history.strokes]
  );

  const continueErase = useCallback(
    (point: InkPoint) => {
      setEraserPreview((currentPreview) => {
        const source = currentPreview ?? history.strokes;
        return applyEraser(source, point, eraserSize);
      });
      setEraserCursor(point);
    },
    [eraserSize, history.strokes]
  );

  const finalizeErase = useCallback(() => {
    if (!erasingRef.current) {
      return;
    }
    erasingRef.current = false;
    if (eraserPreview) {
      dispatch({ type: 'commit', next: eraserPreview });
    }
    setEraserPreview(null);
    setEraserCursor(null);
  }, [eraserPreview]);

  const endGesture = useCallback(() => {
    if (tool === 'eraser') {
      finalizeErase();
      return;
    }
    finalizeStroke();
  }, [finalizeErase, finalizeStroke, tool]);

  const shouldAllowEvent = useCallback(
    (event: GestureResponderEvent): boolean => {
      if (!enabled) {
        return false;
      }

      if (!stylusPriority) {
        return true;
      }

      const stylusIntent = resolveStylusIntent(event);
      if (!stylusIntent.known) {
        return true;
      }

      if (stylusIntent.isStylus) {
        return true;
      }

      showStylusHint();
      return false;
    },
    [enabled, showStylusHint, stylusPriority]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => enabled,
        onMoveShouldSetPanResponder: () => enabled,
        onPanResponderGrant: (event) => {
          if (!shouldAllowEvent(event)) {
            return;
          }
          const point = resolvePoint(event);
          if (!point) {
            return;
          }

          if (tool === 'eraser') {
            beginErase(point);
            return;
          }
          if (tool === 'lasso') {
            lassoPointsRef.current = [point];
            setLassoPath([point]);
            setSelectedIds([]);
            return;
          }
          beginStroke(point);
        },
        onPanResponderMove: (event) => {
          if (!shouldAllowEvent(event)) {
            return;
          }
          const point = resolvePoint(event);
          if (!point) {
            return;
          }

          if (tool === 'eraser') {
            continueErase(point);
            return;
          }
          if (tool === 'lasso') {
            lassoPointsRef.current = [...lassoPointsRef.current, point];
            setLassoPath(lassoPointsRef.current);
            return;
          }
          appendStrokePoint(point);
        },
        onPanResponderRelease: () => {
          if (tool === 'lasso') {
            const polygon = lassoPointsRef.current;
            if (polygon.length >= 3) {
              const ids = history.strokes
                .filter((stroke) => strokeIntersectsPolygon(stroke, polygon))
                .map((stroke) => stroke.id);
              setSelectedIds(ids);
            }
            lassoPointsRef.current = [];
            setLassoPath(null);
            return;
          }
          endGesture();
        },
        onPanResponderTerminate: () => {
          if (tool === 'lasso') {
            lassoPointsRef.current = [];
            setLassoPath(null);
            return;
          }
          endGesture();
        },
      }),
    [appendStrokePoint, beginErase, beginStroke, continueErase, enabled, endGesture, history.strokes, shouldAllowEvent, tool]
  );

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.layerRoot} pointerEvents="box-none">
      <View style={styles.toolbarWrap} pointerEvents="box-none">
        <View style={styles.toolbarCard}>
          <View style={styles.toolbarHeader}>
            <Pressable
              style={[styles.toolbarPrimary, enabled && styles.toolbarPrimaryActive]}
              onPress={() => {
                setEnabled((current) => !current);
                Haptics.selectionAsync();
              }}
              accessibilityRole="switch"
              accessibilityLabel="Toggle pencil ink layer"
              accessibilityHint="Turns on freehand Apple Pencil ink"
              accessibilityState={{ checked: enabled }}
            >
              <Ionicons name="brush-outline" size={16} color={enabled ? Colors.gradientStart : Colors.textSecondary} />
              <Text style={[styles.toolbarPrimaryText, enabled && styles.toolbarPrimaryTextActive]}>
                {enabled ? 'Ink On' : 'Ink Off'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => setExpanded((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Collapse pencil tools' : 'Expand pencil tools'}
            >
              <Ionicons
                name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                size={16}
                color={Colors.textSecondary}
              />
            </Pressable>
          </View>

          {expanded && (
            <View style={styles.toolbarBody}>
              <View style={styles.chipRow}>
                <Pressable
                  style={[styles.toolChip, tool === 'pen' && styles.toolChipActive]}
                  onPress={() => applyToolButton('pen')}
                >
                  <Ionicons name="create-outline" size={14} color={tool === 'pen' ? Colors.gradientStart : Colors.textSecondary} />
                  <Text style={[styles.toolChipText, tool === 'pen' && styles.toolChipTextActive]}>Pen</Text>
                </Pressable>
                <Pressable
                  style={[styles.toolChip, tool === 'highlighter' && styles.toolChipActive]}
                  onPress={() => applyToolButton('highlighter')}
                >
                  <Ionicons
                    name="color-wand-outline"
                    size={14}
                    color={tool === 'highlighter' ? Colors.gradientStart : Colors.textSecondary}
                  />
                  <Text style={[styles.toolChipText, tool === 'highlighter' && styles.toolChipTextActive]}>Highlight</Text>
                </Pressable>
                <Pressable
                  style={[styles.toolChip, tool === 'eraser' && styles.toolChipActive]}
                  onPress={() => applyToolButton('eraser')}
                >
                  <Ionicons
                    name="remove-circle-outline"
                    size={14}
                    color={tool === 'eraser' ? Colors.gradientStart : Colors.textSecondary}
                  />
                  <Text style={[styles.toolChipText, tool === 'eraser' && styles.toolChipTextActive]}>Eraser</Text>
                </Pressable>
                <Pressable
                  style={[styles.toolChip, tool === 'lasso' && styles.toolChipActive]}
                  onPress={() => applyToolButton('lasso')}
                >
                  <Ionicons
                    name="ellipsis-horizontal-circle-outline"
                    size={14}
                    color={tool === 'lasso' ? Colors.gradientStart : Colors.textSecondary}
                  />
                  <Text style={[styles.toolChipText, tool === 'lasso' && styles.toolChipTextActive]}>Lasso</Text>
                </Pressable>
              </View>

              {tool === 'pen' && (
                <View style={styles.colorRow}>
                  {[...COLOR_PRESETS, ...customColors].map((color) => (
                    <Pressable
                      key={color}
                      style={[
                        styles.colorDot,
                        { backgroundColor: color },
                        selectedColor === color && styles.colorDotActive,
                      ]}
                      onPress={() => setSelectedColor(color)}
                      accessibilityRole="button"
                      accessibilityLabel={`Pick pen color ${color}`}
                    />
                  ))}
                  <Pressable
                    style={[styles.colorDot, styles.colorDotAdd]}
                    onPress={() => setShowHexInput(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Add custom HEX color"
                  >
                    <Ionicons name="add" size={12} color={Colors.textPrimary} />
                  </Pressable>
                </View>
              )}
              {tool === 'highlighter' && (
                <View style={styles.colorRow}>
                  {HIGHLIGHTER_PRESETS.map((color) => (
                    <Pressable
                      key={color}
                      style={[
                        styles.colorDot,
                        { backgroundColor: color },
                        highlighterColor === color && styles.colorDotActive,
                      ]}
                      onPress={() => setHighlighterColor(color)}
                      accessibilityRole="button"
                      accessibilityLabel={`Pick highlighter ${color}`}
                    />
                  ))}
                </View>
              )}
              {showHexInput ? (
                <View style={styles.hexInputRow}>
                  <Text style={styles.hexInputLabel}>HEX</Text>
                  <TextInput
                    value={hexDraft}
                    onChangeText={setHexDraft}
                    placeholder="#A1B2C3"
                    placeholderTextColor={Colors.textTertiary}
                    autoCapitalize="characters"
                    maxLength={7}
                    style={styles.hexInput}
                  />
                  <Pressable
                    style={styles.hexAddBtn}
                    onPress={() => {
                      const candidate = hexDraft.startsWith('#') ? hexDraft : `#${hexDraft}`;
                      if (/^#[0-9A-Fa-f]{6}$/.test(candidate)) {
                        setCustomColors((prev) =>
                          prev.includes(candidate) ? prev : [...prev, candidate],
                        );
                        setSelectedColor(candidate);
                        setHexDraft('');
                        setShowHexInput(false);
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Save custom color"
                  >
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  </Pressable>
                  <Pressable
                    style={styles.hexCancelBtn}
                    onPress={() => {
                      setHexDraft('');
                      setShowHexInput(false);
                    }}
                  >
                    <Ionicons name="close" size={14} color={Colors.textSecondary} />
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.chipRow}>
                {(tool === 'eraser' ? ERASER_SIZE_PRESETS : PEN_WIDTH_PRESETS).map((size) => {
                  const selected = Math.abs((tool === 'eraser' ? eraserSize : penWidth) - size) < 0.01;
                  return (
                    <Pressable
                      key={`${tool}-size-${size}`}
                      style={[styles.toolChip, selected && styles.toolChipActive]}
                      onPress={() => {
                        if (tool === 'eraser') {
                          setEraserSize(size);
                        } else {
                          setPenWidth(size);
                        }
                      }}
                    >
                      <Text style={[styles.toolChipText, selected && styles.toolChipTextActive]}>
                        {tool === 'eraser' ? `${Math.round(size)} px` : `${size.toFixed(1)} px`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.toggleRow}>
                <Pressable
                  style={[styles.toggleChip, pressureSensitive && styles.toggleChipActive]}
                  onPress={() => setPressureSensitive((value) => !value)}
                >
                  <Text style={[styles.toggleChipText, pressureSensitive && styles.toggleChipTextActive]}>
                    Pressure
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleChip, stylusPriority && styles.toggleChipActive]}
                  onPress={() => setStylusPriority((value) => !value)}
                >
                  <Text style={[styles.toggleChipText, stylusPriority && styles.toggleChipTextActive]}>
                    Stylus Priority
                  </Text>
                </Pressable>
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.actionBtn, history.undo.length === 0 && styles.actionBtnDisabled]}
                  onPress={() => dispatch({ type: 'undo' })}
                  disabled={history.undo.length === 0}
                >
                  <Ionicons name="arrow-undo-outline" size={14} color={Colors.textSecondary} />
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, history.redo.length === 0 && styles.actionBtnDisabled]}
                  onPress={() => dispatch({ type: 'redo' })}
                  disabled={history.redo.length === 0}
                >
                  <Ionicons name="arrow-redo-outline" size={14} color={Colors.textSecondary} />
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, history.strokes.length === 0 && styles.actionBtnDisabled]}
                  onPress={() => dispatch({ type: 'clear' })}
                  disabled={history.strokes.length === 0}
                >
                  <Ionicons name="trash-outline" size={14} color={Colors.textSecondary} />
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, history.strokes.length === 0 && styles.actionBtnDisabled]}
                  onPress={() => {
                    if (history.strokes.length === 0) return;
                    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
                    const width = 900;
                    const height = 1200;
                    const inner = history.strokes
                      .map((stroke) => {
                        const path = smoothPathFromPoints(stroke.points);
                        const opacity = stroke.tool === 'highlighter' ? 0.36 : 0.92;
                        return `<path d="${path}" stroke="${stroke.color}" stroke-width="${stroke.width}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" />`;
                      })
                      .join('');
                    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${inner}</svg>`;
                    const blob = new Blob([svg], { type: 'image/svg+xml' });
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = `easeverse-ink-${Date.now()}.svg`;
                    document.body.appendChild(anchor);
                    anchor.click();
                    document.body.removeChild(anchor);
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                  disabled={history.strokes.length === 0}
                  accessibilityRole="button"
                  accessibilityLabel="Export ink as image"
                >
                  <Ionicons name="download-outline" size={14} color={Colors.textSecondary} />
                </Pressable>
              </View>

              <Text style={styles.metaText}>
                {history.strokes.length} stroke{history.strokes.length === 1 ? '' : 's'} • {enabled ? 'Drawing active' : 'Drawing paused'}
              </Text>

              <View style={styles.chipRow}>
                <Pressable
                  style={[styles.toolChip, stabilization && styles.toolChipActive]}
                  onPress={() => setStabilization((v) => !v)}
                  accessibilityRole="switch"
                  accessibilityLabel="Toggle brush stabilization"
                  accessibilityState={{ checked: stabilization }}
                >
                  <Ionicons
                    name="trending-down-outline"
                    size={12}
                    color={stabilization ? Colors.gradientStart : Colors.textSecondary}
                  />
                  <Text style={[styles.toolChipText, stabilization && styles.toolChipTextActive]}>
                    Stabilize
                  </Text>
                </Pressable>
              </View>

              {(onTranscribe || onDetectedSections) && Platform.OS === 'web' ? (
                <View style={styles.chipRow}>
                  {onTranscribe ? (
                    <Pressable
                      style={[styles.toolChip, ocrBusy === 'transcribe' && styles.toolChipActive]}
                      disabled={history.strokes.length === 0 || ocrBusy !== null}
                      onPress={async () => {
                        setOcrError(null);
                        setOcrBusy('transcribe');
                        try {
                          const text = await transcribeStrokes(history.strokes);
                          onTranscribe?.(text);
                        } catch (err) {
                          setOcrError(
                            (err as Error).message || 'Transcription failed',
                          );
                        } finally {
                          setOcrBusy(null);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Convert handwriting to typed text"
                    >
                      <Ionicons
                        name={ocrBusy === 'transcribe' ? 'hourglass' : 'text-outline'}
                        size={12}
                        color={Colors.textSecondary}
                      />
                      <Text style={styles.toolChipText}>
                        {ocrBusy === 'transcribe' ? 'Reading…' : 'Convert ink'}
                      </Text>
                    </Pressable>
                  ) : null}
                  {onDetectedSections ? (
                    <Pressable
                      style={[styles.toolChip, ocrBusy === 'sections' && styles.toolChipActive]}
                      disabled={history.strokes.length === 0 || ocrBusy !== null}
                      onPress={async () => {
                        setOcrError(null);
                        setOcrBusy('sections');
                        try {
                          const sections = await detectSectionsFromStrokes(history.strokes);
                          onDetectedSections?.(sections);
                        } catch (err) {
                          setOcrError(
                            (err as Error).message || 'Section detection failed',
                          );
                        } finally {
                          setOcrBusy(null);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Detect verses and chorus from handwriting"
                    >
                      <Ionicons
                        name={ocrBusy === 'sections' ? 'hourglass' : 'list-outline'}
                        size={12}
                        color={Colors.textSecondary}
                      />
                      <Text style={styles.toolChipText}>
                        {ocrBusy === 'sections' ? 'Reading…' : 'Detect sections'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              {ocrError ? <Text style={styles.ocrErrorText}>{ocrError}</Text> : null}

              {tool === 'lasso' && selectedIds.length > 0 ? (
                <View style={styles.selectionBar}>
                  <Text style={styles.selectionText}>
                    {selectedIds.length} stroke{selectedIds.length === 1 ? '' : 's'} selected
                  </Text>
                  <View style={styles.selectionActions}>
                    {(['up', 'down', 'left', 'right'] as const).map((dir) => (
                      <Pressable
                        key={dir}
                        style={styles.actionBtn}
                        onPress={() => {
                          const delta = 8;
                          const dx = dir === 'left' ? -delta : dir === 'right' ? delta : 0;
                          const dy = dir === 'up' ? -delta : dir === 'down' ? delta : 0;
                          const next = history.strokes.map((stroke) =>
                            selectedIds.includes(stroke.id)
                              ? createInkStroke(
                                  translateStroke(stroke, dx, dy).points,
                                  stroke.tool,
                                  stroke.color,
                                  stroke.width,
                                  pressureSensitive,
                                )
                              : stroke,
                          );
                          // Preserve IDs by overriding generated id from createInkStroke
                          const idMapped = next.map((stroke, idx) =>
                            history.strokes[idx]
                              ? { ...stroke, id: history.strokes[idx].id }
                              : stroke,
                          );
                          dispatch({ type: 'commit', next: idMapped });
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Nudge selection ${dir}`}
                      >
                        <Ionicons
                          name={
                            dir === 'up'
                              ? 'arrow-up'
                              : dir === 'down'
                                ? 'arrow-down'
                                : dir === 'left'
                                  ? 'arrow-back'
                                  : 'arrow-forward'
                          }
                          size={12}
                          color={Colors.textSecondary}
                        />
                      </Pressable>
                    ))}
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: Colors.dangerUnderline + '22' }]}
                      onPress={() => {
                        const next = history.strokes.filter(
                          (stroke) => !selectedIds.includes(stroke.id),
                        );
                        dispatch({ type: 'commit', next });
                        setSelectedIds([]);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Delete selected strokes"
                    >
                      <Ionicons name="trash" size={12} color={Colors.dangerUnderline} />
                    </Pressable>
                    <Pressable
                      style={styles.actionBtn}
                      onPress={() => setSelectedIds([])}
                      accessibilityRole="button"
                      accessibilityLabel="Clear lasso selection"
                    >
                      <Ionicons name="close" size={12} color={Colors.textSecondary} />
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          )}
        </View>
      </View>

      {stylusHintVisible && (
        <View style={styles.stylusHintWrap} pointerEvents="none">
          <Text style={styles.stylusHintText}>Stylus priority: use Apple Pencil for ink</Text>
        </View>
      )}

      <View
        style={StyleSheet.absoluteFill}
        pointerEvents={enabled ? 'auto' : 'none'}
        {...panResponder.panHandlers}
      >
        <Svg style={StyleSheet.absoluteFill}>
          {displayedStrokes.map((stroke) => {
            const selected = selectedIds.includes(stroke.id);
            return (
              <Path
                key={stroke.id}
                d={stroke.path}
                stroke={stroke.color}
                strokeWidth={selected ? stroke.width + 1.5 : stroke.width}
                strokeOpacity={selected ? Math.min(1, stroke.opacity + 0.2) : stroke.opacity}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
          {draftStroke && (
            <Path
              d={draftStroke.path}
              stroke={draftStroke.color}
              strokeWidth={draftStroke.width}
              strokeOpacity={draftStroke.opacity}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {lassoPath && lassoPath.length >= 2 && (
            <Path
              d={smoothPathFromPoints(lassoPath) + ' Z'}
              stroke={Colors.gradientStart}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              fill="rgba(255,122,24,0.08)"
            />
          )}
        </Svg>
        {enabled && tool === 'eraser' && eraserCursor && (
          <View
            pointerEvents="none"
            style={[
              styles.eraserCursor,
              {
                width: eraserSize * 2,
                height: eraserSize * 2,
                borderRadius: eraserSize,
                left: eraserCursor.x - eraserSize,
                top: eraserCursor.y - eraserSize,
              },
            ]}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layerRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 8,
  },
  toolbarWrap: {
    alignItems: 'flex-end',
    paddingTop: 8,
    paddingRight: 8,
  },
  toolbarCard: {
    minWidth: 206,
    maxWidth: 286,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(10,13,22,0.84)',
    padding: 10,
    gap: 8,
  },
  toolbarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  toolbarPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  toolbarPrimaryActive: {
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
  },
  toolbarPrimaryText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  toolbarPrimaryTextActive: {
    color: Colors.gradientStart,
  },
  iconBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  toolbarBody: {
    gap: 8,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  toolChipActive: {
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
  },
  toolChipText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  toolChipTextActive: {
    color: Colors.gradientStart,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  colorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
  },
  colorDotActive: {
    borderWidth: 2,
    borderColor: Colors.gradientStart,
    shadowColor: Colors.accentGlow,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  colorDotAdd: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.borderGlass,
  },
  hexInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  hexInputLabel: {
    color: Colors.textTertiary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  hexInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: Colors.textPrimary,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  hexAddBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gradientStart,
  },
  hexCancelBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  ocrErrorText: {
    color: Colors.dangerUnderline,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    marginTop: 4,
  },
  selectionBar: {
    marginTop: 8,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
    gap: 6,
  },
  selectionText: {
    color: Colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  selectionActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  highlighterSample: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  highlighterLabel: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  toggleChip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  toggleChipActive: {
    borderColor: Colors.accentBorder,
    backgroundColor: Colors.accentSubtle,
  },
  toggleChipText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  toggleChipTextActive: {
    color: Colors.gradientStart,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.surfaceGlass,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
  metaText: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
  },
  stylusHintWrap: {
    position: 'absolute',
    top: 90,
    right: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.warningUnderline,
    backgroundColor: 'rgba(250,204,21,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  stylusHintText: {
    color: Colors.warningUnderline,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  eraserCursor: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.8)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
});
