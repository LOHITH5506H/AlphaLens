import { useEffect, useRef, useState, useCallback } from "react";
import * as mpHands from "@mediapipe/hands";
import * as mpCam from "@mediapipe/camera_utils";

export interface HandGestureState {
  isPinching: boolean;
  isMiddlePinching: boolean;
  swipeDirection: "left" | "right" | null;
  isVisible: boolean;
}

export function useHandTracking(enabled: boolean = true) {
  const [gestureState, setGestureState] = useState<HandGestureState>({
    isPinching: false,
    isMiddlePinching: false,
    swipeDirection: null,
    isVisible: false,
  });

  const coordsRef = useRef({ x: 0, y: 0 });

  const handsRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const pinchStateRef = useRef({ index: false, middle: false });
  const rafRef = useRef<number>(0);

  const onResults = useCallback((results: any) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    rafRef.current = requestAnimationFrame(() => {
      if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        setGestureState((prev) => {
          if (!prev.isVisible) return prev;
          return { ...prev, isVisible: false, swipeDirection: null, isPinching: false, isMiddlePinching: false };
        });
        pinchStateRef.current = { index: false, middle: false };
        return;
      }

      const landmarks = results.multiHandLandmarks[0];
      
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const middleTip = landmarks[12];

      const x = 1 - indexTip.x;
      const y = indexTip.y;
      
      // Update coordinates in ref (no React re-render)
      coordsRef.current = { x, y };

      // Distances
      const indexDist = Math.sqrt(
        Math.pow(indexTip.x - thumbTip.x, 2) + Math.pow(indexTip.y - thumbTip.y, 2) + Math.pow(indexTip.z - thumbTip.z, 2)
      );
      const middleDist = Math.sqrt(
        Math.pow(middleTip.x - thumbTip.x, 2) + Math.pow(middleTip.y - thumbTip.y, 2) + Math.pow(middleTip.z - thumbTip.z, 2)
      );

      // Hysteresis thresholds
      const PINCH_ENGAGE = 0.04;
      const PINCH_RELEASE = 0.06;

      let isIndexPinching = pinchStateRef.current.index;
      if (!isIndexPinching && indexDist < PINCH_ENGAGE) isIndexPinching = true;
      else if (isIndexPinching && indexDist > PINCH_RELEASE) isIndexPinching = false;

      let isMiddlePinching = pinchStateRef.current.middle;
      if (!isMiddlePinching && middleDist < PINCH_ENGAGE) isMiddlePinching = true;
      else if (isMiddlePinching && middleDist > PINCH_RELEASE) isMiddlePinching = false;

      pinchStateRef.current = { index: isIndexPinching, middle: isMiddlePinching };

      setGestureState((prev) => {
        if (
          prev.isPinching === isIndexPinching &&
          prev.isMiddlePinching === isMiddlePinching &&
          prev.isVisible === true
        ) {
          return prev;
        }
        return {
          isPinching: isIndexPinching,
          isMiddlePinching: isMiddlePinching,
          swipeDirection: null,
          isVisible: true,
        };
      });
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
      setGestureState((prev) => ({ ...prev, isVisible: false }));
      return;
    }

    const HandsClass = mpHands.Hands || (mpHands as any).default?.Hands || (window as any).Hands;
    const CameraClass = mpCam.Camera || (mpCam as any).default?.Camera || (window as any).Camera;

    if (!HandsClass || !CameraClass) {
        console.error("[AlphaLens] MediaPipe constructors not found.");
        return;
    }

    // Initialize Hands
    const hands = new HandsClass({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      },
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    hands.onResults(onResults);
    handsRef.current = hands;

    // Find or create video element
    let videoElement = document.querySelector("#mindar-container video") as HTMLVideoElement;
    
    // If MindAR video isn't available, create a hidden one
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
        if (handsRef.current && videoRef.current) {
          await handsRef.current.send({ image: videoRef.current });
        }
      },
      width: 640,
      height: 480,
    });
    
    camera.start();
    cameraRef.current = camera;

    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
      if (handsRef.current) {
        handsRef.current.close();
      }
      if (isCustomVideo && videoElement && videoElement.parentNode) {
        videoElement.parentNode.removeChild(videoElement);
      }
    };
  }, [enabled, onResults]);

  return { gestureState, coordsRef };
}
