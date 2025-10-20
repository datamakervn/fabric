/**
 * Parse Model.bim to extract schema information
 * Run once: node parse-model.js
 * Output: schema-parsed.json
 */

const fs = require('fs');
const path = require('path');

console.log('🔄 Starting Model.bim parser...\n');

// Config
const INPUT_FILE = './Model.bim';  // Adjust path if needed
const OUTPUT_FILE = './schema-parsed.json';

try {
  // Read Model.bim
  console.log('📖 Reading Model.bim...');
  const modelBimContent = fs.readFileSync(INPUT_FILE, 'utf8');
  const modelBim = JSON.parse(modelBimContent);
  
  console.log('✅ Model.bim loaded successfully\n');

  // Initialize schema structure
  const schema = {
    datasetName: modelBim.model?.name || 'QUAN TRI TAI CHINH',
    tables: {},
    measures: {},
    relationships: [],
    metadata: {
      parsedAt: new Date().toISOString(),
      version: modelBim.model?.version || 'unknown'
    }
  };

  // Parse tables
  console.log('🔍 Parsing tables...');
  
  if (modelBim.model && modelBim.model.tables) {
    let visibleTableCount = 0;
    
    modelBim.model.tables.forEach(table => {
      // Skip hidden/system tables
      if (table.isHidden || table.name.startsWith('DateTableTemplate')) {
        console.log(`  ⏭️  Skipping hidden table: ${table.name}`);
        return;
      }
      
      visibleTableCount++;
      console.log(`  📊 Processing table: ${table.name}`);
      
      // Extract columns
      const columns = [];
      if (table.columns) {
        table.columns.forEach(col => {
          if (col.type === 'rowNumber' || col.isHidden) return;
          
          columns.push({
            name: col.name,
            dataType: col.dataType || 'unknown',
            description: col.description || '',
            sourceColumn: col.sourceColumn || col.name,
            formatString: col.formatString || '',
            dataCategory: col.dataCategory || ''
          });
        });
      }
      
      // Extract measures
      const tableMeasures = [];
      if (table.measures) {
       table.measures.forEach(measure => {
  // Ensure expression is string
  let expression = '';
  if (typeof measure.expression === 'string') {
    expression = measure.expression;
  } else if (measure.expression && typeof measure.expression === 'object') {
    expression = JSON.stringify(measure.expression);
  }
  
  const measureInfo = {
    name: measure.name,
    expression: expression,
    description: measure.description || '',
    formatString: measure.formatString || '',
    displayFolder: measure.displayFolder || ''
  };
          
          tableMeasures.push(measureInfo);
          
          // Also add to global measures dictionary
          schema.measures[measure.name] = {
            table: table.name,
            ...measureInfo
          };
        });
        
        console.log(`    ✓ Extracted ${tableMeasures.length} measures`);
      }
      
      // Add to schema
      schema.tables[table.name] = {
        columns: columns,
        measures: tableMeasures,
        description: table.description || '',
        isHidden: false
      };
      
      console.log(`    ✓ Extracted ${columns.length} columns`);
    });
    
    console.log(`\n✅ Parsed ${visibleTableCount} visible tables`);
  }

  // Parse relationships
  console.log('\n🔗 Parsing relationships...');
  
  if (modelBim.model && modelBim.model.relationships) {
    modelBim.model.relationships.forEach(rel => {
      schema.relationships.push({
        name: rel.name || `${rel.fromTable} → ${rel.toTable}`,
        fromTable: rel.fromTable,
        fromColumn: rel.fromColumn,
        toTable: rel.toTable,
        toColumn: rel.toColumn,
        crossFilteringBehavior: rel.crossFilteringBehavior || 'oneDirection',
        isActive: rel.isActive !== false
      });
    });
    
    console.log(`✅ Parsed ${schema.relationships.length} relationships`);
  }

  // Generate statistics
  const stats = {
    tables: Object.keys(schema.tables).length,
    measures: Object.keys(schema.measures).length,
    relationships: schema.relationships.length,
    totalColumns: Object.values(schema.tables).reduce((sum, t) => sum + t.columns.length, 0)
  };

  schema.metadata.statistics = stats;

  // Save to file
  console.log('\n💾 Saving parsed schema...');
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(schema, null, 2), 'utf8');
  
  const fileSize = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2);
  
  console.log(`\n✅ Schema saved to: ${OUTPUT_FILE}`);
  console.log(`📦 File size: ${fileSize} KB`);
  
  console.log('\n📊 STATISTICS:');
  console.log('─'.repeat(50));
  console.log(`  Tables:        ${stats.tables}`);
  console.log(`  Total Columns: ${stats.totalColumns}`);
  console.log(`  Measures:      ${stats.measures}`);
  console.log(`  Relationships: ${stats.relationships}`);
  console.log('─'.repeat(50));
  
  console.log('\n🎉 Parsing completed successfully!\n');
  
  // Show sample measures
  console.log('📏 Sample Measures:');
  const sampleMeasures = Object.keys(schema.measures).slice(0, 10);
  sampleMeasures.forEach(m => {
    console.log(`  - ${m}`);
  });
  if (Object.keys(schema.measures).length > 10) {
    console.log(`  ... and ${Object.keys(schema.measures).length - 10} more`);
  }

} catch (error) {
  console.error('\n❌ ERROR:', error.message);
  
  if (error.code === 'ENOENT') {
    console.error('\n💡 Make sure Model.bim file exists in the backend directory');
    console.error(`   Expected path: ${path.resolve(INPUT_FILE)}`);
  } else if (error instanceof SyntaxError) {
    console.error('\n💡 Model.bim file is not valid JSON');
  }
  
  console.error('\nStack trace:', error.stack);
  process.exit(1);
}