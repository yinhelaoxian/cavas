// index.js
Page({
  data: {
    imageObj: null,
    cropBox: null,
    isLoading: false,
    uploadProgress: 0
  },

  onLoad() {
    this.cropper = this.selectComponent('#cropper');
  },

  onCropperReady(e) {
    console.log('[页面] 图片剪裁组件已就绪');
    this.setData({ isLoading: false });
  },

  onImageLoaded(e) {
    console.log('[页面] 图片加载完成', e.detail);
    this.setData({ imageObj: e.detail.status });
  },

  onCropperError(e) {
    console.error('[页面] 组件错误:', e.detail.message);
    wx.showToast({ title: e.detail.message || '操作失败', icon: 'none' });
  },

  onUploadProgress(e) {
    this.setData({ uploadProgress: e.detail.progress });
  },

  onSaveSuccess(e) {
    console.log('[页面] 保存成功:', e.detail.fileID);
  },

  chooseImage() {
    wx.chooseImage({
      count: 1,
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.cropper.loadImage(res.tempFilePaths[0]).catch(err => console.error(err));
      },
      fail: (err) => wx.showToast({ title: '选择图片失败', icon: 'none' })
    });
  },

  saveCroppedImage() {
    this.cropper.saveCroppedImage().catch(err => console.error(err));
  }
});