const axios = require('axios');
const msal = require('@azure/msal-node');
const config = require('../config/xmla.config');

class XMLAService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.workspaceId = null;
    this.initMSAL();
  }

  initMSAL() {
    const msalConfig = {
      auth: {
        clientId: config.powerbi.clientId,
        authority: config.powerbi.authority,
        clientSecret: config.powerbi.clientSecret,
      },
    };
    this.confidentialClientApplication = new msal.ConfidentialClientApplication(msalConfig);
  }

  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const tokenRequest = {
        scopes: config.powerbi.scope,
      };

      const response = await this.confidentialClientApplication.acquireTokenByClientCredential(tokenRequest);
      
      this.accessToken = response.accessToken;
      this.tokenExpiry = Date.now() + (response.expiresIn * 1000) - 60000;
      
      console.log('✅ Access token acquired successfully');
      return this.accessToken;
    } catch (error) {
      console.error('❌ Error acquiring token:', error.message);
      throw new Error('Failed to authenticate with Power BI');
    }
  }

  async getWorkspaceId() {
    if (this.workspaceId) {
      return this.workspaceId;
    }

    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get('https://api.powerbi.com/v1.0/myorg/groups', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const workspace = response.data.value.find(
        w => w.name.toLowerCase() === config.xmla.workspace.toLowerCase()
      );

      if (!workspace) {
        throw new Error(`Workspace '${config.xmla.workspace}' not found`);
      }

      this.workspaceId = workspace.id;
      console.log(`✅ Found workspace: ${workspace.name} (${this.workspaceId})`);
      
      return this.workspaceId;
    } catch (error) {
      console.error('❌ Error getting workspace ID:', error.message);
      throw error;
    }
  }

  async executeDAXQuery(daxQuery, datasetName = 'QUAN TRI TAI CHINH') {
    try {
      const token = await this.getAccessToken();
      const workspaceId = await this.getWorkspaceId();
      
      const url = `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/datasets/${config.xmla.datasetId}/executeQueries`;
      
      console.log(`🔍 Executing DAX query on dataset ${config.xmla.datasetId}`);
      
      const payload = {
        queries: [
          {
            query: daxQuery,
          },
        ],
        serializerSettings: {
          includeNulls: true,
        },
      };

      const response = await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: config.xmla.timeout,
      });

      if (response.data && response.data.results && response.data.results[0]) {
        const result = response.data.results[0];
        
        if (result.error) {
          throw new Error(`DAX Query Error: ${result.error.message}`);
        }

        console.log(`✅ Query executed successfully, returned ${result.tables[0].rows.length} rows`);

        return {
          success: true,
          data: result.tables[0].rows,
          columns: Object.keys(result.tables[0].rows[0] || {}),
          rowCount: result.tables[0].rows.length,
        };
      }

      throw new Error('Invalid response from Power BI API');
    } catch (error) {
      console.error('❌ XMLA Query Error:', error.response?.data || error.message);
      
      // Provide more helpful error messages
      if (error.response?.status === 400) {
        throw new Error('Invalid DAX query syntax');
      } else if (error.response?.status === 401) {
        throw new Error('Authentication failed - check your credentials');
      } else if (error.response?.status === 404) {
        throw new Error('Dataset not found - check your dataset ID');
      }
      
      throw error;
    }
  }

  async getDatasetMetadata() {
    try {
      const token = await this.getAccessToken();
      const workspaceId = await this.getWorkspaceId();
      
      const url = `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/datasets/${config.xmla.datasetId}`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      console.log(`✅ Retrieved metadata for dataset: ${response.data.name}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error getting metadata:', error.message);
      throw error;
    }
  }

  async getDatasetSchema() {
    try {
      const token = await this.getAccessToken();
      const workspaceId = await this.getWorkspaceId();
      
      // Get basic dataset info
      const url = `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/datasets/${config.xmla.datasetId}`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      console.log(`✅ Retrieved schema for dataset: ${response.data.name}`);
      
      // Get detailed schema using XMLA endpoint
      const xmlaUrl = `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/datasets/${config.xmla.datasetId}/executeQueries`;
      
      // DAX query to get all tables
      const schemaQuery = `
        EVALUATE
        SELECTCOLUMNS(
          INFO.TABLES(),
          "TableName", [TABLE_NAME],
          "TableType", [TABLE_TYPE]
        )
      `;

      console.log('🔍 Fetching tables...');
      const schemaResponse = await axios.post(xmlaUrl, {
        queries: [{ query: schemaQuery }],
        serializerSettings: { includeNulls: true }
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: config.xmla.timeout,
      });

      const tables = schemaResponse.data.results[0].tables[0].rows;
      console.log(`✅ Found ${tables.length} tables`);
      
      // Get all columns in one query
      const columnsQuery = `
        EVALUATE
        SELECTCOLUMNS(
          INFO.COLUMNS(),
          "ColumnName", [COLUMN_NAME],
          "TableName", [TABLE_NAME],
          "DataType", [DATA_TYPE]
        )
      `;

      console.log('🔍 Fetching columns...');
      const colResponse = await axios.post(xmlaUrl, {
        queries: [{ query: columnsQuery }],
        serializerSettings: { includeNulls: true }
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: config.xmla.timeout,
      });

      const allColumns = colResponse.data.results[0].tables[0].rows;
      console.log(`✅ Found ${allColumns.length} columns`);

      // Build schema object
      const schema = {};
      
      // Filter only TABLE type (not MEASURE or CALCULATED)
      const dataTables = tables.filter(t => t.TableType === 'TABLE');
      
      for (const table of dataTables) {
        const tableColumns = allColumns.filter(c => c.TableName === table.TableName);
        
        if (tableColumns.length > 0) {
          schema[table.TableName] = {
            type: table.TableType,
            columns: tableColumns.map(c => ({
              name: c.ColumnName,
              type: c.DataType
            }))
          };
        }
      }

      console.log(`✅ Schema built successfully for ${Object.keys(schema).length} tables`);

      return {
        datasetName: response.data.name,
        datasetId: config.xmla.datasetId,
        tables: schema,
        tableCount: Object.keys(schema).length,
        totalColumns: allColumns.length
      };

    } catch (error) {
      console.error('❌ Error getting schema:', error.response?.data || error.message);
      throw error;
    }
  }

  validateDAXQuery(query) {
    const upper = query.toUpperCase();
    
    if (!upper.includes('EVALUATE')) {
      throw new Error('DAX query must contain EVALUATE statement');
    }

    const dangerous = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE'];
    for (const keyword of dangerous) {
      if (upper.includes(keyword)) {
        throw new Error(`Dangerous keyword '${keyword}' not allowed`);
      }
    }

    return true;
  }
}

module.exports = new XMLAService();