const core = require('@actions/core')

// 加载运行时变量
function getRequiredVars() {
  // 新的API和文件上传相关配置
  const apiToken = core.getInput('api_token', { required: true })
  const siteId = core.getInput('site_id', { required: true })
  const apiBaseUrl = core.getInput('api_base_url') || 'https://api.example.com'
  const sourceDir = core.getInput('source_dir') || './dist'
  
  // 固定配置，简化使用
  const targetPath = '/'
  const timeout = 600000  // 10分钟
  const maxRetries = 3

  // 保留部分原有环境变量用于日志记录
  const workflowRun = process.env.GITHUB_RUN_ID
  const repositoryNwo = process.env.GITHUB_REPOSITORY
  const buildVersion = process.env.GITHUB_SHA

  return {
    apiToken,
    siteId,
    apiBaseUrl,
    sourceDir,
    targetPath,
    timeout,
    maxRetries,
    // 保留部分原有环境变量用于日志记录
    workflowRun,
    repositoryNwo,
    buildVersion
  }
}

module.exports = function getContext() {
  const requiredVars = getRequiredVars()
  for (const variable in requiredVars) {
    if (requiredVars[variable] === undefined) {
      throw new Error(`${variable} is undefined. Cannot continue.`)
    }
  }
  core.debug('all variables are set')
  return requiredVars
}
