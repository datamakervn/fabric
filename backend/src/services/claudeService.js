const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/xmla.config');

class ClaudeService {
  constructor() {
    this.client = new Anthropic({
      apiKey: config.claude.apiKey,
    });
  }

  // Generate DAX query from natural language
  async generateDAXQuery(userQuestion, datasetMetadata) {
    const systemPrompt = `Bạn là chuyên gia Power BI và DAX. Nhiệm vụ của bạn là chuyển câu hỏi của user thành DAX query.

Dataset có sẵn:
- Table: 'A1_KQKD (month)' với các columns: Month, Chỉ tiêu, [các measures]
- Measures: [1.Doanh thu thuần], [2.Giá vốn hàng bán], [3.Lợi nhuận sau thuế], [4.Tỷ suất lợi nhuận%]

Quy tắc:
1. LUÔN bắt đầu với EVALUATE
2. Sử dụng TOPN, FILTER, SUMMARIZE phù hợp
3. Trả về JSON: { "dax": "...", "explanation": "..." }
4. DAX phải đơn giản, dễ hiểu, không quá 5 dòng
5. Limit kết quả max 100 rows với TOPN

Ví dụ:
User: "Doanh thu 3 tháng gần nhất"
Response: {
  "dax": "EVALUATE TOPN(3, 'A1_KQKD (month)', 'A1_KQKD (month)'[Month], DESC)",
  "explanation": "Query lấy 3 tháng gần nhất từ bảng KQKD"
}`;

    try {
      const response = await this.client.messages.create({
        model: config.claude.model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userQuestion,
          },
        ],
      });

      const content = response.content[0].text;
      
      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      throw new Error('Could not parse DAX query from Claude response');
    } catch (error) {
      console.error('Claude DAX Generation Error:', error);
      throw error;
    }
  }

  // Analyze query results and generate insights
  async analyzeResults(userQuestion, queryResults, metadata) {
    const systemPrompt = `Bạn là chuyên gia phân tích dữ liệu tài chính Power BI.

QUAN TRỌNG - QUY TẮC FORMAT:
1. Trình bày rõ ràng, dễ đọc, professional
2. SỬ DỤNG ÍT EMOJI - chỉ dùng 1-2 emoji quan trọng
3. Dùng markdown: **bold**, ## headers, - bullet points
4. Số liệu: format đẹp với dấu phẩy ngăn cách hàng nghìn
5. Phân tích ngắn gọn, đi thẳng vào vấn đề
6. Không dùng các ký hiệu lạ như ###, ***, 🔍, 💡, etc

CẤU TRÚC RESPONSE:
## [Tiêu đề ngắn gọn]

**Kết quả chính:**
- Điểm 1
- Điểm 2

**Phân tích:**
[Phân tích ngắn gọn 2-3 câu]

**Khuyến nghị:**
[1-2 action items cụ thể]

---
Query: [DAX query]
Rows: [số rows]`;

    try {
      const dataContext = `
User Question: ${userQuestion}

Query Results (first 20 rows):
${JSON.stringify(queryResults.data.slice(0, 20), null, 2)}

Total Rows: ${queryResults.rowCount}
`;

      const response = await this.client.messages.create({
        model: config.claude.model,
        max_tokens: config.claude.maxTokens,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Phân tích dữ liệu sau và trả lời câu hỏi. Nhớ format đẹp, dễ đọc:\n\n${dataContext}`,
          },
        ],
      });

      return response.content[0].text;
    } catch (error) {
      console.error('Claude Analysis Error:', error);
      throw error;
    }
  }
} 

module.exports = new ClaudeService();