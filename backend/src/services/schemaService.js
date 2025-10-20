/**
 * Schema Service - Dynamic schema loading and intelligent prompt building
 */

const fs = require('fs');
const path = require('path');

class SchemaService {
  constructor() {
    this.fullSchema = null;
    this.initialized = false;
    this.loadSchema();
  }

  /**
   * Load schema from parsed JSON file
   */
  loadSchema() {
    try {
      const schemaPath = path.join(__dirname, '../../schema-parsed.json');
      
      if (!fs.existsSync(schemaPath)) {
        console.warn('⚠️  schema-parsed.json not found. Run: node parse-model.js');
        this.fullSchema = this.getFallbackSchema();
        return;
      }

      this.fullSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      this.initialized = true;
      
      console.log(`✅ Schema loaded: ${this.fullSchema.datasetName}`);
      console.log(`   📊 ${this.fullSchema.metadata.statistics.tables} tables`);
      console.log(`   📏 ${this.fullSchema.metadata.statistics.measures} measures`);
      console.log(`   🔗 ${this.fullSchema.metadata.statistics.relationships} relationships`);
      
    } catch (error) {
      console.error('❌ Error loading schema:', error.message);
      this.fullSchema = this.getFallbackSchema();
    }
  }

  /**
   * Fallback schema if parsed file not available
   */
  getFallbackSchema() {
    return {
      datasetName: 'QUAN TRI TAI CHINH',
      tables: {
        'A1_KQKD (month)': {
          columns: [
            { name: 'Cơ sở', dataType: 'int64' },
            { name: 'Chỉ tiêu', dataType: 'string' },
            { name: 'Month', dataType: 'dateTime' },
            { name: 'Value', dataType: 'double' },
            { name: 'id', dataType: 'double' }
          ],
          measures: []
        }
      },
      measures: {},
      relationships: [],
      metadata: { source: 'fallback' }
    };
  }

  /**
   * Find relevant schema based on user query
   * Uses semantic matching to identify which tables/measures are needed
   */
  /**
 * Find relevant schema based on user query
 * Uses semantic matching to identify which tables/measures are needed
 */
getRelevantSchema(userQuery) {
  const queryLower = userQuery.toLowerCase();
  const relevantTables = new Set();
  const relevantMeasures = [];

  // Keyword mapping for Vietnamese financial terms
  const conceptKeywords = {
    'doanh_thu': ['doanh thu', 'revenue', 'sales', 'thu', 'dt'],
    'loi_nhuan': ['lợi nhuận', 'profit', 'lnst', 'lntt', 'lãi'],
    'gia_von': ['giá vốn', 'cogs', 'cost', 'gv'],
    'tai_san': ['tài sản', 'assets', 'ts'],
    'von': ['vốn', 'equity', 'capital', 'vcsh'],
    'ros': ['ros', 'return on sales', 'tỷ suất', 'lợi nhuận/doanh thu'],
    'roa': ['roa', 'return on assets', 'lợi nhuận/tài sản'],
    'roe': ['roe', 'return on equity', 'lợi nhuận/vốn'],
    'bien': ['biên', 'margin', 'gross margin', 'biên lợi nhuận'],
    'chi_phi': ['chi phí', 'expense', 'cost', 'cp']
  };

  // Search in measures
  for (const [measureName, measureInfo] of Object.entries(this.fullSchema.measures)) {
    try {
      const measureLower = (measureName || '').toLowerCase();
      const descLower = typeof measureInfo.description === 'string' ? measureInfo.description.toLowerCase() : '';
      const exprLower = typeof measureInfo.expression === 'string' ? measureInfo.expression.toLowerCase() : '';
      
      let isRelevant = false;
      
      // Check against keywords
      for (const [concept, synonyms] of Object.entries(conceptKeywords)) {
        const hasQueryKeyword = synonyms.some(syn => queryLower.includes(syn));
        const hasMeasureKeyword = synonyms.some(syn => 
          measureLower.includes(syn) || descLower.includes(syn)
        );
        
        if (hasQueryKeyword && hasMeasureKeyword) {
          isRelevant = true;
          break;
        }
      }
      
      // Direct name matching
      if (!isRelevant) {
        const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
        const measureWords = measureLower.split(/\s+/).filter(w => w.length > 2);
        
        const hasCommonWord = queryWords.some(qw => 
          measureWords.some(mw => mw.includes(qw) || qw.includes(mw))
        );
        
        if (hasCommonWord) {
          isRelevant = true;
        }
      }
      
      if (isRelevant && measureInfo.table) {
        relevantMeasures.push(measureName);
        relevantTables.add(measureInfo.table);
      }
    } catch (error) {
      console.warn(`⚠️ Error processing measure ${measureName}:`, error.message);
      // Continue with other measures
    }
  }

  // Always include core fact table
  relevantTables.add('A1_KQKD (month)');

  // Add related tables through relationships (limited)
  const additionalTables = new Set();
  for (const tableName of relevantTables) {
    this.fullSchema.relationships.forEach(rel => {
      if (rel.fromTable === tableName && rel.isActive) {
        additionalTables.add(rel.toTable);
      }
      if (rel.toTable === tableName && rel.isActive) {
        additionalTables.add(rel.fromTable);
      }
    });
  }
  
  // Limit additional tables to max 3
  let addedCount = 0;
  for (const table of additionalTables) {
    if (addedCount >= 3) break;
    if (this.fullSchema.tables[table]) {
      relevantTables.add(table);
      addedCount++;
    }
  }

  // Build subset schema
  const subset = {
    tables: {},
    measures: {},
    relevantMeasures: relevantMeasures
  };

  for (const tableName of relevantTables) {
    if (this.fullSchema.tables[tableName]) {
      subset.tables[tableName] = this.fullSchema.tables[tableName];
    }
  }

  for (const measureName of relevantMeasures) {
    if (this.fullSchema.measures[measureName]) {
      subset.measures[measureName] = this.fullSchema.measures[measureName];
    }
  }

  console.log(`🔍 Relevant schema: ${Object.keys(subset.tables).length} tables, ${relevantMeasures.length} measures`);

  return subset;
}

  /**
   * Build dynamic system prompt based on user query
   */
  buildDynamicPrompt(userQuery) {
    const relevant = this.getRelevantSchema(userQuery);
    
    let prompt = `Bạn là chuyên gia phân tích dữ liệu tài chính Power BI cho dataset "${this.fullSchema.datasetName}".

📋 **RELEVANT SCHEMA cho query này:**

`;

    // Add relevant tables
    for (const [tableName, tableInfo] of Object.entries(relevant.tables)) {
      prompt += `\n**Table: ${tableName}**\n`;
      
      if (tableInfo.description) {
        prompt += `Description: ${tableInfo.description}\n`;
      }
      
      prompt += `Columns:\n`;
      tableInfo.columns.forEach(col => {
        prompt += `  - ${col.name} (${col.dataType})`;
        if (col.description) prompt += ` - ${col.description}`;
        prompt += `\n`;
      });
      
      // Show table measures if any
      if (tableInfo.measures && tableInfo.measures.length > 0) {
        prompt += `\nTable Measures (${tableInfo.measures.length}):\n`;
        tableInfo.measures.slice(0, 5).forEach(m => {
          prompt += `  - ${m.name}`;
          if (m.formatString) prompt += ` (${m.formatString})`;
          prompt += `\n`;
        });
        if (tableInfo.measures.length > 5) {
          prompt += `  ... and ${tableInfo.measures.length - 5} more\n`;
        }
      }
    }

    // Add relevant measures with details
    if (relevant.relevantMeasures.length > 0) {
      prompt += `\n💡 **RELEVANT MEASURES (${relevant.relevantMeasures.length}):**\n`;
      
      relevant.relevantMeasures.forEach(measureName => {
        const measure = relevant.measures[measureName];
        prompt += `\n**${measureName}**\n`;
        prompt += `  Table: ${measure.table}\n`;
        
        if (measure.description) {
          prompt += `  Description: ${measure.description}\n`;
        }
        
        if (measure.formatString) {
          prompt += `  Format: ${measure.formatString}\n`;
        }
        
        // Include expression if not too long
        if (measure.expression && measure.expression.length < 500) {
          // Clean expression for display
          const cleanExpr = measure.expression.trim().replace(/\n+/g, ' ').substring(0, 200);
          prompt += `  Expression: ${cleanExpr}${measure.expression.length > 200 ? '...' : ''}\n`;
        }
      });
    }

    // Add DAX rules
    prompt += `\n⚠️ **DAX RULES:**

1. **LUÔN dùng fully qualified references:**
   ✅ 'Table'[Column]
   ❌ [Column]

2. **Khi query measure:**
   - Nếu measure đã có: Dùng [MeasureName] trực tiếp trong CALCULATE
   - Nếu cần raw data: Query base table với FILTER

3. **Templates:**

Query data từ fact table:
\`\`\`dax
EVALUATE
FILTER(
    'A1_KQKD (month)',
    'A1_KQKD (month)'[Chỉ tiêu] = "Doanh thu thuần"
    && YEAR('A1_KQKD (month)'[Month]) = 2023
    && MONTH('A1_KQKD (month)'[Month]) = 5
)
\`\`\`

Query với measure:
\`\`\`dax
EVALUATE
ADDCOLUMNS(
    FILTER(
        'A1_KQKD (month)',
        YEAR('A1_KQKD (month)'[Month]) = 2023
    ),
    "MeasureValue", [MeasureName]
)
\`\`\`

So sánh nhiều tháng:
\`\`\`dax
EVALUATE
FILTER(
    'A1_KQKD (month)',
    'A1_KQKD (month)'[Chỉ tiêu] = "Doanh thu thuần"
    && YEAR('A1_KQKD (month)'[Month]) = 2023
    && (MONTH('A1_KQKD (month)'[Month]) IN {2, 3, 5})
)
\`\`\`

📝 **OUTPUT FORMAT:**
- ❌ KHÔNG bao gồm DAX code, raw JSON, technical metadata
- ✅ CHỈ business analysis với format đẹp, ít emoji
- Convert số liệu sang tỷ đồng (chia 1,000,000,000,000)
- Phân tích dựa trên data thực tế

**Structure:**
## 💰 Các Chỉ Số Chính
### 📈 [Metric Name]
- **[Label]**: XXX.XX tỷ đồng

## 📊 Phân Tích
### ✅ Điểm Mạnh
- [Points]

### ⚠️ Điểm Cần Lưu Ý
- [Points]

## 💡 Khuyến Nghị
[Actions]

## 🎯 Kết Luận
[Summary]`;

    return prompt;
  }

  /**
   * Search measures by keyword
   */
  searchMeasures(keyword) {
    const results = [];
    const keywordLower = keyword.toLowerCase();
    
    for (const [name, info] of Object.entries(this.fullSchema.measures)) {
      const nameLower = name.toLowerCase();
      const descLower = (info.description || '').toLowerCase();
      
      if (nameLower.includes(keywordLower) || descLower.includes(keywordLower)) {
        results.push({
          name,
          table: info.table,
          description: info.description,
          formatString: info.formatString,
          displayFolder: info.displayFolder
        });
      }
    }
    
    return results;
  }

  /**
   * Get all measures grouped by table
   */
  getMeasuresByTable() {
    const grouped = {};
    
    for (const [name, info] of Object.entries(this.fullSchema.measures)) {
      if (!grouped[info.table]) {
        grouped[info.table] = [];
      }
      grouped[info.table].push({
        name,
        description: info.description,
        formatString: info.formatString
      });
    }
    
    return grouped;
  }

  /**
   * Get schema statistics
   */
  getStatistics() {
    return {
      datasetName: this.fullSchema.datasetName,
      initialized: this.initialized,
      ...this.fullSchema.metadata.statistics,
      parsedAt: this.fullSchema.metadata.parsedAt
    };
  }
}

module.exports = new SchemaService();