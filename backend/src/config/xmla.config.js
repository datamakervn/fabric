require('dotenv').config();

module.exports = {
  xmla: {
    endpoint: process.env.XMLA_ENDPOINT,
    workspace: process.env.POWERBI_WORKSPACE_NAME,
    datasetId: process.env.POWERBI_DATASET_ID,
    timeout: 30000, // 30 seconds
  },
  powerbi: {
    tenantId: process.env.POWERBI_TENANT_ID,
    clientId: process.env.POWERBI_CLIENT_ID,
    clientSecret: process.env.POWERBI_CLIENT_SECRET,
    authority: `https://login.microsoftonline.com/${process.env.POWERBI_TENANT_ID}`,
    scope: ['https://analysis.windows.net/powerbi/api/.default'],
  },
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
  },
};