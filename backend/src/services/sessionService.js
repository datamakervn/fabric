class SessionService {
  constructor() {
    // Lưu sessions trong memory (dùng Redis cho production)
    this.sessions = new Map();
    
    // Cleanup old sessions every 30 minutes
    this.startCleanup();
  }

  // Tạo session mới
  createSession() {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session = {
      id: sessionId,
      messages: [
        {
          role: 'assistant',
          content: '👋 Xin chào! Tôi là trợ lý phân tích dữ liệu Power BI.\n\nTôi có thể giúp bạn truy vấn và phân tích dữ liệu từ semantic model "QUAN TRI TAI CHINH".\n\nHãy hỏi tôi bất cứ điều gì về dữ liệu tài chính của bạn!',
          timestamp: new Date().toISOString(),
        }
      ],
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    this.sessions.set(sessionId, session);
    console.log(`✅ Created new session: ${sessionId}`);
    return session;
  }

  // Lấy session
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
      return session;
    }
    return null;
  }

  // Lưu message vào session
  addMessage(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push({
        ...message,
        timestamp: new Date().toISOString(),
      });
      session.lastActivity = new Date();
      console.log(`💾 Saved message to session ${sessionId}, total: ${session.messages.length}`);
      return true;
    }
    return false;
  }

  // Xóa session
  deleteSession(sessionId) {
    this.sessions.delete(sessionId);
    console.log(`🗑️ Deleted session: ${sessionId}`);
  }

  // Cleanup old sessions
  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      const maxAge = 2 * 60 * 60 * 1000; // 2 hours

      for (const [sessionId, session] of this.sessions.entries()) {
        const age = now - new Date(session.lastActivity).getTime();
        if (age > maxAge) {
          this.deleteSession(sessionId);
        }
      }
    }, 30 * 60 * 1000); // Run every 30 minutes
  }

  // Debug: List all sessions
  getAllSessions() {
    return Array.from(this.sessions.entries()).map(([id, session]) => ({
      id,
      messageCount: session.messages.length,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
    }));
  }
}

module.exports = new SessionService();