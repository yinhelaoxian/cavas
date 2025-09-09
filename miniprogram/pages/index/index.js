Page({
  data: {
    cropperReady: false,
    cropperIns: null,
    currentMode: 'image'
  },

  onCropperReady(e) {
    if (e.detail.status) {
      const cropperIns = this.selectComponent('#cropperComp');
      this.setData({ cropperReady: true, cropperIns });
      console.log('[页面] 图片剪裁组件已就绪');
    }
  },

  chooseImage() {
    const { cropperIns } = this.data;
    if (!cropperIns) {
      wx.showToast({ title: '组件未加载', icon: 'none' });
      return;
    }
    cropperIns.chooseImage();
  },

  rotateImage() {
    const { cropperIns } = this.data;
    if (!cropperIns) return;
    cropperIns.rotateImage();
  },

  resetImage() {
    const { cropperIns } = this.data;
    if (!cropperIns) return;
    cropperIns.resetImage();
  },

  switchToCrop() {
    const { cropperIns } = this.data;
    if (!cropperIns) return;
    cropperIns.switchMode('crop');
    this.setData({ currentMode: 'crop' });
  },

  switchToEdit() {
    const { cropperIns } = this.data;
    if (!cropperIns) return;
    cropperIns.switchMode('image');
    this.setData({ currentMode: 'image' });
  },

  async saveImage() {
    const { cropperIns } = this.data;
    if (!cropperIns) return;
    
    try {
      const tempPath = await cropperIns.saveCroppedImage();
      if (tempPath) {
        console.log('[页面] 保存的图片路径:', tempPath);
        // 可以进一步处理保存的图片
      }
    } catch (err) {
      console.error('[页面] 保存图片失败:', err);
    }
  }
});