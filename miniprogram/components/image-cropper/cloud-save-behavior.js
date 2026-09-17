// cloud-save-behavior.js
// 负责图片剪裁结果的云端保存逻辑
// 可以结合 wx.cloud.uploadFile 等方法使用
// 示例：
// wx.cloud.uploadFile({
//   cloudPath: `cropper/${Date.now()}-${Math.floor(Math.random()*1000)}.png`,
//   filePath: tempFilePath,
//   success: res => console.log('上传成功', res),
//   fail: err => console.error('上传失败', err)
// })

module.exports = Behavior({
  methods: {
    /**
     * 保存图片到云端
     * @param {string} tempFilePath - 剪裁后的临时文件路径
     * @returns {Promise<string>} - 返回云端文件ID
     */
    saveToCloud(tempFilePath) {
      return new Promise((resolve, reject) => {
        const cloudPath = `cropper/${Date.now()}-${Math.floor(Math.random()*1000)}.png`
        wx.cloud.uploadFile({
          cloudPath,
          filePath: tempFilePath,
          success: res => resolve(res.fileID),
          fail: err => reject(err)
        })
      })
    }
  }
})
