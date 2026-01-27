"use client";

import { useState, useRef, useEffect } from "react";

// Типы для Web Speech API
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

export default function VoiceRecorder({
  onTranscript,
  onError,
  disabled = false,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    // Проверяем поддержку Web Speech API
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      setIsSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false; // Останавливаем после паузы
      recognition.interimResults = true; // Показываем промежуточные результаты
      recognition.lang = "ru-RU"; // Русский язык

      recognition.onstart = () => {
        setIsRecording(true);
        setTranscript("");
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + " ";
          } else {
            interimTranscript += transcript;
          }
        }

        setTranscript(finalTranscript || interimTranscript);

        // Если есть финальный результат, отправляем его
        if (finalTranscript) {
          onTranscript(finalTranscript.trim());
          recognition.stop();
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error:", event.error);
        setIsRecording(false);
        if (onError) {
          let errorMessage = "Ошибка распознавания речи";
          switch (event.error) {
            case "no-speech":
              errorMessage = "Речь не обнаружена. Попробуйте еще раз.";
              break;
            case "audio-capture":
              errorMessage = "Не удалось получить доступ к микрофону.";
              break;
            case "not-allowed":
              errorMessage = "Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.";
              break;
            case "network":
              errorMessage = "Ошибка сети при распознавании речи.";
              break;
          }
          onError(errorMessage);
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    } else {
      setIsSupported(false);
      if (onError) {
        onError(
          "Ваш браузер не поддерживает распознавание речи. Используйте Chrome, Edge или Safari."
        );
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [onTranscript, onError]);

  const startRecording = () => {
    if (recognitionRef.current && !isRecording && !disabled) {
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error("Error starting recognition:", error);
        if (onError) {
          onError("Не удалось начать запись. Попробуйте еще раз.");
        }
      }
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
    }
  };

  if (!isSupported) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {isRecording && (
        <span className="text-sm text-gray-600 animate-pulse">
          {transcript || "Слушаю..."}
        </span>
      )}
      <button
        type="button"
        onClick={isRecording ? stopRecording : startRecording}
        disabled={disabled}
        className={`
          px-4 py-2 rounded-lg font-medium transition-all
          ${
            isRecording
              ? "bg-red-500 hover:bg-red-600 text-white"
              : "bg-blue-500 hover:bg-blue-600 text-white"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        `}
        title={isRecording ? "Остановить запись" : "Начать запись голоса"}
      >
        {isRecording ? (
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
            Остановить
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
            Голос
          </span>
        )}
      </button>
    </div>
  );
}
