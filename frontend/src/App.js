import React, { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [userMessage, setUserMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const messagesEndRef = useRef(null);

  const API_BASE_URL = process.env.NODE_ENV === 'production'
    ? 'https://powerbi-chatbot-umc-a3bbhShaf4dpb5gt.southeastasia-01.azurewebsites.net/api/chat'
    : 'https://powerbi-chatbot-umc-a3bbhShaf4dpb5gt.southeastasia-01.azurewebsites.net/api/chat';

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  // Detect embedded mode và load saved history
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const embedded = urlParams.get('embedded') === 'true';
    setIsEmbedded(embedded);
    
    // Load saved messages khi ở embedded mode
    if (embedded) {
      const saved = localStorage.getItem('powerbi_chat_history');
      if (saved) {
        try {
          const savedHistory = JSON.parse(saved);
          if (savedHistory && savedHistory.length > 0) {
            setChatHistory(savedHistory);
            console.log('✅ Restored chat history:', savedHistory.length, 'messages');
          }
        } catch (e) {
          console.error('❌ Failed to load chat history:', e);
        }
      }
    }
  }, []);

  // Save messages to localStorage khi embedded
  useEffect(() => {
    if (isEmbedded && chatHistory.length > 0) {
      try {
        localStorage.setItem('powerbi_chat_history', JSON.stringify(chatHistory));
        console.log('💾 Saved chat history:', chatHistory.length, 'messages');
      } catch (e) {
        console.error('❌ Failed to save chat history:', e);
      }
    }
  }, [chatHistory, isEmbedded]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const clearHistory = () => {
    localStorage.removeItem('powerbi_chat_history');
    setChatHistory([]);
    console.log('🗑️ Cleared chat history');
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!userMessage.trim()) {
      return;
    }

    const newMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString()
    };
    
    setChatHistory(prev => [...prev, newMessage]);
    setIsLoading(true);
    setUserMessage('');

    try {
      console.log('🚀 Sending request to:', API_BASE_URL);
      console.log('📤 Message:', userMessage);

      const response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: userMessage
        })
      });

      console.log('📥 Response status:', response.status);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('📦 Response data:', data);

      // Parse response
      let aiContent = data.response || data.error || 'Không có phản hồi';
      
      // Add data preview if exists
      if (data.data && data.data.length > 0) {
        aiContent += '\n\n📊 **Dữ liệu trả về:**\n```json\n';
        aiContent += JSON.stringify(data.data, null, 2);
        aiContent += '\n```';
      }

      const aiMessage = {
        role: 'assistant',
        content: aiContent,
        timestamp: new Date().toISOString(),
        metadata: data.metadata
      };

      setChatHistory(prev => [...prev, aiMessage]);

    } catch (error) {
      console.error('❌ Error:', error);
      
      const errorMessage = {
        role: 'assistant',
        content: `❌ Lỗi kết nối:\n${error.message}`,
        timestamp: new Date().toISOString()
      };
      
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🤖 Power BI Assistant</h1>
        <p className="status-indicator">
          {isLoading ? '⏳ Đang xử lý...' : '✅ Connected'}
        </p>
        {isEmbedded && chatHistory.length > 0 && (
          <button 
            onClick={clearHistory}
            style={{
              marginLeft: '10px',
              padding: '8px 16px',
              background: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            🗑️ Xóa lịch sử
          </button>
        )}
      </header>

      <div className="chat-container">
        <div className="chat-history">
          {chatHistory.length === 0 ? (
            <div className="welcome-message">
              <h2>👋 Xin chào!</h2>
              <p>Tôi có thể giúp bạn phân tích dữ liệu tài chính. Hãy hỏi tôi về doanh thu, chi phí, hoặc các chỉ số tài chính khác.</p>
              {isEmbedded && (
                <p style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>
                  💡 Lịch sử chat sẽ được lưu lại khi bạn zoom/resize Power BI report
                </p>
              )}
            </div>
          ) : (
            chatHistory.map((msg, index) => (
              <div 
                key={index} 
                className={`message ${msg.role}`}
              >
                <div className="message-header">
                  <strong>{msg.role === 'user' ? '👤 Bạn' : '🤖 AI'}</strong>
                  <span className="timestamp">
                    {new Date(msg.timestamp).toLocaleTimeString('vi-VN')}
                  </span>
                </div>
                <div className="message-content">
                  {msg.content.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </div>
            ))
          )}
          
          {isLoading && (
            <div className="message assistant loading">
              <div className="message-header">
                <strong>🤖 AI</strong>
              </div>
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        <form className="input-form" onSubmit={handleSendMessage}>
          <input
            type="text"
            value={userMessage}
            onChange={(e) => setUserMessage(e.target.value)}
            placeholder="Nhập câu hỏi của bạn... (VD: doanh thu tháng 02/2023)"
            disabled={isLoading}
            className="message-input"
          />
          <button 
            type="submit" 
            disabled={isLoading || !userMessage.trim()}
            className="send-button"
          >
            {isLoading ? '⏳' : '📤'} Gửi
          </button>
        </form>
      </div>

      {/* Debug Console */}
      {!isEmbedded && (
        <div className="debug-console" style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          background: '#000',
          color: '#0f0',
          padding: '10px',
          fontSize: '12px',
          maxWidth: '400px',
          maxHeight: '200px',
          overflow: 'auto',
          fontFamily: 'monospace'
        }}>
          <div>API URL: {API_BASE_URL}</div>
          <div>Messages: {chatHistory.length}</div>
          <div>Loading: {isLoading ? 'YES' : 'NO'}</div>
          <div>Embedded: {isEmbedded ? 'YES' : 'NO'}</div>
        </div>
      )}
    </div>
  );
}

export default App;
