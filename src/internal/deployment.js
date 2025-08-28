const core = require('@actions/core')
const path = require('path')
const fs = require('fs')

// 加载运行时变量
const getContext = require('./context')
const {
  uploadDirectory,
  validateApiAccess
} = require('./api-client')

const uploadStatus = {
  pending: '等待上传',
  uploading: '正在上传',
  success: '上传成功',
  failed: '上传失败',
  cancelled: '上传已取消'
}

const MAX_TIMEOUT = 600000
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB 单文件大小限制
const SIZE_LIMIT_DESCRIPTION = '100 MB'

class FileUploader {
  constructor() {
    const context = getContext()
    this.apiToken = context.apiToken
    this.siteId = context.siteId
    this.apiBaseUrl = context.apiBaseUrl
    this.sourceDir = context.sourceDir
    this.timeout = context.timeout || MAX_TIMEOUT
    this.maxRetries = context.maxRetries || 3

    // 保留用于日志记录
    this.repositoryNwo = context.repositoryNwo
    this.buildVersion = context.buildVersion
    this.buildActor = context.buildActor
    this.workflowRun = context.workflowRun

    this.uploadInfo = null
    this.startTime = null
    this.status = uploadStatus.pending
  }

  // 验证配置并开始文件上传
  async create() {
    if (this.timeout > MAX_TIMEOUT) {
      core.warning(
        `警告: 超时时间超过最大允许值 - 超时时间设置为最大值 ${MAX_TIMEOUT} 毫秒`
      )
      this.timeout = MAX_TIMEOUT
    }

    try {
      core.debug(`构建版本: ${this.buildVersion}`)
      core.debug(`构建用户: ${this.buildActor}`)
      core.debug(`工作流运行ID: ${this.workflowRun}`)
      core.debug(`源目录: ${this.sourceDir}`)

      // 验证必需的配置参数
      this.validateConfig()

      // 验证源目录是否存在
      const resolvedSourceDir = path.resolve(this.sourceDir)
      if (!fs.existsSync(resolvedSourceDir)) {
        throw new Error(`源目录不存在: ${resolvedSourceDir}`)
      }

      if (!fs.statSync(resolvedSourceDir).isDirectory()) {
        throw new Error(`源路径不是目录: ${resolvedSourceDir}`)
      }

      // 验证API访问权限
      await validateApiAccess({
        apiToken: this.apiToken,
        siteId: this.siteId,
        apiBaseUrl: this.apiBaseUrl
      })

      this.status = uploadStatus.uploading
      this.startTime = Date.now()

      // 开始上传文件
      const uploadResult = await uploadDirectory({
        apiToken: this.apiToken,
        siteId: this.siteId,
        apiBaseUrl: this.apiBaseUrl,
        sourceDir: resolvedSourceDir
      })

      this.uploadInfo = {
        ...uploadResult,
        id: this.buildVersion || Date.now().toString(),
        startTime: this.startTime,
        endTime: Date.now()
      }

      if (uploadResult.failed === 0) {
        this.status = uploadStatus.success
        core.info(`文件上传完成! 成功上传 ${uploadResult.success} 个文件`)
      } else {
        this.status = uploadStatus.failed
        core.warning(`文件上传部分失败: 成功 ${uploadResult.success}/${uploadResult.total} 个文件`)
      }

      core.debug(JSON.stringify(uploadResult, null, 2))

      return this.uploadInfo
    } catch (error) {
      this.status = uploadStatus.failed
      core.error(error.stack)

      // 构建自定义错误消息
      if (error.response) {
        let errorMessage = `文件上传失败 (状态码: ${error.response.status})`

        const status = error.response.status
        if (status === 400) {
          errorMessage += ` 错误详情: ${error.message}`
        } else if (status === 401) {
          errorMessage += ' API Token无效或已过期'
        } else if (status === 403) {
          errorMessage += ' API Token权限不足，需要website_hosting权限'
        } else if (status === 404) {
          errorMessage += ` 网站ID不存在: ${this.siteId}`
        } else if (status >= 500) {
          errorMessage += ' 服务器错误，请稍后重试'
        }
        throw new Error(errorMessage)
      } else {
        throw error
      }
    }
  }

  // 验证配置参数
  validateConfig() {
    if (!this.apiToken) {
      throw new Error('API Token未配置，请设置api_token参数或API_TOKEN环境变量')
    }

    if (!this.siteId) {
      throw new Error('网站ID未配置，请设置site_id参数或SITE_ID环境变量')
    }

    if (!this.apiBaseUrl) {
      throw new Error('API基础URL未配置，请设置api_base_url参数或API_BASE_URL环境变量')
    }

    core.info('配置验证通过')
  }

  // 检查上传状态和结果
  async check() {
    // 如果没有上传信息，说明上传未开始
    if (!this.uploadInfo) {
      core.setFailed('上传未开始或上传信息丢失')
      return
    }

    try {
      core.info('检查上传状态...')

      // 根据当前状态进行处理
      switch (this.status) {
        case uploadStatus.success:
          core.info('文件上传成功!')
          core.setOutput('status', 'success')
          core.setOutput('upload_result', JSON.stringify(this.uploadInfo))

          // 输出上传统计信息
          const { total, success, failed } = this.uploadInfo
          core.setOutput('total_files', total.toString())
          core.setOutput('success_files', success.toString())
          core.setOutput('failed_files', failed.toString())

          if (failed > 0) {
            core.warning(`部分文件上传失败: ${failed}/${total}`)
            // 输出失败的文件列表
            if (this.uploadInfo.errors && this.uploadInfo.errors.length > 0) {
              core.warning('失败文件列表:')
              this.uploadInfo.errors.forEach(error => {
                core.warning(`  - ${error.file}: ${error.error}`)
              })
            }
          }
          break

        case uploadStatus.failed:
          const errorMsg = '文件上传失败'
          core.setFailed(errorMsg)
          core.setOutput('status', 'failed')
          break

        case uploadStatus.cancelled:
          core.setFailed('文件上传已取消')
          core.setOutput('status', 'cancelled')
          break

        default:
          core.info(`当前状态: ${this.status}`)
          core.setOutput('status', this.status)
      }

      // 计算上传耗时
      if (this.startTime && this.uploadInfo.endTime) {
        const duration = this.uploadInfo.endTime - this.startTime
        core.info(`上传耗时: ${Math.round(duration / 1000)} 秒`)
        core.setOutput('duration', duration.toString())
      }

    } catch (error) {
      core.error(`检查上传状态失败: ${error.message}`)
      core.setFailed('检查上传状态时发生错误')
    }
  }

  async cancel() {
    // 如果上传已经完成或未开始，无需取消
    if (!this.uploadInfo || this.status === uploadStatus.success || this.status === uploadStatus.failed) {
      core.debug('无需取消上传操作')
      return
    }

    try {
      core.info('正在取消文件上传...')

      // 更新状态为已取消
      this.status = uploadStatus.cancelled

      if (this.uploadInfo) {
        this.uploadInfo.cancelled = true
        this.uploadInfo.endTime = Date.now()
      }

      core.info('文件上传已取消')

    } catch (error) {
      core.error(`取消上传操作失败: ${error.message}`)
      core.setFailed('取消上传时发生错误')
    }
  }
}

module.exports = { FileUploader, uploadStatus, MAX_TIMEOUT, MAX_FILE_SIZE, SIZE_LIMIT_DESCRIPTION }
