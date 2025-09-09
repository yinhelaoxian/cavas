// index.js
// 页面逻辑：管理图片剪裁组件的交互
Page({
  data: {
    cropperReady: false,  // 组件是否就绪
    cropperIns: null,     // 组件实例
    currentMode: 'image'  // 当前模式
  },

  /**
   * 组件就绪回调
   * @param {Object} e 事件对象
   */
  onCropperReady(e) {
    if (e.detail.status) {
      const cropperIns = this.selectComponent('#cropperComp');
      this.setData({ cropperReady: true, cropperIns });
      console.log('[页面] 图片剪裁组件已就绪');
    }
  },

  /**
   * 选择图片
   */
  chooseImage() {
    const { cropperIns } = this.data;
    if (!cropperIns) {
      wx.showToast({ title: '组件未加载', icon: 'none' });
      return;
    }
    console.log('[页面] 调用选择图片');
    cropperIns.chooseImage();
  },

  /**
   * 旋转图片
   */
  rotateImage() {
    const { cropperIns } = this.data;
    if (!cropperIns) return;
    console.log('[页面] 调用旋转图片');
    cropperIns.rotateImage();
  },

  /**
   * 重置图片
   */
  resetImage() {
    const { cropperIns } = this.data;
    if (!cropperIns) return;
    console.log('[页面] 调用重置图片');
    cropperIns.resetImage();
  },

  /**
   * 切换到剪裁模式
   */
  switchToCrop() {
    const { cropperIns } = this.data;
    if (!cropperIns) return;
    console.log('[页面] 切换到剪裁模式');
    cropperIns.switchMode('crop');
    this.setData({ currentMode: 'crop' });
  },

  /**
   * 切换到编辑模式
   */
  switchToEdit() {
    const { cropperIns } = this.data;
    if (!cropperIns) return;
    console.log('[页面] 切换到编辑模式');
    cropperIns.switchMode('image');
    this.setData({ currentMode: 'image' });
  },

  /**
   * 保存剪裁图片
   */
  async saveImage() {
    const { cropperIns } = this.data;
    if (!cropperIns) return;
    
    try {
      console.log('[页面] 调用保存图片');
      const tempPath = await cropperIns.saveCroppedImage();
      if (tempPath) {
        console.log('[页面] 保存的图片路径:', tempPath);
        wx.showToast({ title: '保存成功', icon: 'success' });
        // 可以进一步处理保存的图片，如上传或预览
      }
    } catch (err) {
      console.error('[页面] 保存图片失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  }
});