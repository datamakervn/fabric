import axios from 'axios';

// FORCE URL - không dùng env để test
const API_BASE_URL = 'http://localhost:3001';

console.log('🔗 API Base URL:', API_BASE_URL);

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor
apiClient.interceptors.request.use(
  (config) => {
    console.log(`📤 API Request: ${config.method.toUpperCase()} ${config.baseURL}${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor
apiClient.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response:`, response.status, response.data);
    return response;
  },
  (error) => {
    console.error('❌ Response Error:', {
      message: error.message,
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data
    });
    return Promise.reject(error);
  }
);

export const chatAPI = {
  // Health check
  healthCheck: async () => {
    try {
      console.log('🏥 Checking backend health...');
      const response = await apiClient.get('/health');
      console.log('✅ Backend is healthy!');
      return response.data;
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      throw new Error('Backend is not available');
    }
  },

  // Create new session
  createSession: async () => {
    try {
      console.log('🆕 Creating new session...');
      const response = await apiClient.post('/api/chat/session');
      console.log('✅ Session created:', response.data.sessionId);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to create session:', error.message);
      throw new Error('Failed to create session');
    }
  },

  // Get session
  getSession: async (sessionId) => {
    try {
      console.log('🔍 Getting session:', sessionId);
      const response = await apiClient.get(`/api/chat/session/${sessionId}`);
      return response.data;
    } catch (error) {
      console.error('❌ Session not found:', error.message);
      throw new Error('Session not found');
    }
  },

  // Send message to chatbot
  sendMessage: async (message, sessionId) => {
    try {
      console.log('💬 Sending message:', message);
      const response = await apiClient.post('/api/chat', {
        message,
        sessionId,
      });
      return response.data;
    } catch (error) {
      console.error('❌ Failed to send message:', error.message);
      throw new Error(error.response?.data?.error || 'Failed to send message');
    }
  },

  // Delete session
  deleteSession: async (sessionId) => {
    try {
      const response = await apiClient.delete(`/api/chat/session/${sessionId}`);
      return response.data;
    } catch (error) {
      throw new Error('Failed to delete session');
    }
  },

  // Get dataset metadata
  getMetadata: async () => {
    try {
      const response = await apiClient.get('/api/chat/metadata');
      return response.data;
    } catch (error) {
      throw new Error('Failed to fetch metadata');
    }
  },

  // Debug: List all sessions
  getAllSessions: async () => {
    try {
      const response = await apiClient.get('/api/chat/sessions');
      return response.data;
    } catch (error) {
      throw new Error('Failed to get sessions');
    }
  },
};

export default apiClient;