import React, { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [userMessage, setUserMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const API_BASE_URL = process.env.NODE_ENV === 'production'
    ? '/api/chat'
    : 'http://localhost:3001/api/chat';

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
        content: `❌ Lỗi kết nối:\n${error.message}\n\nChi tiết: ${error.stack}`,
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
      </header>

      <div className="chat-container">
        <div className="chat-history">
          {chatHistory.length === 0 ? (
            <div className="welcome-message">
              <h2>👋 Xin chào!</h2>
              <p>Tôi có thể giúp bạn truy vấn và phân tích dữ liệu từ semantic model "QUAN TRI TAI CHINH".</p>
              <p>Hãy hỏi tôi bất cứ điều gì về dữ liệu tài chính của bạn!</p>
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
      </div>
    </div>
  );
}

export default App;