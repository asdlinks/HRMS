import api from './client';

export const processVoiceIntent = (transcript: string) => api.post('/voice/intent', { transcript });
export const processVoiceExecution = (data: object) => api.post('/voice/execute', data);
