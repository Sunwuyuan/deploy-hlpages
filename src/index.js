// This package assumes a site has already been built and the files exist in the current workspace
// If there's an artifact named `artifact.tar`, it can upload that to actions on its own,
// without the user having to do the tar process themselves.

const core = require('@actions/core')
const getContext = require('./internal/context')
const { FileUploader } = require('./internal/deployment')

async function main() {
  const inputs = getContext()
  const fileUploader = new FileUploader(inputs)

  // 处理取消信号
  process.on('SIGINT', async () => {
    core.info('用户取消了文件上传')
    try {
      await fileUploader.cancel()
    } catch (error) {
      core.error(`取消上传操作失败: ${error.message}`)
    }
    process.exit(1)
  })

  process.on('SIGTERM', async () => {
    core.info('文件上传被终止')
    try {
      await fileUploader.cancel()
    } catch (error) {
      core.error(`取消上传操作失败: ${error.message}`)
    }
    process.exit(1)
  })

  try {
    core.info('开始文件上传流程...')

    // 验证配置和API访问权限
    core.info('验证配置和API访问权限...')
    await fileUploader.create()

    // 检查上传结果
    core.info('检查上传结果...')
    await fileUploader.check()

    core.info('文件上传流程完成')

  } catch (error) {
    core.error(`文件上传失败: ${error.message}`)
    core.setFailed(`文件上传失败: ${error.message}`)

    // 尝试取消上传操作
    try {
      await fileUploader.cancel()
    } catch (cancelError) {
      core.error(`取消上传操作失败: ${cancelError.message}`)
    }

    process.exit(1)
  }
}

// 启动主程序
main().catch(err => {
  core.error(`程序执行失败: ${err.stack}`)
  core.setFailed(`程序执行失败: ${err.message}`)
})
