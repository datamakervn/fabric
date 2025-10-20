import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Database, AlertCircle, RefreshCw } from 'lucide-react';
import { chatAPI } from '../services/api';
import './ChatWindow.css';

const ChatWindow = ({ embedded = false }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [sessionId, setSessionId] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const messagesEndRef = useRef(null);
  const lastMessageCountRef = useRef(0);
  const initRef = useRef(false);

  // Storage keys
  const STORAGE_KEYS = {
    SESSION_ID: 'powerbi_chatbot_session_id',
    MESSAGES: 'powerbi_chatbot_messages',
    LAST_ACTIVITY: 'powerbi_chatbot_last_activity',
  };

  // Parse markdown to HTML
  const parseMarkdown = (text) => {
    if (!text) return text;

    let html = text;

    // Headers
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Code blocks
    html = html.replace(/```(\w+)?\n([\s\S]+?)```/g, '<pre><code>$2</code></pre>');
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Lists - handle multiple items
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]+?<\/li>)/g, '<ul>$1</ul>');

    // Horizontal rule
    html = html.replace(/^---$/gm, '<hr/>');

    // Format numbers with commas
    html = html.replace(/(\d{1,3}(?:\.\d{2})?)\s*(tỷ|triệu|nghìn)/gi, 
      '<span class="number">$1 $2</span>');

    // Format percentages
    html = html.replace(/(\d+(?:\.\d+)?)\s*%/g, 
      '<span class="percentage">$1%</span>');

    // Line breaks
    html = html.replace(/\n\n/g, '<br/><br/>');
    html = html.replace(/\n/g, '<br/>');

    return html;
  };

  // Initialize session on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    initializeSession();
  }, []);

  // Auto-scroll when new messages
  useEffect(() => {
    if (messages.length > lastMessageCountRef.current) {
      scrollToBottom();
      lastMessageCountRef.current = messages.length;
    }
  }, [messages]);

  // Save messages to sessionStorage
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      try {
        sessionStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
        sessionStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, new Date().toISOString());
        console.log('💾 Saved', messages.length, 'messages to sessionStorage');
      } catch (error) {
        console.error('Failed to save to sessionStorage:', error);
      }
    }
  }, [messages, sessionId, STORAGE_KEYS.MESSAGES, STORAGE_KEYS.LAST_ACTIVITY]);

  const initializeSession = async () => {
    try {
      console.log('🔄 Initializing chatbot session...');
      
      await chatAPI.healthCheck();
      setBackendStatus('online');

      const storedSessionId = sessionStorage.getItem(STORAGE_KEYS.SESSION_ID);
      const storedMessages = sessionStorage.getItem(STORAGE_KEYS.MESSAGES);
      const lastActivity = sessionStorage.getItem(STORAGE_KEYS.LAST_ACTIVITY);

      let session;

      if (storedSessionId && lastActivity) {
        const timeSinceActivity = Date.now() - new Date(lastActivity).getTime();
        const twoHours = 2 * 60 * 60 * 1000;

        if (timeSinceActivity < twoHours) {
          try {
            console.log(`🔍 Restoring session: ${storedSessionId}`);
            const response = await chatAPI.getSession(storedSessionId);
            session = response.session;
            
            if (storedMessages) {
              const parsedMessages = JSON.parse(storedMessages);
              if (parsedMessages.length >= session.messages.length) {
                session.messages = parsedMessages;
                console.log(`✅ Restored ${parsedMessages.length} messages from storage`);
              }
            }
          } catch (error) {
            console.log(`⚠️ Could not restore session, creating new one`);
          }
        }
      }

      if (!session) {
        const newSessionResponse = await chatAPI.createSession();
        session = { 
          id: newSessionResponse.sessionId, 
          messages: newSessionResponse.messages 
        };
        console.log(`✅ Created new session: ${session.id}`);
      }

      sessionStorage.setItem(STORAGE_KEYS.SESSION_ID, session.id);
      sessionStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(session.messages));
      sessionStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, new Date().toISOString());

      setSessionId(session.id);
      setMessages(session.messages);

    } catch (error) {
      console.error('❌ Session initialization error:', error);
      setBackendStatus('offline');
      setError('Không thể kết nối tới backend. Vui lòng kiểm tra server đang chạy.');
    } finally {
      setIsInitializing(false);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !sessionId) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);
    
    const tempUserMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMessage]);

    setIsLoading(true);

    try {
      const response = await chatAPI.sendMessage(userMessage, sessionId);

      const assistantMessage = {
        role: 'assistant',
        content: response.response,
        timestamp: new Date().toISOString(),
        metadata: response.metadata,
        data: response.data,
      };
      
      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error('Chat error:', error);
      setError(error.message);
      
      const errorMessage = {
        role: 'assistant',
        content: `❌ Xin lỗi, đã có lỗi xảy ra: ${error.message}\n\nVui lòng thử lại sau.`,
        timestamp: new Date().toISOString(),
        isError: true,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearHistory = async () => {
    if (window.confirm('Bạn có chắc muốn bắt đầu chat mới? Lịch sử chat sẽ bị xóa.')) {
      try {
        if (sessionId) {
          await chatAPI.deleteSession(sessionId);
        }

        sessionStorage.removeItem(STORAGE_KEYS.SESSION_ID);
        sessionStorage.removeItem(STORAGE_KEYS.MESSAGES);
        sessionStorage.removeItem(STORAGE_KEYS.LAST_ACTIVITY);

        const response = await chatAPI.createSession();
        
        sessionStorage.setItem(STORAGE_KEYS.SESSION_ID, response.sessionId);
        sessionStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(response.messages));
        sessionStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, new Date().toISOString());

        setSessionId(response.sessionId);
        setMessages(response.messages);

        console.log('🔄 Started new chat session');
      } catch (error) {
        console.error('Error clearing history:', error);
        setError('Không thể xóa lịch sử chat');
      }
    }
  };

  const exampleQuestions = [
    "Doanh thu tháng 2 năm 2023như thế nào?",
    "Phân tích giá vốn quý 1 năm 2023 cho tôi",
    "Lợi nhuận năm 2023 có tăng so với năm trước đó không?",
  ];

  if (isInitializing) {
    return (
      <div className="chat-window loading-screen">
        <Loader2 className="spinner" size={48} />
        <p>Đang khởi tạo session...</p>
      </div>
    );
  }

  return (
    <div className={`chat-window ${embedded ? 'embedded' : 'standalone'}`}>
      {/* Header */}
      <div className="chat-header">
        <div className="header-content">
          <Database size={24} color="#3b82f6" />
          <div className="header-text">
            <h2>Power BI Assistant - ICT24h AI Agent TEAM </h2>
            <div className="status-indicator">
              <span className={`status-dot ${backendStatus}`}></span>
              <span className="status-text">
                {backendStatus === 'online' ? 'Connected' : 
                 backendStatus === 'offline' ? 'Offline' : 'Checking...'}
              </span>
              <span className="session-info">
                • Session: {sessionId?.substr(8, 8)}... • {messages.length} tin nhắn
              </span>
            </div>
          </div>
          <button 
            className="clear-btn" 
            onClick={clearHistory}
            title="Bắt đầu chat mới"
            disabled={isLoading}
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="error-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Messages Area */}
      <div className="messages-container">
        {messages.map((msg, idx) => (
          <div key={`msg-${idx}-${msg.timestamp}`} className={`message ${msg.role}`}>
            <div className="message-avatar">
              {msg.role === 'user' ? '👤' : '🤖'}
            </div>
            <div className="message-content">
              <div 
                className="message-text"
                dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.content) }}
              />
              {msg.metadata && (
                <div className="message-metadata">
                  <div className="metadata-item">
                    📊 Query: <code>{msg.metadata.daxQuery}</code>
                  </div>
                  <div className="metadata-item">
                    ✓ Retrieved {msg.metadata.rowCount} rows
                  </div>
                </div>
              )}
              <div className="message-time">
                {new Date(msg.timestamp).toLocaleTimeString('vi-VN')}
              </div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="message assistant loading">
            <div className="message-avatar">🤖</div>
            <div className="message-content">
              <Loader2 className="spinner" size={20} />
              <span>Đang truy vấn dữ liệu...</span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Example Questions */}
      {messages.length === 1 && !isLoading && (
        <div className="example-questions">
          <p className="example-title">💡 Câu hỏi gợi ý:</p>
          {exampleQuestions.map((q, idx) => (
            <button
              key={idx}
              className="example-btn"
              onClick={() => setInput(q)}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="input-container">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Hỏi về dữ liệu tài chính của bạn..."
          disabled={isLoading || backendStatus === 'offline'}
          className="input-field"
          rows={1}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading || backendStatus === 'offline'}
          className="send-btn"
        >
          <Send size={18} />
        </button>
      </div>

      {/* Footer hint */}
      {embedded && (
        <div className="embedded-hint">
          💾 Chat history được lưu tự động. Zoom/resize không làm mất dữ liệu.
        </div>
      )}
    </div>
  );
};

export default ChatWindow;