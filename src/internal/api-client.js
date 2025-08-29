const core = require('@actions/core')
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')
const axios = require('axios')

/**
 * 列出网站目录下的文件和文件夹
 * @param {Object} params - 参数对象
 * @param {string} params.apiToken - API Token
 * @param {string} params.siteId - 网站ID
 * @param {string} params.apiBaseUrl - API基础URL
 * @param {string} [params.path] - 目录路径，默认为根目录
 * @returns {Promise<Object>} 文件列表响应
 */
async function listFiles({ apiToken, siteId, apiBaseUrl, path: dirPath = '' }) {
  const url = `${apiBaseUrl}/sites/${siteId}/files`
  const params = dirPath !== undefined && dirPath !== null ? { path: dirPath } : {}

  try {
    core.info(`正在获取目录文件列表: ${dirPath || '根目录'}`)

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      params
    })

    return response.data
  } catch (error) {
    core.error(`获取文件列表失败: ${error.message}`)
    throw error
  }
}

/**
 * 上传单个文件到指定网站目录
 * @param {Object} params - 参数对象
 * @param {string} params.apiToken - API Token
 * @param {string} params.siteId - 网站ID
 * @param {string} params.apiBaseUrl - API基础URL
 * @param {string} params.filePath - 本地文件路径
 * @param {string} [params.uploadPath] - 上传路径
 * @returns {Promise<Object>} 上传响应
 */
async function uploadFile({ apiToken, siteId, apiBaseUrl, filePath, uploadPath = '' }) {
  const url = `${apiBaseUrl}/sites/${siteId}/files?path=${uploadPath}`

  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`)
    }

    const fileName = path.basename(filePath)
    const fileStream = fs.createReadStream(filePath)
    const fileStats = fs.statSync(filePath)

    core.info(`正在上传文件: ${fileName} (${fileStats.size} 字节) 到路径: ${uploadPath || '根目录'}`)

    const formData = new FormData()
    formData.append('file', fileStream, fileName)
    if (uploadPath) {
      formData.append('path', uploadPath)
    }

    const response = await axios.post(url, formData, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        ...formData.getHeaders()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    })

    core.info(`文件上传成功: ${fileName}`)
    return response.data
  } catch (error) {
    core.error(`文件上传失败 ${path.basename(filePath)}: ${error.message}`)
    throw error
  }
}

/**
 * 递归遍历目录并获取所有文件
 * @param {string} dirPath - 目录路径
 * @param {string} [basePath] - 基础路径，用于计算相对路径
 * @returns {Array<Object>} 文件信息数组
 */
function getAllFiles(dirPath, basePath = dirPath) {
  const files = []

  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true })

    for (const item of items) {
      const fullPath = path.join(dirPath, item.name)
      const relativePath = path.relative(basePath, fullPath)

      if (item.isDirectory()) {
        // 递归遍历子目录
        files.push(...getAllFiles(fullPath, basePath))
      } else if (item.isFile()) {
        files.push({
          localPath: fullPath,
          relativePath: relativePath.replace(/\\/g, '/'), // 统一使用正斜杠
          name: item.name,
          size: fs.statSync(fullPath).size
        })
      }
    }
  } catch (error) {
    core.error(`读取目录失败 ${dirPath}: ${error.message}`)
    throw error
  }

  return files
}

/**
 * 批量上传目录中的所有文件（按照源目录结构上传到根目录）
 * @param {Object} params - 参数对象
 * @param {string} params.apiToken - API Token
 * @param {string} params.siteId - 网站ID
 * @param {string} params.apiBaseUrl - API基础URL
 * @param {string} params.sourceDir - 源目录路径
 * @returns {Promise<Object>} 上传结果统计
 */
async function uploadDirectory({ apiToken, siteId, apiBaseUrl, sourceDir }) {
  try {
    core.info(`开始上传目录: ${sourceDir}`)

    const files = getAllFiles(sourceDir)
    const results = {
      total: files.length,
      success: 0,
      failed: 0,
      errors: []
    }

    core.info(`发现 ${files.length} 个文件需要上传`)

    for (const file of files) {
      try {
        // 直接使用相对路径上传到根目录对应位置
        const uploadPath = path.dirname(file.relativePath)

        await uploadFile({
          apiToken,
          siteId,
          apiBaseUrl,
          filePath: file.localPath,
          uploadPath
        })

        results.success++
      } catch (error) {
        results.failed++
        results.errors.push({
          file: file.relativePath,
          error: error.message
        })
        core.warning(`跳过文件 ${file.relativePath}: ${error.message}`)
      }
    }

    core.info(`上传完成: 成功 ${results.success}/${results.total} 个文件`)
    if (results.failed > 0) {
      core.warning(`失败 ${results.failed} 个文件`)
    }

    return results
  } catch (error) {
    core.error(`批量上传失败: ${error.message}`)
    throw error
  }
}

/**
 * 验证API连接和权限
 * @param {Object} params - 参数对象
 * @param {string} params.apiToken - API Token
 * @param {string} params.siteId - 网站ID
 * @param {string} params.apiBaseUrl - API基础URL
 * @returns {Promise<boolean>} 验证结果
 */
async function validateApiAccess({ apiToken, siteId, apiBaseUrl }) {
  try {
    core.info('验证API访问权限...')

    await listFiles({ apiToken, siteId, apiBaseUrl })

    core.info('API访问权限验证成功')
    return true
  } catch (error) {
    core.error(`API访问权限验证失败: ${error.message}`)

    if (error.response) {
      const status = error.response.status
      if (status === 401) {
        throw new Error('API Token无效或已过期')
      } else if (status === 403) {
        throw new Error('API Token权限不足，需要website_hosting权限')
      } else if (status === 404) {
        throw new Error(`网站ID不存在: ${siteId}`)
      }
    }

    throw error
  }
}

module.exports = {
  listFiles,
  uploadFile,
  getAllFiles,
  uploadDirectory,
  validateApiAccess
}
