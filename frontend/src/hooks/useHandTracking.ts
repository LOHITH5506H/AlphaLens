import { useEffect, useRef, useState, useCallback } from "react";
import * as mpHands from "@mediapipe/hands";
import * as mpCam from "@mediapipe/camera_utils";

export type GestureType =
  | "none"
  | "pinch"
  | "middle_pinch"
  | "bull_thumbs_up"
  | "bear_thumbs_down"
  | "v_sign"
  | "open_palm"
  | "fist"
  | "two_finger_point"
  | "two_hand_manipulation"
  | "swipe_left"
  | "swipe_right";

export interface HandGestureState {
  activeGesture: GestureType;
  isPinching: boolean;
  isMiddlePinching: boolean;
  swipeDirection: "left" | "right" | null;
  isVisible: boolean;
  handCount: number;
  twoHandScale: number; // e.g. 1.0 (clamped 0.5 - 2.5)
  twoHandRotation: number; // in radians
  gestureFeedback: string | null;
  isTwoHandPinching: boolean;
}

export interface HandTrackingCoords {
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  hasSecondHand: boolean;
}

// Distance helper functions
function dist2D(p1: { x: number; y: number }, p2: { x: number; y: number }) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function dist3D(p1: { x: number; y: number; z?: number }, p2: { x: number; y: number; z?: number }) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z ?? 0) - (p2.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function useHandTracking(enabled: boolean = true) {
  const [gestureState, setGestureState] = useState<HandGestureState>({
    activeGesture: "none",
    isPinching: false,
    isMiddlePinching: false,
    swipeDirection: null,
    isVisible: false,
    handCount: 0,
    twoHandScale: 1.0,
    twoHandRotation: 0,
    gestureFeedback: null,
    isTwoHandPinching: false,
  });

  const coordsRef = useRef<HandTrackingCoords>({ x: 0, y: 0, hasSecondHand: false });

  const handsRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isAliveRef = useRef(false);

  const pinchStateRef = useRef({ index: false, middle: false });
  const rafRef = useRef<number>(0);

  // Position history for swipe detection
  const historyRef = useRef<{ x: number; y: number; time: number }[]>([]);
  const lastSwipeTimeRef = useRef<number>(0);

  // Discrete gesture hold & trigger tracking
  const holdGestureRef = useRef<{
    type: GestureType;
    startTime: number;
    triggered: boolean;
  }>({ type: "none", startTime: 0, triggered: false });

  const lastActionTriggerTimeRef = useRef<number>(0);
  const feedbackTimeoutRef = useRef<any>(null);

  // Two-hand manipulation refs
  const twoHandBaseRef = useRef<{
    initialDist: number;
    initialAngle: number;
    baseScale: number;
    baseRotation: number;
  } | null>(null);

  const scaleRef = useRef<number>(1.0);
  const rotationRef = useRef<number>(0);

  const showFeedback = useCallback((msg: string) => {
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    setGestureState((prev) => ({ ...prev, gestureFeedback: msg }));
    feedbackTimeoutRef.current = setTimeout(() => {
      setGestureState((prev) => ({ ...prev, gestureFeedback: null }));
    }, 2400);
  }, []);

  const onResults = useCallback((results: any) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    rafRef.current = requestAnimationFrame(() => {
      const hands = results.multiHandLandmarks;
      const handCount = hands ? hands.length : 0;

      if (!hands || handCount === 0) {
        setGestureState((prev) => {
          if (!prev.isVisible && prev.activeGesture === "none") return prev;
          return {
            ...prev,
            isVisible: false,
            activeGesture: "none",
            swipeDirection: null,
            isPinching: false,
            isMiddlePinching: false,
            handCount: 0,
            isTwoHandPinching: false,
          };
        });
        pinchStateRef.current = { index: false, middle: false };
        twoHandBaseRef.current = null;
        coordsRef.current.hasSecondHand = false;
        holdGestureRef.current = { type: "none", startTime: 0, triggered: false };
        return;
      }

      const now = performance.now();

      // Hand 0 (Primary)
      const lm0 = hands[0];
      const thumbTip0 = lm0[4];
      const indexTip0 = lm0[8];
      const middleTip0 = lm0[12];

      const primaryX = 1 - indexTip0.x;
      const primaryY = indexTip0.y;

      coordsRef.current.x = primaryX;
      coordsRef.current.y = primaryY;

      // Update position history for swipe detection
      historyRef.current.push({ x: primaryX, y: primaryY, time: now });
      if (historyRef.current.length > 25) {
        historyRef.current = historyRef.current.slice(-25);
      }
      historyRef.current = historyRef.current.filter((p) => now - p.time <= 300);

      // Check pinches for primary hand
      const PINCH_ENGAGE = 0.042;
      const PINCH_RELEASE = 0.065;

      const indexDist0 = dist3D(indexTip0, thumbTip0);
      const middleDist0 = dist3D(middleTip0, thumbTip0);

      let isIndexPinching0 = pinchStateRef.current.index;
      if (!isIndexPinching0 && indexDist0 < PINCH_ENGAGE) isIndexPinching0 = true;
      else if (isIndexPinching0 && indexDist0 > PINCH_RELEASE) isIndexPinching0 = false;

      let isMiddlePinching0 = pinchStateRef.current.middle;
      if (!isMiddlePinching0 && middleDist0 < PINCH_ENGAGE) isMiddlePinching0 = true;
      else if (isMiddlePinching0 && middleDist0 > PINCH_RELEASE) isMiddlePinching0 = false;

      pinchStateRef.current = { index: isIndexPinching0, middle: isMiddlePinching0 };

      // Bimanual 2-Hand Tracking
      let isTwoHandPinchActive = false;
      if (handCount >= 2) {
        const lm1 = hands[1];
        const thumbTip1 = lm1[4];
        const indexTip1 = lm1[8];

        const secondaryX = 1 - indexTip1.x;
        const secondaryY = indexTip1.y;

        coordsRef.current.x2 = secondaryX;
        coordsRef.current.y2 = secondaryY;
        coordsRef.current.hasSecondHand = true;

        const indexDist1 = dist3D(indexTip1, thumbTip1);
        const isIndexPinching1 = indexDist1 < PINCH_RELEASE;

        if (isIndexPinching0 && isIndexPinching1) {
          isTwoHandPinchActive = true;
          const currentDist = dist2D(
            { x: primaryX, y: primaryY },
            { x: secondaryX, y: secondaryY }
          );
          const currentAngle = Math.atan2(secondaryY - primaryY, secondaryX - primaryX);

          if (!twoHandBaseRef.current) {
            twoHandBaseRef.current = {
              initialDist: Math.max(currentDist, 0.08),
              initialAngle: currentAngle,
              baseScale: scaleRef.current,
              baseRotation: rotationRef.current,
            };
          } else {
            const ratio = currentDist / twoHandBaseRef.current.initialDist;
            const newScale = Math.max(0.4, Math.min(2.8, twoHandBaseRef.current.baseScale * ratio));
            const angleDelta = currentAngle - twoHandBaseRef.current.initialAngle;
            const newRot = twoHandBaseRef.current.baseRotation + angleDelta;

            scaleRef.current = newScale;
            rotationRef.current = newRot;
          }
        } else {
          twoHandBaseRef.current = null;
        }
      } else {
        coordsRef.current.hasSecondHand = false;
        twoHandBaseRef.current = null;
      }

      // Geometric finger extension classifiers for Hand 0
      const wrist = lm0[0];
      const isIndexExt = dist3D(lm0[8], wrist) > dist3D(lm0[6], wrist) * 1.15;
      const isMiddleExt = dist3D(lm0[12], wrist) > dist3D(lm0[10], wrist) * 1.15;
      const isRingExt = dist3D(lm0[16], wrist) > dist3D(lm0[14], wrist) * 1.15;
      const isPinkyExt = dist3D(lm0[20], wrist) > dist3D(lm0[18], wrist) * 1.15;

      const isIndexCurled = dist3D(lm0[8], wrist) < dist3D(lm0[6], wrist) * 1.05;
      const isMiddleCurled = dist3D(lm0[12], wrist) < dist3D(lm0[10], wrist) * 1.05;
      const isRingCurled = dist3D(lm0[16], wrist) < dist3D(lm0[14], wrist) * 1.05;
      const isPinkyCurled = dist3D(lm0[20], wrist) < dist3D(lm0[18], wrist) * 1.05;

      const allFingersCurled = isIndexCurled && isMiddleCurled && isRingCurled && isPinkyCurled;
      const allFingersExtended = isIndexExt && isMiddleExt && isRingExt && isPinkyExt;

      // Identify Current Pose Candidate
      let detectedPose: GestureType = "none";

      if (isTwoHandPinchActive) {
        detectedPose = "two_hand_manipulation";
      } else if (isIndexPinching0) {
        detectedPose = "pinch";
      } else if (isMiddlePinching0) {
        detectedPose = "middle_pinch";
      } else if (allFingersCurled) {
        // Check Thumbs Up / Thumbs Down / Fist
        const thumbTip = lm0[4];
        const thumbIP = lm0[3];
        const thumbMCP = lm0[2];

        // Upright screen space: lower y means higher on screen
        if (thumbTip.y < thumbIP.y && thumbIP.y < thumbMCP.y && thumbTip.y < wrist.y - 0.07) {
          detectedPose = "bull_thumbs_up";
        } else if (thumbTip.y > thumbIP.y && thumbIP.y > thumbMCP.y && thumbTip.y > wrist.y + 0.07) {
          detectedPose = "bear_thumbs_down";
        } else if (dist3D(thumbTip, lm0[9]) < 0.14) {
          detectedPose = "fist";
        }
      } else if (isIndexExt && isMiddleExt && isRingCurled && isPinkyCurled) {
        // V-Sign or Two-Finger Point
        const indexMiddleDist = dist2D(lm0[8], lm0[12]);
        if (indexMiddleDist > 0.055) {
          detectedPose = "v_sign";
        } else {
          detectedPose = "two_finger_point";
        }
      } else if (allFingersExtended) {
        const thumbPinkyDist = dist2D(lm0[4], lm0[17]);
        if (thumbPinkyDist > 0.13) {
          detectedPose = "open_palm";
        }
      }

      // Check Swipe Detection (when hand is in open or pointing posture)
      let detectedSwipe: "left" | "right" | null = null;
      if (
        !isIndexPinching0 &&
        !isMiddlePinching0 &&
        historyRef.current.length >= 4 &&
        now - lastSwipeTimeRef.current > 700
      ) {
        const oldest = historyRef.current[0];
        const dx = primaryX - oldest.x;
        const dy = primaryY - oldest.y;
        const dt = (now - oldest.time) / 1000;
        const vx = dt > 0 ? dx / dt : 0;

        if (Math.abs(dx) > 0.16 && Math.abs(dx) > Math.abs(dy) * 1.7 && Math.abs(vx) > 0.6) {
          detectedSwipe = dx > 0 ? "right" : "left";
          lastSwipeTimeRef.current = now;
          showFeedback(
            detectedSwipe === "right" ? "↔ Switched to Trader" : "↔ Switched to Investor"
          );
        }
      }

      // Discrete Action State Machine (Debounce & Continuous Hold)
      const HOLD_THRESHOLD_MS = 220;
      const ACTION_COOLDOWN_MS = 900;

      let triggeredActionPose: GestureType = detectedPose;

      if (
        detectedPose === "bull_thumbs_up" ||
        detectedPose === "bear_thumbs_down" ||
        detectedPose === "v_sign" ||
        detectedPose === "open_palm"
      ) {
        if (holdGestureRef.current.type !== detectedPose) {
          holdGestureRef.current = { type: detectedPose, startTime: now, triggered: false };
        } else if (
          !holdGestureRef.current.triggered &&
          now - holdGestureRef.current.startTime >= HOLD_THRESHOLD_MS &&
          now - lastActionTriggerTimeRef.current >= ACTION_COOLDOWN_MS
        ) {
          holdGestureRef.current.triggered = true;
          lastActionTriggerTimeRef.current = now;

          if (detectedPose === "bull_thumbs_up") {
            showFeedback("🚀 FinBERT Bull Shock Triggered");
          } else if (detectedPose === "bear_thumbs_down") {
            showFeedback("⚠️ FinBERT Bear Stress Shock Triggered");
          } else if (detectedPose === "v_sign") {
            showFeedback("🎬 Pitch Studio / IC Debate Toggled");
          } else if (detectedPose === "open_palm") {
            showFeedback("✋ Spatial HUD Toggled");
          }
        }
      } else {
        holdGestureRef.current = { type: "none", startTime: 0, triggered: false };
      }

      setGestureState((prev) => {
        const scaleChanged = Math.abs(prev.twoHandScale - scaleRef.current) > 0.015;
        const rotChanged = Math.abs(prev.twoHandRotation - rotationRef.current) > 0.02;

        if (
          prev.activeGesture === detectedPose &&
          prev.isPinching === isIndexPinching0 &&
          prev.isMiddlePinching === isMiddlePinching0 &&
          prev.swipeDirection === detectedSwipe &&
          prev.isVisible === true &&
          prev.handCount === handCount &&
          prev.isTwoHandPinching === isTwoHandPinchActive &&
          !scaleChanged &&
          !rotChanged
        ) {
          return prev;
        }

        return {
          ...prev,
          activeGesture: detectedPose,
          isPinching: isIndexPinching0,
          isMiddlePinching: isMiddlePinching0,
          swipeDirection: detectedSwipe,
          isVisible: true,
          handCount,
          twoHandScale: scaleRef.current,
          twoHandRotation: rotationRef.current,
          isTwoHandPinching: isTwoHandPinchActive,
        };
      });
    });
  }, [showFeedback]);

  useEffect(() => {
    if (!enabled) {
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
      setGestureState((prev) => ({
        ...prev,
        isVisible: false,
        activeGesture: "none",
        handCount: 0,
        isTwoHandPinching: false,
      }));
      return;
    }

    const HandsClass = mpHands.Hands || (mpHands as any).default?.Hands || (window as any).Hands;
    const CameraClass = mpCam.Camera || (mpCam as any).default?.Camera || (window as any).Camera;

    if (!HandsClass || !CameraClass) {
      console.error("[AlphaLens] MediaPipe constructors not found.");
      return;
    }

    isAliveRef.current = true;

    const hands = new HandsClass({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    // Enabled multi-hand tracking (max 2 hands for bimanual manipulation)
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.65,
      minTrackingConfidence: 0.65,
    });

    hands.onResults(onResults);
    handsRef.current = hands;

    let videoElement = document.querySelector("#mindar-container video") as HTMLVideoElement;
    let isCustomVideo = false;

    if (!videoElement) {
      videoElement = document.createElement("video");
      videoElement.style.display = "none";
      document.body.appendChild(videoElement);
      isCustomVideo = true;
    }
    videoRef.current = videoElement;

    const camera = new CameraClass(videoElement, {
      onFrame: async () => {
        if (!isAliveRef.current || !handsRef.current || !videoRef.current) return;
        try {
          await handsRef.current.send({ image: videoRef.current });
        } catch (err: any) {
          if (!isAliveRef.current) return;
          console.warn("[AlphaLens] MediaPipe send error (safe to ignore):", err?.message);
        }
      },
      width: 640,
      height: 480,
    });

    camera.start();
    cameraRef.current = camera;

    return () => {
      isAliveRef.current = false;

      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);

      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }

      if (handsRef.current) {
        try {
          handsRef.current.close();
        } catch {}
        handsRef.current = null;
      }

      if (isCustomVideo && videoElement && videoElement.parentNode) {
        videoElement.parentNode.removeChild(videoElement);
      }
    };
  }, [enabled, onResults]);

  return { gestureState, coordsRef };
}
