const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const xmlaService = require('../services/xmlaService');
const schemaService = require('../services/schemaService'); // ← NEW

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Helper: Format query result for Claude
function formatQueryResultForClaude(queryResult, userMessage) {
  if (!queryResult || !queryResult.data || queryResult.data.length === 0) {
    return '⚠️ Query không trả về dữ liệu.';
  }

  let context = `📊 **DỮ LIỆU TỪ POWER BI (${queryResult.rowCount} rows):**\n\n`;

  queryResult.data.forEach((row, index) => {
    context += `**Row ${index + 1}:**\n`;
    
    for (const [key, value] of Object.entries(row)) {
      const cleanKey = key.replace(/^.*?\[|\]$/g, '');
      
      let formattedValue = value;
      
      // Format Value to billions
      if (cleanKey === 'Value' && typeof value === 'number') {
        const billions = value / 1000000000; //chia cho 1 tỷ
        formattedValue = `${billions.toFixed(2)} tỷ đồng (${value.toLocaleString('vi-VN')} đồng)`;
      } 
      // Format Month
      else if (cleanKey === 'Month' && value) {
        const date = new Date(value);
        formattedValue = `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
      }
      // Format percentage values
      else if (typeof value === 'number' && (cleanKey.toLowerCase().includes('rate') || cleanKey.toLowerCase().includes('ratio') || cleanKey.toLowerCase().includes('%'))) {
        formattedValue = `${(value * 100).toFixed(2)}%`;
      }
      
      context += `  - ${cleanKey}: ${formattedValue}\n`;
    }
    context += '\n';
  });

  context += `⚠️ **CRITICAL:** Sử dụng ĐÚNG số liệu từ data trên. KHÔNG đoán mò!\n`;
  context += `Ví dụ: Nếu Value = 478978249082 → phải viết "478.98 tỷ đồng"\n`;

  return context;
}

// POST /api/chat - Main chat endpoint
router.post('/', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    console.log('📩 User message:', message);

    // Build DYNAMIC prompt based on user query
    const systemPrompt = schemaService.buildDynamicPrompt(message);
    const promptSize = (systemPrompt.length / 1024).toFixed(2);
    console.log(`📋 Dynamic prompt built (${promptSize} KB)`);

    // STEP 1: Generate DAX query
    console.log('🔄 Step 1: Generating DAX query...');
    
    const claudeResponse1 = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `${message}

Generate ONLY the DAX query. No analysis yet.`
      }]
    });

    const daxText = claudeResponse1.content[0].text;
    
    // Extract DAX query
    const daxMatch = daxText.match(/```(?:dax)?\s*(EVALUATE[\s\S]+?)```/i) ||
                     daxText.match(/(EVALUATE[\s\S]+)/i);
    
    if (!daxMatch) {
      return res.json({
        success: false,
        response: 'Không thể tạo DAX query từ câu hỏi của bạn. Vui lòng hỏi rõ ràng hơn về dữ liệu tài chính.'
      });
    }

    const daxQuery = daxMatch[1].trim();
    console.log('✅ DAX Query generated');
    console.log(daxQuery);

    // STEP 2: Execute query
    console.log('🔄 Step 2: Executing DAX query...');
    
    let queryResult;
    try {
      queryResult = await xmlaService.executeDAXQuery(daxQuery);
      console.log(`✅ Query executed: ${queryResult.rowCount} rows returned`);
    } catch (queryError) {
      console.error('❌ Query execution failed:', queryError.message);
      return res.json({
        success: false,
        response: `Lỗi khi thực thi query:\n\n${queryError.message}\n\nVui lòng thử lại hoặc hỏi câu hỏi khác.`
      });
    }

    // STEP 3: Format data for Claude
    const dataContext = formatQueryResultForClaude(queryResult, message);
    console.log('📊 Data formatted for Claude');

    // STEP 4: Analyze with Claude using actual data
    console.log('🔄 Step 3: Analyzing data with Claude...');
    
    const claudeResponse2 = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Câu hỏi của user: ${message}

${dataContext}

Phân tích kết quả trên và trả lời câu hỏi.

⚠️ CRITICAL RULES:
1. Sử dụng ĐÚNG số liệu từ data trên
2. Convert sang tỷ đồng như đã format
3. KHÔNG đoán mò hoặc tự nghĩ số liệu
4. Format theo template đã định
5. KHÔNG bao gồm DAX query code trong response

Bắt đầu response với business analysis, không có code blocks.`
      }]
    });

    let finalResponse = claudeResponse2.content[0].text;

    // Clean up response (remove any technical details if leaked)
    finalResponse = finalResponse
      .replace(/```(?:dax)?\s*EVALUATE[\s\S]*?```/gi, '')
      .replace(/📌 \*\*Query:\*\*.*?\n/gi, '')
      .replace(/✅ \*\*Retrieved.*?\n/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    console.log('✅ Analysis completed');

    // Return response
    res.json({
      success: true,
      response: finalResponse,
      data: queryResult.data,
      rowCount: queryResult.rowCount
    });

  } catch (error) {
    console.error('❌ Chat endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// GET /api/chat - For testing in browser
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Power BI Chat API is running',
    endpoint: 'POST /api/chat/',
    usage: 'Send POST request with body: {"message": "your question"}'
  });
});

// GET /api/chat/health - Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'Chat API is running',
    timestamp: new Date().toISOString()
  });
});

// GET /api/chat/measures/search?q=ros - Search measures by keyword
router.get('/measures/search', (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "q" is required',
        example: '/api/chat/measures/search?q=ros'
      });
    }
    
    const results = schemaService.searchMeasures(q);
    
    res.json({
      success: true,
      query: q,
      results,
      count: results.length
    });
  } catch (error) {
    console.error('❌ Measure search error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/chat/measures/by-table - Get all measures grouped by table
router.get('/measures/by-table', (req, res) => {
  try {
    const grouped = schemaService.getMeasuresByTable();
    
    // Calculate total measures
    const totalMeasures = Object.values(grouped).reduce((sum, measures) => sum + measures.length, 0);
    
    res.json({
      success: true,
      data: grouped,
      tableCount: Object.keys(grouped).length,
      totalMeasures: totalMeasures
    });
  } catch (error) {
    console.error('❌ Measures by table error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/chat/schema/stats - Get schema statistics
router.get('/schema/stats', (req, res) => {
  try {
    const stats = schemaService.getStatistics();
    
    res.json({
      success: true,
      ...stats
    });
  } catch (error) {
    console.error('❌ Schema stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/chat/schema/tables - Get all table names
router.get('/schema/tables', (req, res) => {
  try {
    const tables = Object.keys(schemaService.fullSchema.tables);
    
    res.json({
      success: true,
      tables,
      count: tables.length
    });
  } catch (error) {
    console.error('❌ Schema tables error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/chat/schema/table/:tableName - Get specific table details
router.get('/schema/table/:tableName', (req, res) => {
  try {
    const { tableName } = req.params;
    
    if (!schemaService.fullSchema.tables[tableName]) {
      return res.status(404).json({
        success: false,
        error: `Table "${tableName}" not found`
      });
    }
    
    const tableInfo = schemaService.fullSchema.tables[tableName];
    
    res.json({
      success: true,
      tableName,
      ...tableInfo,
      columnCount: tableInfo.columns.length,
      measureCount: tableInfo.measures.length
    });
  } catch (error) {
    console.error('❌ Table details error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/chat/schema/refresh - Refresh schema from file (for development)
router.post('/schema/refresh', (req, res) => {
  try {
    schemaService.loadSchema();
    const stats = schemaService.getStatistics();
    
    res.json({
      success: true,
      message: 'Schema refreshed successfully',
      ...stats
    });
  } catch (error) {
    console.error('❌ Schema refresh error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
