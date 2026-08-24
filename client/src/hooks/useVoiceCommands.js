import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { processVoiceIntent } from '../api';

const useVoiceCommands = (user) => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const recognitionRef = useRef(null);
    const navigate = useNavigate();

    const processCommand = useCallback(async (text) => {
        const cmd = text.toLowerCase();

        try {
            // Send transcript to backend NLP engine
            const resp = await processVoiceIntent(text);
            const data = resp.data;
            
            // Dispatch custom event for App.jsx to handle complex intents
            if (data.intent !== 'UNKNOWN') {
                const event = new CustomEvent('voiceIntentParsed', { detail: data });
                window.dispatchEvent(event);
            } else {
                // Fallback to basic navigation if intent is unknown
                if (cmd.includes('apply') && cmd.includes('leave')) {
                    navigate('/leaves');
                } else if (cmd.includes('cancel') && cmd.includes('leave')) {
                    navigate('/cancellation');
                } else if (cmd.includes('holiday')) {
                    navigate('/holidays');
                } else if (user?.role === 'manager' && (cmd.includes('show employee') || cmd.includes('find'))) {
                    navigate('/employees');
                } else if (cmd.includes('dashboard') || cmd.includes('home')) {
                    navigate('/dashboard');
                }
            }
        } catch (err) {
            console.error("Voice parsing error", err);
        }
    }, [navigate, user]);

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error("Speech Recognition not supported in this browser.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            console.log("Voice recognition started...");
            setIsListening(true);
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            const currentText = finalTranscript || interimTranscript;
            console.log("Transcript received:", currentText);
            setTranscript(currentText);

            if (finalTranscript) {
                processCommand(finalTranscript);
            }
        };

        recognition.onerror = (event) => {
            console.error("Voice recognition error:", event.error);
            setIsListening(false);
            if (event.error === 'network') {
                console.warn("Voice API network error: usually caused by HTTP (instead of HTTPS) or browser speech server connection drops.");
                alert("Voice recognition error: The browser couldn't connect to the speech servers. This can happen on local development environments.");
            }
            try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
        };

        recognition.onend = () => {
            console.log("Voice recognition ended.");
            setIsListening(false);
        };

        recognitionRef.current = recognition;

        return () => {
            if (recognitionRef.current) recognitionRef.current.stop();
        };
    }, [processCommand]);

    const toggleListening = () => {
        if (!recognitionRef.current) return;
        if (isListening) {
            recognitionRef.current.stop();
        } else {
            recognitionRef.current.start();
        }
    };

    return { isListening, transcript, toggleListening };
};

export default useVoiceCommands;
