"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function useVoiceInput(options?: {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  lang?: string;
}) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const baseTextRef = useRef("");
  const onInterimRef = useRef(options?.onInterim);
  const onFinalRef = useRef(options?.onFinal);
  onInterimRef.current = options?.onInterim;
  onFinalRef.current = options?.onFinal;
  const lang = options?.lang ?? "en-US";

  useEffect(() => {
    setIsSupported(getSpeechRecognition() !== null);
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const start = useCallback(
    (currentInput: string) => {
      const Ctor = getSpeechRecognition();
      if (!Ctor) return;

      stop();
      baseTextRef.current = currentInput.trim();

      const recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        let finalChunk = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0]?.transcript ?? "";
          if (event.results[i].isFinal) {
            finalChunk += transcript;
          } else {
            interim += transcript;
          }
        }

        const prefix = baseTextRef.current;
        const sep = prefix && (finalChunk || interim) ? " " : "";

        if (interim) {
          onInterimRef.current?.(
            `${prefix}${sep}${finalChunk}${finalChunk && interim ? " " : ""}${interim}`.trim(),
          );
        }

        if (finalChunk) {
          const merged = `${prefix}${sep}${finalChunk}`.trim();
          baseTextRef.current = merged;
          onFinalRef.current?.(merged);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    },
    [lang, stop],
  );

  const toggle = useCallback(
    (currentInput: string) => {
      if (isListening) {
        stop();
      } else {
        start(currentInput);
      }
    },
    [isListening, start, stop],
  );

  useEffect(() => () => stop(), [stop]);

  return { isListening, isSupported, start, stop, toggle };
}
