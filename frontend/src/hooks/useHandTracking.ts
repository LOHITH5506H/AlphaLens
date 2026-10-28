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
  twoHandScale: number; // e.g. 1.0 (clamped 0.5 - 2.8)
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

  // Position history for palm centroid velocity & swipe detection
  const swipeHistoryRef = useRef<{ x: number; y: number; time: number }[]>([]);
  const lastSwipeTimeRef = useRef<number>(0);
  const suppressStaticUntilRef = useRef<number>(0);

  // Speed calculation buffer
  const prevPalmRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const handSpeedRef = useRef<number>(0);

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
        prevPalmRef.current = null;
        handSpeedRef.current = 0;
        return;
      }

      const now = performance.now();

      // Hand 0 (Primary)
      const lm0 = hands[0];
      const thumbTip0 = lm0[4];
      const indexTip0 = lm0[8];
      const middleTip0 = lm0[12];
      const wrist0 = lm0[0];

      // Screen cursor position from index tip
      const primaryX = 1 - indexTip0.x;
      const primaryY = indexTip0.y;
      coordsRef.current.x = primaryX;
      coordsRef.current.y = primaryY;

      // Robust Palm Centroid for Motion & Swipe Tracking
      const palmX = 1 - (wrist0.x + lm0[5].x + lm0[9].x + lm0[17].x) / 4;
      const palmY = (wrist0.y + lm0[5].y + lm0[9].y + lm0[17].y) / 4;

      // Calculate instantaneous hand speed
      if (prevPalmRef.current) {
        const dtSec = (now - prevPalmRef.current.time) / 1000;
        if (dtSec > 0.01) {
          const moveDist = dist2D({ x: palmX, y: palmY }, prevPalmRef.current);
          const currentSpeed = moveDist / dtSec;
          handSpeedRef.current = handSpeedRef.current * 0.6 + currentSpeed * 0.4;
        }
      }
      prevPalmRef.current = { x: palmX, y: palmY, time: now };

      // Update position history for swipe detection
      swipeHistoryRef.current.push({ x: palmX, y: palmY, time: now });
      swipeHistoryRef.current = swipeHistoryRef.current.filter((p) => now - p.time <= 280);

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

      // ─────────────────────────────────────────────────────────────────────────
      // 1. Horizontal Swipe Detection (High Priority Motion Gesture)
      // ─────────────────────────────────────────────────────────────────────────
      let detectedSwipe: "left" | "right" | null = null;
      if (
        !isIndexPinching0 &&
        !isMiddlePinching0 &&
        swipeHistoryRef.current.length >= 3 &&
        now - lastSwipeTimeRef.current > 750
      ) {
        const oldest = swipeHistoryRef.current[0];
        const dx = palmX - oldest.x;
        const dy = palmY - oldest.y;
        const dt = (now - oldest.time) / 1000;
        const vx = dt > 0 ? dx / dt : 0;

        // Decisive horizontal swipe: fast velocity, horizontal displacement dominates vertical
        if (Math.abs(dx) > 0.13 && Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(vx) > 0.55) {
          detectedSwipe = dx > 0 ? "right" : "left";
          lastSwipeTimeRef.current = now;
          // CRUCIAL: Suppress static gestures (especially open palm) during/after swiping
          suppressStaticUntilRef.current = now + 900;
          holdGestureRef.current = { type: "none", startTime: 0, triggered: false };
        }
      }

      // Check whether hand is currently moving quickly
      const isHandInMotion = handSpeedRef.current > 0.28 || now < suppressStaticUntilRef.current;

      // ─────────────────────────────────────────────────────────────────────────
      // 2. Anatomical Finger Pose Classifiers
      // ─────────────────────────────────────────────────────────────────────────
      // Extended checks: Tip significantly farther from wrist than PIP
      const isIndexExt = dist3D(lm0[8], wrist0) > dist3D(lm0[6], wrist0) * 1.25;
      const isMiddleExt = dist3D(lm0[12], wrist0) > dist3D(lm0[10], wrist0) * 1.25;
      const isRingExt = dist3D(lm0[16], wrist0) > dist3D(lm0[14], wrist0) * 1.25;
      const isPinkyExt = dist3D(lm0[20], wrist0) > dist3D(lm0[18], wrist0) * 1.25;

      // Curled checks: Tip tucked near MCP or wrist
      const isIndexCurled =
        dist3D(lm0[8], lm0[5]) < dist3D(lm0[6], lm0[5]) * 1.15 ||
        dist3D(lm0[8], wrist0) < dist3D(lm0[6], wrist0) * 1.05;
      const isMiddleCurled =
        dist3D(lm0[12], lm0[9]) < dist3D(lm0[10], lm0[9]) * 1.15 ||
        dist3D(lm0[12], wrist0) < dist3D(lm0[10], wrist0) * 1.05;
      const isRingCurled =
        dist3D(lm0[16], lm0[13]) < dist3D(lm0[14], lm0[13]) * 1.15 ||
        dist3D(lm0[16], wrist0) < dist3D(lm0[14], wrist0) * 1.05;
      const isPinkyCurled =
        dist3D(lm0[20], lm0[17]) < dist3D(lm0[18], lm0[17]) * 1.15 ||
        dist3D(lm0[20], wrist0) < dist3D(lm0[18], wrist0) * 1.05;

      const allFourFingersCurled = isIndexCurled && isMiddleCurled && isRingCurled && isPinkyCurled;
      const allFourFingersExtended = isIndexExt && isMiddleExt && isRingExt && isPinkyExt;

      // ─────────────────────────────────────────────────────────────────────────
      // 3. Pose Classification
      // ─────────────────────────────────────────────────────────────────────────
      let detectedPose: GestureType = "none";

      if (isTwoHandPinchActive) {
        detectedPose = "two_hand_manipulation";
      } else if (isIndexPinching0) {
        detectedPose = "pinch";
      } else if (isMiddlePinching0) {
        detectedPose = "middle_pinch";
      } else if (allFourFingersCurled) {
        const thumbTip = lm0[4];
        const thumbIP = lm0[3];
        const thumbMCP = lm0[2];

        // Is thumb tucked against fingers (Fist)?
        const thumbTucked = dist3D(thumbTip, lm0[9]) < 0.14 || dist3D(thumbTip, lm0[10]) < 0.14;

        if (
          !isHandInMotion &&
          thumbTip.y < thumbIP.y - 0.035 &&
          thumbIP.y < thumbMCP.y &&
          thumbTip.y < wrist0.y - 0.08 &&
          Math.abs(thumbTip.x - thumbMCP.x) < 0.1
        ) {
          detectedPose = "bull_thumbs_up";
        } else if (
          !isHandInMotion &&
          thumbTip.y > thumbIP.y + 0.035 &&
          thumbIP.y > thumbMCP.y &&
          thumbTip.y > wrist0.y + 0.08 &&
          Math.abs(thumbTip.x - thumbMCP.x) < 0.1
        ) {
          detectedPose = "bear_thumbs_down";
        } else if (thumbTucked || dist3D(thumbTip, wrist0) < 0.18) {
          // Robust Fist / Simulation Hold
          detectedPose = "fist";
        }
      } else if (isIndexExt && isMiddleExt && isRingCurled && isPinkyCurled) {
        const indexMiddleDist = dist2D(lm0[8], lm0[12]);
        if (!isHandInMotion && indexMiddleDist > 0.055) {
          detectedPose = "v_sign";
        } else {
          detectedPose = "two_finger_point";
        }
      } else if (allFourFingersExtended) {
        const thumbPinkyDist = dist2D(lm0[4], lm0[17]);
        // Strict Open Palm: Must be stationary, not in swipe motion, thumb spread
        if (!isHandInMotion && thumbPinkyDist > 0.14) {
          detectedPose = "open_palm";
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // 4. Discrete Action Hold State-Machine (Prevents False Triggers)
      // ─────────────────────────────────────────────────────────────────────────
      // Strict hold thresholds: Open Palm requires deliberate 480ms hold
      const HOLD_THRESHOLDS: Record<string, number> = {
        open_palm: 480,
        bull_thumbs_up: 350,
        bear_thumbs_down: 350,
        v_sign: 400,
        fist: 100, // Fist activates quickly to pause simulation instantly
      };

      const requiredHold = HOLD_THRESHOLDS[detectedPose] ?? 350;
      const ACTION_COOLDOWN_MS = detectedPose === "open_palm" ? 1200 : 900;

      if (
        detectedPose === "bull_thumbs_up" ||
        detectedPose === "bear_thumbs_down" ||
        detectedPose === "v_sign" ||
        detectedPose === "open_palm" ||
        detectedPose === "fist"
      ) {
        if (holdGestureRef.current.type !== detectedPose) {
          holdGestureRef.current = { type: detectedPose, startTime: now, triggered: false };
        } else if (
          !holdGestureRef.current.triggered &&
          now - holdGestureRef.current.startTime >= requiredHold &&
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
          } else if (detectedPose === "fist") {
            showFeedback("⏸️ Simulation Frozen (Hold Fist)");
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
